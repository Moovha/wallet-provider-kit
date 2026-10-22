import type { RpcReader } from './chain.js';
import { WalletProviderError } from '../domain/signing.js';

interface LogFilter {
  address: string;
  fromBlock: string;
  toBlock: string;
  topics: [string, string];
}
interface Pending {
  hash: string;
  resolve(logs: unknown[]): void;
  reject(error: unknown): void;
}
interface Scan {
  reader: RpcReader;
  filter: LogFilter;
  pending: Pending[];
  timer?: ReturnType<typeof setTimeout>;
}
const scans = new WeakMap<object, Map<string, Scan>>();

/** Combine overlapping operation scans at the same endpoint, EntryPoint and exact block range. */
export function readUserOperationLogs(reader: RpcReader, filter: LogFilter) {
  let queues = scans.get(reader.readScope);
  if (!queues) {
    queues = new Map();
    scans.set(reader.readScope, queues);
  }
  const key = JSON.stringify([
    filter.address.toLowerCase(),
    filter.fromBlock,
    filter.toBlock,
    filter.topics[0],
  ]);
  return new Promise<unknown[]>((resolve, reject) => {
    let scan = queues.get(key);
    if (!scan) {
      scan = { reader, filter: structuredClone(filter), pending: [] };
      queues.set(key, scan);
      const selected = scan;
      scan.timer = setTimeout(() => flush(queues!, key, selected), 5);
    }
    scan.pending.push({
      hash: filter.topics[1].toLowerCase(),
      resolve,
      reject,
    });
    if (scan.pending.length >= 40) flush(queues, key, scan);
  });
}
function flush(queues: Map<string, Scan>, key: string, scan: Scan) {
  if (queues.get(key) !== scan) return;
  queues.delete(key);
  clearTimeout(scan.timer);
  void read(scan).catch((error) => {
    for (const pending of scan.pending) pending.reject(error);
  });
}
async function read(scan: Scan) {
  const hashes = [...new Set(scan.pending.map((pending) => pending.hash))];
  const logs = await scan.reader.call('eth_getLogs', [
    {
      ...scan.filter,
      topics: [scan.filter.topics[0], hashes.length === 1 ? hashes[0] : hashes],
    },
  ]);
  const unavailable = () =>
    new WalletProviderError('wallet_attempt_unavailable', 'unknown');
  if (!Array.isArray(logs) || logs.length > hashes.length * 8)
    throw unavailable();
  const groups = new Map<string, unknown[]>();
  for (const log of logs) {
    if (!log || typeof log !== 'object' || Array.isArray(log))
      throw unavailable();
    const { address, topics } = log as Record<string, unknown>;
    if (
      typeof address !== 'string' ||
      address.toLowerCase() !== scan.filter.address.toLowerCase() ||
      !Array.isArray(topics) ||
      topics[0] !== scan.filter.topics[0] ||
      typeof topics[1] !== 'string' ||
      !hashes.includes(topics[1].toLowerCase())
    )
      throw unavailable();
    const hash = topics[1].toLowerCase();
    const group = groups.get(hash) ?? [];
    group.push(log);
    if (group.length > 8) throw unavailable();
    groups.set(hash, group);
  }
  for (const pending of scan.pending)
    pending.resolve(structuredClone(groups.get(pending.hash) ?? []));
}
