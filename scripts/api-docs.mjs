import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { format, resolveConfig } from 'prettier';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(
  await readFile(resolve(root, 'package.json'), 'utf8'),
);
const config = ts.readConfigFile(
  resolve(root, 'tsconfig.json'),
  ts.sys.readFile,
);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, {
  ...parsed.options,
  declaration: true,
  emitDeclarationOnly: true,
});
// Emit declarations in memory so checks also work in a clean checkout before build.
const declarations = new Map();
const emitted = program.emit(undefined, (path, content) =>
  declarations.set(resolve(path), content),
);
assert.equal(
  emitted.emitSkipped,
  false,
  'API declarations could not be emitted',
);
const host = ts.createCompilerHost(parsed.options);
const readFileOriginal = host.readFile.bind(host);
const existsOriginal = host.fileExists.bind(host);
const directoryOriginal = host.directoryExists.bind(host);
const sourceOriginal = host.getSourceFile.bind(host);
const directories = new Set(
  [...declarations.keys()].flatMap((path) => [
    dirname(path),
    dirname(dirname(path)),
  ]),
);
host.readFile = (path) =>
  declarations.get(resolve(path)) ?? readFileOriginal(path);
host.fileExists = (path) =>
  declarations.has(resolve(path)) || existsOriginal(path);
host.directoryExists = (path) =>
  directories.has(resolve(path)) || directoryOriginal(path);
host.getSourceFile = (path, version, onError, shouldCreate) =>
  declarations.has(resolve(path))
    ? ts.createSourceFile(path, declarations.get(resolve(path)), version, true)
    : sourceOriginal(path, version, onError, shouldCreate);
