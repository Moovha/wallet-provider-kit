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
      await reader.verifyGenesis(
        JSON.stringify([options.chainId, options.genesisHash]),
        async () => {
          const [chain, genesis] = await Promise.all([
            reader.call('eth_chainId', []),
            reader.call('eth_getBlockByNumber', ['0x0', false]),
          ]);
          if (
            BigInt(String(chain)) !== BigInt(options.chainId) ||
            (genesis as { hash?: string })?.hash !== options.genesisHash
          )
            throw new WalletProviderError('wallet_provider_configuration');
        },
      );
      return endpoint;
    },
    ['genesis'],
  );
}
