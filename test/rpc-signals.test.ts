import { expect, it, vi } from 'vitest';
import { RpcSignals } from '../src/execution/rpc-signals.js';
class Socket extends EventTarget {
  sent: { id: number; method: string; params: unknown[] }[] = [];
  send(value: string) {
    this.sent.push(JSON.parse(value));
  }
  close() {
    this.dispatchEvent(new Event('close'));
  }
  message(value: unknown) {
    this.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(value) }),
    );
  }
}
it('uses one chain-checked subscription, ignores unrelated hashes and treats tracked Flashblocks as hints only', () => {
  const socket = new Socket(),
    connect = vi.fn(() => socket as unknown as WebSocket),
    wake = vi.fn();
  const source = new RpcSignals(
    ['https://rpc.example.test/private'],
    '8453',
    connect,
  );
  const stop = source.subscribe(wake),
    second = source.subscribe(wake);
  expect(connect).toHaveBeenCalledOnce();
  socket.dispatchEvent(new Event('open'));
  expect(socket.sent[0].method).toBe('eth_chainId');
  socket.message({ id: 0, result: '0x2105' });
  expect(socket.sent).toHaveLength(3);
  socket.message({ id: 1, result: 'head' });
  socket.message({ id: 2, result: 'flash' });
  const hash = '0x' + 'a'.repeat(64);
  socket.message({
    method: 'eth_subscription',
    params: { subscription: 'flash', result: hash },
  });
  expect(wake).not.toHaveBeenCalled();
  source.track([hash]);
  socket.message({
    method: 'eth_subscription',
    params: { subscription: 'flash', result: hash },
  });
  expect(wake).toHaveBeenCalledOnce();
  expect(source.preconfirmation([hash])).toMatchObject({
    stage: 'preconfirmed',
    transaction_hash: hash,
  });
  socket.message({
    method: 'eth_subscription',
    params: { subscription: 'head', result: {} },
  });
  expect(wake).toHaveBeenCalledTimes(2);
  stop();
  second();
});
it('rejects a subscription on the wrong chain and releases reconnect timers on close', () => {
  const socket = new Socket(),
    wake = vi.fn();
  const source = new RpcSignals(
    ['https://rpc.example.test'],
    '8453',
    () => socket as unknown as WebSocket,
  );
  const stop = source.subscribe(wake);
  socket.dispatchEvent(new Event('open'));
  socket.message({ id: 0, result: '0x1' });
  expect(socket.sent).toHaveLength(1);
  expect(wake).not.toHaveBeenCalled();
  stop();
});