const surfaces = Object.entries(manifest.exports).filter(
  ([, target]) => typeof target === 'object',
);
const typed = ts.createProgram(
  surfaces.map(([, target]) => resolve(root, target.types)),
  { ...parsed.options, noEmit: true },
  host,
);
const checker = typed.getTypeChecker();
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
const guides = {
  './storage': ['Durable storage', 'storage.md'],
  './core': [
    'Host authority and signing attempts',
    'api.md#core-wallet-service',
  ],
  './deployment': ['Configuration-first provider service', 'setup.md'],
  './sponsorship': [
    'ERC-4337 and ERC-7677 sponsorship foundation',
    'account-abstraction-sponsorship.md',
  ],
  './wallets': ['Personal and shared wallets', 'multiple-wallets.md'],
  './wallet-calls': [
    'Standard wallet calls request adapter',
    'wallet-calls.md',
  ],
  './http': [
    'HTTP composition and authentication',
    'api.md#http-and-authentication',
  ],
  './onboarding': ['Onboarding, owner login and access', 'onboarding.md'],
  './identity': ['OIDC Identity Assurance enrollment', 'enrollment.md'],
  './telemetry': ['Telemetry lifecycle', 'operations.md'],
  './ows': ['Open Wallet Standard adapter', 'ows-adapter.md'],
};
let markdown = `# TypeScript API reference\n\nUse these declarations when embedding the toolkit in your own server. Start with\n[TypeScript integration](api.md) to choose the module and responsibility boundary.\nApplications calling a running provider use the [HTTP API](http-api.md) instead.\n\nThese excerpts preserve exact source names and are not standalone programs.\nFollow each source link for its declaration. The root \`@moovha/wallet-provider-kit\`\nre-exports core, HTTP, onboarding, identity, telemetry, storage and deployment;\nprovider adapters use explicit subpaths. [Package guidance](package.md) explains\nconsumer checks, and the [contributor guide](../CONTRIBUTING.md#development) covers regeneration.\n\n`;
for (const [path, target] of surfaces.filter(([path]) => path !== '.')) {
  const source = typed.getSourceFile(resolve(root, target.types));
  assert.ok(source, `Missing declarations for ${path}`);
  const exports = checker
    .getExportsOfModule(checker.getSymbolAtLocation(source))
    .sort((a, b) => a.name.localeCompare(b.name));
  const [title, guide] = guides[path];
  markdown += `## ${title}\n\nImport from \`${manifest.name}${path.slice(1)}\`. [Integration guide](${guide}).\n\n`;
  markdown +=
    exports
      .map((symbol) => `- [${symbol.name}](#${symbol.name.toLowerCase()})`)
      .join('\n') + '\n\n';
  for (const exported of exports) {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(exported)
        : exported;
    const nodes = symbol.getDeclarations() ?? [];
    assert.ok(nodes.length, `No declaration for ${exported.name}`);
    const file = nodes[0].getSourceFile();
    const sourcePath = relative(resolve(root, 'dist'), file.fileName)
      .replace(/\\/g, '/')
      .replace(/\.d\.ts$/, '.ts');
    markdown += `### ${exported.name}\n\n[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/${sourcePath}).\n\n`;
    if (exported.name === 'ProviderPaths') {
      markdown +=
        'Generated OpenAPI path types from [the implemented provider contract](../spec/provider-api.json).\nUse `ProviderPaths["/v1/accounts/{accountId}/wallet"]["post"]` to select an operation.\nSee the [HTTP reference](http-reference.md).\n\n';
      continue;
    }
    const snippets = nodes.map((node) => {
      if (ts.isVariableDeclaration(node)) node = node.parent.parent;
      if (ts.isClassDeclaration(node)) {
        const publicMembers = node.members.filter(
          (member) =>
            !member.modifiers?.some(
              (modifier) =>
                modifier.kind === ts.SyntaxKind.PrivateKeyword ||
                modifier.kind === ts.SyntaxKind.ProtectedKeyword,
            ),
        );
        node = ts.factory.updateClassDeclaration(
          node,
          node.modifiers,
          node.name,
          node.typeParameters,
          node.heritageClauses,
          publicMembers,
        );
      }
      return printer.printNode(ts.EmitHint.Unspecified, node, file);
    });
    markdown += `\`\`\`ts\n${snippets.join('\n')}\n\`\`\`\n\n`;
  }
}
const schema = JSON.parse(
  await readFile(resolve(root, 'spec/provider-api.json'), 'utf8'),
);
let http =
  '# HTTP schema reference\n\nUse this reference to look up an exact request or response while integrating an\napplication or management tool. Start with the [application API guide](http-api.md)\nfor the request sequence, or [provider administration](provider-installation.md#automate-provider-administration)\nfor management access.\n\nThese schemas come from the [implemented contract](../spec/provider-api.json).\nRoute availability depends on current configuration and permission. A schema\ndescribes an input; it does not grant authority to use it. The\n[contributor guide](../CONTRIBUTING.md#development) covers regeneration.\n\n';
