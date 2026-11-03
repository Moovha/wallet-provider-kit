import { Interface, zeroPadValue } from 'ethers';
import { WalletProviderError } from '../domain/signing.js';
import {
  baseDutchV3Reactor,
  uniswapXPermit2,
  type UniswapXOrderReview,
} from './uniswapx-v3.js';
import type { OrderRpc } from './price-policy.js';
const reactor = new Interface([
  'event Fill(bytes32 indexed orderHash,address indexed filler,address indexed swapper,uint256 nonce)',
]);
const transfer = new Interface([
  'event Transfer(address indexed from,address indexed to,uint256 value)',
]);
const permit2 = new Interface([
  'event UnorderedNonceInvalidation(address indexed owner,uint256 word,uint256 mask)',
  'function nonceBitmap(address,uint256) view returns(uint256)',
]);
const fillTopic = reactor.getEvent('Fill')!.topicHash;
const transferTopic = transfer.getEvent('Transfer')!.topicHash;
const same = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();
interface Log {
  address: string;
  topics: string[];
  data: string;
  transactionHash?: string;
  blockHash?: string;
  blockNumber?: string;
  logIndex?: string;
  removed?: boolean;
}
interface Receipt {
  status: string;
  blockHash: string;
  blockNumber: string;
  transactionHash: string;
  logs: Log[];
}
interface Block {
  hash: string;
  number: string;
  timestamp: string;
}
export interface OrderFillProof {
  transactionHash: string;
  blockHash: string;
  blockNumber: number;
  finality: 'base-safe';
  safeBlockHash: string;
  inputAmountUnits: string;
  outputAmountUnits: string;
  feeAmountUnits: string;
}
export type OrderRecovery =
  | { state: 'pending' }
  | { state: 'expired'; checkpoint: { number: number; hash: string } }
  | {
      state: 'cancelled';
      transactionHash: string;
      blockNumber: number;
      blockHash: string;
      checkpoint: { number: number; hash: string };
    }
  | { state: 'needs_review' }
  | { state: 'filled'; proof: OrderFillProof };

/** Uses canonical receipt effects, not a provider's "filled" label or a nonce
 * bit alone. Ambiguous batch attribution is held for review, never reimbursed. */
export function verifyOrderFillReceipt(
  review: UniswapXOrderReview,
  receipt: Receipt,
): Omit<OrderFillProof, 'safeBlockHash'> | null {
  try {
    if (
      receipt.status !== '0x1' ||
      !Number.isSafeInteger(Number(BigInt(receipt.blockNumber))) ||
      BigInt(receipt.blockNumber) < 0n ||
      !/^0x[a-fA-F0-9]{64}$/.test(receipt.transactionHash) ||
      !/^0x[a-fA-F0-9]{64}$/.test(receipt.blockHash)
    )
      throw new Error();
    const fills = receipt.logs.flatMap((log, index) => {
      if (!same(log.address, baseDutchV3Reactor) || log.topics[0] !== fillTopic)
        return [];
      const parsed = reactor.parseLog(log);
      if (!parsed) throw new Error();
      return [{ index, parsed }];
    });
    const userFills = fills.filter((fill) =>
      same(fill.parsed.args.swapper, review.swapper),
    );
    if (userFills.length !== 1) throw new Error();
    const target = userFills[0];
    const args = target.parsed.args;
    if (
      args.orderHash !== review.witnessHash ||
      args.nonce !== BigInt(review.nonce) ||
      same(args.filler, review.swapper)
    )
      throw new Error();
    const preceding =
      fills.filter((fill) => fill.index < target.index).at(-1)?.index ?? -1;
    let inputDebit = 0n,
      inputCredit = 0n,
      outputDebit = 0n,
      outputCredit = 0n,
      feeCredit = 0n;
    for (const [index, log] of receipt.logs.entries()) {
      if (log.removed) throw new Error();
      if (
        log.topics[0] !== transferTopic ||
        (!same(log.address, review.tokenIn) &&
          !same(log.address, review.tokenOut))
      )
        continue;
      const event = transfer.parseLog(log);
      if (!event) throw new Error();
      const { from, to, value } = event.args;
      if (same(log.address, review.tokenIn)) {
        if (same(from, review.swapper)) {
          if (!same(to, args.filler)) throw new Error();
          inputDebit += value;
        }
        if (same(to, review.swapper)) inputCredit += value;
      } else {
        if (same(from, review.swapper)) outputDebit += value;
        if (index > preceding && index < target.index) {
          if (same(to, review.swapper)) {
            if (!same(from, args.filler)) throw new Error();
            outputCredit += value;
          }
          if (same(to, review.fee.recipient)) {
            if (!same(from, args.filler)) throw new Error();
            feeCredit += value;
          }
        }
      }
    }
    if (
      inputDebit !== BigInt(review.amountInUnits) ||
      inputCredit !== 0n ||
      outputDebit !== 0n ||
      outputCredit < BigInt(review.minimumAmountOutUnits) ||
      feeCredit < BigInt(review.fee.minimumAmountUnits)
    )
      throw new Error();
    const expectedFee =
      ((outputCredit + feeCredit) * BigInt(review.fee.basisPoints)) / 10000n;
    if (feeCredit < expectedFee - 1n || feeCredit > expectedFee + 1n)
      throw new Error();
    return {
      transactionHash: receipt.transactionHash,
      blockHash: receipt.blockHash,
      blockNumber: Number(BigInt(receipt.blockNumber)),
      finality: 'base-safe',
      inputAmountUnits: inputDebit.toString(),
      outputAmountUnits: outputCredit.toString(),
      feeAmountUnits: feeCredit.toString(),
    };
  } catch {
    return null;
  }
}

