import { randomBytes } from 'node:crypto';
import { Interface } from 'ethers';
import type { RpcReader } from './chain.js';
import type { SafeAccountBinding, PinnedContract } from './approved-calls.js';
import { safeStateReaderCode } from './safe-state-reader.generated.js';
import { WalletProviderError } from '../domain/signing.js';
const abi = new Interface([
  'function inspect(address wallet,address singleton,bytes32 proxyHash,bytes32 singletonHash,address owner) view returns (uint256)',
  'function inspect4337((address wallet,address singleton,address owner,address module,address entryPoint) profile,address[] targets,bytes32[] hashes,bool[] allowEmpty) view returns(uint256)',
  'function inspect4337Batch(((address wallet,address singleton,address owner,address module,address entryPoint) profile,address[] targets,bytes32[] hashes,bool[] allowEmpty)[] items) view returns(bool[] valid,uint256[] nonces)',
]);
/** Validate actual Safe state in one read-only EVM call; only the temporary reader receives a code override. */
export async function readSafeState(
  reader: RpcReader,
  binding: SafeAccountBinding,
  owner: string,
  tag: string,
): Promise<string> {
  let address: string;
  const inspected = [binding.address, binding.singleton.address, owner].map(
    (value) => value.toLowerCase(),
  );
  do {
    address = '0x' + randomBytes(20).toString('hex');
  } while (inspected.includes(address));
  const result = await reader.call('eth_call', [
    {
      to: address,
      gas: '0xf4240',
      value: '0x0',
      data: abi.encodeFunctionData('inspect', [
        binding.address,
        binding.singleton.address,
        binding.codeHash,
        binding.singleton.codeHash,
        owner,
      ]),
    },
    tag,
    { [address]: { code: safeStateReaderCode } },
  ]);
  if (typeof result !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(result))
    throw new WalletProviderError(
      'wallet_provider_unavailable',
      'not_dispatched',
    );
  return abi.decodeFunctionResult('inspect', result)[0].toString();
}

/** Fresh code, authority and EntryPoint nonce checks at the caller's fixed block. */
export async function readSafe4337State(
  reader: RpcReader,
  binding: SafeAccountBinding,
  owner: string,
  profile: { module: PinnedContract; entryPoint: PinnedContract },
  pins: PinnedContract[],
  tag: string,
  allowEmpty: boolean[] = pins.map(() => false),
): Promise<string> {
  const values = {
    profile: [
      binding.address,
      binding.singleton.address,
      owner,
      profile.module.address,
      profile.entryPoint.address,
    ],
    targets: pins.map((pin) => pin.address),
    hashes: pins.map((pin) => pin.codeHash),
    allowEmpty: [...allowEmpty],
  };
  const data = abi.encodeFunctionData('inspect4337', [
    values.profile,
    values.targets,
    values.hashes,
    values.allowEmpty,
  ]);
  return new Promise<string>((resolve, reject) => {
    const scope = reader.readScope;
    let queues = inspectionQueues.get(scope);
    if (!queues) {
      queues = new Map();
      inspectionQueues.set(scope, queues);
    }
    let queue = queues.get(tag);
    if (!queue) {
      queue = { reader, tag, pending: [] };
      queues.set(tag, queue);
      const selected = queue;
      queue.timer = setTimeout(() => flushInspection(queues!, selected), 5);
    }
    queue.pending.push({ values, data, owner, resolve, reject });
    if (queue.pending.length >= 40) flushInspection(queues, queue);
  });
}

interface Inspection {
  values: {
    profile: string[];
    targets: string[];
    hashes: string[];
    allowEmpty: boolean[];
  };
  data: string;
  owner: string;
  resolve(value: string): void;
  reject(error: unknown): void;
}
interface InspectionQueue {
  reader: RpcReader;
  tag: string;
  pending: Inspection[];
  timer?: ReturnType<typeof setTimeout>;
}
const inspectionQueues = new WeakMap<object, Map<string, InspectionQueue>>();
function flushInspection(
  queues: Map<string, InspectionQueue>,
  queue: InspectionQueue,
) {
  if (queues.get(queue.tag) !== queue) return;
  queues.delete(queue.tag);
  clearTimeout(queue.timer);
  while (queue.pending.length) {
    const group: Inspection[] = [];
    let bytes = 0;
    while (queue.pending.length && group.length < 10) {
      const next = queue.pending[0];
      const size = (next.data.length - 2) / 2;
      if (group.length && bytes + size > 48000) break;
      bytes += size;
      group.push(queue.pending.shift()!);
    }
    void inspectGroup(queue.reader, queue.tag, group).catch((error) => {
      for (const item of group) item.reject(error);
    });
  }
}
async function inspectGroup(
  reader: RpcReader,
  tag: string,
  group: Inspection[],
) {
  const inspected = new Set(
    group
      .flatMap((item) => [
        item.owner,
        ...item.values.targets,
        ...item.values.profile,
      ])
      .map((value) => value.toLowerCase()),
  );
  let address: string;
  do {
    address = '0x' + randomBytes(20).toString('hex');
  } while (inspected.has(address));
  const single = group.length === 1;
  const result = await reader.call('eth_call', [
    {
      to: address,
      gas:
        '0x' +
        (single ? 2000000 : group.length * 2100000 + 100000).toString(16),
      value: '0x0',
      data: single
        ? group[0].data
        : abi.encodeFunctionData('inspect4337Batch', [
            group.map((item) => item.values),
          ]),
    },
    tag,
    { [address]: { code: safeStateReaderCode } },
  ]);
  if (
    typeof result !== 'string' ||
    !/^0x(?:[0-9a-fA-F]{2})+$/.test(result) ||
    result.length > 8194
  )
    throw new WalletProviderError(
      'wallet_provider_unavailable',
      'not_dispatched',
    );
  if (single) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(result))
      throw new WalletProviderError('wallet_provider_unavailable');
    group[0].resolve(
      abi.decodeFunctionResult('inspect4337', result)[0].toString(),
    );
    return;
  }
  const [valid, nonces] = abi.decodeFunctionResult('inspect4337Batch', result);
  if (valid.length !== group.length || nonces.length !== group.length)
    throw new WalletProviderError('wallet_provider_unavailable');
  for (let i = 0; i < group.length; i++) {
    if (valid[i] !== true || nonces[i] >= 2n ** 64n)
      group[i].reject(new WalletProviderError('wallet_authorization_denied'));
    else group[i].resolve(nonces[i].toString());
  }
}
