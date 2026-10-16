import { getAuthHeaders } from '@coinbase/cdp-sdk/auth';
import { getAddress, recoverAddress } from 'ethers';
import {
  WalletProviderError,
  type EmbeddedAccount,
  type TypedDataAction,
  type WalletSigningProvider,
} from '../domain/signing.js';

import { baseSepoliaPayload } from './evm-typed-data.js';

const host = 'api.cdp.coinbase.com';
const accountsPath = '/platform/v2/evm/accounts';
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const addressPattern = /^0x[0-9a-fA-F]{40}$/;

interface CdpConfiguration {
  apiKeyId: string;
  apiKeySecret: string;
  walletSecret: string;
}

function configuration(environment: NodeJS.ProcessEnv): CdpConfiguration {
  const apiKeyId = environment.WALLET_CDP_API_KEY_ID;
  const apiKeySecret = environment.WALLET_CDP_API_KEY_SECRET;
  const walletSecret = environment.WALLET_CDP_WALLET_SECRET;
  if (
    environment.WALLET_SERVICE_MODE !== 'provider' ||
    environment.GAE_SERVICE === 'exchange' ||
    environment.WALLET_BACKEND !== 'cdp' ||
    environment.NODE_TLS_REJECT_UNAUTHORIZED === '0' ||
    !apiKeyId?.trim() ||
    !apiKeySecret?.trim() ||
    !walletSecret?.trim()
  ) {
    throw new WalletProviderError('wallet_provider_configuration');
  }
  return { apiKeyId, apiKeySecret, walletSecret };
}

function accountName(accountId: string): string {
  if (!uuid.test(accountId))
    throw new WalletProviderError('wallet_provider_input');
  // Reserve this opaque ID durably BEFORE creation. Never send a phone/user ID.
  // CDP allows at most 36 alphanumeric/hyphen characters. Keep every UUID bit
  // in a deterministic 35-character name for creation and read-only recovery.
  return `mw-${accountId.replaceAll('-', '')}`;
}

function requireAttempt(attemptId: string): void {
  if (!uuid.test(attemptId))
    throw new WalletProviderError('wallet_provider_input');
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function accountResponse(value: unknown, accountId: string): EmbeddedAccount {
  if (
    !record(value) ||
    value.name !== accountName(accountId) ||
    typeof value.address !== 'string' ||
    !addressPattern.test(value.address) ||
    value.address.toLowerCase() === '0x' + '0'.repeat(40)
  ) {
    throw new WalletProviderError('wallet_provider_response', 'unknown');
  }
  try {
    return { accountId, address: getAddress(value.address) };
  } catch {
    throw new WalletProviderError('wallet_provider_response', 'unknown');
  }
}

async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('missing response');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65536) throw new Error('response limit');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/**
 * No SDK singleton, telemetry, ambient credentials, redirects or automatic retries.
 * Auth uses the vendor's public SDK; HTTP lifecycle belongs to this adapter.
 * Import this factory explicitly when selecting CDP. Compose business policy and
 * durable attempts through the configured service or an embedded host before activation.
 */
export function createCdpWalletProvider(
  environment: NodeJS.ProcessEnv,
  request: typeof fetch = fetch,
): WalletSigningProvider {
  const config = configuration(environment);

  async function call(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
    attemptId?: string,
  ): Promise<unknown> {
    let headers: Record<string, string>;
    try {
      headers = await getAuthHeaders({
        ...config,
        requestMethod: method,
        requestHost: host,
        requestPath: path,
        requestBody: body,
        expiresIn: 60,
        source: 'moovha-api-wallet',
      });
    } catch {
      throw new WalletProviderError('wallet_provider_configuration');
    }
    if (attemptId) headers['X-Idempotency-Key'] = attemptId;
    try {
      const response = await request(`https://${host}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (method === 'GET' && response.status === 404) return null;
        if (
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 408
        ) {
          throw new WalletProviderError('wallet_provider_rejected', 'rejected');
        }
        throw new WalletProviderError(
          'wallet_provider_unavailable',
          method === 'POST' ? 'unknown' : 'not_dispatched',
        );
      }
      return await boundedJson(response);
    } catch (error) {
      if (error instanceof WalletProviderError) throw error;
      throw new WalletProviderError(
        'wallet_provider_unavailable',
        method === 'POST' ? 'unknown' : 'not_dispatched',
      );
    }
  }

  async function findAccount(
    accountId: string,
  ): Promise<EmbeddedAccount | null> {
    const name = accountName(accountId);
    const response = await call('GET', `${accountsPath}/by-name/${name}`);
    if (response === null) return null;
    return accountResponse(response, accountId);
  }

  return {
    provider: 'cdp-api-key-wallet-v2',
    async createAccount(accountId, attemptId) {
      const name = accountName(accountId);
      requireAttempt(attemptId);
      const response = await call('POST', accountsPath, { name }, attemptId);
      return accountResponse(response, accountId);
    },
    findAccount,
    async signTypedData(account, action, attemptId) {
      // Snapshot before the first await: caller mutation cannot change authorized bytes.
      const boundAccount = structuredClone(account);
      const boundAction = structuredClone(action);
      requireAttempt(attemptId);
      const body = baseSepoliaPayload(boundAccount, boundAction);
      const stored = await findAccount(boundAccount.accountId);
      if (
        !stored ||
        stored.address.toLowerCase() !== boundAccount.address.toLowerCase()
      ) {
        throw new WalletProviderError('wallet_provider_input');
      }
      baseSepoliaPayload(boundAccount, boundAction); // Recheck expiry after the provider lookup.
      const response = await call(
        'POST',
        `${accountsPath}/${stored.address}/sign/typed-data`,
        body,
        attemptId,
      );
      try {
        if (
          !record(response) ||
          typeof response.signature !== 'string' ||
          !/^0x[0-9a-fA-F]{130}$/.test(response.signature) ||
          recoverAddress(
            boundAction.payload_hash,
            response.signature,
          ).toLowerCase() !== stored.address.toLowerCase()
        ) {
          throw new Error('invalid');
        }
        return response.signature;
      } catch {
        // A bad/lost response does not establish that no usable signature was made.
        throw new WalletProviderError('wallet_provider_response', 'unknown');
      }
    },
  };
}
