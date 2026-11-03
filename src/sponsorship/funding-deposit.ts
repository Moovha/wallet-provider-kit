import { Interface, isAddress } from 'ethers';
import type { RpcReader } from '../execution/chain.js';
import { WalletProviderError } from '../domain/signing.js';
import type { FundingSnapshot } from './funding.js';

const balanceInterface = new Interface([
  'function balanceOf(address) view returns(uint256)',
]);
type DepositRead = { blockHash: string; value: FundingSnapshot };

/** Reuse immutable deposit state only after a fresh head read confirms the same hash. */
export class FundingDepositReader {
  private readonly deposits = new WeakMap<object, Map<string, DepositRead>>();

  async read(
    reader: Pick<RpcReader, 'call' | 'readScope'>,
    applicationId: string,
    entryPoint: string,
    paymaster: string,
  ): Promise<FundingSnapshot> {
    const deny = (): never => {
      throw new WalletProviderError('wallet_authorization_denied');
    };
    if (!isAddress(entryPoint) || !isAddress(paymaster)) deny();
    const block = (await reader.call('eth_getBlockByNumber', [
      'latest',
      false,
    ])) as { number?: string; hash?: string };
    if (
      !block ||
      !/^0x[0-9a-fA-F]+$/.test(block.number ?? '') ||
      !/^0x[0-9a-fA-F]{64}$/.test(block.hash ?? '')
    )
      deny();
    const blockNumber = block.number!;
    const blockHash = block.hash!.toLowerCase();
    let snapshots = this.deposits.get(reader.readScope);
    if (!snapshots) {
      snapshots = new Map();
      this.deposits.set(reader.readScope, snapshots);
    }
    const key = JSON.stringify([
      applicationId,
      entryPoint.toLowerCase(),
      paymaster.toLowerCase(),
    ]);
    const previous = snapshots.get(key);
    const age = previous
      ? Date.now() - Date.parse(previous.value.checkedAt)
      : Infinity;
    if (
      previous &&
      previous.blockHash === blockHash &&
      previous.value.blockNumber === blockNumber &&
      age >= 0 &&
      age <= 2000
    )
      return { ...previous.value };
    const raw = await reader.call('eth_call', [
      {
        to: entryPoint,
        data: balanceInterface.encodeFunctionData('balanceOf', [paymaster]),
      },
      blockNumber,
    ]);
    const balance = balanceInterface.decodeFunctionResult(
      'balanceOf',
      String(raw),
    )[0] as bigint;
    const canonical = (await reader.call('eth_getBlockByNumber', [
      blockNumber,
      false,
    ])) as { hash?: string };
    if (canonical?.hash?.toLowerCase() !== blockHash) deny();
    const value = {
      balanceWei: balance.toString(),
      blockNumber,
      checkedAt: new Date().toISOString(),
    };
    if (!snapshots.has(key) && snapshots.size >= 128)
      snapshots.delete(snapshots.keys().next().value!);
    snapshots.set(key, { blockHash, value });
    return { ...value };
  }
}
