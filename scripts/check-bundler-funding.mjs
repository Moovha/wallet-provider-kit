import assert from 'node:assert/strict';
import { Mempool } from '/app/src/esm/mempool/mempool.js';
const entryPoint = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
const paymaster = '0x' + '1'.repeat(40);
const original = Array.from({ length: 8 }, (_, i) => ({
  userOpHash: '0x' + (i + 1).toString(16).padStart(64, '0'),
  submissionAttempts: 0,
  userOp: {
    sender: '0x' + (i + 10).toString(16).padStart(40, '0'),
    nonce: 0n,
    callData: '0x',
    signature: '0x' + '11'.repeat(77),
    callGasLimit: 10000n,
    verificationGasLimit: 10000n,
    preVerificationGas: 5000n,
    maxFeePerGas: 100n,
    maxPriorityFeePerGas: 1n,
    paymaster,
    paymasterData: '0x',
    paymasterVerificationGasLimit: 3000n,
    paymasterPostOpGasLimit: 2000n,
  },
}));
const pending = new Map(original.map((op) => [op.userOpHash, op]));
const processing = new Map();
let reads = 0,
  balance = 15000000n;
const worker = Object.create(Mempool.prototype);
Object.assign(worker, {
  config: {
    safeMode: false,
    entrypoints: [entryPoint],
    mempoolPopBatchSize: 10,
    executorGasMultiplier: 105n,
    utilityWalletAddress: '0x' + '3'.repeat(40),
    publicClient: {
      readContract: async () => {
        reads++;
        return balance;
      },
    },
  },
  isShuttingDown: false,
  reputationManager: { decreaseUserOpCount() {} },
  store: {
    popOutstanding: async (_entry, count) => {
      const result = [...pending.values()].slice(0, count);
      result.forEach((op) => pending.delete(op.userOpHash));
      return result;
    },
    addProcessing: async ({ userOpInfos }) => {
      userOpInfos.forEach((op) => processing.set(op.userOpHash, op));
    },
    removeProcessing: async ({ userOpInfos }) => {
      userOpInfos.forEach((op) => processing.delete(op.userOpHash));
    },
    addOutstanding: async ({ userOpInfos }) => {
      userOpInfos.forEach((op) => pending.set(op.userOpHash, op));
    },
    dumpOutstanding: async () => [...pending.values()],
  },
});
const process = () =>
  worker.process({ maxGasLimit: 6000000n, entryPoint, maxBundleCount: 1 });
const first = await process();
assert.equal(first.length, 1);
assert.equal(first[0].userOps.length, 5);
assert.equal(pending.size, 3);
assert.equal(reads, 1);
for (const op of [...first[0].userOps, ...pending.values()])
  assert.equal(
    op,
    original.find((original) => original.userOpHash === op.userOpHash),
  );
assert.equal(
  first[0].userOps.reduce(
    (sum, info) =>
      sum +
      BigInt(
        info.userOp.callGasLimit +
          info.userOp.verificationGasLimit +
          info.userOp.preVerificationGas +
          info.userOp.paymasterVerificationGasLimit +
          info.userOp.paymasterPostOpGasLimit,
      ) *
        info.userOp.maxFeePerGas,
    0n,
  ),
  15000000n,
);
balance = 0n;
const unavailable = await process();
assert.equal(unavailable.length, 0);
assert.equal(pending.size, 3);
assert.equal(processing.size, 5);
const before = reads;
await process();
assert.equal(reads, before);
for (const op of pending.values()) assert.equal(op.submissionAttempts, 0);
console.log(
  JSON.stringify({
    pinnedMempoolSelectionPassed: true,
    selected: 5,
    deferred: 3,
    oneDepositReadPerBundle: true,
    unchangedDeferredIdentities: true,
    unchangedFundingBackoff: true,
    externalRequests: 0,
    broadcasts: 0,
  }),
);

for (const info of pending.values())
  info.userOp.signature =
    '0x' +
    '00'.repeat(6) +
    (BigInt(Math.floor(Date.now() / 1000)) - 1n)
      .toString(16)
      .padStart(12, '0') +
    '11'.repeat(65);
assert.equal((await process()).length, 0);
assert.equal(pending.size, 0);
assert.equal(processing.size, 5);
console.log(
  JSON.stringify({
    expiredOperationsRemovedWithoutBroadcast: true,
    externalRequests: 0,
  }),
);

const { ExecutorManager } =
  await import('/app/src/esm/executor/executorManager.js');
