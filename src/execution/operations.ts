import type { ReplacementStatus } from './replacement.js';
import { createHmac, randomUUID } from 'node:crypto';
import type { SecretReference } from '../deployment/config.js';
import { fingerprint } from '../onboarding/policy.js';
import { trustedHttpsUrl } from '../service/auth.js';

export interface OperationsConfiguration {
  pollIntervalSeconds: number;
  lowBalanceWei: string;
  webhooks: {
    id: string;
    endpoint: SecretReference;
    signingSecrets: SecretReference[];
  }[];
}
export interface PayerCondition {
  balance: 'unknown' | 'low' | 'sufficient';
  affected: boolean;
  reason: string;
  checkedAt?: number;
  balanceWei?: string;
  replacement?: {
    pending: number;
    unknown: number;
    blocked: number;
    exhausted: number;
    attempts: number;
  };
}
export interface PayerEvent {
  specversion: '1.0';
  id: string;
  source: string;
  type: 'com.moovha.wallet-provider.payer.observed.v1';
  subject: string;
  time: string;
  datacontenttype: 'application/json';
  data: {
    balance: PayerCondition['balance'];
    affected: boolean;
    reason: string;
    balance_wei?: string;
    threshold_wei: string;
    replacement?: PayerCondition['replacement'];
  };
}
interface Delivery {
  event: PayerEvent;
  endpointId: string;
  target: string;
  attempts: number;
  nextAt: number;
  lease?: string;
  leaseUntil?: number;
  failed?: boolean;
}
export interface OperationsState {
  binding?: string;
  lastDeliveredAt?: number;
  payers: Record<string, PayerCondition>;
  deliveries: Record<string, Delivery>;
  replacementStatuses?: Record<
    string,
    { payer: string; status: ReplacementStatus }
  >;
}
export interface OperationsStore {
  transaction<T>(operation: (state: OperationsState) => T): Promise<T>;
}
export const emptyOperationsState = (): OperationsState => ({
  payers: {},
  deliveries: {},
});
export const payerKey = (address: string) =>
  fingerprint(['payer', address.toLowerCase()]);
