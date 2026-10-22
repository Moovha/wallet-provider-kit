import { createWalletCallsProvider } from '../wallet-calls/client.js';
import { providerNetwork, type ProviderNetwork } from '../networks.js';
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
export class WalletAccessError extends Error {
  constructor(readonly status: number) {
    super('The wallet service could not authorize or complete this request');
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
    const response = await send(new URL(path, origin), {
      method,
      headers: {
        authorization: await options.authorization(),
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
    if (!response.ok) throw new WalletAccessError(response.status);
    return (await response.json()) as T;
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
    accessPolicy() {
      return request<{
        policy_revision: string;
        action_policy_revision?: string;
        chain_id: string;
        required_fields: string[];
        verification_level: string;
        max_identity_age_days: number;
        max_access_days: number;
      }>('/v1/access-policy', 'GET');
    },
    requestAccess(input: AccessRequestInput, idempotencyKey: string) {
      return request<{
        request_id: string;
        status: string;
        account_id?: string;
        grant_id?: string;
        wallet?: WalletDescription;
        permissions?: Permission[];
        expires_at?: string;
      }>('/v1/access-requests', 'POST', input, idempotencyKey);
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
