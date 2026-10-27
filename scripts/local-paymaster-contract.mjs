import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import solc from 'solc';
import { format } from 'prettier';

const manifest = JSON.parse(
  await readFile(
    new URL('../contracts/vendor/paymaster-sources.json', import.meta.url),
    'utf8',
  ),
);
assert.equal(solc.version().split('+')[0], '0.8.38');
assert.equal(
  manifest.sourceRevision,
  '1e2305d1102242379b582142f62bd17add12b8c2',
);
const output = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: 'Solidity',
      sources: manifest.sources,
      settings: {
        optimizer: { enabled: true, runs: 200 },
        evmVersion: 'london',
        metadata: { bytecodeHash: 'none', appendCBOR: false },
        outputSelection: {
          '*': {
            '*': [
              'abi',
              'evm.bytecode.object',
              'evm.deployedBytecode.object',
              'evm.deployedBytecode.immutableReferences',
            ],
            '': ['ast'],
          },
        },
      },
    }),
  ),
);
assert.equal(
  (output.errors ?? []).filter((e) => e.severity === 'error').length,
  0,
  JSON.stringify(output.errors),
);
const contract = output.contracts[manifest.entry].SingletonPaymasterV7;
const names = {};
const visit = (node) => {
  if (!node || typeof node !== 'object') return;
  if (
    node.nodeType === 'VariableDeclaration' &&
    node.mutability === 'immutable'
  )
    names[node.id] = node.name;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else visit(value);
  }
};
Object.values(output.sources).forEach((source) => visit(source.ast));
const references = Object.entries(
  contract.evm.deployedBytecode.immutableReferences,
).map(([id, locations]) => ({ name: names[id], locations }));
assert.ok(references.every((reference) => reference.name));
const hash = createHash('sha256')
  .update(JSON.stringify(manifest))
  .digest('hex');
const generated = await format(
  `// Generated from pinned upstream MIT-licensed SingletonPaymasterV7 sources.\n// solc 0.8.38; optimizer 200 runs; London EVM; metadata disabled.\n// Source manifest SHA-256: ${hash}\nexport const localPaymasterCreationCode = '0x${contract.evm.bytecode.object}';\nexport const localPaymasterRuntimeTemplate = '0x${contract.evm.deployedBytecode.object}';\nexport const localPaymasterImmutableReferences = ${JSON.stringify(references)} as const;\nexport const localPaymasterAbi = ${JSON.stringify(contract.abi)} as const;\n`,
  { parser: 'typescript', singleQuote: true, trailingComma: 'all' },
);
const destination = new URL(
  '../src/sponsorship/local-paymaster-contract.generated.ts',
  import.meta.url,
);
if (process.argv.includes('--write')) await writeFile(destination, generated);
else
  assert.equal(
    await readFile(destination, 'utf8'),
    generated,
    'Regenerate with npm run generate:paymaster',
  );
console.log(
  'Local paymaster build matches pinned source manifest and compiler settings',
);