export interface WebhookTarget {
  id: string;
  url: string;
  target: string;
  secrets: Buffer[];
}
/** Credentials remain in memory; durable deliveries pin the destination without storing its URL. */
export function webhookTargets(
  configuration: OperationsConfiguration,
  resolve: (reference: SecretReference) => string,
): WebhookTarget[] {
  const registeredKeys = new Set<string>();
  return configuration.webhooks.map((entry) => {
    const url = trustedHttpsUrl(resolve(entry.endpoint));
    if (url.username || url.password || url.search || url.hash)
      throw new Error('Invalid webhook destination');
    const secrets = entry.signingSecrets.map((reference) => {
      const value = resolve(reference);
      if (!/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(value))
        throw new Error('Invalid webhook signing secret');
      const key = Buffer.from(value.slice(6), 'base64');
      if (
        key.length < 24 ||
        key.length > 64 ||
        key.toString('base64') !== value.slice(6)
      )
        throw new Error('Invalid webhook signing secret');
      const identity = fingerprint(key.toString('base64'));
      if (registeredKeys.has(identity))
        throw new Error('Webhook signing keys must be unique');
      registeredKeys.add(identity);
      return key;
    });
    return {
      id: entry.id,
      url: url.href,
      target: fingerprint(url.href),
      secrets,
    };
  });
}
/** Persist condition changes and their delivery intents in the same transaction. */
export function recordPayer(
  state: OperationsState,
  key: string,
  patch: Partial<PayerCondition>,
  configuration: OperationsConfiguration,
  targets: Pick<WebhookTarget, 'id' | 'target'>[],
  source: string,
  now = Date.now(),
): void {
  const previous = state.payers[key];
  const condition: PayerCondition = {
    ...(previous ?? { balance: 'unknown', affected: false, reason: 'none' }),
    ...patch,
  };
  state.payers[key] = condition;
  if (
    previous?.balance === condition.balance &&
    previous.affected === condition.affected &&
    previous.reason === condition.reason &&
    JSON.stringify(previous.replacement) ===
      JSON.stringify(condition.replacement)
  )
    return;
  if (
    !previous &&
    condition.balance === 'sufficient' &&
    !condition.affected &&
    !condition.replacement
  )
    return;
  const event: PayerEvent = {
    specversion: '1.0',
    id: randomUUID(),
    source,
    type: 'com.moovha.wallet-provider.payer.observed.v1',
    subject: key,
    time: new Date(now).toISOString(),
    datacontenttype: 'application/json',
    data: {
      balance: condition.balance,
      affected: condition.affected,
      reason: condition.reason,
      ...(condition.balanceWei !== undefined
        ? { balance_wei: condition.balanceWei }
        : {}),
      threshold_wei: configuration.lowBalanceWei,
      ...(condition.replacement ? { replacement: condition.replacement } : {}),
    },
  };
  for (const target of targets)
    state.deliveries[event.id + ':' + target.id] = {
      event,
      endpointId: target.id,
      target: target.target,
      attempts: 0,
      nextAt: now,
    };
}
export interface OperationsHealth {
  status: 'healthy' | 'degraded' | 'disabled';
  payers: number;
  affected_payers: number;
  low_balance_payers: number;
  unavailable_payers: number;
  stale_payers: number;
  webhook_pending: number;
  webhook_failed: number;
  webhook_unroutable: number;
  oldest_delivery_age_ms: number;
  last_webhook_delivery_at?: string;
  replacement_pending: number;
  replacement_unknown: number;
  replacement_blocked: number;
  replacement_exhausted: number;
}
/** Durable at-least-once delivery. Receiver deduplication uses the stable webhook-id. */
export class PayerOperations {
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = true;
  private cursor = 0;
  readonly source: string;
  readonly binding: string;
  readonly targets: WebhookTarget[];
  constructor(
    readonly configuration: OperationsConfiguration,
    private readonly store: OperationsStore,
    private readonly payers: {
      address: string;
      balance: () => Promise<string>;
    }[],
    origin: string,
    resolve: (reference: SecretReference) => string,
    private readonly request: typeof fetch = fetch,
    private readonly now = Date.now,
  ) {
    this.configuration = structuredClone(configuration);
    this.targets = webhookTargets(configuration, resolve);
    this.binding = fingerprint([
      configuration,
      this.targets.map((target) => [
        target.id,
        target.target,
        target.secrets.map((key) => fingerprint(key.toString('base64'))),
      ]),
    ]);
    this.source =
      'urn:moovha:wallet-provider-kit:payers:' + fingerprint(origin);
  }
  async health(): Promise<OperationsHealth> {
    return this.store.transaction((state) => {
      const now = this.now(),
        keys = [
          ...new Set(this.payers.map((payer) => payerKey(payer.address))),
        ];
      const conditions = keys.map((key) => state.payers[key]);
      const deliveries = Object.values(state.deliveries);
      const stale = conditions.filter(
        (value) =>
          !value?.checkedAt ||
          now - value.checkedAt >
            this.configuration.pollIntervalSeconds *
              1000 *
              Math.max(3, Math.ceil(keys.length / 4) * 3),
      ).length;
      const affected = conditions.filter((value) => value?.affected).length;
      const low = conditions.filter((value) => value?.balance === 'low').length;
      const unavailable = conditions.filter(
        (value) => !value || value.balance === 'unknown',
      ).length;
      const replacements = conditions.map((value) => value?.replacement);
      const replacement_pending = replacements.reduce(
        (count, value) => count + (value?.pending ?? 0),
        0,
      );
      const replacement_unknown = replacements.reduce(
        (count, value) => count + (value?.unknown ?? 0),
        0,
      );
      const replacement_blocked = replacements.reduce(
        (count, value) => count + (value?.blocked ?? 0),
        0,
      );
      const replacement_exhausted = replacements.reduce(
        (count, value) => count + (value?.exhausted ?? 0),
        0,
      );
      const failed = deliveries.filter((value) => value.failed).length;
      const unroutable = deliveries.filter(
        (value) =>
          !this.targets.some(
            (target) =>
              target.id === value.endpointId && target.target === value.target,
          ),
      ).length;
      return {
        status:
          stale ||
          affected ||
          low ||
          unavailable ||
          failed ||
          unroutable ||
          replacement_unknown ||
          replacement_blocked ||
          replacement_exhausted
            ? 'degraded'
            : 'healthy',
        payers: keys.length,
        affected_payers: affected,
        replacement_pending,
        replacement_unknown,
        replacement_blocked,
        replacement_exhausted,
        low_balance_payers: low,
        unavailable_payers: unavailable,
        stale_payers: stale,
        webhook_pending: deliveries.length,
        webhook_failed: failed,
        webhook_unroutable: unroutable,
        ...(state.lastDeliveredAt !== undefined
          ? {
              last_webhook_delivery_at: new Date(
                state.lastDeliveredAt,
              ).toISOString(),
            }
          : {}),
        oldest_delivery_age_ms: deliveries.length
          ? deliveries.reduce(
              (age, value) => Math.max(age, now - Date.parse(value.event.time)),
              0,
            )
          : 0,
      };
    });
  }
  async sample(): Promise<void> {
    const groups = new Map<string, typeof this.payers>();
    for (const payer of this.payers) {
      const key = payerKey(payer.address);
      groups.set(key, [...(groups.get(key) ?? []), payer]);
    }
    const unique = [...groups.values()].map((group) => ({
      address: group[0].address,
      balance: async () => {
        const values = await Promise.all(group.map((payer) => payer.balance()));
        if (values.some((value) => value !== values[0]))
          throw new Error('Conflicting balance evidence');
        return values[0];
      },
    }));
    const selected = Array.from(
      { length: Math.min(4, unique.length) },
      (_, i) => unique[(this.cursor + i) % unique.length],
    );
    this.cursor = unique.length
      ? (this.cursor + selected.length) % unique.length
      : 0;
    await Promise.allSettled(
      selected.map(async (payer) => {
        let balanceWei: string | undefined;
        try {
          balanceWei = await payer.balance();
          if (
            !/^(0|[1-9][0-9]{0,77})$/.test(balanceWei) ||
            BigInt(balanceWei) >= 2n ** 256n
          )
            throw new Error();
        } catch {
          balanceWei = undefined;
        }
        await this.store.transaction((state) =>
          recordPayer(
            state,
            payerKey(payer.address),
            {
              checkedAt: this.now(),
              balanceWei,
              balance:
                balanceWei === undefined
                  ? 'unknown'
                  : BigInt(balanceWei) <
                      BigInt(this.configuration.lowBalanceWei)
                    ? 'low'
                    : 'sufficient',
            },
            this.configuration,
            this.targets,
            this.source,
            this.now(),
          ),
        );
      }),
    );
  }
  async deliver(): Promise<void> {
    const claims = await this.store.transaction((state) => {
      const selected = Object.entries(state.deliveries)
        .filter(
          ([, value]) =>
            value.nextAt <= this.now() &&
            (value.leaseUntil ?? 0) <= this.now() &&
            this.targets.some(
              (target) =>
                target.id === value.endpointId &&
                target.target === value.target,
            ),
        )
        .sort((a, b) => a[1].nextAt - b[1].nextAt)
        .slice(0, 4);
      return selected.map(([id, value]) => {
        value.lease = randomUUID();
        value.leaseUntil = this.now() + 30000;
        value.attempts++;
        return { id, value: structuredClone(value) };
      });
    });
    await Promise.allSettled(
      claims.map(async ({ id, value }) => {
        const target = this.targets.find(
          (target) =>
            target.id === value.endpointId && target.target === value.target,
        )!;
        const timestamp = Math.floor(this.now() / 1000).toString(),
          body = JSON.stringify(value.event);
        const signature = target.secrets
          .map(
            (key) =>
              'v1,' +
              createHmac('sha256', key)
                .update(value.event.id + '.' + timestamp + '.' + body)
                .digest('base64'),
          )
          .join(' ');
        let success = false;
        try {
          const response = await this.request(target.url, {
            method: 'POST',
            redirect: 'error',
            signal: AbortSignal.timeout(10000),
            headers: {
              'content-type': 'application/cloudevents+json',
              'webhook-id': value.event.id,
              'webhook-timestamp': timestamp,
              'webhook-signature': signature,
            },
            body,
          });
          success = response.status >= 200 && response.status < 300;
          await response.body?.cancel();
        } catch {
          /* Response bodies and transport errors never enter event or health data. */
        }
        await this.store.transaction((state) => {
          const current = state.deliveries[id];
          if (current?.lease !== value.lease) return;
          if (success) {
            delete state.deliveries[id];
            state.lastDeliveredAt = this.now();
          } else {
            current.failed = true;
            current.nextAt =
              this.now() +
              Math.min(3600000, 1000 * 2 ** Math.min(12, current.attempts)) +
              Math.floor(Math.random() * 1000);
            delete current.lease;
            delete current.leaseUntil;
          }
        });
      }),
    );
  }
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    const schedule = () => {
      this.running = tick();
    };
    const tick = async () => {
      try {
        await this.sample();
        await this.deliver();
      } catch {
        /* Durable work remains pending; health becomes stale when evidence cannot be refreshed. */
      }
      if (!this.stopped) {
        this.timer = setTimeout(
          schedule,
          this.configuration.pollIntervalSeconds * 1000,
        );
        this.timer.unref();
      }
    };
    this.timer = setTimeout(schedule, 0);
    this.timer.unref();
  }
  async close(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }
}

