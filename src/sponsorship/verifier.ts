import { etherscanEndpoint } from '../execution/etherscan.js';
import { serviceHash } from '../executor/auth.js';
import { RpcEndpointPool } from '../execution/rpc-pool.js';
import { allowsEmptyRecipientCode } from '../execution/approved-calls.js';
import { vaultInterface } from '../execution/operation-interfaces.js';
import { Interface, keccak256, toQuantity, zeroPadValue } from 'ethers';
import { RpcReader } from '../execution/chain.js';
import { readSafe4337State } from '../execution/safe-state-reader.js';
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
  rpcUrls: string[];
  rpcVerification?: 'single' | 'quorum';
  aggregateReads?: boolean;
  observationRpcUrls?: string[];
}
/** Independent chain reads at a common block. No module installation or relaxation of the SafeTx verifier. */
export class Safe4337Verifier {
  private readonly config: Safe4337Acceptance;
  private readonly readers: RpcReader[];
  private readonly pool?: RpcEndpointPool;
  private readonly proofs = new Map<
    string,
    { nonce: string; expiresAt: number }
  >();
  constructor(config: Safe4337Acceptance, request: typeof fetch = fetch) {
    try {
      this.config = structuredClone(config);
      const c = this.config;
      normalizeUserOperationDomainV07(c.domain);
      if (
        (c.aggregateReads !== undefined &&
          typeof c.aggregateReads !== 'boolean') ||
        c.profile !== 'safe-4337-module-0.3.0-v07' ||
        (c.observationRpcUrls !== undefined &&
          (!Array.isArray(c.observationRpcUrls) ||
            c.observationRpcUrls.length + c.rpcUrls.length > 3 ||
            c.observationRpcUrls.some((url) => {
              const explorer = etherscanEndpoint(url);
              return (
                !explorer ||
                BigInt(explorer.searchParams.get('chainid')!) !==
                  BigInt(c.domain.chainId)
              );
            }))) ||
        c.entryPoint.address.toLowerCase() !==
          c.domain.entryPoint.toLowerCase() ||
        !/^0x[0-9a-f]{64}$/.test(c.genesisHash) ||
        (c.rpcVerification !== undefined &&
          !['single', 'quorum'].includes(c.rpcVerification)) ||
        (c.rpcVerification === 'single'
          ? c.rpcUrls.length < 1 || c.rpcUrls.length > 3
          : c.rpcUrls.length !== 2) ||
        new Set(c.rpcUrls.map((url) => new URL(url).origin)).size !==
          c.rpcUrls.length ||
        new Set(
          [c.entryPoint, c.module, c.paymaster].map((p) =>
            p.address.toLowerCase(),
          ),
        ).size !== 3
      )
        throw new WalletProviderError('wallet_provider_configuration');
      this.readers = c.rpcUrls.map(
        (url) =>
          new RpcReader(
            url,
            request,
            c.rpcVerification === 'single' ? 4 : 1,
            c.rpcVerification === 'single',
            c.rpcVerification === 'single' ? 'endpoint-failover' : 'bounded',
          ),
      );
      if (c.rpcVerification === 'single')
        this.pool = new RpcEndpointPool(c.rpcUrls, request, true);
    } catch {
      throw new WalletProviderError('wallet_provider_configuration');
    }
  }
  async verify(
    intent: Pick<
      ApprovedCallIntent,
      'account' | 'multiSend' | 'calls' | 'contracts' | 'nativeRecipients'
    > &
      Partial<Pick<ApprovedCallIntent, 'adapterInput' | 'effects'>>,
    owner: string,
    nonce?: string,
  ) {
    if (this.pool)
      return this.pool.run(
        (endpoint) =>
          this.verifyAt(intent, owner, nonce, [
            this.readers[this.config.rpcUrls.indexOf(endpoint)],
          ]),
        this.config.aggregateReads
          ? ['genesis', 'state-overrides']
          : ['genesis'],
      );
    return this.verifyAt(intent, owner, nonce, this.readers);
  }
  private async verifyAt(
    intent: Parameters<Safe4337Verifier['verify']>[0],
    owner: string,
    nonce: string | undefined,
    readers: RpcReader[],
  ) {
    intent = structuredClone(intent);
    const config = this.config;
    try {
      const heads = await Promise.all(
        readers.map(async (r) => {
          const verifyGenesis = async () => {
            const genesis = (await r.call('eth_getBlockByNumber', [
              '0x0',
              false,
            ])) as { hash: string };
            if (genesis?.hash !== config.genesisHash) throw new Error();
          };
          const [chain, head] = await Promise.all([
            config.aggregateReads
              ? r.feed('eth_chainId', [])
              : r.call('eth_chainId', []),
            (config.aggregateReads
              ? r.feed('eth_getBlockByNumber', ['latest', false])
              : r.call('eth_getBlockByNumber', ['latest', false])) as Promise<{
              number: string;
              hash: string;
            }>,
            config.rpcVerification === 'single'
              ? r.verifyGenesis(config.genesisHash, verifyGenesis)
              : verifyGenesis(),
          ]);
          if (chain !== config.domain.chainId) throw new Error();
          if (!/^0x[0-9a-f]{64}$/.test(head.hash)) throw new Error();
          return {
            number: BigInt(operationQuantity(head.number, 256)),
            hash: head.hash,
          };
        }),
      );
      const height = heads.reduce((a, b) =>
        a.number < b.number ? a : b,
      ).number;
      const tag = toQuantity(height);
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
        readers.map(async (r) => {
          const head = heads[readers.indexOf(r)];
          const block =
            head.number === height
              ? { hash: head.hash, number: tag }
              : ((await r.call('eth_getBlockByNumber', [tag, false])) as {
                  hash: string;
                  number: string;
                });
          if (!/^0x[0-9a-f]{64}$/.test(block?.hash) || block.number !== tag)
            throw new Error();
          const proofKey = serviceHash([
            this.readers.indexOf(r),
            tag,
            block.hash,
            owner.toLowerCase(),
            intent.account,
            intent.multiSend,
            intent.contracts,
            intent.nativeRecipients ?? [],
            intent.adapterInput ?? null,
            intent.effects ?? [],
          ]);
          const cached =
            config.rpcVerification === 'single'
              ? this.proofs.get(proofKey)
              : undefined;
          if (cached && cached.expiresAt > Date.now()) {
            if (nonce !== undefined && BigInt(cached.nonce) !== BigInt(nonce))
              throw new Error();
            return { hash: block.hash, nonce: cached.nonce };
          }
          let verifiedNonce: string;
          if (intent.adapterInput?.kind === 'vault-deposit') {
            if (!intent.effects || intent.effects.length !== 2)
              throw new Error();
            const result = await r.call('eth_call', [
              {
                to: intent.effects[1].token,
                data: vaultInterface.encodeFunctionData('asset'),
              },
              tag,
            ]);
            if (
              String(
                vaultInterface.decodeFunctionResult('asset', String(result))[0],
              ).toLowerCase() !== intent.effects[0].token.toLowerCase()
            )
              throw new Error();
          }
          if (config.aggregateReads) {
            const roots = [
              config.entryPoint,
              config.module,
              config.paymaster,
              intent.account,
              intent.account.singleton,
              intent.multiSend,
              ...intent.contracts,
            ];
            const pins: PinnedContract[] = [];
            const storage: Promise<void>[] = [];
            const add = (pin: PinnedContract) => {
              operationAddress(pin.address);
              if (!/^0x[0-9a-f]{64}$/.test(pin.codeHash)) throw new Error();
              pins.push(pin);
              if (pin.implementation) {
                storage.push(
                  r
                    .call('eth_getStorageAt', [
                      pin.address,
                      implementationSlot,
                      tag,
                    ])
                    .then((slot) => {
                      if (
                        slot !==
                        zeroPadValue(
                          pin.implementation!.address,
                          32,
                        ).toLowerCase()
                      )
                        throw new Error();
                    }),
                );
                add(pin.implementation);
              }
            };
            roots.forEach(add);
            const [currentNonce] = await Promise.all([
              readSafe4337State(
                r,
                intent.account,
                owner,
                config,
                pins,
                tag,
                pins.map((p) => allowsEmptyRecipientCode(intent, p.address)),
              ),
              ...storage,
            ]);
            if (nonce !== undefined && BigInt(currentNonce) !== BigInt(nonce))
              throw new Error();
            verifiedNonce = currentNonce;
          } else {
            const pin = async (p: PinnedContract) => {
              operationAddress(p.address);
              if (!/^0x[0-9a-f]{64}$/.test(p.codeHash)) throw new Error();
              const code = await r.call('eth_getCode', [p.address, tag]);
              if (
                typeof code !== 'string' ||
                (code === '0x' &&
                  !allowsEmptyRecipientCode(intent, p.address)) ||
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
              handler !==
                zeroPadValue(config.module.address, 32).toLowerCase() ||
              guard !== zeroPadValue('0x00', 32) ||
              moduleInterface
                .decodeFunctionResult('SUPPORTED_ENTRYPOINT', String(entry))[0]
                .toLowerCase() !== config.domain.entryPoint.toLowerCase() ||
              entryInterface.decodeFunctionResult(
                'getNonce',
                String(entryNonce),
              )[0] >=
                2n ** 64n ||
              (nonce !== undefined &&
                entryInterface.decodeFunctionResult(
                  'getNonce',
                  String(entryNonce),
                )[0] !== BigInt(nonce))
            )
              throw new Error();
            verifiedNonce = entryInterface
              .decodeFunctionResult('getNonce', String(entryNonce))[0]
              .toString();
          }
          // Reject a reorg that occurred while reading this accepted account profile.
          const after = (await r.call('eth_getBlockByNumber', [
            tag,
            false,
          ])) as { hash: string };
          if (after?.hash !== block.hash) throw new Error();
          const verified = {
            hash: block.hash,
            nonce: verifiedNonce,
          };
          if (config.rpcVerification === 'single') {
            this.proofs.delete(proofKey);
            this.proofs.set(proofKey, {
              nonce: verified.nonce,
              expiresAt: Date.now() + 60000,
            });
            while (this.proofs.size > 256)
              this.proofs.delete(this.proofs.keys().next().value!);
          }
          return verified;
        }),
      );
      if (
        values.some(
          (value) =>
            value.hash !== values[0].hash || value.nonce !== values[0].nonce,
        )
      )
        throw new Error();
      return values[0].nonce;
    } catch (error) {
      if (
        error instanceof WalletProviderError &&
        error.code === 'wallet_provider_unavailable'
      )
        throw error;
      throw new WalletProviderError('wallet_authorization_denied');
    }
  }
}
