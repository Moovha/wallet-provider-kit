import { expect, it, vi, afterEach } from 'vitest';
import {
  requiredPaymasterPrefund,
  reservePaymasterPrefund,
} from '../scripts/bundler-funding.mjs';
import {
  patchBundlerFunding,
  patchBundlerSenderAcquisition,
} from '../scripts/patch-bundler-scheduling.mjs';
import { createHash } from 'node:crypto';
const paymaster = '0x' + '1'.repeat(40),
  entryPoint = '0x' + '2'.repeat(40);
const operation = {
  paymaster,
  callGasLimit: 10n,
  verificationGasLimit: 10n,
  preVerificationGas: 5n,
  paymasterVerificationGasLimit: 3n,
  paymasterPostOpGasLimit: 2n,
  maxFeePerGas: 1n,
};
afterEach(() => vi.useRealTimers());
it('fits a cumulative bundle within one fresh deposit read and keeps deferred operations available for a later balance', async () => {
  const scope = {},
    balances: Record<string, bigint> = {},
    readBalance = vi.fn(async () => 150n);
  const selected = [];
  for (let i = 0; i < 8; i++)
    selected.push(
      await reservePaymasterPrefund({
        scope,
        entryPoint,
        userOp: operation,
        balances,
        readBalance,
      }),
    );
  expect(requiredPaymasterPrefund(operation)).toBe(30n);
  expect(selected).toEqual([true, true, true, true, true, false, false, false]);
  expect(readBalance).toHaveBeenCalledOnce();
  expect(balances[paymaster]).toBe(0n);
  const next: Record<string, bigint> = {};
  expect(
    await reservePaymasterPrefund({
      scope,
      entryPoint,
      userOp: operation,
      balances: next,
      readBalance,
    }),
  ).toBe(true);
  expect(readBalance).toHaveBeenCalledTimes(2);
});
it('backs off unchanged insufficient or unavailable funding without using cached negative evidence to approve a smaller operation', async () => {
  vi.useFakeTimers();
  const scope = {},
    readBalance = vi.fn(async () => 20n);
  const check = (op = operation) =>
    reservePaymasterPrefund({
      scope,
      entryPoint,
      userOp: op,
      balances: {},
      readBalance,
    });
  expect(await check()).toBe(false);
  expect(await check()).toBe(false);
  expect(readBalance).toHaveBeenCalledOnce();
  expect(await check({ ...operation, callGasLimit: 0n })).toBe(true);
  expect(readBalance).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(2001);
  readBalance.mockRejectedValueOnce(Error('Offline unavailable'));
  expect(await check()).toBe(false);
  expect(await check()).toBe(false);
  expect(readBalance).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(2001);
  expect(await check()).toBe(false);
  expect(readBalance).toHaveBeenCalledTimes(4);
});
it('isolates EntryPoints, paymasters and client scopes, and fails closed for malformed gas fields', async () => {
  const readBalance = vi.fn(async () => 0n),
    scope = {};
  for (const input of [
    { scope, entryPoint, userOp: operation },
    { scope: {}, entryPoint, userOp: operation },
    { scope, entryPoint: '0x' + '3'.repeat(40), userOp: operation },
    {
      scope,
      entryPoint,
      userOp: { ...operation, paymaster: '0x' + '4'.repeat(40) },
    },
  ])
    expect(
      await reservePaymasterPrefund({ ...input, balances: {}, readBalance }),
    ).toBe(false);
  expect(readBalance).toHaveBeenCalledTimes(4);
  expect(() =>
    requiredPaymasterPrefund({ ...operation, maxFeePerGas: -1n }),
  ).toThrow();
  expect(() =>
    requiredPaymasterPrefund({ ...operation, callGasLimit: 1n << 128n }),
  ).toThrow();
});
it('patches only the pinned trusted-pool selection branch and rejects already modified or unexpected source', () => {
  const source =
    'class Mempool { async shouldSkip() { const {userOp}=userOpInfo; if (!this.config.safeMode) { return { skip: false, paymasterDeposit }; } return {skip:true}; } }';
  const hash = createHash('sha256').update(source).digest('hex');
  const result = patchBundlerFunding(source, hash);
  expect(result).toContain(
    'skip: privateOperationExpired(userOp) || !(await reservePaymasterPrefund',
  );
  expect(result).toContain('return {skip:true}');
  expect(result).not.toContain('\\n');
  expect(() => patchBundlerFunding(result, hash)).toThrow('source mismatch');
});

it('patches only the pinned successful-acquisition delay and rejects source drift', () => {
  const source =
    'while (!walletAddress) { walletAddress = await walletPool.pop(); await delay(100); } activeWallets.add(wallet);';
  const hash = createHash('sha256').update(source).digest('hex');
  const patched = patchBundlerSenderAcquisition(source, hash);
  expect(patched).toContain('if (!walletAddress) await delay(100)');
  expect(() => patchBundlerSenderAcquisition(patched, hash)).toThrow(
    'source mismatch',
  );
});

it('recovers a bounded pre-broadcast read outage without repeating healthy reads', async () => {
  const { readBundleParameter } =
    await import('../scripts/bundler-funding.mjs');
  let healthy = 0;
  let failing = 0;
  const delays: number[] = [];
  const result = await Promise.all([
    readBundleParameter(async () => ++healthy),
    readBundleParameter(
      async () => {
        if (++failing < 4) throw Error('Offline transient read');
        return 7;
      },
      async (ms) => {
        delays.push(ms);
      },
    ),
  ]);
  expect(result).toEqual([1, 7]);
  expect(healthy).toBe(1);
  expect(failing).toBe(4);
  expect(delays).toEqual([1000, 2000, 4000]);
  const error = Error('Offline persistent failure');
  let calls = 0;
  await expect(
    readBundleParameter(
      async () => {
        calls++;
        throw error;
      },
      async () => {},
    ),
  ).rejects.toBe(error);
  expect(calls).toBe(4);
});
