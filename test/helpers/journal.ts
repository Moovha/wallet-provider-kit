import { randomUUID } from 'node:crypto';
import type {
  WalletAttemptJournal,
  WalletAttemptRequest,
  WalletAttemptClaim,
  WalletAttemptResult,
  WalletAttemptFailure,
} from '../../src/domain/attempt-journal.js';
interface AttemptRecord {
  request: WalletAttemptRequest;
  leaseToken: string;
  expiresAt: number;
  state: 'dispatch' | 'succeeded' | 'failed' | 'unknown';
  result?: WalletAttemptResult;
  failure?: WalletAttemptFailure;
}

/** Ephemeral contract fixture, deliberately excluded from runtime/package exports. */
export class TestJournal implements WalletAttemptJournal {
  readonly records = new Map<string, AttemptRecord>();
  private readonly resources = new Map<string, string>();

  async claim(request: WalletAttemptRequest): Promise<WalletAttemptClaim> {
    const identity = {
      attemptId: request.attemptId,
      resourceKey: request.resourceKey,
      requestHash: request.requestHash,
    };
    const key = [request.namespace, request.provider, request.attemptId].join(
      ':',
    );
    const previous = this.records.get(key);
    if (previous) {
      if (
        previous.request.resourceKey !== request.resourceKey ||
        previous.request.requestHash !== request.requestHash
      )
        return { ...identity, state: 'conflict' };
      if (previous.state === 'dispatch' && previous.expiresAt <= Date.now())
        previous.state = 'unknown';
      if (previous.state === 'succeeded')
        return {
          ...identity,
          state: 'succeeded',
          result: structuredClone(previous.result!),
        };
      if (previous.state === 'failed')
        return {
          ...identity,
          state: 'failed',
          failure: { ...previous.failure! },
        };
      return {
        ...identity,
        state: previous.state === 'dispatch' ? 'pending' : 'unknown',
      };
    }
    if (this.resources.has(request.resourceKey))
      return { ...identity, state: 'conflict' };
    const leaseToken = randomUUID();
    this.records.set(key, {
      request: { ...request },
      leaseToken,
      expiresAt: Date.now() + 30000,
      state: 'dispatch',
    });
    this.resources.set(request.resourceKey, key);
    return {
      ...identity,
      state: 'dispatch',
      leaseToken,
      leaseExpiresAt: new Date(Date.now() + 30000).toISOString(),
    };
  }

  private claimed(
    request: WalletAttemptRequest,
    leaseToken: string,
  ): AttemptRecord {
    const record = this.records.get(
      [request.namespace, request.provider, request.attemptId].join(':'),
    );
    if (
      !record ||
      record.state !== 'dispatch' ||
      record.leaseToken !== leaseToken ||
      record.expiresAt <= Date.now()
    )
      throw new Error('Fixture fencing failure');
    return record;
  }

  async complete(
    request: WalletAttemptRequest,
    leaseToken: string,
    result: WalletAttemptResult,
  ): Promise<void> {
    const record = this.claimed(request, leaseToken);
    record.state = 'succeeded';
    record.result = structuredClone(result);
  }

  async fail(
    request: WalletAttemptRequest,
    leaseToken: string,
    failure: WalletAttemptFailure,
  ): Promise<void> {
    const record = this.claimed(request, leaseToken);
    record.state = failure.outcome === 'unknown' ? 'unknown' : 'failed';
    record.failure = { ...failure };
  }
}
