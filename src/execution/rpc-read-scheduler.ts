import { RpcEndpointPool } from './rpc-pool.js';
import { RpcReader } from './chain.js';
import {
  etherscanEndpoint,
  etherscanRead,
  etherscanSupports,
} from './etherscan.js';
import { rpcCapacity } from './rpc-capacity.js';

/** Distribute immutable block checks; each result is checked against an already verified block hash. */
export class RpcReadScheduler {
  constructor(
    private readonly endpoints: string[],
    private readonly request: typeof fetch,
  ) {}
  async block(tag: string) {
    const params = [tag, false];
    const eligible = this.endpoints.filter(
      (endpoint) =>
        !etherscanEndpoint(endpoint) ||
        etherscanSupports('eth_getBlockByNumber', params),
    );
    return new RpcEndpointPool(eligible, this.request).run(async (endpoint) => {
      if (!etherscanEndpoint(endpoint))
        return new RpcReader(
          endpoint,
          this.request,
          4,
          true,
          'endpoint-failover',
        ).call('eth_getBlockByNumber', params);
      return rpcCapacity(this.request, endpoint).run(async () => {
        try {
          return await etherscanRead(
            endpoint,
            'eth_getBlockByNumber',
            params,
            this.request,
          );
        } catch (error) {
          rpcCapacity(this.request, endpoint).recordReadFailure();
          throw error;
        }
      });
    });
  }
}
