import { providerNetwork, type ProviderNetwork } from '../networks.js';
import { TypedDataEncoder } from 'ethers';
import {
  WalletProviderError,
  type EmbeddedAccount,
  type TypedDataAction,
} from '../domain/signing.js';
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const addressPattern = /^0x[0-9a-fA-F]{40}$/;
function requireAccountId(accountId: string): void {
  if (!uuid.test(accountId))
    throw new WalletProviderError('wallet_provider_input');
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function wireValue(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (Array.isArray(value))
    return value.every((entry) => wireValue(entry, depth + 1));
  return (
    record(value) &&
    Object.values(value).every((entry) => wireValue(entry, depth + 1))
  );
}

/** Validate the exact action against the backend network before signing. */
export function evmTypedDataPayload(
  account: EmbeddedAccount,
  action: TypedDataAction,
  network?: ProviderNetwork,
): Record<string, unknown> {
  try {
    const selected = providerNetwork(network);
    requireAccountId(account.accountId);
    if (
      action.kind !== 'sign_typed_data' ||
      action.profile !== 'evm_eoa_v1' ||
      action.profile_revision !== '1' ||
      action.status !== 'ready' ||
      action.chain_id !== selected.caip ||
      action.chain_account_id.toLowerCase() !==
        `${selected.caip}:${account.address.toLowerCase()}` ||
      !addressPattern.test(account.address) ||
      !Number.isFinite(Date.parse(action.expires_at)) ||
      Date.parse(action.expires_at) <= Date.now() ||
      !/^0x[0-9a-f]{64}$/.test(action.payload_hash) ||
      Buffer.byteLength(JSON.stringify(action.payload), 'utf8') > 32768 ||
      !wireValue(action.payload) ||
      action.payload.domain.chainId !== selected.chainId
    ) {
      throw new Error('invalid');
    }
    const { EIP712Domain: declaredDomain, ...types } = action.payload.types;
    const domain = action.payload.domain;
    const canonical = TypedDataEncoder.getPayload(
      domain,
      types,
      action.payload.message,
    );
    if (
      canonical.primaryType !== action.payload.primaryType ||
      (declaredDomain &&
        JSON.stringify(declaredDomain) !==
          JSON.stringify(canonical.types.EIP712Domain)) ||
      TypedDataEncoder.hash(domain, types, action.payload.message) !==
        action.payload_hash
    ) {
      throw new Error('invalid');
    }
    // CDP's domain uses a JSON number; only the selected, safe chain ID is converted.
    return {
      ...canonical,
      domain: { ...canonical.domain, chainId: Number(selected.chainId) },
    };
  } catch {
    throw new WalletProviderError('wallet_provider_input');
  }
}
