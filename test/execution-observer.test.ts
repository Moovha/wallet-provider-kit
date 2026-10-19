import { describe, expect, it } from 'vitest';
import { QuorumTransferObserver } from '../src/execution/chain.js';
import { createTransferExecutionProvider } from '../src/execution/relayer.js';
import { executionFixture } from './helpers/execution.js';

function observer(f: ReturnType<typeof executionFixture>) {
  return new QuorumTransferObserver(
    ['https://primary.example.test', 'https://secondary.example.test'],
    f.configuration.rpc.genesisHash,
    10000,
    f.request,
  );
}
describe('fixed transfer execution wire profile', () => {
  it('simulates without mutation and independently distinguishes inclusion, safe and finalized effects', async () => {
    const f = executionFixture();
    const plan = await f.plan();
    const chain = observer(f);
    expect(await chain.anchor()).toBe('100');
    await chain.preflight(plan);
    expect(f.state.posts).toBe(0);
    expect((await chain.observe(plan, [f.transactionHash])).verification).toBe(
      'unverified',
    );
    f.state.included = true;
    for (const phase of ['included', 'safe', 'finalized'] as const) {
      f.state.finality = phase;
      const result = await chain.observe(
        plan,
        [f.transactionHash],
        f.transactionHash,
      );
      expect(result).toMatchObject({
        chain_status: phase,
        verification: 'rpc-quorum',
        outcome: 'succeeded',
        settlement: phase === 'finalized' ? 'succeeded' : 'pending',
        block_hash: f.blockHash,
      });
    }
    expect(f.state.posts).toBe(0);
  });
  it.each([
    'wrong chain',
    'wrong genesis',
    'wrong code',
    'wrong domain',
    'used authorization',
    'insufficient gas balance',
    'simulation failure',
  ])('fails preflight closed for %s', async (condition) => {
    const f = executionFixture();
    const plan = await f.plan();
    f.state.mutate = (method, result) => {
      if (condition === 'wrong chain' && method === 'eth_chainId') return '0x1';
      if (condition === 'wrong genesis' && method === 'eth_getBlockByNumber')
        return { ...(result as object), hash: '0x' + 'f'.repeat(64) };
      if (condition === 'wrong code' && method === 'eth_getCode')
        return '0x6002';
      if (condition === 'wrong domain' && method === 'eth_call')
        return '0x' + 'f'.repeat(64);
      if (
        condition === 'used authorization' &&
        method === 'eth_call' &&
        result === '0x' + '0'.repeat(64)
      )
        return '0x' + '0'.repeat(63) + '1';
      if (
        condition === 'insufficient gas balance' &&
        method === 'eth_getBalance'
      )
        return '0x0';
      if (
        condition === 'simulation failure' &&
        method === 'eth_call' &&
        result === '0x'
      )
        return '0x01';
      return result;
    };
    await expect(observer(f).preflight(plan)).rejects.toThrow();
    expect(f.state.posts).toBe(0);
  });
  it.each([
    'missing transfer',
    'wrong amount',
    'wrong nonce',
    'different token',
    'different calldata',
    'different native value',
    'different receipt hash',
    'different transaction chain',
    'excessive sponsor fee',
    'different gas limit',
    'RPC disagreement',
  ])('never confirms %s', async (condition) => {
    const f = executionFixture();
    const plan = await f.plan();
    f.state.included = true;
    f.state.finality = 'finalized';
    f.state.mutate = (method, value, origin) => {
      if (method === 'eth_getTransactionReceipt' && value) {
        const receipt = structuredClone(value) as Record<string, any>;
        if (condition === 'missing transfer')
          receipt.logs = receipt.logs.slice(0, 1);
        if (condition === 'wrong amount')
          receipt.logs[1].data = '0x' + '0'.repeat(63) + '1';
        if (condition === 'wrong nonce')
          receipt.logs[0].topics[2] = '0x' + 'f'.repeat(64);
        if (condition === 'different token') receipt.to = '0x' + 'f'.repeat(40);
        if (condition === 'different receipt hash')
          receipt.transactionHash = '0x' + 'f'.repeat(64);
        if (condition === 'RPC disagreement' && origin.includes('secondary'))
          receipt.status = '0x0';
        return receipt;
      }
      if (method === 'eth_getTransactionByHash' && value) {
        if (condition === 'different transaction chain')
          return { ...(value as object), chainId: '0x1' };
        if (condition === 'excessive sponsor fee')
          return { ...(value as object), maxFeePerGas: '0xffffffffffff' };
        if (condition === 'different gas limit')
          return { ...(value as object), gas: '0xffff' };
        if (condition === 'different calldata')
          return { ...(value as object), input: '0x' };
        if (condition === 'different native value')
          return { ...(value as object), value: '0x1' };
      }
      return value;
    };
    let settled = false;
    try {
      settled =
        (
          await observer(f).observe(
            plan,
            [f.transactionHash],
            f.transactionHash,
          )
        ).settlement === 'succeeded';
    } catch {
      /* Invalid evidence is unavailable, never settled. */
    }
    expect(settled).toBe(false);
  });
  it('requires every RPC source to reach finality and handles canonical block changes', async () => {
    const f = executionFixture();
    const plan = await f.plan();
    f.state.included = true;
    f.state.finality = 'finalized';
    f.state.mutate = (method, value, origin, params) =>
      method === 'eth_getBlockByNumber' &&
      origin.includes('secondary') &&
      params[0] === 'finalized'
        ? { ...(value as object), number: '0x64' }
        : value;
    expect(
      (await observer(f).observe(plan, [f.transactionHash], f.transactionHash))
        .settlement,
    ).toBe('pending');
    f.state.mutate = (method, value) =>
      method === 'eth_getBlockByNumber' && (value as any).number === '0x65'
        ? { ...(value as object), hash: '0x' + 'f'.repeat(64) }
        : value;
    expect(
      (await observer(f).observe(plan, [f.transactionHash], f.transactionHash))
        .chain_status,
    ).toBe('reorged');
  });
  it('verifies a sponsor revert without claiming a transfer and ignores third-party reverted reports', async () => {
    const f = executionFixture();
    const plan = await f.plan();
    f.state.included = true;
    f.state.finality = 'finalized';
    f.state.transactionStatus = '0x0';
    expect(
      (await observer(f).observe(plan, [f.transactionHash], f.transactionHash))
        .settlement,
    ).toBe('reverted');
    expect(
      (await observer(f).observe(plan, [f.transactionHash])).settlement,
    ).toBe('pending');
  });
  it('submits only the stored zero-value token call and treats lost responses as unknown', async () => {
    const f = executionFixture();
    const plan = await f.plan();
    const provider = createTransferExecutionProvider(
      f.configuration,
      'ephemeral-offline-api-token',
      f.request,
    );
    await provider.prepare(plan);
    expect(await provider.submit(plan)).toBe(f.transactionId);
    expect(await provider.transactionHash(plan, f.transactionId)).toBe(
      f.transactionHash,
    );
    f.state.lostResponse = true;
    await expect(provider.submit(plan)).rejects.toMatchObject({
      outcome: 'unknown',
    });
  });
  it('advances bounded recovery scans only through finalized blocks and eventually finds a lost submission', async () => {
    const f = executionFixture();
    const plan = await f.plan();
    plan.scanFromBlock = '0';
    f.state.included = true;
    f.state.finality = 'finalized';
    const chain = new QuorumTransferObserver(
      ['https://primary.example.test', 'https://secondary.example.test'],
      f.configuration.rpc.genesisHash,
      100,
      f.request,
    );
    const first = await chain.observe(plan, []);
    expect(first.settlement).toBe('pending');
    expect(first.scanNextBlock).toBe('100');
    const next = await chain.observe(plan, [], undefined, first.scanNextBlock);
    expect(next.settlement).toBe('succeeded');
    expect(next.scanNextBlock).toBe('111');
  });
  it.each([
    'invalid JSON',
    'wrong envelope',
    'oversized body',
    'transport error',
  ])('sanitizes %s without leaking node data', async (condition) => {
    const f = executionFixture();
    const request = (async () => {
      if (condition === 'transport error') throw new Error('private-rpc-data');
      return new Response(
        condition === 'invalid JSON'
          ? 'private-rpc-data'
          : condition === 'oversized body'
            ? 'x'.repeat(262145)
            : JSON.stringify({
                jsonrpc: '2.0',
                id: 99,
                result: 'private-rpc-data',
              }),
      );
    }) as typeof fetch;
    const chain = new QuorumTransferObserver(
      ['https://primary.example.test', 'https://secondary.example.test'],
      f.configuration.rpc.genesisHash,
      100,
      request,
    );
    await expect(chain.anchor()).rejects.toMatchObject({
      code: 'wallet_provider_unavailable',
      outcome: 'unknown',
    });
  });
  it('refuses unsafe, repeated or insufficient RPC sources', () => {
    const f = executionFixture();
    for (const endpoints of [
      ['https://primary.example.test'],
      ['https://primary.example.test', 'https://primary.example.test/other'],
      ['http://primary.example.test', 'https://secondary.example.test'],
    ])
      expect(
        () =>
          new QuorumTransferObserver(
            endpoints,
            f.configuration.rpc.genesisHash,
            10000,
            f.request,
          ),
      ).toThrow();
  });
});

it.each(['owned', 'cached', 'missing'] as const)(
  'verifies a %s hash independently before relying on log-history availability',
  async (source) => {
    const f = executionFixture();
    const plan = await f.plan();
    f.state.included = true;
    f.state.finality = 'finalized';
    let scans = 0;
    f.state.mutate = (method, value) => {
      if (method === 'eth_getLogs') {
        scans++;
        throw Error('Offline history unavailable');
      }
      return value;
    };
    const read = observer(f).observe(
      plan,
      source === 'cached' ? [f.transactionHash] : [],
      source === 'owned' ? f.transactionHash : undefined,
    );
    if (source === 'missing') {
      await expect(read).rejects.toMatchObject({
        code: 'wallet_provider_unavailable',
      });
      expect(scans).toBeGreaterThan(0);
    } else {
      expect(await read).toMatchObject({
        verification: 'rpc-quorum',
        chain_status: 'finalized',
        outcome: 'succeeded',
        transaction_hash: f.transactionHash,
        scanNextBlock: plan.scanFromBlock,
      });
      expect(scans).toBe(0);
    }
    expect(f.state.posts).toBe(0);
  },
);
