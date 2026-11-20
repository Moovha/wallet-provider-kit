import { afterEach, expect, it, vi } from 'vitest';
import { Interface } from 'ethers';
import { FundingDepositReader } from '../src/sponsorship/funding-deposit.js';
const abi = new Interface([
  'function balanceOf(address) view returns(uint256)',
]);
const entryPoint = '0x' + '1'.repeat(40),
  paymaster = '0x' + '2'.repeat(40);
afterEach(() => vi.useRealTimers());
function fixture() {
  const head = { number: '0x10', hash: '0x' + 'a'.repeat(64) };
  let balance = 1000n,
    failHead = false,
    failBalance = false,
    canonical = head.hash;
  const reader = {
    readScope: {},
    call: vi.fn(async (method: string, params: unknown[]) => {
      if (method === 'eth_call') {
        if (failBalance) throw new Error('balance unavailable');
        return abi.encodeFunctionResult('balanceOf', [balance]);
      }
      if (params[0] === 'latest') {
        if (failHead) throw new Error('head unavailable');
        return { ...head };
      }
      return { hash: canonical };
    }),
  };
  const deposit = new FundingDepositReader();
  return {
    reader,
    head,
    deposit,
    setBalance: (value: bigint) => {
      balance = value;
    },
    setCanonical: (hash: string) => {
      canonical = hash;
    },
    failHead: () => {
      failHead = true;
    },
    failBalance: () => {
      failBalance = true;
    },
    read: () => deposit.read(reader, 'app', entryPoint, paymaster),
  };
}
it('reuses only an identical freshly observed head and preserves the original timestamp', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const first = await f.read();
  await vi.advanceTimersByTimeAsync(1000);
  first.balanceWei = '0';
  const second = await f.read();
  expect(second.balanceWei).toBe('1000');
  expect(second.checkedAt).toBe(first.checkedAt);
  expect(
    f.reader.call.mock.calls.filter((c) => c[0] === 'eth_call'),
  ).toHaveLength(1);
  expect(
    f.reader.call.mock.calls.filter((c) => c[1][0] === 'latest'),
  ).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(1001);
  await f.read();
  expect(
    f.reader.call.mock.calls.filter((c) => c[0] === 'eth_call'),
  ).toHaveLength(2);
});
it('refreshes after a new block or same-height reorg', async () => {
  const f = fixture();
  await f.read();
  f.head.number = '0x11';
  f.head.hash = '0x' + 'b'.repeat(64);
  f.setCanonical(f.head.hash);
  f.setBalance(900n);
  expect((await f.read()).balanceWei).toBe('900');
  f.head.hash = '0x' + 'c'.repeat(64);
  f.setCanonical(f.head.hash);
  f.setBalance(800n);
  expect((await f.read()).balanceWei).toBe('800');
  expect(
    f.reader.call.mock.calls.filter((c) => c[0] === 'eth_call'),
  ).toHaveLength(3);
});
it('never returns a stored balance when the current head is unavailable', async () => {
  const f = fixture();
  await f.read();
  f.failHead();
  await expect(f.read()).rejects.toThrow('head unavailable');
});
it('does not fall back to an old balance when a changed head cannot be read or verified', async () => {
  const f = fixture();
  await f.read();
  f.head.number = '0x11';
  f.failBalance();
  await expect(f.read()).rejects.toThrow('balance unavailable');
  const other = fixture();
  other.setCanonical('0x' + 'd'.repeat(64));
  await expect(other.read()).rejects.toMatchObject({
    code: 'wallet_authorization_denied',
  });
});
it('isolates the application, paymaster and RPC transport scopes', async () => {
  const f = fixture();
  await f.read();
  await f.deposit.read(f.reader, 'another-app', entryPoint, paymaster);
  await f.deposit.read(f.reader, 'app', entryPoint, '0x' + '3'.repeat(40));
  await f.deposit.read(
    { ...f.reader, readScope: {} },
    'app',
    entryPoint,
    paymaster,
  );
  expect(
    f.reader.call.mock.calls.filter((c) => c[0] === 'eth_call'),
  ).toHaveLength(4);
});
