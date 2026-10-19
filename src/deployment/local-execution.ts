import { providerNetwork } from '../networks.js';
import { Wallet } from 'ethers';
import { ConfigurationError, type ProviderConfiguration } from './config.js';
import { trustedHttpsUrl } from '../service/auth.js';

import {
  localExecutionOrigin,
  localSponsorIds,
} from './local-execution-contract.js';
export {
  localExecutionOrigin,
  localSponsorIds,
} from './local-execution-contract.js';
export type { LocalExecutionConfiguration } from './local-execution-contract.js';
/** Fixed private transport selected only by reviewed local-execution configuration. */
export function localExecutionFetch(
  request: typeof fetch = fetch,
): typeof fetch {
  return (async (input: string | URL | Request, options?: RequestInit) => {
    if (typeof input !== 'string' && !(input instanceof URL))
      throw new Error('Invalid local execution request');
    const url = new URL(input);
    if (
      url.origin !== localExecutionOrigin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.startsWith('/api/v1/')
    )
      throw new Error('Invalid local execution request');
    return request('http://local-execution:8080' + url.pathname, {
      ...options,
      redirect: 'error',
      credentials: 'omit',
    });
  }) as typeof fetch;
}

/** New-deployment material only. Private keys never enter configuration, API replies or command arguments. */
export function prepareLocalExecution(
  config: ProviderConfiguration,
  values: Record<string, string>,
) {
  const engine = config.localExecution!;
  const network = providerNetwork(config.network);
  const keys: { name: string; contents: string }[] = [];
  const execution = config.execution?.local ? config.execution : undefined;
  for (const sponsor of execution?.sponsors ?? []) {
    if (
      !/^[0-9a-f-]{36}$/.test(sponsor.accountId) ||
      sponsor.binding.address !== 'managed'
    )
      throw new ConfigurationError([
        '/execution/sponsors: new bundled setup requires managed sponsor creation; retain existing deployments and keystores for maintenance',
      ]);
    const wallet = Wallet.createRandom();
    sponsor.binding = {
      ...localSponsorIds(sponsor.accountId),
      address: wallet.address,
      bindingRevision: '1',
    };
    const keystore = JSON.parse(
      wallet.encryptSync(values[engine.keystorePassphrase.env]),
    );
    // oz-keystore requires the lowercase Web3 Secret Storage v3 field.
    keystore.crypto = keystore.Crypto ?? keystore.crypto;
    delete keystore.Crypto;
    keys.push({
      name: sponsor.accountId + '.json',
      contents: JSON.stringify(keystore),
    });
  }
  const rpc = config.runtimeConfiguration?.sharedApplicationSafes
    ? ['https://unconfigured.invalid']
    : execution
      ? execution.rpc.endpoints.map((entry) => values[entry.env])
      : network.testnet
        ? [
            'https://sepolia.base.org',
            'https://base-sepolia-rpc.publicnode.com',
          ]
        : ['https://mainnet.base.org', 'https://base.drpc.org'];
  if (rpc.some((url) => !url))
    throw new ConfigurationError([
      '/execution/rpc: supply the configured RPC values privately',
    ]);
  for (const url of rpc) trustedHttpsUrl(url);
  const relayer = {
    relayers: (execution?.sponsors ?? []).map((sponsor) => ({
      id: sponsor.binding.relayerId,
      name: 'Application gas sponsor',
      network: network.name,
      network_type: 'evm',
      paused: false,
      signer_id: sponsor.binding.signerId,
      policies: {
        min_balance: 0,
        gas_limit_estimation: false,
        eip1559_pricing: true,
        gas_price_cap: Number(sponsor.maxFeePerGas),
      },
    })),
    signers: (execution?.sponsors ?? []).map((sponsor) => ({
      id: sponsor.binding.signerId,
      type: 'local',
      config: {
        path: 'config/keys/' + sponsor.accountId + '.json',
        passphrase: { type: 'env', value: 'KEYSTORE_PASSPHRASE' },
      },
    })),
    notifications: [],
    plugins: [],
    networks: [
      {
        type: 'evm',
        network: network.name,
        chain_id: Number(network.chainId),
        required_confirmations: 6,
        symbol: 'ETH',
        features: ['eip1559'],
        rpc_urls: rpc,
        explorer_urls: [],
        average_blocktime_ms: 2000,
        is_testnet: network.testnet,
        tags: [network.testnet ? 'testnet' : 'mainnet'],
      },
    ],
  };
  return {
    keys,
    relayer,
    environment: {
      API_KEY: values[engine.apiKey.env],
      KEYSTORE_PASSPHRASE: values[engine.keystorePassphrase.env],
      STORAGE_ENCRYPTION_KEY: values[engine.storageKey.env],
    },
  };
}
