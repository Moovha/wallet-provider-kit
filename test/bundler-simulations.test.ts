import { expect, it } from 'vitest';
import { applyBundlerSimulationOverrides } from '../scripts/bundler-simulations.mjs';
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
