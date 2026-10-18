import { describe, expect, it } from 'vitest';
import {
  diagnoseExecution,
  checkedInspection,
  type NonceSnapshot,
} from '../src/execution/recovery.js';
import { QuorumExecutionObserver } from '../src/execution/chain.js';
import { executionFixture } from './helpers/execution.js';
const configuration = { stuckAfterSeconds: 30, quarantineOnStuck: true };
function snapshot(): NonceSnapshot {
  return {
    confirmedNonce: '0',
    finalizedNonce: '0',
    pendingNonceMinimum: '1',
    pendingNonceMaximum: '2',
    balanceWei: '1000000000000000000',
    baseFeePerGas: '1000000000',
    transactionNonce: '0',
  };
}
describe('stuck transaction diagnosis', () => {
  it.each([
    'funding',
    'fees',
    'gap',
    'missing',
    'consumed',
    'conflict',
    'unavailable',
    'pending',
  ] as const)(
    'classifies %s without authorizing dispatch or inventing settlement',
    async (kind) => {
      const f = executionFixture(),
        plan = await f.plan(),
        chain = snapshot();
      if (kind === 'funding') chain.balanceWei = '0';
      if (kind === 'fees') chain.baseFeePerGas = '4000000000';
      if (kind === 'gap') chain.transactionNonce = '2';
      if (kind === 'missing') delete chain.transactionNonce;
      if (kind === 'consumed')
        chain.finalizedNonce = chain.confirmedNonce = '1';
      const result = diagnoseExecution({
        plan,
        configuration,
        startedAt: 1000,
        now: 32000,
        snapshot: kind === 'unavailable' ? undefined : chain,
        knownNonce: kind === 'conflict' ? '1' : undefined,
        inspection: { status: 'submitted', nonce: '0' },
      });
      const reasons = {
        funding: 'insufficient-sponsor-funds',
        fees: 'fee-cap-below-base-fee',
        gap: 'nonce-gap-suspected',
        missing: 'transaction-not-visible',
        consumed: 'nonce-consumed-without-result',
        conflict: 'provider-nonce-conflict',
        unavailable: 'evidence-unavailable',
        pending: 'pending-too-long',
      };
      expect(result.reason).toBe(reasons[kind]);
      expect(result.quarantined).toBe(true);
      expect(result).not.toHaveProperty('settlement');
    },
  );
  it('distinguishes the suspicion threshold, inclusion and verified finality', async () => {
    const plan = await executionFixture().plan();
    expect(
      diagnoseExecution({
        plan,
        configuration,
        startedAt: 1000,
        now: 29999,
        snapshot: snapshot(),
      }).state,
    ).toBe('observing');
    const observation = {
      chain_status: 'included' as const,
      verification: 'rpc-quorum' as const,
      outcome: 'succeeded' as const,
      settlement: 'pending' as const,
      observed_at: new Date().toISOString(),
    };
    expect(
      diagnoseExecution({
        plan,
        configuration,
        startedAt: 1000,
        now: 32000,
        observation,
      }).state,
    ).toBe('awaiting-finality');
    expect(
      diagnoseExecution({
        plan,
        configuration,
        startedAt: 1000,
        now: 32000,
        observation: {
          ...observation,
          chain_status: 'finalized',
          settlement: 'succeeded',
        },
      }).state,
    ).toBe('finalized');
  });
  it('rejects malformed provider metadata rather than converting it into nonce authority', () => {
    for (const value of [
      { status: 'submitted', nonce: 0 },
      { status: 'submitted', nonce: '01' },
      { status: 'submitted', nonce: '9'.repeat(78) },
      { status: 'submitted', transactionHash: 'arbitrary' },
      { status: 'submitted', rawUrl: 'https://private.example.test' },
    ])
      expect(() => checkedInspection(value)).toThrow();
  });
});
describe('independent nonce evidence', () => {
  it('compares canonical nonce/funding evidence while retaining different local pending counts as hints', async () => {
    const f = executionFixture(),
      plan = await f.plan();
    f.state.mutate = (method, result, origin, params) =>
      method === 'eth_getTransactionCount' && params[1] === 'pending'
        ? origin.includes('primary')
          ? '0x2'
          : '0x3'
        : result;
    const observer = new QuorumExecutionObserver(
      ['https://primary.example.test', 'https://secondary.example.test'],
      f.configuration.rpc.genesisHash,
      10000,
      f.request,
    );
    expect(await observer.nonceSnapshot(plan)).toMatchObject({
      confirmedNonce: '0',
      finalizedNonce: '0',
      pendingNonceMinimum: '2',
      pendingNonceMaximum: '3',
    });
    f.state.mutate = (method, result, origin, params) =>
      method === 'eth_getTransactionCount' &&
      params[1] !== 'pending' &&
      origin.includes('primary')
        ? '0x1'
        : result;
    await expect(observer.nonceSnapshot(plan)).rejects.toThrow();
  });
  it('does not trust a pending hash whose sender, calldata or nonce conflicts across RPC sources', async () => {
    const f = executionFixture(),
      plan = await f.plan();
    f.state.data = plan.data;
    f.state.included = true;
    const observer = new QuorumExecutionObserver(
      ['https://primary.example.test', 'https://secondary.example.test'],
      f.configuration.rpc.genesisHash,
      10000,
      f.request,
    );
    expect(
      (await observer.nonceSnapshot(plan, f.transactionHash)).transactionNonce,
    ).toBe('0');
    f.state.mutate = (method, result, origin) =>
      method === 'eth_getTransactionByHash' && origin.includes('secondary')
        ? { ...(result as object), nonce: '0x1' }
        : result;
    await expect(
      observer.nonceSnapshot(plan, f.transactionHash),
    ).rejects.toThrow();
  });
});