/** Recovery is read-only. After an outage it scans only the signed validity
 * interval, even when many later blocks have accumulated. "safe" is the stated
 * Base settlement level; it is not a claim of Ethereum L1 finalization. */
export async function recoverUniswapXFill(
  rpc: OrderRpc,
  review: UniswapXOrderReview,
  startBlock: number,
  genesisHash: string,
): Promise<OrderRecovery> {
  try {
    if (!Number.isSafeInteger(startBlock) || startBlock < 0) throw new Error();
    if ((await rpc.call('eth_chainId', [])) !== '0x2105') throw new Error();
    const genesis = (await rpc.call('eth_getBlockByNumber', [
      '0x0',
      false,
    ])) as Block;
    if (genesis.hash !== genesisHash) throw new Error();
    const safe = (await rpc.call('eth_getBlockByNumber', [
      'safe',
      false,
    ])) as Block;
    const safeNumber = Number(BigInt(safe.number)),
      safeTime = Number(BigInt(safe.timestamp));
    if (
      !Number.isSafeInteger(safeNumber) ||
      !Number.isSafeInteger(safeTime) ||
      !/^0x[a-fA-F0-9]{64}$/.test(safe.hash)
    )
      throw new Error();
    if (safeNumber < startBlock) return { state: 'pending' };
    let endBlock = safeNumber;
    if (safeTime > review.deadline) {
      let low = startBlock,
        high = safeNumber,
        last = startBlock - 1;
      while (low <= high) {
        const middle = low + Math.floor((high - low) / 2);
        const block = (await rpc.call('eth_getBlockByNumber', [
          '0x' + middle.toString(16),
          false,
        ])) as Block;
        if (Number(BigInt(block.timestamp)) <= review.deadline) {
          last = middle;
          low = middle + 1;
        } else high = middle - 1;
      }
      endBlock = last;
    }
    if (endBlock - startBlock > 1024) throw new Error();
    const logs =
      endBlock < startBlock
        ? []
        : ((await rpc.call('eth_getLogs', [
            {
              address: baseDutchV3Reactor,
              fromBlock: '0x' + startBlock.toString(16),
              toBlock: '0x' + endBlock.toString(16),
              topics: [
                fillTopic,
                review.witnessHash,
                null,
                zeroPadValue(review.swapper, 32),
              ],
            },
          ])) as Log[]);
    if (!Array.isArray(logs) || logs.length > 1)
      return { state: 'needs_review' };
    let result: OrderRecovery;
    if (logs.length) {
      const log = logs[0];
      if (log.removed || !log.transactionHash) throw new Error();
      const receipt = (await rpc.call('eth_getTransactionReceipt', [
        log.transactionHash,
      ])) as Receipt;
      if (
        !receipt ||
        receipt.blockHash !== log.blockHash ||
        Number(BigInt(receipt.blockNumber)) < startBlock ||
        Number(BigInt(receipt.blockNumber)) > endBlock ||
        Number(BigInt(receipt.blockNumber)) > safeNumber ||
        receipt.transactionHash !== log.transactionHash
      )
        throw new Error();
      const canonical = (await rpc.call('eth_getBlockByNumber', [
        receipt.blockNumber,
        false,
      ])) as Block;
      if (canonical.hash !== receipt.blockHash)
        return { state: 'needs_review' };
      const proof = verifyOrderFillReceipt(review, receipt);
      result = proof
        ? { state: 'filled', proof: { ...proof, safeBlockHash: safe.hash } }
        : { state: 'needs_review' };
    } else {
      const invalidations =
        endBlock < startBlock
          ? []
          : ((await rpc.call('eth_getLogs', [
              {
                address: uniswapXPermit2,
                fromBlock: '0x' + startBlock.toString(16),
                toBlock: '0x' + endBlock.toString(16),
                topics: [
                  permit2.getEvent('UnorderedNonceInvalidation')!.topicHash,
                  zeroPadValue(review.swapper, 32),
                ],
              },
            ])) as Log[]);
      if (!Array.isArray(invalidations) || invalidations.length > 1024)
        throw new Error();
      const cancellation = invalidations.find((log) => {
        if (!same(log.address, uniswapXPermit2) || log.removed) return false;
        const parsed = permit2.parseLog(log);
        return (
          !!parsed &&
          same(parsed.args.owner, review.swapper) &&
          parsed.args.word === BigInt(review.nonce) >> 8n &&
          (parsed.args.mask & (1n << (BigInt(review.nonce) & 255n))) !== 0n
        );
      });
      if (cancellation) {
        if (
          !cancellation.transactionHash ||
          !cancellation.blockHash ||
          !cancellation.blockNumber
        )
          throw new Error();
        const receipt = (await rpc.call('eth_getTransactionReceipt', [
          cancellation.transactionHash,
        ])) as Receipt;
        const canonical = (await rpc.call('eth_getBlockByNumber', [
          cancellation.blockNumber,
          false,
        ])) as Block;
        if (
          !receipt ||
          receipt.status !== '0x1' ||
          receipt.transactionHash !== cancellation.transactionHash ||
          receipt.blockHash !== cancellation.blockHash ||
          receipt.blockNumber !== cancellation.blockNumber ||
          Number(BigInt(receipt.blockNumber)) < startBlock ||
          Number(BigInt(receipt.blockNumber)) > endBlock ||
          canonical.hash !== cancellation.blockHash ||
          Number(BigInt(receipt.blockNumber)) > safeNumber ||
          !receipt.logs.some(
            (log) =>
              same(log.address, uniswapXPermit2) &&
              log.data === cancellation.data &&
              log.topics.join(',') === cancellation.topics.join(','),
          )
        )
          throw new Error();
        result = {
          state: 'cancelled',
          transactionHash: cancellation.transactionHash,
          blockNumber: Number(BigInt(cancellation.blockNumber)),
          blockHash: cancellation.blockHash,
          checkpoint: { number: safeNumber, hash: safe.hash },
        };
      } else {
        const data = String(
          await rpc.call('eth_call', [
            {
              to: uniswapXPermit2,
              data: permit2.encodeFunctionData('nonceBitmap', [
                review.swapper,
                BigInt(review.nonce) >> 8n,
              ]),
            },
            { blockHash: safe.hash, requireCanonical: true },
          ]),
        );
        const [bitmap] = permit2.decodeFunctionResult('nonceBitmap', data);
        result =
          (bitmap & (1n << (BigInt(review.nonce) & 255n))) !== 0n
            ? { state: 'needs_review' }
            : safeTime > review.deadline
              ? {
                  state: 'expired',
                  checkpoint: { number: safeNumber, hash: safe.hash },
                }
              : { state: 'pending' };
      }
    }
    const stillCanonical = (await rpc.call('eth_getBlockByNumber', [
      safe.number,
      false,
    ])) as Block;
    if (stillCanonical.hash !== safe.hash) return { state: 'needs_review' };
    return result;
  } catch {
    throw new WalletProviderError('wallet_provider_unavailable');
  }
}
