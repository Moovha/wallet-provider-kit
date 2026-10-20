import { includedExecution, observationBatch } from './inclusion.js';
import type { TransferExecutionRecord } from './types.js';

type Row = { id: string; execution: TransferExecutionRecord };
/** Read-only workers refill independently; no batch waits for its slowest member. */
export class ObservationWorker {
  private stopped = true;
  private timer?: ReturnType<typeof setTimeout>;
  private scanning?: Promise<void>;
  private requested = false;
  private readonly active = new Map<string, Promise<void>>();
  private readonly next = new Map<string, number>();
  private readonly started = new Map<string, number>();
  private readonly settlement = new Set<string>();
  private cursors = { pending: 0, settlement: 0 };
  constructor(
    private readonly rows: () => Promise<Row[]>,
    private readonly observe: (id: string) => Promise<void>,
    private readonly intervalMs: number,
  ) {}
  private lastHint = 0;
  private rowCache?: { at: number; rows: Row[] };
  hint() {
    if (Date.now() - this.lastHint < 200) return;
    this.lastHint = Date.now();
    this.rowCache = undefined;
    // Signals may shorten a long fallback interval, but cannot create a polling storm.
    for (const id of this.next.keys())
      this.next.set(
        id,
        Math.max(Date.now(), (this.started.get(id) ?? Date.now()) + 1000),
      );
    this.wake();
  }
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.wake();
  }
  wake() {
    if (this.stopped) return;
    if (this.scanning) {
      this.requested = true;
      return;
    }
    clearTimeout(this.timer);
    this.scanning = this.fill()
      .catch(() => {})
      .finally(() => {
        this.scanning = undefined;
        if (this.requested && !this.stopped) {
          this.requested = false;
          this.wake();
          return;
        }
        if (!this.stopped) {
          this.timer = setTimeout(
            () => this.wake(),
            Math.min(1000, this.intervalMs),
          );
          this.timer.unref();
        }
      });
  }
  private async fill() {
    if (this.active.size >= 4) return;
    if (!this.rowCache || Date.now() - this.rowCache.at >= 1000)
      this.rowCache = { at: Date.now(), rows: await this.rows() };
    const all = this.rowCache.rows;
    const rows = all.filter(
      (row) =>
        !this.active.has(row.id) && (this.next.get(row.id) ?? 0) <= Date.now(),
    );
    const batch = observationBatch(rows, this.cursors);
    this.cursors = batch.cursors;
    const ids = batch.ids;
    // Reserve one slot for settlement even when only one worker has just completed.
    const old = rows.find((row) => includedExecution(row.execution));
    if (old && !this.settlement.size) {
      const index = ids.indexOf(old.id);
      if (index >= 0) ids.splice(index, 1);
      ids.unshift(old.id);
    }
    for (const id of ids.slice(0, 4 - this.active.size)) {
      if (this.stopped) break;
      if (includedExecution(rows.find((row) => row.id === id)?.execution))
        this.settlement.add(id);
      this.started.set(id, Date.now());
      this.next.set(id, Date.now() + Math.max(250, this.intervalMs));
      const work = this.observe(id)
        .catch(() => {})
        .finally(() => {
          this.active.delete(id);
          this.settlement.delete(id);
          this.wake();
        });
      this.active.set(id, work);
    }
    // Only retain cooldowns for currently eligible rows or active observations.
    const retained = new Set(all.map((row) => row.id));
    for (const id of this.next.keys())
      if (!retained.has(id) && !this.active.has(id)) {
        this.next.delete(id);
        this.started.delete(id);
      }
  }
  async close() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.scanning;
    await Promise.allSettled(this.active.values());
  }
}
