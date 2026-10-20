import {
  Interface,
  ZeroAddress,
  concat,
  getAddress,
  getCreate2Address,
  keccak256,
  solidityPacked,
  toBeHex,
  zeroPadValue,
} from 'ethers';
import type { PinnedContract } from '../execution/approved-calls.js';
import { WalletProviderError } from '../domain/signing.js';
import { atomicSafeInitializer, safeModuleSetup } from './atomic-safe.js';
import {
  safeFactoryInterface,
  type SafeProvisioningConfiguration,
} from './safe.js';

/** Public deployment data. Back this up with the original owner's recovery material. */
export interface SafeRecoveryManifest {
  format: 'safe-recovery-1';
  address: string;
  owner: string;
  initializer: string;
  saltNonce: string;
  proxyCreationCode: string;
  factory: PinnedContract;
  singleton: PinnedContract;
  proxyCodeHash: string;
  module: PinnedContract;
  entryPoint: PinnedContract;
}
export function predictSafeAddress(
  input: Pick<
    SafeRecoveryManifest,
    'factory' | 'singleton' | 'initializer' | 'saltNonce' | 'proxyCreationCode'
  >,
): string {
  const salt = keccak256(
    solidityPacked(
      ['bytes32', 'uint256'],
      [keccak256(input.initializer), BigInt(input.saltNonce)],
    ),
  );
  const initCode = concat([
    input.proxyCreationCode,
    zeroPadValue(input.singleton.address, 32),
  ]);
  return getCreate2Address(input.factory.address, salt, keccak256(initCode));
}
export function createSafeRecoveryManifest(input: {
  config: SafeProvisioningConfiguration;
  owner: string;
  module: PinnedContract;
  entryPoint: PinnedContract;
  saltNonce: string;
  proxyCreationCode: string;
}): SafeRecoveryManifest {
  const recipe = {
    format: 'safe-recovery-1' as const,
    owner: getAddress(input.owner),
    initializer: atomicSafeInitializer(input.owner, input.module.address),
    saltNonce: BigInt(input.saltNonce).toString(),
    proxyCreationCode: input.proxyCreationCode,
    factory: { ...input.config.factory },
    singleton: { ...input.config.singleton },
    proxyCodeHash: input.config.proxyCodeHash,
    module: { ...input.module },
    entryPoint: { ...input.entryPoint },
  };
  return { ...recipe, address: predictSafeAddress(recipe) };
}
const abi = new Interface([
  'function getOwners() view returns(address[])',
  'function getThreshold() view returns(uint256)',
  'function masterCopy() view returns(address)',
  'function getModulesPaginated(address,uint256) view returns(address[],address)',
  'function SUPPORTED_ENTRYPOINT() view returns(address)',
]);
const sentinel = '0x0000000000000000000000000000000000000001';
const denied = (): never => {
  throw new WalletProviderError('wallet_authorization_denied');
};
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export interface SafeRecoveryReader {
  call(method: string, params: unknown[]): Promise<unknown>;
}

