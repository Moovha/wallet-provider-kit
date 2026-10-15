import { mkdir, open, readFile, rename, rm, lstat } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WalletProviderError } from '../domain/signing.js';
import { AuthenticationError } from '../service/auth.js';
import type { OnboardingStore, ProviderState } from './types.js';

function emptyState(): ProviderState {
  return {
    format: 'moovha-onboarding-1',
    requests: {},
    accounts: {},
    grants: {},
    idempotency: {},
    budgets: {},
    evidenceOwners: {},
    attempts: {},
    admissions: {},
    sessions: {},
    logins: {},
    audit: [],
  };
}
/** Small, single-host reference store. Requires a private local POSIX filesystem with atomic rename/fsync. */
export function createFileOnboardingStore(directory: string): OnboardingStore {
  if (!isAbsolute(directory))
    throw new WalletProviderError('wallet_provider_configuration');
  return {
    async transaction<T>(operation: (state: ProviderState) => T): Promise<T> {
      let locked = false;
      let temporary: string | undefined;
      const lock = join(directory, 'transaction.lock');
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const info = await lstat(directory);
        if (
          !info.isDirectory() ||
          info.isSymbolicLink() ||
          (info.mode & 0o077) !== 0
        )
          throw new Error();
        for (let attempt = 0; attempt < 100; attempt++) {
          try {
            await mkdir(lock, { mode: 0o700 });
            locked = true;
            break;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        }
        if (!locked) throw new Error();
        const path = join(directory, 'state.json');
        let state: ProviderState;
        try {
          const stat = await lstat(path);
          if (
            !stat.isFile() ||
            stat.isSymbolicLink() ||
            (stat.mode & 0o077) !== 0 ||
            stat.size > 16 * 1024 * 1024
          )
            throw new Error();
          state = JSON.parse(await readFile(path, 'utf8')) as ProviderState;
          if (
            state.format !== 'moovha-onboarding-1' ||
            !Array.isArray(state.audit) ||
            [
              'requests',
              'accounts',
              'grants',
              'idempotency',
              'budgets',
              'evidenceOwners',
              'attempts',
              'admissions',
              'sessions',
              'logins',
            ].some(
              (k) =>
                !state[k as keyof ProviderState] ||
                typeof state[k as keyof ProviderState] !== 'object' ||
                Array.isArray(state[k as keyof ProviderState]),
            )
          )
            throw new Error();
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          state = emptyState();
        }
        const result = operation(state);
        if (result instanceof Promise)
          throw new Error('Async transaction is unsupported');
        const encoded = JSON.stringify(state);
        if (Buffer.byteLength(encoded) > 16 * 1024 * 1024) throw new Error();
        temporary = join(directory, `state-${randomUUID()}.tmp`);
        const file = await open(temporary, 'wx', 0o600);
        try {
          await file.writeFile(encoded);
          await file.sync();
        } finally {
          await file.close();
        }
        await rename(temporary, path);
        temporary = undefined;
        const parent = await open(directory, 'r');
        try {
          await parent.sync();
        } finally {
          await parent.close();
        }
        return structuredClone(result);
      } catch (error) {
        if (
          error instanceof WalletProviderError ||
          error instanceof AuthenticationError
        )
          throw error;
        throw new WalletProviderError(
          'wallet_onboarding_unavailable',
          'unknown',
        );
      } finally {
        if (temporary)
          await rm(temporary, { force: true }).catch(() => undefined);
        if (locked) await rm(lock, { recursive: true }).catch(() => undefined);
      }
    },
  };
}
