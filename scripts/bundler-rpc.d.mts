export interface BundlerRpcConfiguration {
  rpcUrls: string[];
  chainId: string;
  genesisHash: string;
}
export interface BundlerRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown[];
}
export function createBundlerRpc(
  configuration: () => BundlerRpcConfiguration,
  request?: typeof fetch,
): (body: BundlerRpcRequest) => Promise<Record<string, unknown>>;

export function bundlerNetworkProfile(chainId: string): {
  'chain-type': 'default' | 'op-stack';
  'block-time': number;
};
