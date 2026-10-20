import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import solc from 'solc';
import { format } from 'prettier';
const name = 'AtomicVaultSwap.sol';
const content = await readFile(
  new URL('../contracts/' + name, import.meta.url),
  'utf8',
);
assert.equal(solc.version().split('+')[0], '0.8.37');
const math = await readFile(
  new URL('../contracts/vendor/Math.sol', import.meta.url),
  'utf8',
);
const manifest = JSON.parse(
  await readFile(
    new URL('../contracts/vendor/paymaster-sources.json', import.meta.url),
    'utf8',
  ),
);
assert.equal(
  math,
  manifest.sources['@openzeppelin-v5.0.2/contracts/utils/math/Math.sol']
    .content,
);
const output = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: 'Solidity',
      sources: {
        [name]: { content },
        'DexAdapters.sol': {
          content: await readFile(
            new URL('../contracts/DexAdapters.sol', import.meta.url),
            'utf8',
          ),
        },
        'vendor/Math.sol': {
          content: await readFile(
            new URL('../contracts/vendor/Math.sol', import.meta.url),
            'utf8',
          ),
        },
      },
      settings: {
        optimizer: { enabled: true, runs: 200 },
        evmVersion: 'cancun',
        metadata: { bytecodeHash: 'none', appendCBOR: false },
        outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
      },
    }),
  ),
);
assert.equal(
  (output.errors ?? []).filter((e) => e.severity === 'error').length,
  0,
  JSON.stringify(output.errors),
);
const contract = output.contracts[name].AtomicVaultSwap;
const adapterNames = [
  'UniswapV3DexAdapter',
  'UniswapV4DexAdapter',
  'AerodromeSlipstreamDexAdapter',
  'AerodromeClassicDexAdapter',
];
const adapters = Object.fromEntries(
  adapterNames.map((name) => {
    const c = output.contracts['DexAdapters.sol'][name];
    return [name, { abi: c.abi, creationCode: '0x' + c.evm.bytecode.object }];
  }),
);
const generated = await format(
  `// Generated from contracts/AtomicVaultSwap.sol with solc 0.8.37, optimizer 200 runs, Cancun EVM and metadata disabled.\nimport type { InterfaceAbi } from 'ethers';\nexport const atomicVaultSwapCreationCode: string = '0x${contract.evm.bytecode.object}';\nexport const atomicVaultSwapAbi: InterfaceAbi = ${JSON.stringify(contract.abi)};\nexport const dexAdapterArtifacts: Record<'UniswapV3DexAdapter' | 'UniswapV4DexAdapter' | 'AerodromeSlipstreamDexAdapter' | 'AerodromeClassicDexAdapter', {abi: InterfaceAbi; creationCode: string}> = ${JSON.stringify(adapters)};\n`,
  { parser: 'typescript', singleQuote: true, trailingComma: 'all' },
);
const path = new URL(
  '../src/execution/atomic-vault-swap.generated.ts',
  import.meta.url,
);
if (process.argv.includes('--write')) await writeFile(path, generated);
else
  assert.equal(
    await readFile(path, 'utf8'),
    generated,
    'Run npm run generate:vault-swap',
  );
console.log(
  'Atomic vault swap artifact matches its source and compiler settings',
);
