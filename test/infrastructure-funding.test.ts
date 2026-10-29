import { expect, it } from 'vitest';
import {
  infrastructureFundingPlan,
  percentageFundingPlan,
} from '../src/sponsorship/infrastructure-funding.js';
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
  let fundingMode: 'balance' | undefined;
  let fundingBalance = '27';
  Object.assign(runtime, {
    resources: {
      acceptedSponsorship: async () => ({
        value: {
          account_model: 'provider-controlled-user-safe',
          funding_mode: fundingMode,
        },
      }),
    },
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
      transactions: [
        {
          included: true,
          maximumCostWei: '98',
          purpose: 'paymaster-deposit-0',
        },
      ],
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
            : fundingBalance;
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
  fundingMode = 'balance';
  await expect(runtime.replenish('application-c')).rejects.toMatchObject({
    reason: 'needs-funding',
  });
  fundingBalance = '100';
  await runtime.replenish('application-c');
  expect(send).toHaveBeenCalledTimes(2);
  expect(runtime.fundingObservation('application-c').status).toBe('ready');
  send.mockClear();
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

const allocation = {
  paymasterBasisPoints: 8500,
  bundlerBasisPoints: 500,
  reserveBasisPoints: 1000,
  feeReserveWei: '100',
  minimumRefillWei: '10',
};
it('splits new funding after fees, protects the reserve and never withdraws active funds', () => {
  const plan = percentageFundingPlan(
    { deposit: 0n, executor: 0n, funding: 10100n, allowance: 10100n },
    allocation,
  );
  expect(plan).toEqual({
    deposit: 8500n,
    executor: 500n,
    reserve: 1100n,
    status: 'replenishing',
  });
  expect(
    percentageFundingPlan(
      { deposit: 8500n, executor: 500n, funding: 1100n, allowance: 10100n },
      allocation,
    ).status,
  ).toBe('ready');
  const topup = percentageFundingPlan(
    { deposit: 8500n, executor: 500n, funding: 11100n, allowance: 20100n },
    allocation,
  );
  expect(topup.deposit).toBe(8500n);
  expect(topup.executor).toBe(500n);
  expect(topup.reserve).toBe(2100n);
  const excess = percentageFundingPlan(
    { deposit: 9500n, executor: 500n, funding: 100n, allowance: 10100n },
    allocation,
  );
  expect(excess.deposit).toBe(0n);
  expect(excess.executor).toBe(0n);
});
it('bounds each refill, avoids dust and rejects invalid allocation percentages', () => {
  const plan = percentageFundingPlan(
    { deposit: 0n, executor: 0n, funding: 10100n, allowance: 1100n },
    allocation,
  );
  expect(plan.deposit + plan.executor).toBe(1000n);
  expect(plan.reserve).toBe(1100n);
  expect(
    percentageFundingPlan(
      { deposit: 8499n, executor: 500n, funding: 1101n, allowance: 10100n },
      allocation,
    ).status,
  ).toBe('ready');
  expect(() =>
    percentageFundingPlan(
      { deposit: 0n, executor: 0n, funding: 10100n, allowance: 10100n },
      { ...allocation, reserveBasisPoints: 999 },
    ),
  ).toThrow();
});
it('denies spending protected reserves before signing or broadcasting', async () => {
  const runtime = Object.create(SafeWalletRuntime.prototype);
  const e = new Interface([
    'function balanceOf(address) view returns(uint256)',
  ]);
  Object.assign(runtime, {
    config: {
      safeWallet: {
        maximumSetupCostWei: '10100',
        fundingAllocation: allocation,
      },
    },
    domain: { entryPoint: 'entry' },
    current: async () => ({
      fundingAddress: 'funding',
      executor: { address: 'executor' },
      paymaster: { address: '0x' + '22'.repeat(20) },
      transactions: [],
    }),
  });
  const reader = {
    call: async (method: string, params: unknown[]) =>
      method === 'eth_call'
        ? e.encodeFunctionResult('balanceOf', [8500n])
        : params[0] === 'executor'
          ? '500'
          : '1100',
  };
  await expect(
    runtime.assertFundingReserve(
      'app',
      { id: 'test', maximumCostWei: '91' },
      reader,
    ),
  ).rejects.toMatchObject({ reason: 'needs-funding' });
});

it('retains current estimated refill fees before calculating percentage funding targets', async () => {
  const entry = new Interface([
    'function balanceOf(address) view returns (uint256)',
  ]);
  const runtime = Object.create(SafeWalletRuntime.prototype);
  let price = '10';
  let pendingWallet = false;
  const send = vi.fn();
  const estimate = vi.fn(async () => '0x14');
  Object.assign(runtime, {
    resources: {
      acceptedSponsorship: async () => ({
        value: {
          account_model: 'provider-controlled-user-safe',
          chain_id: 'eip155:11155111',
          funding_mode: 'balance',
        },
      }),
    },
    config: {
      safeWallet: {
        maximumSetupCostWei: '10100',
        paymasterDepositWei: '60',
        executorBalanceWei: '30',
        fundingAllocation: allocation,
      },
    },
    domain: { entryPoint: '0x' + '11'.repeat(20) },
    transaction: async (
      work: (state: { safeWalletAccounts: Record<string, unknown> }) => unknown,
    ) =>
      work({
        safeWalletAccounts: pendingWallet
          ? {
              test: {
                applicationId: 'application',
                accountId: 'test',
                status: 'prepared',
                recovery: {
                  factory: { address: '0x' + '33'.repeat(20) },
                  singleton: { address: '0x' + '44'.repeat(20) },
                  initializer: '0x',
                  saltNonce: '1',
                },
              },
            }
          : {},
      }),
    assertRecoveryRecipe: vi.fn(),
    fundingObservations: new Map(),
    recoverSetup: async () => {},
    current: async () => ({
      paymaster: { address: '0x' + '22'.repeat(20) },
      executor: { address: 'executor' },
      fundingAddress: 'funding',
      transactions: [],
    }),
    reader: async () => ({
      call: async (method: string, parameters: unknown[]) =>
        method === 'eth_call'
          ? entry.encodeFunctionResult('balanceOf', [0n])
          : parameters[0] === 'executor'
            ? '0'
            : '10100',
    }),
    networkFees: async () => ({ maxFeePerGas: price }),
    infrastructureRpc: estimate,
    send,
  });
  await runtime.replenish('application');
  expect(estimate).toHaveBeenCalledTimes(2);
  expect(send.mock.calls.map((call) => call[2].value)).toEqual(['8131', '478']);
  send.mockClear();
  price = '20';
  await runtime.replenish('application');
  expect(send.mock.calls.map((call) => call[2].value)).toEqual(['7678', '451']);
  send.mockClear();
  estimate.mockResolvedValueOnce('-1');
  await expect(runtime.replenish('application')).rejects.toMatchObject({
    code: 'wallet_provider_unavailable',
  });
  expect(send).not.toHaveBeenCalled();
  estimate.mockClear();
  estimate.mockResolvedValue('0x14');
  price = '10';
  pendingWallet = true;
  await runtime.replenish('application');
  expect(estimate).toHaveBeenCalledTimes(3);
  expect(send.mock.calls.map((call) => call[2].value)).toEqual(['7905', '465']);
});

it('reports insufficient funding when the fee buffer consumes all available balances', () => {
  expect(
    percentageFundingPlan(
      { deposit: 0n, executor: 0n, funding: 100n, allowance: 1000n },
      allocation,
    ).status,
  ).toBe('needs-funding');
});

it('retains a spendable provisioning allocation separately from the protected reserve', async () => {
  const policy = {
    ...allocation,
    paymasterBasisPoints: 6000,
    bundlerBasisPoints: 1000,
    provisioningBasisPoints: 2000,
    reserveBasisPoints: 1000,
  };
  const plan = percentageFundingPlan(
    { deposit: 0n, executor: 0n, funding: 10100n, allowance: 10100n },
    policy,
  );
  expect(plan).toEqual({
    deposit: 6000n,
    executor: 1000n,
    reserve: 3100n,
    status: 'replenishing',
  });
  const runtime = Object.create(SafeWalletRuntime.prototype);
  const entry = new Interface([
    'function balanceOf(address) view returns(uint256)',
  ]);
  Object.assign(runtime, {
    config: { safeWallet: { fundingAllocation: policy } },
    domain: { entryPoint: 'entry' },
    current: async () => ({
      fundingAddress: 'funding',
      executor: { address: 'executor' },
      paymaster: { address: '0x' + '22'.repeat(20) },
      transactions: [],
    }),
  });
  const reader = {
    call: async (method: string, params: unknown[]) =>
      method === 'eth_call'
        ? entry.encodeFunctionResult('balanceOf', [6000n])
        : params[0] === 'executor'
          ? '1000'
          : '3100',
  };
  // Provisioning can spend its allocation while the 10% reserve remains untouched.
  await expect(
    runtime.assertFundingReserve(
      'app',
      { id: 'setup', maximumCostWei: '2000' },
      reader,
    ),
  ).resolves.toBeUndefined();
  await expect(
    runtime.assertFundingReserve(
      'app',
      { id: 'setup', maximumCostWei: '2091' },
      reader,
    ),
  ).rejects.toMatchObject({ reason: 'needs-funding' });
  for (const provisioningBasisPoints of [-1, 2001, 0.5, 10000])
    expect(() =>
      percentageFundingPlan(
        { deposit: 0n, executor: 0n, funding: 10100n, allowance: 10100n },
        { ...policy, provisioningBasisPoints },
      ),
    ).toThrow();
});

it('refills below a low-water mark to the target without topping up after every small spend', () => {
  const input = {
    deposit: 40n,
    depositTarget: 60n,
    executor: 20n,
    executorTarget: 30n,
    funding: 100n,
    allowance: 100n,
  };
  expect(infrastructureFundingPlan(input, 5000)).toMatchObject({
    deposit: 0n,
    executor: 0n,
    status: 'ready',
  });
  expect(
    infrastructureFundingPlan({ ...input, deposit: 29n }, 5000),
  ).toMatchObject({ deposit: 31n, executor: 0n, status: 'replenishing' });
  expect(infrastructureFundingPlan(input, 10000)).toMatchObject({
    deposit: 20n,
    executor: 10n,
  });
  expect(() => infrastructureFundingPlan(input, 0)).toThrow(
    'wallet_provider_configuration',
  );
});
it('applies the same hysteresis to percentage allocation without changing reserve protection', () => {
  const balanced = {
    deposit: 5000n,
    executor: 400n,
    funding: 4700n,
    allowance: 10100n,
  };
  expect(percentageFundingPlan(balanced, allocation, 5000)).toMatchObject({
    deposit: 0n,
    executor: 0n,
    status: 'ready',
  });
  const low = percentageFundingPlan(
    { ...balanced, deposit: 4000n, funding: 5700n },
    allocation,
    5000,
  );
  expect(low.deposit).toBeGreaterThan(0n);
  expect(low.executor).toBe(0n);
  expect(low.reserve).toBeGreaterThanOrEqual(100n);
});
