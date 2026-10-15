import { randomUUID } from 'node:crypto';

/** @typedef {import('@moovha/wallet-provider-kit/core').WalletAttemptRequest} Request */
/** @typedef {import('@moovha/wallet-provider-kit/core').WalletAttemptResult} Result */
/** @typedef {import('@moovha/wallet-provider-kit/core').WalletAttemptFailure} Failure */
/** @typedef {{ request: Request, leaseToken: string, expiresAt: number, result?: Result, failure?: Failure }} Record */

/** @typedef {import('@moovha/wallet-provider-kit/core').WalletAttemptJournal} Journal */

/**
 * Single-process offline fixture, NOT durable storage or a deployment adapter.
 * A production journal must implement the persistence/fencing contract in docs/durable-attempts.md.
 * @implements {Journal}
 */
export class FixtureJournal {
  /** @type {Map<string, Record>} */
  #records = new Map();
  /** @type {Set<string>} */
  #resources = new Set();

  /** @param {Request} request @returns {Promise<import('@moovha/wallet-provider-kit/core').WalletAttemptClaim>} */
  async claim(request) {
    const identity = {
      attemptId: request.attemptId,
      resourceKey: request.resourceKey,
      requestHash: request.requestHash,
    };
    const key = [request.namespace, request.provider, request.attemptId].join(
      ':',
    );
    const previous = this.#records.get(key);
    if (previous) {
      if (JSON.stringify(previous.request) !== JSON.stringify(request)) {
        return { ...identity, state: 'conflict' };
      }
      if (previous.result) {
        return {
          ...identity,
          state: 'succeeded',
          result: structuredClone(previous.result),
        };
      }
      if (previous.failure) {
        return previous.failure.outcome === 'unknown'
          ? { ...identity, state: 'unknown' }
          : { ...identity, state: 'failed', failure: { ...previous.failure } };
      }
      return {
        ...identity,
        state: previous.expiresAt <= Date.now() ? 'unknown' : 'pending',
      };
    }
    if (this.#resources.has(request.resourceKey))
      return { ...identity, state: 'conflict' };
    const record = {
      request: structuredClone(request),
      leaseToken: randomUUID(),
      expiresAt: Date.now() + 30000,
    };
    // No await between lookup and insertion: only this in-process fixture is serialized.
    this.#records.set(key, record);
    this.#resources.add(request.resourceKey);
    return {
      ...identity,
      state: 'dispatch',
      leaseToken: record.leaseToken,
      leaseExpiresAt: new Date(record.expiresAt).toISOString(),
    };
  }

  /** @param {Request} request @param {string} leaseToken */
  #claimed(request, leaseToken) {
    const key = [request.namespace, request.provider, request.attemptId].join(
      ':',
    );
    const record = this.#records.get(key);
    if (
      !record ||
      record.leaseToken !== leaseToken ||
      record.expiresAt <= Date.now() ||
      record.result ||
      record.failure
    ) {
      throw new Error('Fixture lease unavailable');
    }
    return record;
  }

  /** @param {Request} request @param {string} leaseToken @param {Result} result */
  async complete(request, leaseToken, result) {
    this.#claimed(request, leaseToken).result = structuredClone(result);
  }

  /** @param {Request} request @param {string} leaseToken @param {Failure} failure */
  async fail(request, leaseToken, failure) {
    this.#claimed(request, leaseToken).failure = { ...failure };
  }
}
