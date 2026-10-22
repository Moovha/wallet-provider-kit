import type { FastifyRequest } from 'fastify';
import type { ProviderNetwork } from '../networks.js';
import type { ProviderDatabase } from '../storage/index.js';
import type { ServerOptions } from './server.js';
import { WalletProviderError } from '../domain/signing.js';

export interface NetworkServices extends Pick<
  ServerOptions,
  | 'service'
  | 'safeWallet'
  | 'walletCalls'
  | 'runtimeConfiguration'
  | 'onboarding'
  | 'ready'
> {
  network?: ProviderNetwork;
}
export interface NetworkContext extends NetworkServices {
  network: ProviderNetwork;
  database: ProviderDatabase;
  currentConfiguration(): Promise<boolean>;
  start(): Promise<void>;
  close(): Promise<void>;
}
export type ResolveNetwork = (request: FastifyRequest) => NetworkServices;

/** A selector chooses a network; durable resource ownership always wins over conflicting input. */
export function createNetworkResolver(
  contexts: readonly NetworkContext[],
): ResolveNetwork {
  if (
    !contexts.length ||
    new Set(contexts.map((entry) => entry.network)).size !== contexts.length
  )
    throw new WalletProviderError('wallet_provider_configuration');
  const selected = new WeakMap<FastifyRequest, NetworkContext>();
  return (request) => {
    const retained = selected.get(request);
    if (retained) return retained;
    const selector = request.headers['wallet-network'];
    const explicit =
      selector === undefined
        ? undefined
        : contexts.find((entry) => entry.network === selector);
    if (selector !== undefined && !explicit)
      throw new WalletProviderError('wallet_provider_input');
    const params = request.params as Record<string, unknown> | undefined;
    const body = request.body as Record<string, unknown> | undefined;
    const ids = [
      params?.accountId,
      params?.requestId,
      params?.grantId,
      body?.account_id,
      body?.source_account_id,
    ].filter(
      (id): id is string =>
        typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id),
    );
    const owners = contexts.filter((entry) =>
      ids.some((id) => entry.database.hasResource(id)),
    );
    if (
      owners.length > 1 ||
      (owners.length && explicit && owners[0] !== explicit)
    )
      throw new WalletProviderError('wallet_authorization_denied');
    const result = owners[0] ?? explicit ?? contexts[0];
    selected.set(request, result);
    return result;
  };
}

export function usesNetworkContext(path: string): boolean {
  return /^\/v1\/(?:access-|accounts(?:\/|$)|configuration\/|applications\/configurations|application\/|wallet\/|provider\/(?:applications\/|policy\/)|(?:execution-)?capabilities$)/.test(
    path,
  );
}