/** Read-only preparation. The host separately authorizes deployment and any asset movement. */
export async function inspectSafeRecovery(
  reader: SafeRecoveryReader,
  manifest: SafeRecoveryManifest,
  target: { chainId: number; genesisHash: string },
) {
  if (
    manifest.format !== 'safe-recovery-1' ||
    !same(predictSafeAddress(manifest), manifest.address) ||
    manifest.initializer !==
      atomicSafeInitializer(manifest.owner, manifest.module.address) ||
    !Number.isSafeInteger(target.chainId) ||
    target.chainId < 1
  )
    denied();
  const [chain, genesis, head] = await Promise.all([
    reader.call('eth_chainId', []),
    reader.call('eth_getBlockByNumber', ['0x0', false]),
    reader.call('eth_getBlockByNumber', ['latest', false]),
  ]);
  const block = head as { number: string; hash: string };
  if (
    BigInt(String(chain)) !== BigInt(target.chainId) ||
    !same((genesis as { hash: string }).hash, target.genesisHash) ||
    !/^0x[0-9a-f]+$/i.test(block.number) ||
    !/^0x[0-9a-f]{64}$/i.test(block.hash)
  )
    denied();
  const tag = block.number;
  const pin = async (contract: PinnedContract) => {
    const code = String(
      await reader.call('eth_getCode', [contract.address, tag]),
    );
    if (code === '0x' || !same(keccak256(code), contract.codeHash)) denied();
  };
  await Promise.all(
    [
      manifest.factory,
      manifest.singleton,
      manifest.module,
      manifest.entryPoint,
      safeModuleSetup,
    ].map(pin),
  );
  const read = async (to: string, name: string, args: unknown[] = []) =>
    abi.decodeFunctionResult(
      name,
      String(
        await reader.call('eth_call', [
          { to, data: abi.encodeFunctionData(name, args) },
          tag,
        ]),
      ),
    );
  const creation = String(
    await reader.call('eth_call', [
      {
        to: manifest.factory.address,
        data: safeFactoryInterface.encodeFunctionData('proxyCreationCode'),
      },
      tag,
    ]),
  );
  if (
    !same(
      String(
        safeFactoryInterface.decodeFunctionResult(
          'proxyCreationCode',
          creation,
        )[0],
      ),
      manifest.proxyCreationCode,
    ) ||
    !same(
      String((await read(manifest.module.address, 'SUPPORTED_ENTRYPOINT'))[0]),
      manifest.entryPoint.address,
    )
  )
    denied();
  const code = String(
    await reader.call('eth_getCode', [manifest.address, tag]),
  );
  let transaction: { to: string; data: string; value: string } | undefined;
  if (code === '0x') {
    transaction = {
      to: manifest.factory.address,
      value: '0x0',
      data: safeFactoryInterface.encodeFunctionData('createProxyWithNonce', [
        manifest.singleton.address,
        manifest.initializer,
        manifest.saltNonce,
      ]),
    };
    const result = await reader.call('eth_call', [transaction, tag]);
    if (
      !same(
        String(
          safeFactoryInterface.decodeFunctionResult(
            'createProxyWithNonce',
            String(result),
          )[0],
        ),
        manifest.address,
      )
    )
      denied();
  } else {
    if (!same(keccak256(code), manifest.proxyCodeHash)) denied();
    const [owners, threshold, singleton, modules, handler, guard] =
      await Promise.all([
        read(manifest.address, 'getOwners'),
        read(manifest.address, 'getThreshold'),
        read(manifest.address, 'masterCopy'),
        read(manifest.address, 'getModulesPaginated', [sentinel, 2]),
        reader.call('eth_getStorageAt', [
          manifest.address,
          keccak256(
            new TextEncoder().encode('fallback_manager.handler.address'),
          ),
          tag,
        ]),
        reader.call('eth_getStorageAt', [
          manifest.address,
          keccak256(new TextEncoder().encode('guard_manager.guard.address')),
          tag,
        ]),
      ]);
    if (
      owners[0].length !== 1 ||
      !same(owners[0][0], manifest.owner) ||
      threshold[0] !== 1n ||
      !same(singleton[0], manifest.singleton.address) ||
      modules[0].length !== 1 ||
      !same(modules[0][0], manifest.module.address) ||
      !same(modules[1], sentinel) ||
      !same(String(handler), zeroPadValue(manifest.module.address, 32)) ||
      !same(String(guard), zeroPadValue(ZeroAddress, 32))
    )
      denied();
  }
  const canonical = (await reader.call('eth_getBlockByNumber', [
    tag,
    false,
  ])) as { hash: string };
  if (!same(canonical.hash, block.hash)) denied();
  return {
    chainId: target.chainId,
    address: manifest.address,
    blockNumber: toBeHex(BigInt(tag)),
    blockHash: block.hash,
    status: transaction ? ('undeployed' as const) : ('deployed' as const),
    ...(transaction ? { transaction } : {}),
  };
}
