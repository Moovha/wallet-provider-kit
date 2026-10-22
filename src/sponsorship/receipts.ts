import { readUserOperationLogs } from '../execution/user-operation-logs.js';
import { RpcReadScheduler } from '../execution/rpc-read-scheduler.js';
import { rpcTransportScope } from '../execution/rpc-capacity.js';
import { RpcEndpointPool } from '../execution/rpc-pool.js';
import { verifyAdapterEffects } from '../execution/adapter-effects.js';
import {
  AbiCoder,
  Interface,
  keccak256,
  toQuantity,
  ZeroAddress,
} from 'ethers';
import { RpcReader } from '../execution/chain.js';
import {
  implementationSlot,
  allowsEmptyRecipientCode,
  type PinnedContract,
} from '../execution/approved-calls.js';
import { WalletProviderError } from '../domain/signing.js';
import { canonicalHash } from '../domain/canonical.js';
import { operationQuantity } from './user-operation.js';
import { packedUserOperation } from './bundler.js';
import { Safe4337Verifier, type Safe4337Acceptance } from './verifier.js';
import type {
  UserOperationExecution,
  UserOperationObservation,
} from './execution-types.js';

export const packedOperationTuple =
  '(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)';
export const entryPointV07Interface = new Interface([
  'event BeforeExecution()',
  'event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)',
  `function handleOps(${packedOperationTuple}[] ops,address beneficiary)`,
  `function handleAggregatedOps((${packedOperationTuple}[] userOps,address aggregator,bytes signature)[] opsPerAggregator,address beneficiary)`,
]);
function unavailable(): never {
  throw new WalletProviderError('wallet_attempt_unavailable', 'unknown');
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    unavailable();
  return value as Record<string, unknown>;
}
function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value))
    unavailable();
  return value;
}
function address(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value))
    unavailable();
  return value.toLowerCase();
}
function quantity(value: unknown): bigint {
  return BigInt(operationQuantity(value, 256));
}
type VerifiedReceipt = {
  state: 'included' | 'safe' | 'finalized';
  actualGasCost: string;
  actualGasUsed: string;
  receipt: NonNullable<UserOperationObservation['receipt']>;
};
const verifiedReceipts = new WeakMap<
  typeof fetch,
  Map<string, { value: VerifiedReceipt }>
