import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { patchBundlerScheduling } from '../scripts/patch-bundler-scheduling.mjs';
it('waits for executor submission before draining more outstanding operations into queued bundles', async () => {
  const source =
    'async function bundle(bundles) {for(const bundle of bundles) {this.sendBundleToExecutor(bundle)}}';
  const hash = createHash('sha256').update(source).digest('hex');
  const patched = patchBundlerScheduling(source, hash);
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const sent: number[] = [];
  const run = new Function('return (' + patched + ')')() as (
    this: { sendBundleToExecutor: (value: number) => Promise<void> },
    bundles: number[],
  ) => Promise<void>;
  const running = run.call(
    {
      sendBundleToExecutor: async (value) => {
        sent.push(value);
        await gate;
      },
    },
    [1, 2],
  );
  await Promise.resolve();
  expect(sent).toEqual([1]);
  release();
  await running;
  expect(sent).toEqual([1, 2]);
  expect(() => patchBundlerScheduling(source, '0'.repeat(64))).toThrow(
    'source mismatch',
  );
  expect(() => patchBundlerScheduling(patched, hash)).toThrow(
    'source mismatch',
  );
});