for (const [path, methods] of Object.entries(schema.paths)) {
  for (const [method, operation] of Object.entries(methods)) {
    if (!['get', 'post', 'delete', 'put', 'patch'].includes(method)) continue;
    http += `## ${method.toUpperCase()} \`${path}\`\n\nOperation: \`${operation.operationId}\`.\n\n${operation.description ?? ''}\n\n`;
    if (operation.parameters?.length) {
      http +=
        '| Parameter | Location | Required | Schema |\n| --- | --- | --- | --- |\n';
      for (const parameter of operation.parameters) {
        http += `| \`${parameter.name}\` | ${parameter.in} | ${parameter.required ? 'yes' : 'no'} | \`${JSON.stringify(parameter.schema).replace(/\|/g, '\\|')}\` |\n`;
      }
      http += '\n';
    }
    const body = operation.requestBody?.content?.['application/json']?.schema;
    if (body)
      http += `Request body (application/json):\n\n\`\`\`json\n${JSON.stringify(body, null, 2)}\n\`\`\`\n\n`;
    http += '| Status | Content type | Description |\n| --- | --- | --- |\n';
    for (const [status, response] of Object.entries(operation.responses)) {
      http += `| ${status} | ${Object.keys(response.content ?? {}).join(', ') || 'none'} | ${(response.description || 'Response').replace(/\n/g, ' ').replace(/\|/g, '\\|')} |\n`;
    }
    const success = Object.entries(operation.responses).find(([status]) =>
      status.startsWith('2'),
    )?.[1]?.content?.['application/json']?.schema;
    if (success)
      http += `\nSuccess response schema:\n\n\`\`\`json\n${JSON.stringify(success, null, 2)}\n\`\`\`\n`;
    http += '\n';
  }
}
let catalog = `---
outline: 2
---

# Find the API request you need

Choose a task before choosing an endpoint. Application developers normally start
with wallet access, then transactions. Service operators can use administration
at \`/admin/\` for connections and shared user checks. Optional identity integrations
are separate host integrations and can be skipped in the standard flow.

The explorer starts with **Wallet access**. Use **Browse requests by task** to
choose another area, or **All requests** for the complete technical reference.
Selecting a task sends no API request and grants no access. The request URLs and
permission boundaries are the same in every view.

## Understand requests that look similar

| Question | Which requests to use |
| --- | --- |
| Access approval or wallet creation? | Read the access policy, submit identity and consent, then provision the approved account. Permission and blockchain wallet creation are separate steps. |
| Account details or transaction wallet? | The account-details read shows access/provisioning status and the address once created. The transaction-wallet read provides the execution address and chain after transaction access is ready. |
| Agreements or transaction rules? | Agreements record business actions, trusted network services and who pays fees. Transaction rules define the exact contract calls and limits. Both must be accepted/current before eligible transactions. |
| Propose, approve a proposal, or publish directly? | Applications propose rules; operators review and publish saved proposals. Direct provider publication is an alternative for provider-authored baselines or changes. Historical reads support audit rather than activating older rules. |
| Application route or provider route? | Applications see and change their own permitted records. Provider routes let a separately authorized operator review a selected application. These routes keep review separate from application requests. |
| Fee funding or a person’s receiving address? | The application funding address covers eligible network fees. Individual user wallets hold their assets. Funding and user spending permission are separate. |
| Standard access or enrollment/vendor import? | Standard applications submit their agreed user checks and consent with the access request. Custom login enrollment, vendor evidence import and read-only hosted evaluation are optional integrations. |

`;
const orderedOperations = Object.entries(schema.paths)
  .flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, op]) => ({ path, method, op })),
  )
  .sort((a, b) => a.op['x-task-order'] - b.op['x-task-order']);
for (const task of schema.tags ?? []) {
  catalog += `## ${task.name}\n\n${task.description}\n\n`;
  for (const { path, method, op } of orderedOperations) {
    if (!op.tags?.includes(task.name)) continue;
    const anchor = (method + '-' + path)
      .toLowerCase()
      .replace(/[{}]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    catalog += `### ${op.summary}\n\n${op['x-purpose']}\n\n**Who uses it:** ${op['x-audience']}.\n\n**When you need it:** ${op['x-when-to-use']}\n\n[\`${method.toUpperCase()} ${path}\`](http-reference.md#${anchor}) — request body, permissions, effects and response details.\n\n`;
  }
}
for (const [path, text] of [
  ['docs/api-reference.md', markdown],
  ['docs/http-reference.md', http],
  ['docs/api-endpoints.md', catalog],
]) {
  const content = await format(text, {
    ...(await resolveConfig(resolve(root, path))),
    filepath: path,
  });
  if (process.argv.includes('--write'))
    await writeFile(resolve(root, path), content);
  else
    assert.equal(
      await readFile(resolve(root, path), 'utf8'),
      content,
      `${path} is stale; run npm run generate:docs`,
    );
}
console.log(
  'Public TypeScript API and implemented HTTP reference match their sources',
);
