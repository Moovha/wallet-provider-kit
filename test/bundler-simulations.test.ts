import { expect, it } from 'vitest';
import { maximumSponsorGasLimit } from '../src/execution/defaults.js';
import {
  maximumBundlerUserOperationGas,
  applyBundlerSimulationOverrides,
} from '../scripts/bundler-simulations.mjs';
it('keeps the bundler ceiling aligned with accepted sponsorship configuration', () => {
  expect(maximumBundlerUserOperationGas).toBe(maximumSponsorGasLimit());
});
const address = '0x0000000000000000000000000000000000007707';
it('passes parameterless chain discovery through the private transport', () => {
  const body = { jsonrpc: '2.0', id: 1, method: 'eth_chainId' };
  expect(applyBundlerSimulationOverrides(body, { [address]: '0x6000' })).toBe(
    body,
  );
  expect(() =>
    applyBundlerSimulationOverrides({ method: 'eth_call' } as never, {
      [address]: '0x6000',
    }),
  ).toThrow('Missing simulation parameters');
});
it('keeps simulation helpers out of transaction broadcasts and canonical chain evidence', () => {
  for (const method of [
    'eth_sendRawTransaction',
    'eth_getTransactionReceipt',
    'eth_getLogs',
    'eth_getBlockByNumber',
  ]) {
    const body = { jsonrpc: '2.0', id: 1, method, params: ['0x1234'] };
    expect(applyBundlerSimulationOverrides(body, { [address]: '0x6000' })).toBe(
      body,
    );
  }
});
it('adds temporary helper code only to read-only calls and preserves account state overrides without mutating the request', () => {
  const body = {
    method: 'eth_call',
    params: [
      { to: address, data: '0x' },
      'pending',
      { '0x1111111111111111111111111111111111111111': { balance: '0x1' } },
    ],
  };
  const result = applyBundlerSimulationOverrides(body, { [address]: '0x6000' });
  expect(result.params[2]).toEqual({
    ...(body.params[2] as object),
    [address]: { code: '0x6000' },
  });
  expect(body.params[2]).not.toHaveProperty(address);
  expect(() =>
    applyBundlerSimulationOverrides(
      {
        method: 'eth_call',
        params: [{}, 'latest', { [address]: { code: '0x6001' } }],
      },
      { [address]: '0x6000' },
    ),
  ).toThrow('Simulation code substitution');
});
it('preserves tracer settings and rejects batch RPC requests at the simulation boundary', () => {
  const result = applyBundlerSimulationOverrides(
    {
      method: 'debug_traceCall',
      params: [{}, 'latest', { tracer: 'callTracer', stateOverrides: {} }],
    },
    { [address]: '0x6000' },
  );
  expect(result.params[2]).toEqual({
    tracer: 'callTracer',
    stateOverrides: { [address]: { code: '0x6000' } },
  });
  expect(() =>
    applyBundlerSimulationOverrides([] as never, { [address]: '0x6000' }),
  ).toThrow();
});

it('bounds unsigned gas against the deployed EntryPoint without signing, broadcasting or changing operation inputs', async () => {
  const { estimateNativeUserOperationGas } =
    await import('../scripts/bundler-simulations.mjs');
  const { Interface } = await import('ethers');
  const abi = new Interface([
    'error FailedOp(uint256,string)',
    'function handleOps((address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes)[],address)',
  ]);
  const operation = {
    sender: '0x1111111111111111111111111111111111111111',
    nonce: '0x0',
    callData: '0x1234',
    verificationGasLimit: '0x493e0',
    callGasLimit: '0x493e0',
    preVerificationGas: '0x10000',
    maxFeePerGas: '0x2',
    maxPriorityFeePerGas: '0x1',
    paymaster: '0x2222222222222222222222222222222222222222',
    paymasterVerificationGasLimit: '0x186a0',
    paymasterPostOpGasLimit: '0xc350',
    paymasterData: '0x' + '11'.repeat(77),
    signature: '0x' + '11'.repeat(77),
  };
  const before = structuredClone(operation),
    block = { number: '0x64', hash: '0x' + '11'.repeat(32) };
  let calls = 0,
    reorg = false,
    unexpected = false,
    callGas = '0x30000';
  const request = async (
    method: string,
    params: unknown[],
  ): Promise<Record<string, unknown>> => {
    if (method === 'eth_getBlockByNumber')
      return {
        result: {
          ...block,
          ...(reorg && params[0] === block.number
            ? { hash: '0x' + '22'.repeat(32) }
            : {}),
        },
      };
    if (method === 'eth_estimateGas') {
      expect(params[1]).toBe(block.number);
      expect(params).toHaveLength(2);
      return { result: callGas };
    }
    expect(method).toBe('eth_call');
    calls++;
    const tx = params[0] as { to: string; data: string };
    expect(tx.to).toBe(address);
    expect(params[1]).toBe(block.number);
    expect(params).toHaveLength(2);
    const gas =
      BigInt(abi.decodeFunctionData('handleOps', tx.data)[0][0][4]) >> 128n;
    return {
      error: {
        code: 3,
        data: abi.encodeErrorResult('FailedOp', [
          0,
          unexpected
            ? 'AA25 invalid nonce'
            : gas >= 124000n
              ? 'AA24 signature error'
              : 'AA26 over verificationGasLimit',
        ]),
      },
    };
  };
  const input = {
    operation,
    estimate: { verificationGasLimit: '0x115fd', callGasLimit: '0x10000' },
    entryPoint: address,
    request,
  };
  const result = await estimateNativeUserOperationGas(input);
  expect(BigInt(result.verificationGasLimit)).toBeGreaterThanOrEqual(124000n);
  expect(BigInt(result.verificationGasLimit)).toBeLessThan(126048n);
  expect(result.callGasLimit).toBe('0x30000');
  expect(calls).toBeLessThanOrEqual(10);
  expect(operation).toEqual(before);
  callGas = '0x124f80';
  const composed = {
    ...input,
    operation: { ...operation, callGasLimit: '0x4c4b40' },
  };
  expect((await estimateNativeUserOperationGas(composed)).callGasLimit).toBe(
    callGas,
  );
  await expect(estimateNativeUserOperationGas(input)).rejects.toThrow(
    'Call gas estimate unavailable',
  );
  callGas = '0x0';
  await expect(estimateNativeUserOperationGas(composed)).rejects.toThrow(
    'Call gas estimate unavailable',
  );
  callGas = '0x4c4b41';
  await expect(estimateNativeUserOperationGas(composed)).rejects.toThrow(
    'Call gas estimate unavailable',
  );
  callGas = '0x30000';
  await expect(
    estimateNativeUserOperationGas({
      ...composed,
      estimate: { ...input.estimate, callGasLimit: '0x4c4b41' },
    }),
  ).rejects.toThrow('Call gas estimate unavailable');
  reorg = true;
  await expect(estimateNativeUserOperationGas(input)).rejects.toThrow(
    'Verification block changed',
  );
  reorg = false;
  unexpected = true;
  await expect(estimateNativeUserOperationGas(input)).rejects.toThrow(
    'EntryPoint estimate unavailable',
  );
  unexpected = false;
  await expect(
    estimateNativeUserOperationGas({
      ...input,
      operation: { ...operation, verificationGasLimit: '0x186a0' },
    }),
  ).rejects.toThrow('Verification gas exceeds ceiling');
});
