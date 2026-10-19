import type { ProviderNetwork } from '../networks.js';
import { getAddress } from 'ethers';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { JournaledProviderOptions } from '../domain/attempt-journal.js';
import {
  WalletProviderError,
  type WalletSigningProvider,
} from '../domain/signing.js';
import { fingerprint } from '../onboarding/policy.js';
import { createCdpWalletProvider } from '../providers/cdp.js';
import { createOwsWalletProvider } from '../providers/ows.js';
import {
  createOpenZeppelinRelayerWalletProvider,
  type RelayerBinding,
} from '../providers/openzeppelin-relayer.js';
import { createJournaledWalletProvider } from '../providers/journaled.js';
import type { ProviderDatabase } from '../storage/index.js';
import {
  ConfigurationError,
  resolveSecret,
  type ProviderConfiguration,
} from './config.js';

/** Trusted deployment extension. The returned raw backend receives toolkit-owned policy/journals. */
export interface WalletBackendAdapterV1 {
  adapterVersion: 1;
  createWalletBackend(context: {
    options: Record<string, unknown>;
    secret(name: string): string;
  }): Promise<WalletSigningProvider> | WalletSigningProvider;
}
interface ConfiguredBackend extends WalletSigningProvider {
  reserveAccount?(accountId: string): Promise<void>;
}
function combine(
  provision: WalletSigningProvider,
  signing: WalletSigningProvider,
): ConfiguredBackend {
  return {
    provider: provision.provider,
    createAccount: provision.createAccount,
    findAccount: provision.findAccount,
    signTypedData: signing.signTypedData,
  };
}
export async function createConfiguredBackend(
  config: ProviderConfiguration['backend'],
  directory: string,
  database: ProviderDatabase,
  provision: JournaledProviderOptions,
  financial: JournaledProviderOptions,
  network?: ProviderNetwork,
): Promise<ConfiguredBackend> {
  if (config.kind === 'ows') {
    try {
      createRequire(import.meta.url).resolve('@open-wallet-standard/core');
    } catch {
      throw new ConfigurationError([
        '/backend: reinstall dependencies with the pinned OWS engine and native platform binding',
      ]);
    }
    const passphrase = resolveSecret(config.passphrase);
    if (
      passphrase.length < 16 ||
      passphrase.length > 4096 ||
      passphrase.startsWith('ows_key_')
    )
      throw new ConfigurationError([
        '/backend/passphrase: invalid owner credential',
      ]);
    const options = {
      vaultPath: resolve(directory, config.vaultDirectory),
      passphrase: async () => passphrase,
      network,
    };
    // Built-in OWS and Relayer factories already own the journal wrapper; never wrap them twice.
    return combine(
      createOwsWalletProvider(options, provision),
      createOwsWalletProvider(options, financial),
    );
  }
  if (config.kind === 'openzeppelin-relayer') {
    const pool = config.signers.map((signer) => ({
      relayerId: signer.relayerId,
      signerId: signer.signerId,
      address: getAddress(signer.address),
      bindingRevision: signer.bindingRevision,
    }));
    const connection = {
      url: config.url,
      network,
      apiKey: resolveSecret(config.apiKey),
      resolveAccount: async (id: string): Promise<RelayerBinding | null> =>
        database.onboardingStore.transaction((state) => {
          const saved = state.backendAccounts?.[id];
          return saved &&
            saved.binding === config.binding &&
            pool.some(
              (candidate) =>
                fingerprint(candidate) === fingerprint(saved.signer),
            )
            ? saved.signer
            : null;
        }),
    };
    const backend = combine(
      createOpenZeppelinRelayerWalletProvider(connection, provision),
      createOpenZeppelinRelayerWalletProvider(connection, financial),
    );
    backend.reserveAccount = async (id) => {
      await database.onboardingStore.transaction((state) => {
        const accounts = (state.backendAccounts ??= {});
        const previous = accounts[id];
        if (previous) {
          if (
            previous.binding !== config.binding ||
            !pool.some(
              (candidate) =>
                fingerprint(candidate) === fingerprint(previous.signer),
            )
          )
            throw new WalletProviderError('wallet_authorization_denied');
          return;
        }
        const signer = pool.find(
          (candidate) =>
            !Object.values(accounts).some(
              (saved) =>
                saved.signer.address.toLowerCase() ===
                candidate.address.toLowerCase(),
            ),
        );
        if (!signer)
          throw new WalletProviderError('wallet_authorization_denied');
        accounts[id] = { binding: config.binding, signer };
        state.audit.push({
          at: Date.now(),
          event: 'backend_account_reserved',
          resource: id,
          revision: '1',
        });
      });
    };
    return backend;
  }
  let raw: WalletSigningProvider;
  if (config.kind === 'cdp') {
    raw = createCdpWalletProvider(
      {
        WALLET_SERVICE_MODE: 'provider',
        WALLET_BACKEND: 'cdp',
        WALLET_CDP_API_KEY_ID: resolveSecret(config.apiKeyId),
        WALLET_CDP_API_KEY_SECRET: resolveSecret(config.apiKeySecret),
        WALLET_CDP_WALLET_SECRET: resolveSecret(config.walletSecret),
      },
      fetch,
      network,
    );
  } else {
    const module: WalletBackendAdapterV1 = await import(
      pathToFileURL(resolve(directory, config.module)).href
    );
    if (
      module.adapterVersion !== 1 ||
      typeof module.createWalletBackend !== 'function'
    )
      throw new ConfigurationError([
        '/backend: incompatible adapter interface',
      ]);
    raw = await module.createWalletBackend({
      options: structuredClone(config.options ?? {}),
      secret: (env) => {
        if (!/^[A-Z][A-Z0-9_]{0,127}$/.test(env))
          throw new ConfigurationError(['/backend: invalid secret reference']);
        return resolveSecret({ env });
      },
    });
    if (
      !raw ||
      !/^[a-z][a-z0-9._-]{0,63}$/.test(raw.provider) ||
      ['createAccount', 'findAccount', 'signTypedData'].some(
        (key) => typeof raw[key as keyof WalletSigningProvider] !== 'function',
      )
    )
      throw new ConfigurationError(['/backend: invalid adapter']);
  }
  return combine(
    createJournaledWalletProvider(raw, provision),
    createJournaledWalletProvider(raw, financial),
  );
}
