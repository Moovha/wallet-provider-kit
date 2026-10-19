import { providerNetwork, type ProviderNetwork } from '../networks.js';
import { lstatSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import {
  getAddress,
  recoverAddress,
  toBeHex,
  toTwos,
  TypedDataEncoder,
} from 'ethers';
import type { JournaledProviderOptions } from '../domain/attempt-journal.js';
import {
  WalletProviderError,
  type EmbeddedAccount,
  type WalletSigningProvider,
} from '../domain/signing.js';
import { owsCommand } from './ows-process.js';
import type { WalletInfo } from '@open-wallet-standard/core';
import { evmTypedDataPayload } from './evm-typed-data.js';
import { createJournaledWalletProvider } from './journaled.js';

export interface OwsProviderOptions {
  network?: ProviderNetwork;
  /** Dedicated, existing, operator-owned vault; never the ambient ~/.ows vault. */
  vaultPath: string;
  /** Owner credential from the host secret store. Never from an HTTP caller. */
  passphrase(): Promise<string>;
}

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Experimental local OWS owner-credential profile. No export, broadcast or raw signing. */
export function createOwsWalletProvider(
  options: OwsProviderOptions,
  attempts: JournaledProviderOptions,
): WalletSigningProvider {
  const selected = providerNetwork(options.network);
  const vaultPath = options.vaultPath;
  const passphrase = options.passphrase;
  function checkVault(): void {
    try {
      const info = lstatSync(vaultPath);
      if (
        !isAbsolute(vaultPath) ||
        !info.isDirectory() ||
        (info.mode & 0o077) !== 0 ||
        (process.getuid && info.uid !== process.getuid())
      )
        throw new Error();
    } catch {
      throw new WalletProviderError('wallet_provider_configuration');
    }
  }
  checkVault();
  if (typeof passphrase !== 'function')
    throw new WalletProviderError('wallet_provider_configuration');

  function name(accountId: string): string {
    if (!uuid.test(accountId))
      throw new WalletProviderError('wallet_provider_input');
    return `moovha-${accountId}`;
  }
  async function lookup(
    accountId: string,
  ): Promise<{ walletId: string; account: EmbeddedAccount } | null> {
    const walletName = name(accountId);
    checkVault();
    try {
      const wallets = (await owsCommand({
        command: 'list',
        vaultPath,
      })) as WalletInfo[];
      const matches = wallets.filter((wallet) => wallet.name === walletName);
      if (matches.length === 0) return null;
      if (matches.length !== 1 || !uuid.test(matches[0].id)) throw new Error();
      // OWS stores one EVM-family account at the default derivation index.
      const accounts = matches[0].accounts.filter(
        (account) => account.chainId === 'eip155:1',
      );
      if (accounts.length !== 1 || /^0x0{40}$/.test(accounts[0].address))
        throw new Error();
      return {
        walletId: matches[0].id,
        account: { accountId, address: getAddress(accounts[0].address) },
      };
    } catch {
      throw new WalletProviderError('wallet_provider_unavailable');
    }
  }
  async function credential(): Promise<string> {
    try {
      const value = await passphrase();
      // Owner and agent-token policy paths differ. This profile deliberately uses only the former.
      if (
        typeof value !== 'string' ||
        value.length < 16 ||
        value.length > 4096 ||
        value.startsWith('ows_key_')
      )
        throw new Error();
      return value;
    } catch {
      throw new WalletProviderError('wallet_provider_configuration');
    }
  }
  const backend: WalletSigningProvider = {
    provider: 'ows-local-owner-v1',
    async createAccount(accountId) {
      name(accountId);
      const secret = await credential();
      if (await lookup(accountId))
        throw new WalletProviderError('wallet_provider_rejected', 'rejected');
      try {
        await owsCommand({
          command: 'create',
          name: name(accountId),
          secret,
          vaultPath,
        });
        const created = await lookup(accountId);
        if (!created) throw new Error();
        return created.account;
      } catch {
        // OWS may have committed the encrypted file before an error was observed.
        throw new WalletProviderError('wallet_provider_unavailable', 'unknown');
      }
    },
    async findAccount(accountId) {
      return (await lookup(accountId))?.account ?? null;
    },
    async signTypedData(account, action) {
      const boundAccount = structuredClone(account);
      const boundAction = structuredClone(action);
      const canonical = evmTypedDataPayload(
        boundAccount,
        boundAction,
        selected.name,
      );
      const secret = await credential();
      const stored = await lookup(boundAccount.accountId);
      if (
        !stored ||
        stored.account.address.toLowerCase() !==
          boundAccount.address.toLowerCase()
      )
        throw new WalletProviderError('wallet_provider_input');
      evmTypedDataPayload(boundAccount, boundAction, selected.name); // Recheck expiry after secret-store work.
      const { EIP712Domain: _domain, ...types } = boundAction.payload.types;
      // OWS 1.4.3 accepts full-width integer hex; its decimal parser is limited to u128.
      // Fixed-width encoding also avoids its rejection of odd-length hex chain IDs.
      const message = TypedDataEncoder.from(types).visit(
        boundAction.payload.message,
        (type, value) =>
          /^(u?int)[0-9]+$/.test(type)
            ? toBeHex(
                type.startsWith('uint')
                  ? BigInt(value)
                  : toTwos(BigInt(value), 256),
                32,
              )
            : value,
      );
      const payload = {
        ...canonical,
        domain: {
          ...(canonical.domain as object),
          chainId: toBeHex(selected.chainId, 32),
        },
        message,
      };
      let signature: string;
      try {
        const result = (await owsCommand({
          command: 'sign',
          chainId: selected.caip,
          walletId: stored.walletId,
          payload: JSON.stringify(payload),
          secret,
          vaultPath,
          address: stored.account.address,
        })) as { signature: string };
        signature = `0x${result.signature}`;
      } catch {
        throw new WalletProviderError('wallet_provider_unavailable', 'unknown');
      }
      try {
        if (
          !/^0x[0-9a-fA-F]{130}$/.test(signature) ||
          recoverAddress(boundAction.payload_hash, signature) !==
            stored.account.address
        )
          throw new Error();
        return signature;
      } catch {
        throw new WalletProviderError('wallet_provider_response', 'unknown');
      }
    },
  };
  return createJournaledWalletProvider(backend, attempts);
}
