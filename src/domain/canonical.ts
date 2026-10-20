import { createHash } from 'node:crypto';
import { WalletProviderError } from './signing.js';
/** RFC 8785 serialization restricted to well-formed strings and finite JSON numbers. */
export function canonicalJson(value: unknown): string {
  function serialize(input: unknown, depth: number): string {
    if (depth > 20) throw new Error();
    if (input === null || typeof input === 'boolean')
      return JSON.stringify(input);
    if (
      typeof input === 'string' &&
      !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
        input,
      )
    )
      return JSON.stringify(input);
    if (typeof input === 'number' && Number.isFinite(input))
      return JSON.stringify(input);
    if (Array.isArray(input))
      return '[' + input.map((v) => serialize(v, depth + 1)).join(',') + ']';
    if (
      input &&
      typeof input === 'object' &&
      Object.getPrototypeOf(input) === Object.prototype
    )
      return (
        '{' +
        Object.keys(input)
          .sort()
          .map(
            (key) =>
              serialize(key, depth + 1) +
              ':' +
              serialize((input as Record<string, unknown>)[key], depth + 1),
          )
          .join(',') +
        '}'
      );
    throw new Error();
  }
  try {
    return serialize(value, 0);
  } catch {
    throw new WalletProviderError('wallet_provider_input');
  }
}
export function canonicalHash(value: unknown) {
  return createHash('sha256')
    .update(canonicalJson(value), 'utf8')
    .digest('hex');
}
