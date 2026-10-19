import {
  concat,
  Signature,
  solidityPacked,
  TypedDataEncoder,
  recoverAddress,
} from 'ethers';
import type { EmbeddedAccount, TypedDataAction } from '../domain/signing.js';
import { WalletProviderError } from '../domain/signing.js';
import { uuid } from '../onboarding/policy.js';
import {
  normalizeUserOperationV07,
  normalizeUserOperationDomainV07,
  operationAddress,
  type UserOperationV07,
  type UserOperationDomainV07,
} from './user-operation.js';

/** Safe4337Module 0.3.0, EntryPoint v0.7. Field order and uint widths match its SafeOp type hash. */
export const safeOpTypes = {
  SafeOp: [
    { name: 'safe', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'initCode', type: 'bytes' },
    { name: 'callData', type: 'bytes' },
    { name: 'verificationGasLimit', type: 'uint128' },
    { name: 'callGasLimit', type: 'uint128' },
    { name: 'preVerificationGas', type: 'uint256' },
    { name: 'maxPriorityFeePerGas', type: 'uint128' },
    { name: 'maxFeePerGas', type: 'uint128' },
    { name: 'paymasterAndData', type: 'bytes' },
    { name: 'validAfter', type: 'uint48' },
    { name: 'validUntil', type: 'uint48' },
    { name: 'entryPoint', type: 'address' },
  ],
};
for (const field of safeOpTypes.SafeOp) Object.freeze(field);
Object.freeze(safeOpTypes.SafeOp);
Object.freeze(safeOpTypes);

export function safeOpPayloadV07(
  input: UserOperationV07,
  domain: UserOperationDomainV07,
  module: string,
  validAfter: string,
  validUntil: string,
): TypedDataAction['payload'] {
  const op = normalizeUserOperationV07(input),
    selected = normalizeUserOperationDomainV07(domain);
  if (
    ![validAfter, validUntil].every(
      (v) =>
        typeof v === 'string' &&
        /^(0|[1-9][0-9]{0,14})$/.test(v) &&
        BigInt(v) < 2n ** 48n,
    ) ||
    BigInt(validUntil) <= BigInt(validAfter) ||
    BigInt(validUntil) * 1000n <= BigInt(Date.now()) ||
    !op.paymaster ||
    [
      op.callGasLimit,
      op.verificationGasLimit,
      op.preVerificationGas,
      op.maxFeePerGas,
    ].some((v) => BigInt(v) === 0n)
  )
    throw new WalletProviderError('wallet_provider_input');
  return {
    domain: {
      chainId: BigInt(selected.chainId).toString(),
      verifyingContract: operationAddress(module),
    },
    primaryType: 'SafeOp',
    types: structuredClone(safeOpTypes),
    message: {
      safe: op.sender,
      nonce: BigInt(op.nonce).toString(),
      initCode: '0x',
      callData: op.callData,
      verificationGasLimit: BigInt(op.verificationGasLimit).toString(),
      callGasLimit: BigInt(op.callGasLimit).toString(),
      preVerificationGas: BigInt(op.preVerificationGas).toString(),
      maxPriorityFeePerGas: BigInt(op.maxPriorityFeePerGas).toString(),
      maxFeePerGas: BigInt(op.maxFeePerGas).toString(),
      paymasterAndData: concat([
        op.paymaster,
        solidityPacked(
          ['uint128', 'uint128'],
          [op.paymasterVerificationGasLimit!, op.paymasterPostOpGasLimit!],
        ),
        op.paymasterData!,
      ]),
      validAfter,
      validUntil,
      entryPoint: selected.entryPoint,
    },
  };
}
export function safeOpActionV07(
  payload: TypedDataAction['payload'],
  signer: EmbeddedAccount,
  actionId: string,
  operationId: string,
): TypedDataAction {
  if (
    !uuid.test(actionId) ||
    !uuid.test(operationId) ||
    payload.primaryType !== 'SafeOp'
  )
    throw new WalletProviderError('wallet_provider_input');
  const digest = TypedDataEncoder.hash(
    payload.domain,
    payload.types,
    payload.message,
  );
  return {
    action_id: actionId,
    operation_id: operationId,
    kind: 'sign_typed_data',
    profile: 'evm_eoa_v1',
    profile_revision: '1',
    status: 'ready',
    chain_id: 'eip155:' + payload.domain.chainId,
    chain_account_id:
      'eip155:' +
      payload.domain.chainId +
      ':' +
      operationAddress(signer.address),
    binding_revision: '1',
    capability_revision: '1',
    plan_revision: '1',
    plan_hash: digest,
    payload_hash: digest,
    expires_at: new Date(
      Number(payload.message.validUntil) * 1000,
    ).toISOString(),
    dependencies: [],
    payload: structuredClone(payload),
  };
}
/** Strict single-owner EIP-712 signature, prefixed with the validity window expected by Safe4337Module. */
export function safeOpSignatureV07(
  action: TypedDataAction,
  owner: string,
  signature: string,
): string {
  try {
    const parsed = Signature.from(signature);
    if (
      !/^0x[0-9a-fA-F]{130}$/.test(signature) ||
      ![27, 28].includes(parseInt(signature.slice(-2), 16)) ||
      parsed.s >
        '0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0' ||
      action.payload.primaryType !== 'SafeOp' ||
      TypedDataEncoder.hash(
        action.payload.domain,
        action.payload.types,
        action.payload.message,
      ) !== action.payload_hash ||
      recoverAddress(action.payload_hash, signature).toLowerCase() !==
        operationAddress(owner).toLowerCase()
    )
      throw new Error();
    return solidityPacked(
      ['uint48', 'uint48', 'bytes'],
      [
        action.payload.message.validAfter,
        action.payload.message.validUntil,
        parsed.serialized,
      ],
    ).toLowerCase();
  } catch {
    throw new WalletProviderError('wallet_provider_response', 'unknown');
  }
}
