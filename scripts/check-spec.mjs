import { format } from 'prettier';
import { readFile, writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';
const { createServer } = await import('../src/service/server.ts');
const { createExecutionService } = await import('../src/executor/service.ts');
const executor = await createExecutionService();
const executorSpec = await format(JSON.stringify(executor.swagger()), {
  parser: 'json',
});
await executor.close();
const executorTypes = astToString(await openapiTS(JSON.parse(executorSpec)));
const server = await createServer({ documentation: false });
const spec = await format(JSON.stringify(server.swagger()), { parser: 'json' });
await server.close();
const providerTypes = astToString(await openapiTS(JSON.parse(spec)));
const types = astToString(
  await openapiTS(new URL('../spec/orchestration-draft.json', import.meta.url)),
);
for (const [path, content] of [
  ['spec/provider-api.json', spec],
  ['spec/execution-api.json', executorSpec],
  ['src/protocol/execution-service.generated.ts', executorTypes],
  ['src/protocol/provider-api.generated.ts', providerTypes],
  ['src/protocol/wallet-v1.generated.ts', types],
]) {
  if (process.argv.includes('--write')) await writeFile(path, content);
  else if ((await readFile(path, 'utf8')) !== content)
    throw new Error(`Generated file drift: ${path}`);
}
console.log(
  'Provider/executor OpenAPI and orchestration snapshot types match sources',
);
