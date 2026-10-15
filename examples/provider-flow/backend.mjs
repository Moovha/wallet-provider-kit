import { Wallet, TypedDataEncoder } from 'ethers';
import { WalletProviderError } from '@moovha/wallet-provider-kit/core';

/**
 * Complete offline WalletSigningProvider fixture. Replace this adapter with your
 * selected engine/service; keep host authority and durable attempt checks outside it.
 * @param {string} accountId
 */
export function createFixtureBackend(accountId) {
  // Generated in memory, never funded, persisted, printed or exposed by a route.
  const wallet = Wallet.createRandom();
  const account = { accountId, address: wallet.address };
  const calls = { provision: 0, sign: 0 };
  let provisioned = false;
  let loseResponse = false;

  /** @type {import('@moovha/wallet-provider-kit/core').WalletSigningProvider} */
  const provider = {
    provider: 'offline-fixture',
    async createAccount(requestedAccount) {
      if (requestedAccount !== accountId)
        throw new WalletProviderError('wallet_provider_input');
      calls.provision += 1;
      provisioned = true;
      return { ...account };
    },
    async findAccount(requestedAccount) {
      return provisioned && requestedAccount === accountId
        ? { ...account }
        : null;
    },
    async signTypedData(boundAccount, approved) {
      if (
        !provisioned ||
        Date.parse(approved.expires_at) <= Date.now() ||
        boundAccount.accountId !== accountId ||
        boundAccount.address !== wallet.address ||
        approved.payload_hash !==
          TypedDataEncoder.hash(
            approved.payload.domain,
            approved.payload.types,
            approved.payload.message,
          )
      ) {
        throw new WalletProviderError('wallet_provider_input');
      }
      calls.sign += 1;
      const signature = await wallet.signTypedData(
        approved.payload.domain,
        approved.payload.types,
        approved.payload.message,
      );
      if (loseResponse) {
        loseResponse = false;
        // The effect occurred; the caller lost the response. Do not dispatch again.
        throw new WalletProviderError('wallet_provider_unavailable', 'unknown');
      }
      return signature;
    },
  };
  return {
    provider,
    account,
    calls,
    isProvisioned: () => provisioned,
    loseNextSigningResponse: () => {
      loseResponse = true;
    },
  };
}
