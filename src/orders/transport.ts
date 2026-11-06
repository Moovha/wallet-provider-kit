import { WalletProviderError } from '../domain/signing.js';
import { hashBaseUniswapXV3Order } from './uniswapx-v3.js';
export type OrderApiStatus =
  | 'open'
  | 'unverified'
  | 'filled'
  | 'expired'
  | 'error'
  | 'cancelled'
  | 'insufficient-funds';
export interface OrderObservation {
  status: OrderApiStatus;
  transactionHash?: string;
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function status(value: unknown): value is OrderApiStatus {
  return (
    typeof value === 'string' &&
    [
      'open',
      'unverified',
      'filled',
      'expired',
      'error',
      'cancelled',
      'insufficient-funds',
    ].includes(value)
  );
}
/** The service records dispatch before calling this fixed, non-retrying transport. */
export class UniswapXTransport {
  constructor(
    private readonly key: () => string,
    private readonly send: typeof fetch = fetch,
  ) {}
  private async request(path: string, body?: string) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      const key = this.key();
      if (!/^[\x21-\x7e]{16,512}$/.test(key)) throw new Error();
      const r = await this.send(
        'https://trade-api.gateway.uniswap.org/v1' + path,
        {
          method: body ? 'POST' : 'GET',
          redirect: 'error',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-api-key': key,
          },
          ...(body ? { body } : {}),
        },
      );
      if (!r.ok) throw new Error();
      const reader = r.body?.getReader();
      if (!reader) throw new Error();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 131072) {
            await reader.cancel();
            throw new Error();
          }
          chunks.push(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
      return {
        status: r.status,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
      };
    };
    try {
      return await Promise.race([
        run(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error());
          }, 8000);
        }),
      ]);
    } catch {
      throw new WalletProviderError('wallet_provider_unavailable', 'unknown');
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  async post(
    quote: Record<string, unknown>,
    signature: string,
    orderHash: string,
  ): Promise<OrderObservation> {
    const r = await this.request(
      '/order',
      JSON.stringify({ routing: 'DUTCH_V3', quote, signature }),
    );
    if (
      r.status !== 201 ||
      !object(r.body) ||
      r.body.orderId !== orderHash ||
      !status(r.body.orderStatus)
    )
      throw new WalletProviderError('wallet_provider_response', 'unknown');
    return { status: r.body.orderStatus };
  }
  async lookup(
    orderHash: string,
    swapper: string,
  ): Promise<OrderObservation | null> {
    const r = await this.request(
      '/orders?' +
        new URLSearchParams({ orderId: orderHash, orderType: 'Dutch_V3' }),
    );
    if (
      !object(r.body) ||
      !Array.isArray(r.body.orders) ||
      r.body.orders.length > 1
    )
      throw new WalletProviderError('wallet_provider_response');
    if (!r.body.orders.length) return null;
    const order = r.body.orders[0];
    if (
      !object(order) ||
      order.orderId !== orderHash ||
      order.chainId !== 8453 ||
      order.type !== 'Dutch_V3' ||
      !status(order.orderStatus) ||
      typeof order.encodedOrder !== 'string' ||
      hashBaseUniswapXV3Order(order.encodedOrder, swapper).witnessHash !==
        orderHash ||
      (order.txHash !== undefined &&
        (typeof order.txHash !== 'string' ||
          !/^0x[a-fA-F0-9]{64}$/.test(order.txHash)))
    )
      throw new WalletProviderError('wallet_provider_response');
    return {
      status: order.orderStatus,
      ...(typeof order.txHash === 'string'
        ? { transactionHash: order.txHash }
        : {}),
    };
  }
}
