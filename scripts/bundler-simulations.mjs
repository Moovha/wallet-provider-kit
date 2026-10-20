import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
let viem;
try {
  viem = createRequire('/app/src/package.json')('viem');
} catch {
  viem = createRequire(import.meta.url)('viem');
}
const {
  keccak256,
  getContractAddress,
  pad,
  hexToBytes,
  bytesToHex,
  encodeFunctionData,
  decodeFunctionResult,
} = viem;

export const simulationAddresses = {
  entryPoint: '0x0000000000000000000000000000000000007707',
  wrapper: '0x0000000000000000000000000000000000007708',
};
/** Temporary code exists only inside the bundler's read-only simulation calls. */
export async function createBundlerSimulations(entryPoint) {
  const definitions = [
    [
      'EntryPointSimulations.sol/EntryPointSimulations07.json',
      '0x27db06b5e7618014f7be515af0c82c6a15d1d599b23078da74c96432f99e25c0',
    ],
    [
      'PimlicoSimulations.sol/PimlicoSimulations.json',
      '0x22dbcbfa136fcf31bd56a73a11492356bbfac658009dc867cfb0a61485bd7b37',
    ],
  ];
  const contracts = await Promise.all(
    definitions.map(async ([name, hash]) => {
      const contract = JSON.parse(
        await readFile('/app/src/contracts/' + name, 'utf8'),
      );
      if (keccak256(contract.deployedBytecode.object) !== hash)
        throw Error('Simulation artifact mismatch');
      return contract;
    }),
  );
  const runtime = hexToBytes(contracts[0].deployedBytecode.object);
  const creator = getContractAddress({
    from: entryPoint,
    nonce: 1n,
    opcode: 'CREATE',
  });
  const immutables = contracts[0].deployedBytecode.immutableReferences;
  for (const [id, value] of [
    ['2160', creator],
    ['3803', simulationAddresses.entryPoint],
  ]) {
    if (
      !Array.isArray(immutables[id]) ||
      immutables[id].length !== (id === '2160' ? 2 : 10)
    )
      throw Error('Simulation immutable mismatch');
    for (const { start, length } of immutables[id]) {
      if (
        length !== 32 ||
        runtime.slice(start, start + length).some((b) => b !== 0)
      )
        throw Error('Unexpected simulation immutable');
      runtime.set(hexToBytes(pad(value, { size: 32 })), start);
    }
  }
  const code = {
    [simulationAddresses.entryPoint]: bytesToHex(runtime),
    [simulationAddresses.wrapper]: contracts[1].deployedBytecode.object,
  };
  return {
    configuration: {
      'deploy-simulations-contract': false,
      'entrypoint-simulation-contract-v7': simulationAddresses.entryPoint,
      'pimlico-simulation-contract': simulationAddresses.wrapper,
    },
    codeAt(address) {
      return typeof address === 'string'
        ? code[address.toLowerCase()]
        : undefined;
    },
    request(body) {
      return applyBundlerSimulationOverrides(body, code);
    },
    probe() {
      return {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [
          {
            to: simulationAddresses.wrapper,
            data: encodeFunctionData({
              abi: contracts[1].abi,
              functionName: 'getBalances',
              args: [[], []],
            }),
          },
          'latest',
        ],
      };
    },
    verifyProbe(result) {
      const balances = decodeFunctionResult({
        abi: contracts[1].abi,
        functionName: 'getBalances',
        data: result,
      });
      if (!Array.isArray(balances) || balances.length !== 0)
        throw Error('Simulation transport unsupported');
    },
  };
}

export function applyBundlerSimulationOverrides(body, code) {
  if (
    Array.isArray(body) ||
    !body ||
    typeof body !== 'object' ||
    (body.params !== undefined && !Array.isArray(body.params))
  )
    throw Error('Unsupported bundler RPC request');
  if (!['eth_call', 'debug_traceCall'].includes(body.method)) return body;
  if (!Array.isArray(body.params)) throw Error('Missing simulation parameters');
  const index = body.method === 'eth_call' ? 2 : 2;
  const current = body.params[index] ?? {};
  const existing =
    body.method === 'debug_traceCall'
      ? (current.stateOverrides ?? {})
      : current;
  if (!existing || typeof existing !== 'object' || Array.isArray(existing))
    throw Error('Invalid simulation overrides');
  const overrides = { ...existing };
  for (const [address, bytecode] of Object.entries(code)) {
    if (existing[address]?.code && existing[address].code !== bytecode)
      throw Error('Simulation code substitution');
    overrides[address] = { ...existing[address], code: bytecode };
  }
  const params = [...body.params];
  params[index] =
    body.method === 'debug_traceCall'
      ? { ...current, stateOverrides: overrides }
      : overrides;
  return { ...body, params };
}
