import { randomBytes } from 'node:crypto';
import { Interface } from 'ethers';
import type { RpcReader } from './chain.js';
import type { SafeAccountBinding, PinnedContract } from './approved-calls.js';
import { safeStateReaderCode } from './safe-state-reader.generated.js';
import { WalletProviderError } from '../domain/signing.js';
const abi = new Interface([
  'function inspect(address wallet,address singleton,bytes32 proxyHash,bytes32 singletonHash,address owner) view returns (uint256)',
  'function inspect4337((address wallet,address singleton,address owner,address module,address entryPoint) profile,address[] targets,bytes32[] hashes,bool[] allowEmpty) view returns(uint256)',
]);
/** Validate actual Safe state in one read-only EVM call; only the temporary reader receives a code override. */
export async function readSafeState(
  reader: RpcReader,
  binding: SafeAccountBinding,
  owner: string,
  tag: string,
): Promise<string> {
  let address: string;
  const inspected = [binding.address, binding.singleton.address, owner].map(
    (value) => value.toLowerCase(),
  );
  do {
    address = '0x' + randomBytes(20).toString('hex');
  } while (inspected.includes(address));
  const result = await reader.call('eth_call', [
    {
      to: address,
      gas: '0xf4240',
      value: '0x0',
      data: abi.encodeFunctionData('inspect', [
        binding.address,
        binding.singleton.address,
        binding.codeHash,
        binding.singleton.codeHash,
        owner,
      ]),
    },
    tag,
    { [address]: { code: safeStateReaderCode } },
  ]);
  if (typeof result !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(result))
    throw new WalletProviderError(
      'wallet_provider_unavailable',
      'not_dispatched',
    );
  return abi.decodeFunctionResult('inspect', result)[0].toString();
}

/** Fresh code, authority and EntryPoint nonce checks at the caller's fixed block. */
export async function readSafe4337State(
  reader: RpcReader,
  binding: SafeAccountBinding,
  owner: string,
  profile: { module: PinnedContract; entryPoint: PinnedContract },
  pins: PinnedContract[],
  tag: string,
  allowEmpty: boolean[] = pins.map(() => false),
): Promise<string> {
  let address: string;
  const inspected = [owner, ...pins.map((pin) => pin.address)].map((value) =>
    value.toLowerCase(),
  );
  do {
    address = '0x' + randomBytes(20).toString('hex');
  } while (inspected.includes(address));
  const result = await reader.call('eth_call', [
    {
      to: address,
      gas: '0x1e8480',
      value: '0x0',
      data: abi.encodeFunctionData('inspect4337', [
        [
          binding.address,
          binding.singleton.address,
          owner,
          profile.module.address,
          profile.entryPoint.address,
        ],
        pins.map((pin) => pin.address),
        pins.map((pin) => pin.codeHash),
        allowEmpty,
      ]),
    },
    tag,
    { [address]: { code: safeStateReaderCode } },
  ]);
  if (typeof result !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(result))
    throw new WalletProviderError(
      'wallet_provider_unavailable',
      'not_dispatched',
    );
  return abi.decodeFunctionResult('inspect4337', result)[0].toString();
}
