import {
  Interface,
  TypedDataEncoder,
  keccak256,
  toQuantity,
  zeroPadValue,
} from 'ethers';
import { WalletProviderError } from '../domain/signing.js';
import { record } from '../providers/relayer-client.js';
import type {
  ChainObservation,
  ExecutionObserver,
  TransferExecutionPlan,
} from './types.js';

export const transferInterface = new Interface([
  'function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function authorizationState(address authorizer,bytes32 nonce) view returns (bool)',
  'event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
]);
const hashPattern = /^0x[0-9a-fA-F]{64}$/;
const bytesPattern = /^0x(?:[0-9a-fA-F]{2})*$/;
type RpcMethod =
  | 'eth_chainId'
  | 'eth_getBlockByNumber'
  | 'eth_getCode'
  | 'eth_call'
  | 'eth_getBalance'
  | 'eth_getLogs'
  | 'eth_getTransactionReceipt'
  | 'eth_getTransactionByHash';

function unavailable(): never {
  throw new WalletProviderError('wallet_provider_unavailable', 'unknown');
}
function checked(value: unknown): Record<string, unknown> {
  if (!record(value)) unavailable();
  return value;
}
function quantity(value: unknown): bigint {
  if (
    typeof value !== 'string' ||
    !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/.test(value)
  )
    unavailable();
  return BigInt(value);
}
function hash(value: unknown): string {
  if (typeof value !== 'string' || !hashPattern.test(value)) unavailable();
  return value.toLowerCase();
}
function address(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value))
    unavailable();
  return value.toLowerCase();
}

/** Read-only JSON-RPC transport with fixed methods, bounded responses and no automatic retries. */
class RpcReader {
  constructor(
    private readonly endpoint: string,
    private readonly request: typeof fetch,
  ) {
    try {
      const url = new URL(endpoint);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
      )
        throw new Error();
    } catch {
      throw new WalletProviderError('wallet_provider_configuration');
    }
  }
  async call(method: RpcMethod, params: unknown[]): Promise<unknown> {
    try {
      const response = await this.request(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        redirect: 'error',
        credentials: 'omit',
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        unavailable();
      }
      const reader = response.body?.getReader();
      if (!reader) unavailable();
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 262144) unavailable();
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      const envelope = checked(
        JSON.parse(Buffer.concat(chunks).toString('utf8')),
      );
      if (
        envelope.jsonrpc !== '2.0' ||
        envelope.id !== 1 ||
        'error' in envelope ||
        !('result' in envelope)
      )
        unavailable();
      return envelope.result;
    } catch {
      return unavailable();
    }
  }
}

interface Heads {
  latest: bigint;
  safe: bigint;
  finalized: bigint;
}

/** Agreement of configured RPC providers is trusted node evidence, not a light-client proof. */
export class QuorumTransferObserver implements ExecutionObserver {
  private readonly readers: RpcReader[];
  constructor(
    endpoints: string[],
    private readonly genesisHash: string,
    private readonly maxLogRange: number,
    request: typeof fetch = fetch,
  ) {
    try {
      if (
        endpoints.length < 2 ||
        endpoints.length > 3 ||
        new Set(endpoints.map((endpoint) => new URL(endpoint).origin)).size !==
          endpoints.length ||
        !hashPattern.test(genesisHash) ||
        !Number.isSafeInteger(maxLogRange) ||
        maxLogRange < 100 ||
        maxLogRange > 10000
      )
        throw new Error();
      this.readers = endpoints.map(
        (endpoint) => new RpcReader(endpoint, request),
      );
    } catch {
      throw new WalletProviderError('wallet_provider_configuration');
    }
  }

