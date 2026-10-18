import { resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveSecret } from '../deployment/config.js';
import { WalletProviderError } from '../domain/signing.js';
import { createTransferExecutionProvider } from '../execution/relayer.js';
import type {
  ExecutionProvider,
  TransferExecutionPlan,
} from '../execution/types.js';
import type { ExecutorProviderConfiguration } from './config.js';

function immutable<T>(input: T): T {
  if (input && typeof input === 'object') {
    for (const value of Object.values(input)) immutable(value);
    Object.freeze(input);
  }
  return input;
}
function snapshot(plan: TransferExecutionPlan) {
  return immutable(structuredClone(plan));
}
/** Trusted server-side adapter. submit must invoke context.authorizeEffect immediately before effects. */
export interface ExecutionProviderAdapterV1 {
  adapterVersion: 1;
  createExecutionProvider(context: {
    options: Record<string, unknown>;
    secret(name: string): string;
  }): Promise<ExecutionProvider> | ExecutionProvider;
}
export async function createExecutorProvider(
  config: ExecutorProviderConfiguration,
  directory: string,
  request: typeof fetch = fetch,
): Promise<ExecutionProvider> {
  try {
    if (config.kind === 'openzeppelin-relayer') {
      const provider = createTransferExecutionProvider(
        {
          profile: 'erc3009-relayer-v1',
          relayer: config.relayer!,
          rpc: config.rpc,
          sponsors: config.sponsors,
          pollIntervalSeconds: 15,
          maxLogRange: 10000,
        },
        resolveSecret(config.relayer!.apiKey),
        request,
      );
      if (config.replacement && !(await provider.supportsReplacement?.()))
        throw new Error();
      const local = (plan: TransferExecutionPlan) => ({
        ...structuredClone(plan),
        sponsor: structuredClone(
          config.sponsors.find(
            (entry) => entry.accountId === plan.sponsor.accountId,
          )!,
        ),
      });
      return {
        prepare: (plan) => provider.prepare(local(plan)),
        replace: (plan, id, proposal, authorize) =>
          provider.replace!(local(plan), id, proposal, authorize),
        submit: (plan, context) => provider.submit(local(plan), context),
        transactionHash: (plan, id) =>
          provider.transactionHash(local(plan), id),
        inspect: (plan, id) => provider.inspect!(local(plan), id),
      };
    }
    if (
      !config.module ||
      (!config.module.startsWith('./') && !isAbsolute(config.module))
    )
      throw new Error();
    const adapter = (await import(
      pathToFileURL(resolve(directory, config.module)).href
    )) as ExecutionProviderAdapterV1;
    if (
      adapter.adapterVersion !== 1 ||
      typeof adapter.createExecutionProvider !== 'function'
    )
      throw new Error();
    const provider = await adapter.createExecutionProvider({
      options: structuredClone(config.options ?? {}),
      secret: (name) => resolveSecret({ env: name }),
    });
    if (
      !provider ||
      typeof provider.prepare !== 'function' ||
      typeof provider.submit !== 'function' ||
      typeof provider.transactionHash !== 'function'
    )
      throw new Error();
    return {
      ...(provider.inspect
        ? {
            async inspect(plan: TransferExecutionPlan, id: string) {
              try {
                return await provider.inspect!(snapshot(plan), id);
              } catch {
                throw new WalletProviderError('wallet_provider_unavailable');
              }
            },
          }
        : {}),
      ...(provider.recover
        ? {
            async recover(
              plan: TransferExecutionPlan,
              context: import('../execution/types.js').ExecutionDispatchContext,
            ) {
              try {
                return await provider.recover!(
                  snapshot(plan),
                  immutable({
                    executionId: context.executionId,
                    request: structuredClone(context.request),
                  }),
                );
              } catch {
                throw new WalletProviderError('wallet_provider_unavailable');
              }
            },
          }
        : {}),
      async prepare(plan) {
        try {
          await provider.prepare(snapshot(plan));
        } catch {
          throw new WalletProviderError('wallet_provider_unavailable');
        }
      },
      async submit(plan, context) {
        try {
          return await provider.submit(
            snapshot(plan),
            context
              ? immutable({
                  ...context,
                  request: structuredClone(context.request),
                })
              : undefined,
          );
        } catch (error) {
          if (error instanceof WalletProviderError) throw error;
          throw new WalletProviderError(
            'wallet_provider_unavailable',
            'unknown',
          );
        }
      },
      async transactionHash(plan, id) {
        try {
          return await provider.transactionHash(snapshot(plan), id);
        } catch {
          throw new WalletProviderError('wallet_provider_unavailable');
        }
      },
    };
  } catch {
    throw new WalletProviderError('wallet_provider_configuration');
  }
}
