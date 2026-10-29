/** Advisory scheduling only. Fresh chain checks and durable spending reservations remain authoritative. */
export const fundingRecoveryIntervalMs = 15 * 60 * 1000;
export const fundingLowWatermarkBps = 5000;
const activityCooldownMs = 30000;
interface BalanceEstimate {
  deposit: bigint;
  executor: bigint;
  depositTarget: bigint;
  executorTarget: bigint;
}
export class FundingMonitor {
  private stopped = true;
  private recoveryTimer?: ReturnType<typeof setTimeout>;
  private recovery?: Promise<void>;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly lastCheck = new Map<string, number>();
  private readonly balances = new Map<string, BalanceEstimate>();
  private readonly receipts = new Set<string>();
  private readonly running = new Map<
    string,
    { force: boolean; promise: Promise<void> }
  >();
  constructor(
    private readonly applications: () => Promise<string[]>,
    private readonly reconcile: (
      applicationId: string,
      force: boolean,
    ) => Promise<void>,
  ) {}
  observed(applicationId: string, estimate: BalanceEstimate) {
    this.balances.set(applicationId, { ...estimate });
  }
  private low(value: bigint, target: bigint) {
    return value * 10000n < target * BigInt(fundingLowWatermarkBps);
  }
  private needsCheck(applicationId: string) {
    const b = this.balances.get(applicationId);
    return (
      !b ||
      this.low(b.deposit, b.depositTarget) ||
      this.low(b.executor, b.executorTarget)
    );
  }
  /** An existing fixed-block admission read can request an urgent refill without polling idle wallets. */
  async beforeAdmission(
    applicationId: string,
    deposit: bigint,
    maximumCost: bigint,
    depositTarget: bigint,
  ) {
    const b = this.balances.get(applicationId);
    if (b) b.deposit = deposit;
    if (
      deposit < maximumCost ||
      this.low(deposit, depositTarget) ||
      (b && this.low(b.executor, b.executorTarget))
    ) {
      await this.check(applicationId, true);
      return true;
    }
    return false;
  }
  /** Receipt costs are conservative refill hints, never balances used to authorize an operation. */
  spent(
    applicationId: string,
    operationId: string,
    transactionHash: string,
    amount: bigint,
  ) {
    if (this.stopped || amount < 0n) return;
    const key = applicationId + ':' + operationId + ':' + transactionHash;
    if (this.receipts.has(key)) return;
    this.receipts.add(key);
    if (this.receipts.size > 4096)
      this.receipts.delete(this.receipts.values().next().value!);
    const b = this.balances.get(applicationId);
    if (b) {
      b.deposit = b.deposit > amount ? b.deposit - amount : 0n;
      // Full sponsored cost is an upper-bound trigger for the executor's working-balance check.
      b.executor = b.executor > amount ? b.executor - amount : 0n;
    }
    if (this.needsCheck(applicationId)) this.request(applicationId);
  }
  invalidate(applicationId: string) {
    this.balances.delete(applicationId);
    this.request(applicationId);
  }
  private request(applicationId: string) {
    if (this.stopped || this.timers.has(applicationId)) return;
    const delay = Math.max(
      250,
      (this.lastCheck.get(applicationId) ?? 0) +
        activityCooldownMs -
        Date.now(),
    );
    const timer = setTimeout(() => {
      this.timers.delete(applicationId);
      void this.check(applicationId).catch(() => undefined);
    }, delay);
    timer.unref();
    this.timers.set(applicationId, timer);
  }
  /** Concurrent callers share work. An urgent admission upgrades one background pass at most once. */
  check(applicationId: string, force = false): Promise<void> {
    const previous = this.running.get(applicationId);
    if (previous) {
      previous.force ||= force;
      return previous.promise;
    }
    clearTimeout(this.timers.get(applicationId));
    this.timers.delete(applicationId);
    const entry = { force, promise: Promise.resolve() };
    entry.promise = Promise.resolve()
      .then(async () => {
        const initialForce = entry.force;
        await this.reconcile(applicationId, initialForce);
        if (!initialForce && entry.force)
          await this.reconcile(applicationId, true);
      })
      .finally(() => {
        this.lastCheck.set(applicationId, Date.now());
        this.running.delete(applicationId);
      });
    this.running.set(applicationId, entry);
    return entry.promise;
  }
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    const schedule = (delay: number) => {
      if (this.stopped) return;
      this.recoveryTimer = setTimeout(() => {
        this.recovery = this.applications()
          .then(async (ids) => {
            for (const id of new Set(ids)) {
              if (this.stopped) break;
              await this.check(id).catch(() => undefined);
            }
          })
          .catch(() => undefined)
          .finally(() => {
            this.recovery = undefined;
            schedule(fundingRecoveryIntervalMs);
          });
      }, delay);
      this.recoveryTimer.unref();
    };
    schedule(0);
  }
  async close() {
    this.stopped = true;
    clearTimeout(this.recoveryTimer);
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    await this.recovery;
    await Promise.allSettled([...this.running.values()].map((v) => v.promise));
  }
}
