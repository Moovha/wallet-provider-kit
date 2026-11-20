import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { WalletProviderError } from '../domain/signing.js';
import type { SolverPricePolicy } from './price-policy.js';
import type {
  UniswapXOrderPolicy,
  UniswapXOrderReview,
} from './uniswapx-v3.js';

export interface OrderPriceAssessment {
  minimumRequiredOutUnits: string;
  /** Expiry of the independently obtained price evidence, in Unix seconds. */
  validUntil: number;
  proof: Record<string, unknown>;
}
/** Trusted host code, selected by the operator, never by an application request. */
export interface OrderPricePolicyAdapter {
  version: 1;
  validate(
    policy: SolverPricePolicy,
    routes: UniswapXOrderPolicy['routes'],
  ): boolean;
  assess(input: {
    policy: SolverPricePolicy;
    review: UniswapXOrderReview;
    signal: AbortSignal;
  }): Promise<OrderPriceAssessment>;
}

export async function assessApplicationPrice(
  adapter: OrderPricePolicyAdapter | undefined,
  policy: SolverPricePolicy,
  review: UniswapXOrderReview,
  now: () => number = () => Math.floor(Date.now() / 1000),
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!adapter || adapter.version !== 1) throw new Error();
    const assessment = await Promise.race([
      adapter.assess({
        policy: structuredClone(policy),
        review: structuredClone(review),
        signal: controller.signal,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error());
        }, 5000);
      }),
    ]);
    const current = now();
    if (
      !assessment ||
      typeof assessment.minimumRequiredOutUnits !== 'string' ||
      !/^[1-9][0-9]{0,38}$/.test(assessment.minimumRequiredOutUnits) ||
      !Number.isSafeInteger(assessment.validUntil) ||
      assessment.validUntil <= current ||
      !Number.isSafeInteger(review.deadline) ||
      review.deadline <= current ||
      BigInt(review.minimumAmountOutUnits) <
        BigInt(assessment.minimumRequiredOutUnits) ||
      !assessment.proof ||
      typeof assessment.proof !== 'object' ||
      Array.isArray(assessment.proof) ||
      JSON.stringify(assessment.proof).length > 8192
    )
      throw new Error();
    return structuredClone(assessment.proof);
  } catch {
    throw new WalletProviderError('wallet_authorization_denied');
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** Load exactly the reviewed bytes. Adapters are trusted code, not a sandbox. */
export async function loadOrderPricePolicyAdapter(
  reference: { path: string; sha256: string } | undefined,
  directory: string,
  request: typeof fetch = fetch,
): Promise<OrderPricePolicyAdapter | undefined> {
  if (!reference) return undefined;
  try {
    if (!/^[a-f0-9]{64}$/.test(reference.sha256)) throw new Error();
    const file = await open(
      resolve(directory, reference.path),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    let source: Buffer;
    try {
      const metadata = await file.stat();
      if (!metadata.isFile() || metadata.size > 262144) throw new Error();
      source = await file.readFile();
      if (source.length > 262144) throw new Error();
    } finally {
      await file.close();
    }
    if (createHash('sha256').update(source).digest('hex') !== reference.sha256)
      throw new Error();
    const module = await import(
      'data:text/javascript;base64,' + source.toString('base64')
    );
    const adapter = module.createOrderPricePolicyAdapter({ fetch: request });
    if (
      adapter?.version !== 1 ||
      typeof adapter.validate !== 'function' ||
      typeof adapter.assess !== 'function'
    )
      throw new Error();
    return adapter;
  } catch {
    throw new WalletProviderError('wallet_provider_configuration');
  }
}
