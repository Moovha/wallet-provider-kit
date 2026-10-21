import { expect, it } from 'vitest';
import { RpcReader } from '../src/execution/chain.js';
import { readUserOperationLogs } from '../src/execution/user-operation-logs.js';

const topic = '0x' + 'a'.repeat(64);
const address = '0x' + '1'.repeat(40);
const filter = (index: number) => ({
  address,
  fromBlock: '0x64',
  toBlock: '0x65',
  topics: [topic, '0x' + index.toString(16).padStart(64, '0')] as [
    string,
    string,
  ],
});
it('combines ten concurrent scans and returns only each operation’s logs without caching completed reads', async () => {
  const calls: unknown[] = [];
  const transport = (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push(body.params[0]);
    const selected = body.params[0].topics[1];
    return Response.json({
      jsonrpc: '2.0',
      id: body.id,
      result: (Array.isArray(selected) ? selected : [selected]).map((hash) => ({
        address,
        topics: [topic, hash],
        transactionHash: hash,
      })),
    });
  }) as typeof fetch;
  const reader = () =>
    new RpcReader('https://rpc.example.test', transport, 4, true);
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      readUserOperationLogs(reader(), filter(i)),
    ),
  );
  expect(calls).toHaveLength(1);
  results.forEach((logs, i) =>
    expect(logs).toEqual([
      {
        address,
        topics: filter(i).topics,
        transactionHash: filter(i).topics[1],
      },
    ]),
  );
  await readUserOperationLogs(reader(), filter(0));
  expect(calls).toHaveLength(2);
});
it('keeps endpoints and block ranges separate, and rejects unsolicited operation logs for every caller', async () => {
  let calls = 0;
  const transport = (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    calls++;
    return Response.json({ jsonrpc: '2.0', id: body.id, result: [] });
  }) as typeof fetch;
  const reader = new RpcReader('https://rpc.example.test', transport, 4, true);
  const other = new RpcReader('https://other.example.test', transport, 4, true);
  await Promise.all([
    readUserOperationLogs(reader, filter(0)),
    readUserOperationLogs(reader, { ...filter(1), toBlock: '0x66' }),
    readUserOperationLogs(other, filter(2)),
  ]);
  expect(calls).toBe(3);
  const bad = new RpcReader('https://bad.example.test', (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    return Response.json({
      jsonrpc: '2.0',
      id: body.id,
      result: [{ address, topics: filter(99).topics }],
    });
  }) as typeof fetch);
  const outcomes = await Promise.allSettled([
    readUserOperationLogs(bad, filter(0)),
    readUserOperationLogs(bad, filter(1)),
  ]);
  expect(outcomes.every((result) => result.status === 'rejected')).toBe(true);
});