let release;
const executorGate = new Promise((resolve) => {
  release = resolve;
});
const events = [];
const wallet = { address: '0x' + '5'.repeat(40) };
let queued = 1;
const scheduler = Object.create(ExecutorManager.prototype);
Object.assign(scheduler, {
  opsCount: [],
  bundlingMode: 'manual',
  config: {
    maxBundleCount: 1,
    minBundleInterval: 25,
    maxBundleInterval: 100,
    entrypoints: [entryPoint],
    redisKeyPrefix: 'offline',
    chainId: 84532,
  },
  redisBlockCache: {
    redis: {
      zcard: async (key) => {
        assert.equal(
          key,
          'offline:84532:' + entryPoint + ':outstanding:ready-queue',
        );
        return queued;
      },
    },
  },
  senderManager: {
    getWallet: async () => {
      events.push('wait_executor');
      return executorGate;
    },
    markWalletProcessed: async (value) => {
      assert.equal(value, wallet);
      events.push('release_executor');
    },
  },
  mempool: {
    getBundles: async (count) => {
      assert.equal(count, 1);
      events.push('select_funded_batch');
      return [{ userOps: [{}] }];
    },
  },
  sendBundleToExecutor: async (_bundle, value) => {
    assert.equal(value, wallet);
    events.push('submit');
  },
});
const scheduled = scheduler.autoScalingBundling();
await Promise.resolve();
assert.deepEqual(events, ['wait_executor']);
release(wallet);
await scheduled;
assert.deepEqual(events, ['wait_executor', 'select_funded_batch', 'submit']);
events.length = 0;
scheduler.mempool.getBundles = async () => [];
await scheduler.autoScalingBundling();
assert.deepEqual(events, ['wait_executor', 'release_executor']);
events.length = 0;
queued = 0;
await scheduler.autoScalingBundling();
assert.deepEqual(events, []);
queued = 1;
const queueRead = scheduler.redisBlockCache.redis.zcard;
scheduler.redisBlockCache.redis.zcard = async () => {
  throw Error('Offline unavailable');
};
await scheduler.autoScalingBundling();
assert.deepEqual(events, []);
scheduler.redisBlockCache.redis.zcard = queueRead;
events.length = 0;
scheduler.mempool.getBundles = async () => {
  throw Error('Offline unavailable');
};
await assert.rejects(scheduler.autoScalingBundling());
assert.deepEqual(events, ['wait_executor', 'release_executor']);
console.log(
  JSON.stringify({
    pinnedExecutorLeasePassed: true,
    selectionWaitsForExecutor: true,
    emptyOrFailedSelectionReleasesLease: true,
    idleQueueDoesNotAcquireExecutor: true,
    unavailableQueueDoesNotAcquireExecutor: true,
    externalRequests: 0,
    broadcasts: 0,
  }),
);

const { readFile } = await import('node:fs/promises');
const senderSource = await readFile(
  '/app/src/esm/executor/senderManager/createRedisSenderManager.js',
  'utf8',
);
const available = new Set([wallet.address]);
globalThis[Symbol.for('wpk-offline-redis')] = class {
  async eval() {
    return [wallet.address];
  }
  async scard() {
    return available.size;
  }
  async spop() {
    const value = available.values().next().value ?? null;
    if (value) available.delete(value);
    return value;
  }
  async sadd(_key, address) {
    available.add(address);
    return 1;
  }
};
const moduleUrl = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const patchedSender = senderSource
  .replace(
    '"ioredis"',
    JSON.stringify(
      moduleUrl('export default globalThis[Symbol.for("wpk-offline-redis")];'),
    ),
  )
  .replace(
    '"./index.js"',
    JSON.stringify(
      moduleUrl(
        'export const getAvailableWallets = config => config.executorPrivateKeys;',
      ),
    ),
  );
const { createRedisSenderManager } = await import(moduleUrl(patchedSender));
const logger = { info() {}, trace() {}, warn() {} };
const gauge = { set() {} };
const manager = await createRedisSenderManager({
  config: {
    executorPrivateKeys: [wallet],
    redisKeyPrefix: 'offline',
    chainId: 84532,
    getLogger: () => logger,
  },
  metrics: { walletsTotal: gauge, walletsAvailable: gauge },
  redisEndpoint: 'offline',
});
const acquisition = manager.getWallet();
// Observe the exact point after the Redis pop resolves, before timer-based shutdown cleanup.
await Promise.resolve();
assert.deepEqual(manager.getActiveWallets(), [wallet]);
await manager.markWalletProcessed(wallet);
assert.equal(await acquisition, wallet);
assert.equal(available.size, 1);
delete globalThis[Symbol.for('wpk-offline-redis')];
console.log(
  JSON.stringify({
    pinnedSenderAcquisitionPassed: true,
    acquiredExecutorVisibleWithoutTimerDelay: true,
    shutdownCanReleaseAcquiredExecutor: true,
    externalRequests: 0,
  }),
);
