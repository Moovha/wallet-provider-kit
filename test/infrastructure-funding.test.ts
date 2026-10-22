import { expect, it } from 'vitest';
import { infrastructureFundingPlan } from '../src/sponsorship/infrastructure-funding.js';
it('distinguishes target balances, funding liquidity and authorized infrastructure headroom', () => {
  const input = {
    deposit: 15n,
    depositTarget: 60n,
    executor: 19n,
    executorTarget: 30n,
    funding: 27n,
    allowance: 2n,
  };
  expect(infrastructureFundingPlan(input)).toEqual({
    deposit: 45n,
    executor: 11n,
    status: 'limit-reached',
  });
  expect(infrastructureFundingPlan({ ...input, allowance: 100n }).status).toBe(
    'needs-funding',
  );
  expect(
    infrastructureFundingPlan({ ...input, allowance: 100n, funding: 100n })
      .status,
  ).toBe('replenishing');
  expect(
    infrastructureFundingPlan({ ...input, deposit: 60n, executor: 30n }).status,
  ).toBe('ready');
});

import { Interface } from 'ethers';
import { SafeWalletRuntime } from '../src/sponsorship/safe-wallet.js';
import { vi } from 'vitest';

it('reports infeasible refills before fee estimates or dispatch and keeps funding observations application scoped', async () => {
  const entry = new Interface([
    'function balanceOf(address) view returns (uint256)',
  ]);
  const runtime = Object.create(SafeWalletRuntime.prototype);
  const calls: string[] = [];
  const send = vi.fn();
  let targetsMet = false;
  Object.assign(runtime, {
    config: {
      safeWallet: {
        maximumSetupCostWei: '100',
        paymasterDepositWei: '60',
        executorBalanceWei: '30',
      },
    },
    domain: { entryPoint: '0x' + '11'.repeat(20) },
    fundingObservations: new Map(),
    recoverSetup: async () => {},
    current: async () => ({
      paymaster: { address: '0x' + '22'.repeat(20) },
      executor: { address: 'executor' },
      fundingAddress: 'funding',
      transactions: [{ included: true, maximumCostWei: '98' }],
    }),
    reader: async () => ({
      call: async (method: string, parameters: unknown[]) => {
        calls.push(method);
        if (method === 'eth_call')
          return entry.encodeFunctionResult('balanceOf', [
            targetsMet ? 60n : 15n,
          ]);
        if (method === 'eth_getBalance')
          return parameters[0] === 'executor'
            ? targetsMet
              ? '30'
              : '19'
            : '27';
        throw Error('Unexpected financial preparation');
      },
    }),
    send,
  });
  await expect(runtime.replenish('application-a')).rejects.toMatchObject({
    reason: 'limit-reached',
  });
  expect(calls).toEqual(['eth_call', 'eth_getBalance', 'eth_getBalance']);
  expect(send).not.toHaveBeenCalled();
  expect(runtime.fundingObservation('application-a').status).toBe(
    'limit-reached',
  );
  expect(runtime.fundingObservation('application-b').status).toBe('checking');
  // Reading an observation performs no RPC and cannot initiate a refill.
  runtime.fundingObservation('application-a');
  expect(calls).toHaveLength(3);
  targetsMet = true;
  calls.length = 0;
  await runtime.replenish('application-b');
  expect(runtime.fundingObservation('application-b').status).toBe('ready');
  expect(runtime.fundingObservation('application-a').status).toBe(
    'limit-reached',
  );
  expect(calls).toEqual(['eth_call', 'eth_getBalance']);
  expect(send).not.toHaveBeenCalled();
});
