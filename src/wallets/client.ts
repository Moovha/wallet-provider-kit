import { createWalletCallsProvider } from '../wallet-calls/client.js';
import { providerNetwork, type ProviderNetwork } from '../networks.js';
import {
  readProviderFailure,
  type ProviderFailureDetails,
} from '../client-failure.js';
import type { operations } from '../protocol/provider-api.generated.js';
export type { ProviderFailureDetails } from '../client-failure.js';
import type {
  AccessRequestInput,
  Permission,
  WalletDescription,
} from '../onboarding/types.js';
export type {
  AccessRequestInput,
  WalletDescription,
} from '../onboarding/types.js';

export interface WalletSummary {
  network?: ProviderNetwork;
  chain_id?: string;
  account_id: string;
  is_default: boolean;
  wallet: WalletDescription;
  grant_id: string;
  permissions: Permission[];
  expires_at: string;
  role: 'owner' | 'member';
}
export interface MemberSettings {
  account_id: string;
  wallet: WalletDescription;
  revision: number;
  members: {
    member_id: string;
    application_id: string;
    user_id?: string;
    name: string;
    permissions: Permission[];
    membership_revision: number;
    status: 'invited' | 'active' | 'removed';
  }[];
}
export type WalletAccessPolicy =
  operations['getAccountAccessPolicy']['responses'][200]['content']['application/json'];
export type WalletAccessReceipt =
  operations['getAccountAccessRequest']['responses'][200]['content']['application/json'];

export class WalletAccessError extends Error {
  readonly code?: string;
  readonly requestId?: string;
  readonly outcome?: ProviderFailureDetails['outcome'];
  readonly retryAfterSeconds?: number;
  constructor(
    readonly status: number,
    details: ProviderFailureDetails = {},
  ) {
    super('The wallet service could not authorize or complete this request');
    this.name = 'WalletAccessError';
    this.code = details.problemCode;
    this.requestId = details.requestId;
    this.outcome = details.outcome;
    this.retryAfterSeconds = details.retryAfterSeconds;
  }
}
/** For a trusted application backend. Supply short-lived bearer authorization; never embed a client secret in a browser. */
export function createWalletsClient(options: {
  url: string;
  network?: ProviderNetwork;
  authorization(): Promise<string>;
  fetch?: typeof fetch;
}) {
  if (options.network) providerNetwork(options.network);
  const origin = new URL(options.url);
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/'
  )
    throw new Error('An HTTPS provider origin is required');
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const send = options.fetch ?? fetch;
  const accountPath = (id: string) => {
    if (!uuid.test(id)) throw new Error('A valid wallet ID is required');
    return '/v1/accounts/' + id;
  };
  async function request<T>(
    path: string,
    method: string,
    body?: unknown,
    key?: string,
    grantId?: string,
  ): Promise<T> {
    if (key !== undefined && !uuid.test(key))
      throw new Error('Keep a valid idempotency key for retries');
    if (grantId !== undefined && !uuid.test(grantId))
      throw new Error('A valid wallet grant ID is required');
    const authorization = await options.authorization();
    let response: Response;
    try {
      response = await send(new URL(path, origin), {
        method,
        headers: {
          authorization,
          ...(options.network ? { 'Wallet-Network': options.network } : {}),
          'content-type': 'application/json',
          ...(key ? { 'Idempotency-Key': key } : {}),
          ...(grantId ? { 'Wallet-Grant-Id': grantId } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        redirect: 'error',
        credentials: 'omit',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new WalletAccessError(0, { outcome: 'unknown' });
    }
    if (!response.ok)
      throw new WalletAccessError(
        response.status,
        await readProviderFailure(response),
      );
    try {
      return (await response.json()) as T;
    } catch {
      throw new WalletAccessError(response.status, { outcome: 'unknown' });
    }
  }
  return {
    networks() {
      return request<{
        default_network: ProviderNetwork;
        networks: {
          network: ProviderNetwork;
          name: string;
          chain_id: string;
          configured: boolean;
        }[];
      }>('/v1/networks', 'GET');
    },
    accessPolicy(sourceApplicationId?: string): Promise<WalletAccessPolicy> {
      if (
        sourceApplicationId !== undefined &&
        (!sourceApplicationId || sourceApplicationId.length > 256)
      )
        throw new Error('A valid source application ID is required');
      const query =
        sourceApplicationId !== undefined
          ? '?' +
            new URLSearchParams({ source_application_id: sourceApplicationId })
          : '';
      return request<WalletAccessPolicy>('/v1/access-policy' + query, 'GET');
    },
    requestAccess(
      input: AccessRequestInput,
      idempotencyKey: string,
    ): Promise<WalletAccessReceipt> {
      return request<WalletAccessReceipt>(
        '/v1/access-requests',
        'POST',
        input,
        idempotencyKey,
      );
    },
    accessRequest(requestId: string): Promise<WalletAccessReceipt> {
      if (!uuid.test(requestId))
        throw new Error('A valid access request ID is required');
      return request<WalletAccessReceipt>(
        '/v1/access-requests/' + requestId,
        'GET',
      );
    },
    revokeAccess(grantId: string, idempotencyKey: string) {
      if (!uuid.test(grantId))
        throw new Error('A valid wallet grant ID is required');
      return request<{ grant_id: string; status: 'revoked' }>(
        '/v1/access-grants/' + grantId + '/revoke',
        'POST',
        {},
        idempotencyKey,
      );
    },
    listWallets(userId: string) {
      return request<{ accounts: WalletSummary[] }>(
        '/v1/accounts/query',
        'POST',
        { user_id: userId },
        crypto.randomUUID(),
      );
    },
    account(accountId: string, grantId?: string) {
      return request<{
        account_id: string;
        wallet: WalletDescription;
        status: string;
        address?: string;
      }>(accountPath(accountId), 'GET', undefined, undefined, grantId);
    },
    provision(accountId: string, grantId: string, idempotencyKey: string) {
      return request<{ account_id: string; address: string }>(
        accountPath(accountId) + '/provision',
        'POST',
        {},
        idempotencyKey,
        grantId,
      );
    },
    members(accountId: string, grantId: string) {
      return request<MemberSettings>(
        accountPath(accountId) + '/members',
        'GET',
        undefined,
        undefined,
        grantId,
      );
    },
    saveMember(
      accountId: string,
      grantId: string,
      input: {
        expected_revision: number;
        user_id?: string;
        member_id?: string;
        name?: string;
        enabled: boolean;
        permissions: ('account:read' | 'contracts:request')[];
      },
      idempotencyKey: string,
    ) {
      return request<MemberSettings>(
        accountPath(accountId) + '/members',
        'POST',
        input,
        idempotencyKey,
        grantId,
      );
    },
    walletProvider(wallet: WalletSummary) {
      return createWalletCallsProvider({
        network: wallet.network ?? options.network,
        url: new URL(accountPath(wallet.account_id) + '/wallet', origin).href,
        authorization: options.authorization,
        fetch: send,
        accessGrantId: wallet.grant_id,
      });
    },
  };
}
