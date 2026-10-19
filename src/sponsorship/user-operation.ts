import {
  AbiCoder,
  concat,
  getAddress,
  keccak256,
  toBeHex,
  ZeroAddress,
} from 'ethers';
import { WalletProviderError } from '../domain/signing.js';

/** Deployed-account, EntryPoint v0.7 wire profile. No factories or EIP-7702 delegation. */
export interface UserOperationV07 {
  sender: string;
  nonce: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  paymaster?: string;
  paymasterVerificationGasLimit?: string;
  paymasterPostOpGasLimit?: string;
  paymasterData?: string;
}
export interface UserOperationDomainV07 {
  entryPointVersion: '0.7';
  entryPoint: string;
  chainId: '0x14a34' | '0x2105';
}
export function invalidUserOperation(): never {
  throw new WalletProviderError('wallet_provider_input');
}
export function operationAddress(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value))
    invalidUserOperation();
  try {
    const address = getAddress(value);
    if (address === ZeroAddress) invalidUserOperation();
    return address;
  } catch {
    return invalidUserOperation();
  }
}
export function operationQuantity(value: unknown, bits = 120): string {
  if (
    typeof value !== 'string' ||
    !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/.test(value) ||
    BigInt(value) >= 2n ** BigInt(bits)
  )
    invalidUserOperation();
  return '0x' + BigInt(value).toString(16);
}
export function operationBytes(value: unknown, maximumBytes: number): string {
  if (
    typeof value !== 'string' ||
    !/^0x(?:[0-9a-fA-F]{2})*$/.test(value) ||
    value.length > 2 + maximumBytes * 2
  )
    invalidUserOperation();
  return value.toLowerCase();
}
export function normalizeUserOperationV07(
  input: UserOperationV07,
): UserOperationV07 {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some(
      (key) =>
        ![
          'sender',
          'nonce',
          'callData',
          'callGasLimit',
          'verificationGasLimit',
          'preVerificationGas',
          'maxFeePerGas',
          'maxPriorityFeePerGas',
          'paymaster',
          'paymasterVerificationGasLimit',
          'paymasterPostOpGasLimit',
          'paymasterData',
        ].includes(key),
    )
  )
    invalidUserOperation();
  const operation: UserOperationV07 = {
    sender: operationAddress(input.sender),
    nonce: operationQuantity(input.nonce, 256),
    callData: operationBytes(input.callData, 16384),
    callGasLimit: operationQuantity(input.callGasLimit),
    verificationGasLimit: operationQuantity(input.verificationGasLimit),
    preVerificationGas: operationQuantity(input.preVerificationGas),
    maxFeePerGas: operationQuantity(input.maxFeePerGas),
    maxPriorityFeePerGas: operationQuantity(input.maxPriorityFeePerGas),
  };
  if (BigInt(operation.maxPriorityFeePerGas) > BigInt(operation.maxFeePerGas))
    invalidUserOperation();
  const paymasterFields = [
    'paymaster',
    'paymasterVerificationGasLimit',
    'paymasterPostOpGasLimit',
    'paymasterData',
  ] as const;
  if (paymasterFields.some((key) => Object.hasOwn(input, key))) {
    if (!paymasterFields.every((key) => Object.hasOwn(input, key)))
      invalidUserOperation();
    operation.paymaster = operationAddress(input.paymaster);
    operation.paymasterVerificationGasLimit = operationQuantity(
      input.paymasterVerificationGasLimit,
    );
    operation.paymasterPostOpGasLimit = operationQuantity(
      input.paymasterPostOpGasLimit,
    );
    operation.paymasterData = operationBytes(input.paymasterData, 4096);
  }
  return operation;
}
export function normalizeUserOperationDomainV07(
  input: UserOperationDomainV07,
): UserOperationDomainV07 {
  if (
    !input ||
    Object.keys(input).sort().join(',') !==
      'chainId,entryPoint,entryPointVersion' ||
    input.entryPointVersion !== '0.7' ||
    !['0x14a34', '0x2105'].includes(input.chainId)
  )
    invalidUserOperation();
  return { ...input, entryPoint: operationAddress(input.entryPoint) };
}
/** EntryPoint v0.7 hashing; signatures are not accepted by this unsigned preparation profile. */
export function userOperationHashV07(
  input: UserOperationV07,
  domain: UserOperationDomainV07,
): string {
  const operation = normalizeUserOperationV07(input);
  const selected = normalizeUserOperationDomainV07(domain);
  const coder = AbiCoder.defaultAbiCoder();
  const pair = (high: string, low: string) =>
    concat([toBeHex(BigInt(high), 16), toBeHex(BigInt(low), 16)]);
  const paymaster = operation.paymaster
    ? concat([
        operation.paymaster,
        pair(
          operation.paymasterVerificationGasLimit!,
          operation.paymasterPostOpGasLimit!,
        ),
        operation.paymasterData!,
      ])
    : '0x';
  const inner = keccak256(
    coder.encode(
      [
        'address',
        'uint256',
        'bytes32',
        'bytes32',
        'bytes32',
        'uint256',
        'bytes32',
        'bytes32',
      ],
      [
        operation.sender,
        operation.nonce,
        keccak256('0x'),
        keccak256(operation.callData),
        pair(operation.verificationGasLimit, operation.callGasLimit),
        operation.preVerificationGas,
        pair(operation.maxPriorityFeePerGas, operation.maxFeePerGas),
        keccak256(paymaster),
      ],
    ),
  );
  return keccak256(
    coder.encode(
      ['bytes32', 'address', 'uint256'],
      [inner, selected.entryPoint, BigInt(selected.chainId)],
    ),
  );
}
/** Conservative native-fee reservation, including paymaster validation/post-operation gas. */
export function maximumUserOperationCostV07(
  input: UserOperationV07,
  l1FeeReserveWei = '0',
): string {
  const operation = normalizeUserOperationV07(input);
  if (
    typeof l1FeeReserveWei !== 'string' ||
    !/^(0|[1-9][0-9]{0,77})$/.test(l1FeeReserveWei)
  )
    invalidUserOperation();
  const gas = [
    operation.callGasLimit,
    operation.verificationGasLimit,
    operation.preVerificationGas,
    operation.paymasterVerificationGasLimit ?? '0x0',
    operation.paymasterPostOpGasLimit ?? '0x0',
  ].reduce((sum, value) => sum + BigInt(value), 0n);
  const cost = gas * BigInt(operation.maxFeePerGas) + BigInt(l1FeeReserveWei);
  if (cost >= 2n ** 256n) invalidUserOperation();
  return cost.toString();
}