export function validateOperations(
  configuration: OperationsConfiguration,
): void {
  if (
    BigInt(configuration.lowBalanceWei) >= 2n ** 256n ||
    new Set(configuration.webhooks.map((entry) => entry.id)).size !==
      configuration.webhooks.length
  )
    throw new Error('Invalid operations configuration');
}

/** Replacement summaries share the same atomic operational outbox without exposing execution identifiers. */
export function recordReplacement(
  state: OperationsState,
  payer: string,
  executionId: string,
  status: ReplacementStatus,
  configuration: OperationsConfiguration,
  targets: Pick<WebhookTarget, 'id' | 'target'>[],
  source: string,
): void {
  (state.replacementStatuses ??= {})[executionId] = { payer, status };
  const entries = Object.values(state.replacementStatuses).filter(
    (entry) => entry.payer === payer,
  );
  const count = (states: string[]) =>
    entries.filter((entry) => states.includes(entry.status.state)).length;
  recordPayer(
    state,
    payer,
    {
      replacement: {
        pending: count(['prepared', 'dispatch', 'accepted', 'observed']),
        unknown: count(['unknown']),
        blocked: count(['blocked']),
        exhausted: count(['exhausted']),
        attempts: entries.reduce(
          (sum, entry) => sum + entry.status.attempts,
          0,
        ),
      },
    },
    configuration,
    targets,
    source,
  );
}
