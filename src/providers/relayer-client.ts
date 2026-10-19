import { providerNetwork, type ProviderNetwork } from '../networks.js';
import { getAddress } from 'ethers';
import { WalletProviderError } from '../domain/signing.js';

export interface RelayerBinding {
  relayerId: string;
  signerId: string;
  address: string;
  bindingRevision: string;
}

export interface RelayerConnection {
  network?: ProviderNetwork;
  /** Operator-configured HTTPS origin, without path, query, credentials or fragment. */
  url: string;
  apiKey: string;
  /** Server-owned binding. Never resolve from an HTTP transaction body. */
  resolveAccount(accountId: string): Promise<RelayerBinding | null>;
}

export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

const identifier = /^[a-zA-Z0-9_-]{1,64}$/;
export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function createRelayerClient(
  options: RelayerConnection,
  request: typeof fetch,
) {
  const selectedNetwork = providerNetwork(options.network);
  let origin: string;
  try {
    const url = new URL(options.url);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      typeof options.apiKey !== 'string' ||
      !/^[\x21-\x7e]{16,4096}$/.test(options.apiKey) ||
      typeof options.resolveAccount !== 'function' ||
      process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
    )
      throw new Error();
    origin = url.origin;
  } catch {
    throw new WalletProviderError('wallet_provider_configuration');
  }
  const apiKey = options.apiKey;
  const resolveAccount = options.resolveAccount;

  async function call(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    path: string,
    body?: string,
  ): Promise<Record<string, unknown> | null> {
    const outcome = method === 'GET' ? 'not_dispatched' : 'unknown';
    try {
      const response = await request(`${origin}/api/v1${path}`, {
        method,
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body,
        redirect: 'error',
        credentials: 'omit',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (method === 'GET' && response.status === 404) return null;
        // Even a failed POST response can follow a committed upstream queue write.
        throw new WalletProviderError('wallet_provider_unavailable', outcome);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 65536) throw new Error();
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      const envelope: unknown = JSON.parse(
        Buffer.concat(chunks).toString('utf8'),
      );
      if (
        !record(envelope) ||
        envelope.success !== true ||
        !record(envelope.data)
      )
        throw new WalletProviderError('wallet_provider_response', outcome);
      if (method === 'GET' && /^\/relayers\/[^/]+$/.test(path)) {
        delete envelope.data.wpk_replacement_contract;
        const contract = response.headers.get('x-wpk-relayer-contract');
        if (contract) envelope.data.wpk_replacement_contract = contract;
      }
      return envelope.data;
    } catch (error) {
      if (error instanceof WalletProviderError) throw error;
      throw new WalletProviderError('wallet_provider_unavailable', outcome);
    }
  }

  async function resolve(accountId: string): Promise<RelayerBinding | null> {
    if (!uuid.test(accountId))
      throw new WalletProviderError('wallet_provider_input');
    try {
      const binding = structuredClone(await resolveAccount(accountId));
      if (binding === null) return null;
      if (
        typeof binding.relayerId !== 'string' ||
        !identifier.test(binding.relayerId) ||
        typeof binding.signerId !== 'string' ||
        !identifier.test(binding.signerId) ||
        !/^[1-9][0-9]{0,19}$/.test(binding.bindingRevision) ||
        /^0x0{40}$/.test(binding.address)
      )
        throw new Error();
      return {
        relayerId: binding.relayerId,
        signerId: binding.signerId,
        address: getAddress(binding.address),
        bindingRevision: binding.bindingRevision,
      };
    } catch {
      throw new WalletProviderError('wallet_provider_configuration');
    }
  }

  async function binding(
    accountId: string,
    requireActive = true,
  ): Promise<{
    binding: RelayerBinding;
    metadata: Record<string, unknown>;
  } | null> {
    const selected = await resolve(accountId);
    if (!selected) return null;
    const metadata = await call('GET', `/relayers/${selected.relayerId}`);
    const network = await call(
      'GET',
      '/networks/evm%3A' + selectedNetwork.name,
    );
    if (
      !metadata ||
      metadata.id !== selected.relayerId ||
      metadata.signer_id !== selected.signerId ||
      metadata.network !== selectedNetwork.name ||
      metadata.network_type !== 'evm' ||
      typeof metadata.paused !== 'boolean' ||
      (metadata.system_disabled !== undefined &&
        typeof metadata.system_disabled !== 'boolean') ||
      (requireActive &&
        (metadata.paused ||
          metadata.system_disabled === true ||
          metadata.disabled_reason != null)) ||
      typeof metadata.address !== 'string' ||
      metadata.address.toLowerCase() !== selected.address.toLowerCase() ||
      !network ||
      network.id !== 'evm:' + selectedNetwork.name ||
      network.name !== selectedNetwork.name ||
      network.network_type !== 'evm' ||
      network.chain_id !== Number(selectedNetwork.chainId) ||
      network.is_testnet !== selectedNetwork.testnet
    )
      throw new WalletProviderError('wallet_provider_response');
    await current(accountId, selected);
    return { binding: selected, metadata };
  }

  async function current(
    accountId: string,
    expected: RelayerBinding,
  ): Promise<void> {
    if (JSON.stringify(await resolve(accountId)) !== JSON.stringify(expected))
      throw new WalletProviderError('wallet_authorization_denied');
  }
  return { call, binding, current };
}
