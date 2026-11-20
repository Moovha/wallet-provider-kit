import { RpcReader } from './chain.js';
import { RpcEndpointPool } from './rpc-pool.js';
import { WalletProviderError } from '../domain/signing.js';
/** Select before dispatch; a mutation is sent once and is never retried by this selector. */
export async function verifiedRpcEndpoint(options: {
  endpoints: string[];
  request: typeof fetch;
  chainId: number;
  genesisHash: string;
}): Promise<string> {
  const pool = new RpcEndpointPool(options.endpoints, options.request, true);
  return pool.run(
    async (endpoint) => {
      const reader = new RpcReader(
        endpoint,
        options.request,
        4,
        true,
        'endpoint-failover',
      );
      const [chain] = await Promise.all([
        reader.call('eth_chainId', []),
        // Use the same genesis-only verification contract as the state and
        // receipt readers. Chain ID remains a fresh independent check.
        reader.verifyGenesis(options.genesisHash, async () => {
          const genesis = await reader.call('eth_getBlockByNumber', [
            '0x0',
            false,
          ]);
          if ((genesis as { hash?: string })?.hash !== options.genesisHash)
            throw new WalletProviderError('wallet_provider_configuration');
        }),
      ]);
      if (BigInt(String(chain)) !== BigInt(options.chainId))
        throw new WalletProviderError('wallet_provider_configuration');
      return endpoint;
    },
    ['genesis'],
  );
}
