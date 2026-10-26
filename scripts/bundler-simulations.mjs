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
  decodeErrorResult,
  parseAbi,
} = viem;

/** Matches the provider's hard sponsorship configuration ceiling. */
export const maximumBundlerUserOperationGas = 5_000_000n;

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

const entryPointVerificationAbi = parseAbi([
  'function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)[] ops,address beneficiary)',
  'error FailedOp(uint256 opIndex,string reason)',
]);
/** Bound unsigned validation and execution estimates against deployed contracts before any real signature exists. */
export async function estimateNativeUserOperationGas({
  operation,
  estimate,
  entryPoint,
  request,
}) {
  const quantity = (value) => {
    if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value))
      throw Error('Invalid gas estimate');
    return BigInt(value);
  };
  let low = quantity(estimate.verificationGasLimit);
  const ceiling = quantity(operation.verificationGasLimit);
  if (low <= 0n || ceiling < low || ceiling > 1000000n)
    throw Error('Invalid verification ceiling');
  const blockResponse = await request('eth_getBlockByNumber', [
    'latest',
    false,
  ]);
  const block = blockResponse.result;
  if (!block?.number || !/^0x[0-9a-f]{64}$/i.test(block.hash))
    throw Error('Verification block unavailable');
  const pair = (a, b) =>
    pad('0x' + quantity(a).toString(16), { size: 16 }) +
    pad('0x' + quantity(b).toString(16), { size: 16 }).slice(2);
  const probe = async (gas) => {
    const packed = {
      sender: operation.sender,
      nonce: quantity(operation.nonce),
      initCode: '0x',
      callData: operation.callData,
      accountGasLimits: pair('0x' + gas.toString(16), operation.callGasLimit),
      preVerificationGas: quantity(operation.preVerificationGas),
      gasFees: pair(operation.maxPriorityFeePerGas, operation.maxFeePerGas),
      paymasterAndData:
        operation.paymaster +
        pair(
          operation.paymasterVerificationGasLimit,
          operation.paymasterPostOpGasLimit,
        ).slice(2) +
        operation.paymasterData.slice(2),
      signature: operation.signature,
    };
    const result = await request('eth_call', [
      {
        from: operation.sender,
        to: entryPoint,
        gas: '0x5b8d80',
        value: '0x0',
        data: encodeFunctionData({
          abi: entryPointVerificationAbi,
          functionName: 'handleOps',
          args: [[packed], operation.sender],
        }),
      },
      block.number,
    ]);
    const data =
      typeof result.error?.data === 'string'
        ? result.error.data
        : result.error?.data?.data;
    let failure;
    try {
      failure = decodeErrorResult({ abi: entryPointVerificationAbi, data });
    } catch {
      throw Error('Unclassified EntryPoint estimate');
    }
    if (failure.errorName !== 'FailedOp' || failure.args[0] !== 0n)
      throw Error('Unclassified EntryPoint estimate');
    const code = failure.args[1].slice(0, 4);
    if (code === 'AA24') return true;
    if (code === 'AA26' || code === 'AA23') return false;
    throw Error('EntryPoint estimate unavailable');
  };
  const verification = async () => {
    let high = low;
    if (!(await probe(low))) {
      high = ceiling;
      if (!(await probe(high))) throw Error('Verification gas exceeds ceiling');
      for (let attempt = 0; attempt < 10 && high - low > 2048n; attempt++) {
        const middle = (high + low) / 2n;
        if (await probe(middle)) high = middle;
        else low = middle;
      }
    }
    return high;
  };
  const [high, callEstimate] = await Promise.all([
    verification(),
    request('eth_estimateGas', [
      {
        from: entryPoint,
        to: operation.sender,
        data: operation.callData,
        value: '0x0',
        gas: '0x5b8d80',
      },
      block.number,
    ]),
  ]);
  if (callEstimate.error) throw Error('Call gas estimate unavailable');
  const nativeCallGas = quantity(callEstimate.result);
  if (nativeCallGas <= 0n) throw Error('Call gas estimate unavailable');
  const estimatedCallGas = quantity(estimate.callGasLimit);
  const callGas =
    nativeCallGas > estimatedCallGas ? nativeCallGas : estimatedCallGas;
  if (
    callGas <= 0n ||
    callGas > maximumBundlerUserOperationGas ||
    callGas > quantity(operation.callGasLimit)
  )
    throw Error('Call gas estimate unavailable');
  const after = await request('eth_getBlockByNumber', [block.number, false]);
  if (after.result?.hash !== block.hash)
    throw Error('Verification block changed');
  return {
    ...estimate,
    verificationGasLimit: '0x' + high.toString(16),
    callGasLimit: '0x' + callGas.toString(16),
  };
}
