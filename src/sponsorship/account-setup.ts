import { Interface, TypedDataEncoder, ZeroAddress } from 'ethers';
import {
  WalletProviderError,
  type TypedDataAction,
} from '../domain/signing.js';
import { providerNetwork, type ProviderNetwork } from '../networks.js';
const methods = new Interface([
  'function enableModule(address module)',
  'function setFallbackHandler(address handler)',
]);
const safe = new Interface([
  'function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) returns(bool)',
]);
const types = {
  SafeTx: [
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'data', type: 'bytes' },
    { name: 'operation', type: 'uint8' },
    { name: 'safeTxGas', type: 'uint256' },
    { name: 'baseGas', type: 'uint256' },
    { name: 'gasPrice', type: 'uint256' },
    { name: 'gasToken', type: 'address' },
    { name: 'refundReceiver', type: 'address' },
    { name: 'nonce', type: 'uint256' },
  ],
};
/** Bootstrap only: fixed self-calls install the ERC-4337 module and handler before wallet activation. */
export function moduleSetupAction(
  wallet: string,
  owner: string,
  module: string,
  method: 'enableModule' | 'setFallbackHandler',
  nonce: string,
  expiresAt: string,
  id: string,
  network?: ProviderNetwork,
): TypedDataAction {
  if (!['enableModule', 'setFallbackHandler'].includes(method))
    throw new WalletProviderError('wallet_provider_input');
  const payload = {
    domain: {
      chainId: providerNetwork(network).chainId,
      verifyingContract: wallet,
    },
    primaryType: 'SafeTx',
    types,
    message: {
      to: wallet,
      value: '0',
      data: methods.encodeFunctionData(method, [module]),
      operation: '0',
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: ZeroAddress,
      refundReceiver: ZeroAddress,
      nonce,
    },
  };
  const digest = TypedDataEncoder.hash(
    payload.domain,
    payload.types,
    payload.message,
  );
  return {
    action_id: id,
    operation_id: id,
    kind: 'sign_typed_data',
    profile: 'safe_owner_v1',
    profile_revision: '1',
    status: 'ready',
    chain_id: providerNetwork(network).caip,
    chain_account_id: providerNetwork(network).caip + ':' + owner,
    binding_revision: '1',
    capability_revision: '1',
    plan_revision: '1',
    plan_hash: digest,
    payload_hash: digest,
    expires_at: expiresAt,
    dependencies: [],
    payload,
  };
}
export function moduleSetupCallData(
  action: TypedDataAction,
  signature: string,
  wallet: string,
  module: string,
): string {
  const m = action.payload.message;
  if (
    action.payload.primaryType !== 'SafeTx' ||
    m.to !== wallet ||
    m.value !== '0' ||
    m.operation !== '0' ||
    !['enableModule', 'setFallbackHandler'].some(
      (name) => m.data === methods.encodeFunctionData(name, [module]),
    ) ||
    m.safeTxGas !== '0' ||
    m.baseGas !== '0' ||
    m.gasPrice !== '0' ||
    m.gasToken !== ZeroAddress ||
    m.refundReceiver !== ZeroAddress
  )
    throw new WalletProviderError('wallet_authorization_denied');
  return safe.encodeFunctionData('execTransaction', [
    m.to,
    m.value,
    m.data,
    m.operation,
    m.safeTxGas,
    m.baseGas,
    m.gasPrice,
    m.gasToken,
    m.refundReceiver,
    signature,
  ]);
}
