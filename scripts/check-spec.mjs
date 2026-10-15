import { format } from 'prettier';
import { readFile, writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';
const { createServer } = await import('../src/service/server.ts');
const server = await createServer({ documentation: false });
const spec = await format(JSON.stringify(server.swagger()), { parser: 'json' });
await server.close();
const providerTypes = astToString(await openapiTS(JSON.parse(spec)));
const types = astToString(
  await openapiTS(new URL('../spec/orchestration-draft.json', import.meta.url)),
);
for (const [path, content] of [
  ['spec/provider-api.json', spec],
  ['src/protocol/provider-api.generated.ts', providerTypes],
  ['src/protocol/wallet-v1.generated.ts', types],
]) {
  if (process.argv.includes('--write')) await writeFile(path, content);
  else if ((await readFile(path, 'utf8')) !== content)
    throw new Error(`Generated file drift: ${path}`);
}
console.log('OpenAPI service and orchestration snapshot types match sources');