>();
/** Independent canonical EntryPoint evidence, including per-operation log boundaries inside a shared bundle. */
export class UserOperationReceiptObserver {
  private readonly readers: RpcReader[];
  private readonly pool?: RpcEndpointPool;
  private readonly acceptance: Safe4337Acceptance;
  private readonly proofs: Map<string, { value: VerifiedReceipt }>;
  private readonly reads: RpcReadScheduler;
  constructor(
    acceptance: Safe4337Acceptance,
    private readonly maxLogRange: number,
    request: typeof fetch = fetch,
  ) {
    // Apply the same explicit source-count and network-profile validation as signing.
    new Safe4337Verifier(acceptance, request);
    this.acceptance = structuredClone(acceptance);
    const scope = rpcTransportScope(request);
    this.proofs = verifiedReceipts.get(scope) ?? new Map();
    verifiedReceipts.set(scope, this.proofs);
    this.reads = new RpcReadScheduler(
      [...acceptance.rpcUrls, ...(acceptance.observationRpcUrls ?? [])],
      request,
    );
    this.readers = acceptance.rpcUrls.map(
      (url) =>
        new RpcReader(
          url,
          request,
          acceptance.rpcVerification === 'single' ? 4 : 1,
          acceptance.rpcVerification === 'single',
          acceptance.rpcVerification === 'single'
            ? 'endpoint-failover'
            : 'bounded',
        ),
    );
    if (acceptance.rpcVerification === 'single')
      this.pool = new RpcEndpointPool(acceptance.rpcUrls, request, true);
  }
  private async heads(reader: RpcReader, includeFinality = true) {
    const verifyGenesis = async () => {
      const genesis = object(
        await reader.call('eth_getBlockByNumber', ['0x0', false]),
      );
      if (hash(genesis.hash) !== this.acceptance.genesisHash) unavailable();
    };
    const [chain, blocks] = await Promise.all([
      this.acceptance.aggregateReads
        ? reader.feed('eth_chainId', [])
        : reader.call('eth_chainId', []),
      Promise.all(
        (includeFinality ? ['latest', 'safe', 'finalized'] : ['latest']).map(
          async (tag) =>
            object(
              await (this.acceptance.aggregateReads
                ? reader.feed('eth_getBlockByNumber', [tag, false])
                : reader.call('eth_getBlockByNumber', [tag, false])),
            ),
        ),
      ),
      this.acceptance.rpcVerification === 'single'
        ? reader.verifyGenesis(this.acceptance.genesisHash, verifyGenesis)
        : verifyGenesis(),
    ]);
    if (chain !== this.acceptance.domain.chainId) unavailable();
    const [latest, safe = 0n, finalized = 0n] = blocks.map((block) => {
      hash(block.hash);
      return quantity(block.number);
    });
    if (finalized > safe || safe > latest) unavailable();
    return { latest, safe, finalized };
  }
  async anchor(): Promise<string> {
    if (this.pool)
      return this.pool.run(
        async (endpoint) =>
          (
            await this.heads(
              this.readers[this.acceptance.rpcUrls.indexOf(endpoint)],
              !this.acceptance.aggregateReads,
            )
          ).latest.toString(),
        ['genesis'],
      );
    const heads = await Promise.all(
      this.readers.map((r) => this.heads(r, !this.acceptance.aggregateReads)),
    );
    return heads
      .reduce((min, h) => (min < h.latest ? min : h.latest), heads[0].latest)
      .toString();
  }
  private async pin(
    reader: RpcReader,
    pin: PinnedContract,
    tag: string,
    allowEmpty = false,
  ) {
    const code = await reader.call('eth_getCode', [pin.address, tag]);
    if (
      typeof code !== 'string' ||
      (code === '0x' && !allowEmpty) ||
      keccak256(code) !== pin.codeHash
    )
      unavailable();
    if (pin.implementation) {
      const slot = await reader.call('eth_getStorageAt', [
        pin.address,
        implementationSlot,
        tag,
      ]);
      if (
        typeof slot !== 'string' ||
        !/^0x0{24}[0-9a-f]{40}$/.test(slot) ||
        '0x' + slot.slice(-40) !== pin.implementation.address.toLowerCase()
      )
        unavailable();
      await this.pin(reader, pin.implementation, tag);
    }
  }
  private async receipt(
    reader: RpcReader,
    plan: UserOperationExecution,
    txHash: string,
    head: { latest: bigint; safe: bigint; finalized: bigint },
    maximumCostWei: string,
  ) {
    const proofKey = canonicalHash([
      this.acceptance.profile,
      this.acceptance.genesisHash,
      this.acceptance.rpcVerification ?? 'quorum',
      this.acceptance.domain,
      this.acceptance.entryPoint,
      this.acceptance.module,
      this.acceptance.paymaster,
      plan.planHash,
      plan.userOperationHash,
      plan.operation,
      plan.intent,
      maximumCostWei,
      txHash,
    ]);
    const cached =
      this.acceptance.aggregateReads &&
      this.acceptance.rpcVerification === 'single' &&
      this.proofs.get(proofKey);
    // Receipt contents are immutable; every reuse still verifies the canonical block hash.
    if (cached) {
      const block = object(
        await this.reads.block(cached.value.receipt.blockNumber),
      );
      if (hash(block.hash) !== cached.value.receipt.blockHash) {
        this.proofs.delete(proofKey);
        return 'reorged' as const;
      }
      if (quantity(block.number) !== quantity(cached.value.receipt.blockNumber))
        unavailable();
      const height = quantity(block.number);
      if (height > head.latest) unavailable();
      return {
        ...structuredClone(cached.value),
        state:
          head.finalized >= height
            ? ('finalized' as const)
            : head.safe >= height
              ? ('safe' as const)
              : ('included' as const),
      };
    }
    const [rawReceipt, rawTx] = await Promise.all([
      reader.call('eth_getTransactionReceipt', [txHash]),
      reader.call('eth_getTransactionByHash', [txHash]),
    ]);
    if (rawReceipt === null || rawTx === null) return null;
    const receipt = object(rawReceipt),
      tx = object(rawTx),
      entry = this.acceptance.entryPoint.address.toLowerCase();
    const blockHash = hash(receipt.blockHash),
      height = quantity(receipt.blockNumber),
      tag = toQuantity(height);
    if (
      hash(receipt.transactionHash) !== txHash ||
      hash(tx.hash) !== txHash ||
      hash(tx.blockHash) !== blockHash ||
      quantity(tx.blockNumber) !== height ||
      height > head.latest ||
      address(receipt.to) !== entry ||
      address(tx.to) !== entry ||
      address(receipt.from) !== address(tx.from) ||
      quantity(tx.chainId) !== BigInt(this.acceptance.domain.chainId) ||
      quantity(tx.value) !== 0n ||
      quantity(receipt.status) !== 1n
    )
      unavailable();
    const block = await reader.call('eth_getBlockByNumber', [tag, false]);
    if (block === null || hash(object(block).hash) !== blockHash)
      return 'reorged' as const;
    if (quantity(object(block).number) !== height) unavailable();

    if (
      typeof tx.input !== 'string' ||
      !/^0x(?:[0-9a-fA-F]{2})+$/.test(tx.input) ||
      tx.input.length > 131074
    )
      unavailable();
    const parsed = entryPointV07Interface.parseTransaction({ data: tx.input });
    let operations: unknown[] = [];
    if (parsed?.name === 'handleOps') operations = [...parsed.args.ops];
    else if (parsed?.name === 'handleAggregatedOps') {
      if (parsed.args.opsPerAggregator.length > 64) unavailable();
      for (const group of parsed.args.opsPerAggregator) {
        for (const operation of group.userOps) {
          if (
            String(operation.sender).toLowerCase() ===
              plan.operation.sender.toLowerCase() &&
            (String(group.aggregator).toLowerCase() !== ZeroAddress ||
              group.signature !== '0x')
          )
            unavailable();
          operations.push(operation);
        }
      }
    } else unavailable();
    if (!operations.length || operations.length > 128) unavailable();
    await Promise.all([
      this.pin(reader, this.acceptance.entryPoint, tag),
      ...plan.intent.contracts.map((contract) =>
        this.pin(
          reader,
          contract,
          tag,
          allowsEmptyRecipientCode(plan.intent, contract.address),
        ),
      ),
    ]);
    const coder = AbiCoder.defaultAbiCoder(),
      expected = coder.encode(
        [packedOperationTuple],
        [packedUserOperation(plan.operation)],
      );
    if (
      operations.filter(
        (op) => coder.encode([packedOperationTuple], [op]) === expected,
      ).length !== 1
    )
      unavailable();
    if (!Array.isArray(receipt.logs) || receipt.logs.length > 512)
      unavailable();
    const logs = receipt.logs.map((value) => {
      const log = object(value);
      if (
        log.removed !== false ||
        hash(log.transactionHash) !== txHash ||
        hash(log.blockHash) !== blockHash ||
        quantity(log.blockNumber) !== height ||
        !Array.isArray(log.topics) ||
        log.topics.length > 4 ||
        log.topics.some((t) => {
          hash(t);
          return false;
        }) ||
        typeof log.data !== 'string' ||
        !/^0x(?:[0-9a-f]{2})*$/.test(log.data) ||
        log.data.length > 32770
      )
        unavailable();
      return {
        address: address(log.address),
        data: log.data as string,
        topics: log.topics as string[],
        index: quantity(log.logIndex),
      };
    });
    if (logs.some((log, i) => i > 0 && log.index <= logs[i - 1].index))
      unavailable();
    let boundary = -1,
      target = -1,
      event: ReturnType<Interface['parseLog']> | null = null,
      seenBefore = false,
      matching = 0;
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      if (log.address !== entry) continue;
      if (
        log.topics[0] ===
        entryPointV07Interface.getEvent('BeforeExecution')!.topicHash
      ) {
        if (seenBefore) unavailable();
        seenBefore = true;
        boundary = i;
      } else if (
        log.topics[0] ===
        entryPointV07Interface.getEvent('UserOperationEvent')!.topicHash
      ) {
        const parsedEvent = entryPointV07Interface.parseLog(log);
        if (!parsedEvent || !seenBefore) unavailable();
        if (parsedEvent.args.userOpHash === plan.userOperationHash) {
          matching++;
          target = i;
          event = parsedEvent;
          break;
        }
        boundary = i;
      }
    }
    // Exactly one matching event in the full receipt, including all later operations.
    matching = logs.filter(
      (l) =>
        l.address === entry &&
        l.topics[0] ===
          entryPointV07Interface.getEvent('UserOperationEvent')!.topicHash &&
        l.topics[1] === plan.userOperationHash,
    ).length;
    if (matching !== 1 || !event || target <= boundary || boundary < 0)
      unavailable();
    if (
      address(event.args.sender) !== plan.operation.sender.toLowerCase() ||
      address(event.args.paymaster) !==
        plan.operation.paymaster!.toLowerCase() ||
      event.args.nonce !== BigInt(plan.operation.nonce) ||
      event.args.actualGasCost > BigInt(maximumCostWei) ||
      event.args.actualGasUsed >
        BigInt(plan.operation.callGasLimit) +
          BigInt(plan.operation.verificationGasLimit) +
          BigInt(plan.operation.preVerificationGas) +
          BigInt(plan.operation.paymasterVerificationGasLimit!) +
          BigInt(plan.operation.paymasterPostOpGasLimit!)
    )
      unavailable();
    const excluded = new Set([
      entry,
      plan.operation.sender.toLowerCase(),
      this.acceptance.module.address.toLowerCase(),
      this.acceptance.paymaster.address.toLowerCase(),
    ]);
    const isolated = logs
      .slice(boundary + 1, target)
      .filter((l) => !excluded.has(l.address))
      .map(({ index: _, ...log }) => log);
    if (
      event.args.success &&
      !(await verifyAdapterEffects(reader, plan.intent, isolated, tag))
    )
      unavailable();
    const after = object(
      await reader.call('eth_getBlockByNumber', [tag, false]),
    );
    if (hash(after.hash) !== blockHash) return 'reorged' as const;
    const verified = {
      state:
        head.finalized >= height
          ? ('finalized' as const)
          : head.safe >= height
            ? ('safe' as const)
            : ('included' as const),
      actualGasCost: event.args.actualGasCost.toString(),
      actualGasUsed: event.args.actualGasUsed.toString(),
      receipt: {
        logs: isolated,
        status: event.args.success ? '0x1' : '0x0',
        blockHash,
        blockNumber: tag,
        gasUsed: toQuantity(event.args.actualGasUsed),
        transactionHash: txHash,
      },
    };
    if (
      this.acceptance.aggregateReads &&
      this.acceptance.rpcVerification === 'single'
    ) {
      if (this.proofs.size >= 1024)
        this.proofs.delete(this.proofs.keys().next().value!);
      this.proofs.set(proofKey, {
        value: structuredClone(verified),
      });
    }
    return verified;
  }
  async observe(
    plan: UserOperationExecution,
    maximumCostWei: string,
    hint?: string,
  ): Promise<UserOperationObservation> {
    if (this.pool)
      return this.pool.run(
        (endpoint) =>
          this.observeAt(plan, maximumCostWei, hint, [
            this.readers[this.acceptance.rpcUrls.indexOf(endpoint)],
          ]),
        ['genesis'],
      );
    return this.observeAt(plan, maximumCostWei, hint, this.readers);
  }
  /** Exhaust the signed validity window at a stable finalized block; retain all reservations. */
  private async expiryProof(
    plan: UserOperationExecution,
    validUntil: bigint,
    finalized: bigint,
    readers: RpcReader[],
  ): Promise<UserOperationObservation | undefined> {
    const tag = toQuantity(finalized);
    const anchors = await Promise.all(
      readers.map(async (reader) => {
        const block = object(
          await reader.call('eth_getBlockByNumber', [tag, false]),
        );
        if (quantity(block.number) !== finalized) unavailable();
        return { hash: hash(block.hash), timestamp: quantity(block.timestamp) };
      }),
    );
    if (
      anchors.some(
        (block) =>
          block.hash !== anchors[0].hash ||
          block.timestamp !== anchors[0].timestamp,
      )
    )
      unavailable();
    if (anchors[0].timestamp <= validUntil) return;
    const from = BigInt(plan.scanFromBlock);
    if (
      finalized < from ||
      finalized - from + 1n > 32n * BigInt(this.maxLogRange)
    )
      return;
    for (
      let start = from;
      start <= finalized;
      start += BigInt(this.maxLogRange)
    ) {
      const end = start + BigInt(this.maxLogRange) - 1n;
      const results = await Promise.all(
        readers.map((reader) =>
          reader.call('eth_getLogs', [
            {
              address: this.acceptance.entryPoint.address,
              fromBlock: toQuantity(start),
              toBlock: toQuantity(end < finalized ? end : finalized),
              topics: [
                entryPointV07Interface.getEvent('UserOperationEvent')!
                  .topicHash,
                plan.userOperationHash,
              ],
            },
          ]),
        ),
      );
      if (results.some((logs) => !Array.isArray(logs))) unavailable();
      // Any result must be reconciled as execution; it cannot be classified as absent.
      if (results.some((logs) => (logs as unknown[]).length !== 0)) return;
    }
    const after = await Promise.all(
      readers.map(async (reader) =>
        object(await reader.call('eth_getBlockByNumber', [tag, false])),
      ),
    );
    if (
      after.some(
        (block) =>
          hash(block.hash) !== anchors[0].hash ||
          quantity(block.number) !== finalized,
      )
    )
      unavailable();
    return {
      state: 'expired',
      expiry: {
        validUntil: validUntil.toString(),
        finalizedBlock: finalized.toString(),
        blockHash: anchors[0].hash,
        blockTimestamp: anchors[0].timestamp.toString(),
      },
      observedAt: new Date().toISOString(),
      scanNextBlock: (finalized + 1n).toString(),
    };
  }

  private async observeAt(
    plan: UserOperationExecution,
    maximumCostWei: string,
    hint: string | undefined,
    readers: RpcReader[],
    knownFirst = true,
  ): Promise<UserOperationObservation> {
    plan = structuredClone(plan);
    // SafeOp signatures bind uint48 validAfter and validUntil before the owner signature.
    const validUntil = BigInt('0x' + plan.operation.signature.slice(14, 26));
    const expired =
      validUntil !== 0n && validUntil * 1000n < BigInt(Date.now());
    const heads = await Promise.all(
        readers.map((r) =>
          this.heads(
            r,
            expired ||
              !this.acceptance.aggregateReads ||
              !!plan.observation.receipt,
          ),
        ),
      ),
      from = BigInt(plan.observation.scanNextBlock);
    const latest = heads.reduce(
        (min, h) => (min < h.latest ? min : h.latest),
        heads[0].latest,
      ),
      finalized = heads.reduce(
        (min, h) => (min < h.finalized ? min : h.finalized),
        heads[0].finalized,
      );
    const end = from + BigInt(this.maxLogRange) - 1n,
      to = end < latest ? end : latest;
    const known =
      knownFirst &&
      this.acceptance.rpcVerification === 'single' &&
      (hint ?? plan.observation.receipt?.transactionHash);
    const groups = known
      ? readers.map(() => [] as string[])
      : await Promise.all(
          readers.map(async (r) => {
            if (to < from) return [] as string[];
            const filter = {
              address: this.acceptance.entryPoint.address,
              fromBlock: toQuantity(from),
              toBlock: toQuantity(to),
              topics: [
                entryPointV07Interface.getEvent('UserOperationEvent')!
                  .topicHash,
                plan.userOperationHash,
              ] as [string, string],
            };
            const logs = await (this.acceptance.aggregateReads
              ? readUserOperationLogs(r, filter)
              : r.call('eth_getLogs', [filter]));
            if (!Array.isArray(logs) || logs.length > 8) unavailable();
            return logs.map((l) => hash(object(l).transactionHash));
          }),
        );
    const candidates = [
      ...new Set([
        ...groups[0].filter((h) => groups.every((group) => group.includes(h))),
        ...(hint ? [hash(hint)] : []),
        ...(plan.observation.receipt
          ? [plan.observation.receipt.transactionHash]
          : []),
      ]),
    ];
    const next = to < from ? from : (to < finalized ? to : finalized) + 1n;
    const pending: UserOperationObservation = {
      state: 'pending',
      observedAt: new Date().toISOString(),
      scanNextBlock: (next > from ? next : from).toString(),
    };
    for (const candidate of candidates) {
      const results = await Promise.all(
        readers.map((r, i) =>
          this.receipt(r, plan, candidate, heads[i], maximumCostWei),
        ),
      );
      if (known && results.some((r) => r === 'reorged' || r === null))
        return this.observeAt(plan, maximumCostWei, undefined, readers, false);
      if (results.some((r) => r === 'reorged' || r === null))
        return {
          ...pending,
          state: plan.observation.receipt ? 'reorged' : 'pending',
        };
      const values = results as Exclude<
        Awaited<ReturnType<UserOperationReceiptObserver['receipt']>>,
        string | null
      >[];
      if (
        values.some(
          (v) =>
            canonicalHash({
              receipt: v.receipt,
              actualGasCost: v.actualGasCost,
              actualGasUsed: v.actualGasUsed,
            }) !==
            canonicalHash({
              receipt: values[0].receipt,
              actualGasCost: values[0].actualGasCost,
              actualGasUsed: values[0].actualGasUsed,
            }),
        )
      )
        unavailable();
      return {
        ...values[0],
        state: values.every((v) => v.state === 'finalized')
          ? 'finalized'
          : values.every((v) => v.state !== 'included')
            ? 'safe'
            : 'included',
        observedAt: new Date().toISOString(),
        scanNextBlock: pending.scanNextBlock,
      };
    }
    if (expired && finalized > 0n && !plan.observation.receipt) {
      const proof = await this.expiryProof(
        plan,
        validUntil,
        finalized,
        readers,
      );
      if (proof) return proof;
    }
    return pending;
  }
}
