/** Timestamped USD/ZAR references with bounded caching and no stale or static fallback. */
export interface UsdZarSnapshot {
  source: 'exchangerate-api-open';
  numerator: string;
  denominator: string;
  updatedAt: number;
  fetchedAt: number;
}
export const usdZarAttribution = {
  text: 'Rates By Exchange Rate API',
  url: 'https://www.exchangerate-api.com',
} as const;
export const fxCacheSeconds = 3600;
export const fxMaximumAgeSeconds = 129600;
export function validUsdZarSnapshot(
  value: UsdZarSnapshot,
  now: number,
): boolean {
  try {
    return (
      value.source === 'exchangerate-api-open' &&
      /^[1-9][0-9]{0,17}$/.test(value.numerator) &&
      /^(1|10|100|1000|10000|100000|1000000|10000000|100000000|1000000000|10000000000|100000000000|1000000000000)$/.test(
        value.denominator,
      ) &&
      BigInt(value.numerator) >= BigInt(value.denominator) &&
      BigInt(value.numerator) <= 1000n * BigInt(value.denominator) &&
      Number.isSafeInteger(value.updatedAt) &&
      value.updatedAt > 0 &&
      Number.isSafeInteger(value.fetchedAt) &&
      value.fetchedAt >= value.updatedAt &&
      value.fetchedAt <= now &&
      value.fetchedAt + fxCacheSeconds > now &&
      value.updatedAt <= now &&
      value.updatedAt + fxMaximumAgeSeconds > now
    );
  } catch {
    return false;
  }
}
/** Net minimum outputs are compared with the full input budget, using integer
 * base units and outward rounding. USD/USDC and ZAR/ZARP are nominal peg mappings,
 * not a guarantee of token redemption or a market depeg oracle. */
export function fiatMinimumOutput(
  inputUnits: string,
  direction: 'zar-to-usd' | 'usd-to-zar',
  rate: UsdZarSnapshot,
  maximumLossBps: 1000,
) {
  if (!/^[1-9][0-9]{0,38}$/.test(inputUnits) || maximumLossBps !== 1000)
    throw new Error('invalid_fx_input');
  const amount = BigInt(inputUnits);
  const numerator =
    direction === 'zar-to-usd'
      ? amount * BigInt(rate.denominator) * 10n ** 6n
      : amount * BigInt(rate.numerator) * 10n ** 18n;
  const denominator =
    direction === 'zar-to-usd'
      ? BigInt(rate.numerator) * 10n ** 18n
      : BigInt(rate.denominator) * 10n ** 6n;
  const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d;
  return {
    referenceAmountOutUnits: ceil(numerator, denominator).toString(),
    minimumRequiredOutUnits: ceil(
      numerator * 9000n,
      denominator * 10000n,
    ).toString(),
  };
}
export class UsdZarFxReader {
  private cached?: UsdZarSnapshot;
  private pending?: Promise<UsdZarSnapshot | null>;
  private retryAt = 0;
  constructor(
    private options: { fetch?: typeof fetch; now?: () => number } = {},
  ) {}
  private now() {
    return this.options.now?.() ?? Math.floor(Date.now() / 1000);
  }
  get(): Promise<UsdZarSnapshot | null> {
    if (this.cached && validUsdZarSnapshot(this.cached, this.now()))
      return Promise.resolve(structuredClone(this.cached));
    if (this.pending)
      return this.pending.then((value) =>
        value ? structuredClone(value) : null,
      );
    if (this.retryAt > this.now()) return Promise.resolve(null);
    this.pending = this.read().finally(() => {
      this.pending = undefined;
    });
    return this.pending.then((value) =>
      value ? structuredClone(value) : null,
    );
  }
  private async read(): Promise<UsdZarSnapshot | null> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      const response = await (this.options.fetch ?? fetch)(
        'https://open.er-api.com/v6/latest/USD',
        { redirect: 'error', signal: controller.signal },
      );
      if (!response.ok) throw new Error();
      const stream = response.body?.getReader();
      if (!stream) throw new Error();
      let bytes = 0;
      const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const chunk = await stream.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 65536) {
            await stream.cancel();
            throw new Error();
          }
          chunks.push(chunk.value);
        }
      } finally {
        stream.releaseLock();
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const decimal = String(body.rates?.ZAR);
      if (
        body.result !== 'success' ||
        body.base_code !== 'USD' ||
        body.rates?.USD !== 1 ||
        !/^\d{1,4}(?:\.\d{1,12})?$/.test(decimal) ||
        !Number.isSafeInteger(body.time_next_update_unix) ||
        !Number.isSafeInteger(body.time_last_update_unix) ||
        body.time_next_update_unix <= body.time_last_update_unix ||
        body.time_next_update_unix > body.time_last_update_unix + 172800
      )
        throw new Error();
      const [whole, fraction = ''] = decimal.split('.');
      return {
        source: 'exchangerate-api-open' as const,
        numerator: BigInt(whole + fraction).toString(),
        denominator: (10n ** BigInt(fraction.length)).toString(),
        updatedAt: body.time_last_update_unix,
        fetchedAt: this.now(),
      };
    };
    try {
      const value = await Promise.race([
        read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error());
          }, 5000);
        }),
      ]);
      if (!validUsdZarSnapshot(value, this.now())) throw new Error();
      this.cached = value;
      return structuredClone(value);
    } catch {
      this.retryAt = this.now() + 30;
      return null;
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
}

export const baseZarp = '0xb755506531786c8ac63b756bab1ac387bacb0c04';
export const baseUsdc = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
export function fiatPairDirection(tokenIn: string, tokenOut: string) {
  if (tokenIn.toLowerCase() === baseZarp && tokenOut.toLowerCase() === baseUsdc)
    return 'zar-to-usd' as const;
  if (tokenIn.toLowerCase() === baseUsdc && tokenOut.toLowerCase() === baseZarp)
    return 'usd-to-zar' as const;
  throw new Error('unsupported_fx_pair');
}