  private async identity(reader: RpcReader): Promise<void> {
    const [chain, genesis] = await Promise.all([
      reader.call('eth_chainId', []),
      reader.call('eth_getBlockByNumber', ['0x0', false]),
    ]);
    if (
      quantity(chain) !== 84532n ||
      hash(checked(genesis).hash) !== this.genesisHash.toLowerCase() ||
      quantity(checked(genesis).number) !== 0n
    )
      unavailable();
  }
  async anchor(): Promise<string> {
    const heights = await Promise.all(
      this.readers.map(async (reader) => {
        await this.identity(reader);
        return quantity(
          checked(await reader.call('eth_getBlockByNumber', ['latest', false]))
            .number,
        );
      }),
    );
    return heights.reduce((a, b) => (a < b ? a : b)).toString();
  }
  async preflight(plan: TransferExecutionPlan): Promise<void> {
    try {
      await this.preflightRead(structuredClone(plan));
    } catch {
      unavailable();
    }
  }
  private async preflightRead(plan: TransferExecutionPlan): Promise<void> {
    const token = String(plan.action.payload.domain.verifyingContract);
    const owner = String(plan.action.payload.message.from);
    const nonce = String(plan.action.payload.message.nonce);
    const expectedDomain = TypedDataEncoder.hashDomain(
      plan.action.payload.domain,
    ).toLowerCase();
    await Promise.all(
      this.readers.map(async (reader) => {
        await this.identity(reader);
        const [code, domain, used, balance, simulation] = await Promise.all([
          reader.call('eth_getCode', [token, 'latest']),
          reader.call('eth_call', [
            {
              to: token,
              data: transferInterface.encodeFunctionData('DOMAIN_SEPARATOR'),
            },
            'latest',
          ]),
          reader.call('eth_call', [
            {
              to: token,
              data: transferInterface.encodeFunctionData('authorizationState', [
                owner,
                nonce,
              ]),
            },
            'latest',
          ]),
          reader.call('eth_getBalance', [
            plan.sponsor.binding.address,
            'latest',
          ]),
          reader.call('eth_call', [
            {
              from: plan.sponsor.binding.address,
              to: token,
              data: plan.data,
              value: '0x0',
              gas: toQuantity(BigInt(plan.sponsor.gasLimit)),
              maxFeePerGas: toQuantity(BigInt(plan.sponsor.maxFeePerGas)),
              maxPriorityFeePerGas: toQuantity(
                BigInt(plan.sponsor.maxPriorityFeePerGas),
              ),
            },
            'latest',
          ]),
        ]);
        if (
          typeof code !== 'string' ||
          !bytesPattern.test(code) ||
          code === '0x' ||
          keccak256(code).toLowerCase() !== plan.tokenCodeHash.toLowerCase() ||
          hash(domain) !== expectedDomain ||
          used !== '0x' + '0'.repeat(64) ||
          simulation !== '0x' ||
          quantity(balance) <
            BigInt(plan.sponsor.gasLimit) * BigInt(plan.sponsor.maxFeePerGas) +
              BigInt(plan.sponsor.l1FeeReserveWei)
        )
          unavailable();
      }),
    );
  }
  private async heads(reader: RpcReader): Promise<Heads> {
    await this.identity(reader);
    const values = await Promise.all(
      ['latest', 'safe', 'finalized'].map((tag) =>
        reader.call('eth_getBlockByNumber', [tag, false]),
      ),
    );
    const [latest, safe, finalized] = values.map((value) => {
      const block = checked(value);
      hash(block.hash);
      return quantity(block.number);
    });
    if (finalized > safe || safe > latest) unavailable();
    return { latest, safe, finalized };
  }
  private async find(
    reader: RpcReader,
    plan: TransferExecutionPlan,
    latest: bigint,
    from: bigint,
  ): Promise<string[]> {
    if (latest < from) return [];
    const maximum = from + BigInt(this.maxLogRange) - 1n;
    const logs = await reader.call('eth_getLogs', [
      {
        address: String(plan.action.payload.domain.verifyingContract),
        fromBlock: toQuantity(from),
        toBlock: toQuantity(latest < maximum ? latest : maximum),
        topics: [
          transferInterface.getEvent('AuthorizationUsed')!.topicHash,
          zeroPadValue(String(plan.action.payload.message.from), 32),
          String(plan.action.payload.message.nonce),
        ],
      },
    ]);
    if (!Array.isArray(logs) || logs.length > 4) unavailable();
    return logs
      .map((entry) => {
        const log = checked(entry);
        if (log.removed === true) return undefined;
        return hash(log.transactionHash);
      })
      .filter((value): value is string => !!value);
  }
  private async verify(
    reader: RpcReader,
    plan: TransferExecutionPlan,
    candidate: string,
    ownHash: string | undefined,
    heads: Heads,
  ): Promise<ChainObservation | null | 'reorged'> {
    const [rawReceipt, rawTransaction] = await Promise.all([
      reader.call('eth_getTransactionReceipt', [candidate]),
      reader.call('eth_getTransactionByHash', [candidate]),
    ]);
    if (rawReceipt === null || rawTransaction === null) return null;
    const receipt = checked(rawReceipt);
    const transaction = checked(rawTransaction);
    const token = String(
      plan.action.payload.domain.verifyingContract,
    ).toLowerCase();
    const message = plan.action.payload.message;
    if (
      hash(receipt.transactionHash) !== candidate ||
      hash(transaction.hash) !== candidate
    )
      unavailable();
    const blockHash = hash(receipt.blockHash);
    const blockNumber = quantity(receipt.blockNumber);
    if (
      hash(transaction.blockHash) !== blockHash ||
      quantity(transaction.blockNumber) !== blockNumber ||
      heads.latest < blockNumber
    )
      unavailable();
    const [rawBlock, code] = await Promise.all([
      reader.call('eth_getBlockByNumber', [toQuantity(blockNumber), false]),
      reader.call('eth_getCode', [token, toQuantity(blockNumber)]),
    ]);
    if (rawBlock === null || hash(checked(rawBlock).hash) !== blockHash)
      return 'reorged';
    if (
      quantity(checked(rawBlock).number) !== blockNumber ||
      typeof code !== 'string' ||
      !bytesPattern.test(code) ||
      keccak256(code).toLowerCase() !== plan.tokenCodeHash.toLowerCase()
    )
      unavailable();
    if (
      address(transaction.to) !== token ||
      address(receipt.to) !== token ||
      quantity(transaction.value) !== 0n ||
      quantity(transaction.chainId) !== 84532n ||
      typeof transaction.input !== 'string' ||
      transaction.input.toLowerCase() !== plan.data.toLowerCase()
    )
      return null;
    const sender = address(transaction.from);
    if (address(receipt.from) !== sender) unavailable();
    if (
      sender === plan.sponsor.binding.address.toLowerCase() &&
      (transaction.type !== '0x2' ||
        quantity(transaction.gas) !== BigInt(plan.sponsor.gasLimit) ||
        quantity(transaction.maxFeePerGas) >
          BigInt(plan.sponsor.maxFeePerGas) ||
        quantity(transaction.maxPriorityFeePerGas) >
          BigInt(plan.sponsor.maxPriorityFeePerGas))
    )
      unavailable();
    const outcome = quantity(receipt.status);
    if (outcome !== 0n && outcome !== 1n) unavailable();
    if (
      outcome === 0n &&
      (candidate !== ownHash ||
        sender !== plan.sponsor.binding.address.toLowerCase())
    )
      return null;
    if (!Array.isArray(receipt.logs) || receipt.logs.length > 512)
      unavailable();
    if (outcome === 1n) {
      let authorizations = 0;
      let transfers = 0;
      for (const item of receipt.logs) {
        const log = checked(item);
        if (address(log.address) !== token) continue;
        if (
          hash(log.blockHash) !== blockHash ||
          hash(log.transactionHash) !== candidate ||
          quantity(log.blockNumber) !== blockNumber ||
          log.removed === true ||
          !Array.isArray(log.topics) ||
          typeof log.data !== 'string' ||
          !bytesPattern.test(log.data)
        )
          unavailable();
        const parsed = transferInterface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (
          parsed?.name === 'AuthorizationUsed' &&
          address(parsed.args.authorizer) ===
            String(message.from).toLowerCase() &&
          hash(parsed.args.nonce) === String(message.nonce).toLowerCase()
        )
          authorizations++;
        if (
          parsed?.name === 'Transfer' &&
          address(parsed.args.from) === String(message.from).toLowerCase() &&
          address(parsed.args.to) === String(message.to).toLowerCase() &&
          parsed.args.value.toString() === String(message.value)
        )
          transfers++;
      }
      if (authorizations !== 1 || transfers !== 1) return null;
    }
    const chainStatus =
      heads.finalized >= blockNumber
        ? 'finalized'
        : heads.safe >= blockNumber
          ? 'safe'
          : 'included';
    const result = outcome === 1n ? 'succeeded' : 'reverted';
    return {
      chain_status: chainStatus,
      verification: 'rpc-quorum',
      outcome: result,
      settlement: chainStatus === 'finalized' ? result : 'pending',
      observed_at: new Date(Date.now()).toISOString(),
      transaction_hash: candidate,
      block_hash: blockHash,
      block_number: blockNumber.toString(),
      execution_origin:
        sender === plan.sponsor.binding.address.toLowerCase()
          ? 'sponsor'
          : 'external',
    };
  }
  async observe(
    plan: TransferExecutionPlan,
    candidates: string[],
    ownHash?: string,
    scanFromBlock?: string,
  ): Promise<ChainObservation & { scanNextBlock?: string }> {
    try {
      return await this.observeRead(
        structuredClone(plan),
        [...candidates],
        ownHash,
        scanFromBlock,
      );
    } catch {
      return unavailable();
    }
  }
  private async observeRead(
    plan: TransferExecutionPlan,
    input: string[],
    ownHash?: string,
    scanFromBlock = plan.scanFromBlock,
  ): Promise<ChainObservation & { scanNextBlock?: string }> {
    if (plan.genesisHash.toLowerCase() !== this.genesisHash.toLowerCase())
      unavailable();
    const heads = await Promise.all(
      this.readers.map((reader) => this.heads(reader)),
    );
    const from = BigInt(scanFromBlock);
    if (from < BigInt(plan.scanFromBlock)) unavailable();
    const end = from + BigInt(this.maxLogRange) - 1n;
    const finalized = heads.reduce(
      (minimum, head) => (head.finalized < minimum ? head.finalized : minimum),
      heads[0].finalized,
    );
    // Advance only across finalized history; re-scan the unfinalized tail after reorgs.
    const next = (end < finalized ? end : finalized) + 1n;
    const scanNextBlock = (next > from ? next : from).toString();
    const found = await Promise.all(
      this.readers.map((reader, index) =>
        this.find(reader, plan, heads[index].latest, from),
      ),
    );
    const common = found[0].filter((candidate) =>
      found.every((group) => group.includes(candidate)),
    );
    const candidates = [
      ...new Set(
        [...common, ...(ownHash ? [ownHash] : []), ...input].map(hash),
      ),
    ].slice(0, 8);
    let reorged = false;
    let pending = false;
    for (const candidate of candidates) {
      const observations = await Promise.all(
        this.readers.map((reader, index) =>
          this.verify(
            reader,
            plan,
            candidate,
            ownHash?.toLowerCase(),
            heads[index],
          ),
        ),
      );
      if (observations.includes('reorged')) {
        reorged = true;
        continue;
      }
      if (observations.some((value) => value === null)) {
        pending = true;
        continue;
      }
      const values = observations as ChainObservation[];
      if (
        values.some(
          (value) =>
            value.transaction_hash !== values[0].transaction_hash ||
            value.block_hash !== values[0].block_hash ||
            value.block_number !== values[0].block_number ||
            value.outcome !== values[0].outcome ||
            value.execution_origin !== values[0].execution_origin,
        )
      )
        unavailable();
      const status = values.every((value) => value.chain_status === 'finalized')
        ? 'finalized'
        : values.every(
              (value) =>
                value.chain_status === 'safe' ||
                value.chain_status === 'finalized',
            )
          ? 'safe'
          : 'included';
      return {
        ...values[0],
        scanNextBlock,
        chain_status: status,
        settlement:
          status === 'finalized'
            ? (values[0].outcome as 'succeeded' | 'reverted')
            : 'pending',
        observed_at: new Date(Date.now()).toISOString(),
      };
    }
    return {
      scanNextBlock,
      chain_status: reorged ? 'reorged' : pending ? 'pending' : 'unobserved',
      verification: 'unverified',
      outcome: 'unknown',
      settlement: 'pending',
      observed_at: new Date(Date.now()).toISOString(),
    };
  }
}
