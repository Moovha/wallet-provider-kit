import { Interface, keccak256, toQuantity, zeroPadValue } from 'ethers';
import { RpcReader } from '../execution/chain.js';
import {
  safeInterface,
  implementationSlot,
  type ApprovedCallIntent,
  type PinnedContract,
} from '../execution/approved-calls.js';
import { WalletProviderError } from '../domain/signing.js';
import {
  operationAddress,
  operationQuantity,
  normalizeUserOperationDomainV07,
  type UserOperationDomainV07,
} from './user-operation.js';

const moduleInterface = new Interface([
  'function SUPPORTED_ENTRYPOINT() view returns(address)',
]);
const entryInterface = new Interface([
  'function getNonce(address sender,uint192 key) view returns(uint256)',
]);
const sentinel = '0x0000000000000000000000000000000000000001';
export interface Safe4337Acceptance {
  profile: 'safe-4337-module-0.3.0-v07';
  domain: UserOperationDomainV07;
  entryPoint: PinnedContract;
  module: PinnedContract;
  paymaster: PinnedContract;
  genesisHash: string;
  rpcUrls: [string, string];
}
/** Independent chain reads at a common block. No module installation or relaxation of the SafeTx verifier. */
export class Safe4337Verifier {
  private readonly config: Safe4337Acceptance;
  private readonly readers: RpcReader[];
  constructor(config: Safe4337Acceptance, request: typeof fetch = fetch) {
    try {
      this.config = structuredClone(config);
      const c = this.config;
      normalizeUserOperationDomainV07(c.domain);
      if (
        c.profile !== 'safe-4337-module-0.3.0-v07' ||
        c.entryPoint.address.toLowerCase() !==
          c.domain.entryPoint.toLowerCase() ||
        !/^0x[0-9a-f]{64}$/.test(c.genesisHash) ||
        c.rpcUrls.length !== 2 ||
        new URL(c.rpcUrls[0]).origin === new URL(c.rpcUrls[1]).origin ||
        new Set(
          [c.entryPoint, c.module, c.paymaster].map((p) =>
            p.address.toLowerCase(),
          ),
        ).size !== 3
      )
        throw new WalletProviderError('wallet_provider_configuration');
      this.readers = c.rpcUrls.map((url) => new RpcReader(url, request));
    } catch {
      throw new WalletProviderError('wallet_provider_configuration');
    }
  }
  async verify(intent: ApprovedCallIntent, owner: string, nonce: string) {
    intent = structuredClone(intent);
    const config = this.config;
    try {
      const heads = await Promise.all(
        this.readers.map(async (r) => {
          if ((await r.call('eth_chainId', [])) !== config.domain.chainId)
            throw new Error();
          const genesis = (await r.call('eth_getBlockByNumber', [
            '0x0',
            false,
          ])) as { hash: string };
          if (genesis?.hash !== config.genesisHash) throw new Error();
          const head = (await r.call('eth_getBlockByNumber', [
            'latest',
            false,
          ])) as { number: string };
          return BigInt(operationQuantity(head.number, 256));
        }),
      );
      const tag = toQuantity(heads.reduce((a, b) => (a < b ? a : b)));
      const protectedAddresses = [
        config.entryPoint,
        config.module,
        config.paymaster,
        intent.account,
        intent.account.singleton,
        intent.multiSend,
      ].map((p) => p.address.toLowerCase());
      if (
        intent.calls.some((c) =>
          protectedAddresses.includes(c.to.toLowerCase()),
        )
      )
        throw new Error();
      const values = await Promise.all(
        this.readers.map(async (r) => {
          const block = (await r.call('eth_getBlockByNumber', [
            tag,
            false,
          ])) as { hash: string; number: string };
          if (!/^0x[0-9a-f]{64}$/.test(block?.hash) || block.number !== tag)
            throw new Error();
          const pin = async (p: PinnedContract) => {
            operationAddress(p.address);
            if (!/^0x[0-9a-f]{64}$/.test(p.codeHash)) throw new Error();
            const code = await r.call('eth_getCode', [p.address, tag]);
            if (
              typeof code !== 'string' ||
              code === '0x' ||
              keccak256(code) !== p.codeHash
            )
              throw new Error();
            if (p.implementation) {
              const slot = await r.call('eth_getStorageAt', [
                p.address,
                implementationSlot,
                tag,
              ]);
              if (
                slot !==
                zeroPadValue(p.implementation.address, 32).toLowerCase()
              )
                throw new Error();
              await pin({
                address: p.implementation.address,
                codeHash: p.implementation.codeHash,
              });
            }
          };
          await Promise.all(
            [
              config.entryPoint,
              config.module,
              config.paymaster,
              intent.account,
              intent.account.singleton,
              intent.multiSend,
              ...intent.contracts,
            ].map(pin),
          );
          const call = async (name: string, args: unknown[] = []) =>
            safeInterface.decodeFunctionResult(
              name,
              String(
                await r.call('eth_call', [
                  {
                    to: intent.account.address,
                    data: safeInterface.encodeFunctionData(name, args),
                  },
                  tag,
                ]),
              ),
            );
          const [
            owners,
            threshold,
            version,
            singleton,
            modules,
            handler,
            guard,
            entry,
            entryNonce,
          ] = await Promise.all([
            call('getOwners'),
            call('getThreshold'),
            call('VERSION'),
            call('masterCopy'),
            call('getModulesPaginated', [sentinel, 2]),
            r.call('eth_getStorageAt', [
              intent.account.address,
              keccak256(
                new TextEncoder().encode('fallback_manager.handler.address'),
              ),
              tag,
            ]),
            r.call('eth_getStorageAt', [
              intent.account.address,
              keccak256(
                new TextEncoder().encode('guard_manager.guard.address'),
              ),
              tag,
            ]),
            r.call('eth_call', [
              {
                to: config.module.address,
                data: moduleInterface.encodeFunctionData(
                  'SUPPORTED_ENTRYPOINT',
                ),
              },
              tag,
            ]),
            r.call('eth_call', [
              {
                to: config.entryPoint.address,
                data: entryInterface.encodeFunctionData('getNonce', [
                  intent.account.address,
                  0,
                ]),
              },
              tag,
            ]),
          ]);
          if (
            owners[0].length !== 1 ||
            owners[0][0].toLowerCase() !==
              operationAddress(owner).toLowerCase() ||
            threshold[0] !== 1n ||
            version[0] !== '1.4.1' ||
            singleton[0].toLowerCase() !==
              intent.account.singleton.address.toLowerCase() ||
            modules[0].length !== 1 ||
            modules[0][0].toLowerCase() !==
              config.module.address.toLowerCase() ||
            modules[1].toLowerCase() !== sentinel ||
            handler !== zeroPadValue(config.module.address, 32).toLowerCase() ||
            guard !== zeroPadValue('0x00', 32) ||
            moduleInterface
              .decodeFunctionResult('SUPPORTED_ENTRYPOINT', String(entry))[0]
              .toLowerCase() !== config.domain.entryPoint.toLowerCase() ||
            entryInterface.decodeFunctionResult(
              'getNonce',
              String(entryNonce),
            )[0] !== BigInt(nonce) ||
            BigInt(nonce) >= 2n ** 64n
          )
            throw new Error();
          // Reject a reorg that occurred while reading this accepted account profile.
          const after = (await r.call('eth_getBlockByNumber', [
            tag,
            false,
          ])) as { hash: string };
          if (after?.hash !== block.hash) throw new Error();
          return block.hash;
        }),
      );
      if (values[0] !== values[1]) throw new Error();
    } catch {
      throw new WalletProviderError('wallet_authorization_denied');
    }
  }
}
