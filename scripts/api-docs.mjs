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
  './core': [
    'Host authority and signing attempts',
    'api.md#core-wallet-service',
  ],
  './deployment': ['Configuration-first provider service', 'setup.md'],
  './sponsorship': [
    'ERC-4337 and ERC-7677 sponsorship foundation',
    'account-abstraction-sponsorship.md',
  ],
  './wallet-calls': [
    'Standard wallet calls request adapter',
    'wallet-calls.md',
  ],
  './backend': ['Supplied stored-action backend', 'stored-backend.md'],
  './storage': [
    'Built-in SQLite storage and financial authority',
    'storage.md',
  ],
  './http': [
    'HTTP composition and authentication',
    'api.md#http-and-authentication',
  ],
  './onboarding': ['Onboarding, owner login and access', 'onboarding.md'],
  './identity': ['OIDC Identity Assurance enrollment', 'enrollment.md'],
  './telemetry': ['Telemetry lifecycle', 'operations.md'],
  './cdp': [
    'Coinbase CDP adapter',
    'provider-guide.md#current-adapter-profile',
  ],
  './ows': ['Open Wallet Standard adapter', 'ows-adapter.md'],
  './openzeppelin-relayer': [
    'OpenZeppelin Relayer adapter and execution',
    'openzeppelin-relayer.md',
  ],
};
let markdown = `# TypeScript API reference\n\nUse this reference for the public package exports and TypeScript declarations.\nFor contributing or regeneration, see the [development guide](../CONTRIBUTING.md#development).\n\nStart with the [API guide](api.md) for composition, ownership and errors, or the\n[runnable integration tutorial](integration-example.md). These declaration excerpts\nare a reference, not standalone programs. Read [roles and terms](concepts.md)\nfor owners, application clients, host authority, wallet backends and journals.\nSupporting names and schema aliases\nretain their source declaration names; follow the declaration link for their imports.\n\nThe root \`@moovha/wallet-provider-kit\` re-exports core, HTTP, onboarding,\nidentity, telemetry, storage and deployment. Provider adapters require their explicit subpaths.\n\n`;
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
        'Generated OpenAPI path types from [the implemented provider contract](../spec/provider-api.json).\nUse `ProviderPaths["/v1/actions/{actionId}/sign"]["post"]` to select an operation.\nSee the [HTTP reference](http-reference.md).\n\n';
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
  '# HTTP schema reference\n\nUse these request and response schemas with the\n[implemented provider contract](../spec/provider-api.json). For contributing or\nregeneration, see the [development guide](../CONTRIBUTING.md#development).\nRead the [HTTP usage guide](http-api.md) for authentication, scopes, error handling\nand integration profiles. Optional-profile routes are present in the contract even\nwhen the corresponding service is not configured. Read [roles and terms](concepts.md)\nfor application clients, account owners, authority and journals.\n\n';
for (const [path, methods] of Object.entries(schema.paths)) {
  for (const [method, operation] of Object.entries(methods)) {
    if (!['get', 'post', 'delete', 'put', 'patch'].includes(method)) continue;
    http += `## ${method.toUpperCase()} ${path}\n\nOperation: \`${operation.operationId}\`.\n\n${operation.description ?? ''}\n\n`;
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
const executorSchema = JSON.parse(
  await readFile(resolve(root, 'spec/execution-api.json'), 'utf8'),
);
let executorHttp =
  '# Execution service HTTP reference\n\nUse the [designated execution service guide](execution-service.md) for deployment, signed service requests, current wallet authority and recovery. This is a separate process and API from the wallet service. The [generated OpenAPI contract](../spec/execution-api.json) includes all implemented service operations.\n\n';
for (const [path, methods] of Object.entries(executorSchema.paths)) {
  for (const [method, operation] of Object.entries(methods)) {
    if (!['get', 'post'].includes(method)) continue;
    executorHttp += `## ${method.toUpperCase()} ${path}\n\nOperation: \`${operation.operationId}\`.\n\n${operation.description ?? ''}\n\n`;
    const body = operation.requestBody?.content?.['application/json']?.schema;
    if (body)
      executorHttp += `Request body:\n\n\`\`\`json\n${JSON.stringify(body, null, 2)}\n\`\`\`\n\n`;
    const response =
      operation.responses['200']?.content?.['application/json']?.schema;
    if (response)
      executorHttp += `Success response:\n\n\`\`\`json\n${JSON.stringify(response, null, 2)}\n\`\`\`\n\n`;
  }
}
for (const [path, text] of [
  ['docs/api-reference.md', markdown],
  ['docs/http-reference.md', http],
  ['docs/executor-http-reference.md', executorHttp],
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
