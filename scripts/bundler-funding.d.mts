export interface PrivatePaymasterOperation {
  paymaster?: string;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
  maxFeePerGas: bigint;
}
export function requiredPaymasterPrefund(
  operation: PrivatePaymasterOperation,
): bigint;
export function reservePaymasterPrefund(input: {
  scope: object;
  entryPoint: string;
  userOp: PrivatePaymasterOperation;
  balances: Record<string, bigint>;
  readBalance(paymaster: string): Promise<bigint>;
}): Promise<boolean>;
export function privateOperationExpired(operation: {
  signature: string;
}): boolean;
