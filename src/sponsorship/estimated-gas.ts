import { WalletProviderError } from '../domain/signing.js';
import { toQuantity } from 'ethers';
import type { UserOperationV07 } from './user-operation.js';
const fields = [
  'callGasLimit',
  'verificationGasLimit',
  'preVerificationGas',
] as const;
type GasCeilings = Pick<UserOperationV07, (typeof fields)[number]>;
/** Buffer estimates within per-field ceilings and the accepted total, including paymaster gas. */
export function applyEstimatedUserOperationGas(
  operation: UserOperationV07,
  estimate: Record<string, string>,
  ceilings: GasCeilings,
  maximumTotalGas?: string,
  paymasterGas = 150000n,
  costLimit?: { maximumCostWei: string; l1FeeReserveWei: string },
): UserOperationV07 {
  const gas = { ...operation };
  const denied = () => {
    throw new WalletProviderError('wallet_authorization_denied');
  };
  for (const field of fields) {
    const value = estimate[field];
    if (
      typeof value !== 'string' ||
      !/^0x[0-9a-f]{1,30}$/.test(value) ||
      BigInt(value) === 0n
    )
      denied();
    const bounded = (BigInt(value) * 12n + 9n) / 10n;
    if (bounded > BigInt(ceilings[field])) denied();
    gas[field] = toQuantity(bounded);
  }
  const totalGas = fields.reduce(
    (sum, field) => sum + BigInt(gas[field]),
    paymasterGas,
  );
  if (maximumTotalGas !== undefined && totalGas > BigInt(maximumTotalGas))
    denied();
  if (costLimit) {
    const fee = operation.maxFeePerGas;
    if (
      !/^0x[0-9a-f]{1,30}$/.test(fee) ||
      BigInt(fee) === 0n ||
      !/^[1-9][0-9]{0,77}$/.test(costLimit.maximumCostWei) ||
      !/^(0|[1-9][0-9]{0,77})$/.test(costLimit.l1FeeReserveWei)
    )
      denied();
    const maximumCost =
      totalGas * BigInt(fee) + BigInt(costLimit.l1FeeReserveWei);
    if (maximumCost > BigInt(costLimit.maximumCostWei)) denied();
  }
  return gas;
}

/** Only an authenticated, correlated pre-dispatch execution-revert response is terminal. */
export function readUserOperationGasEstimate(
  ok: boolean,
  body: unknown,
  id: string,
): Record<string, string> {
  const object = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
  if (
    ok &&
    object(body) &&
    body.jsonrpc === '2.0' &&
    body.id === id &&
    !Object.hasOwn(body, 'result') &&
    object(body.error) &&
    body.error.code === -32521
  )
    throw new WalletProviderError('wallet_provider_rejected', 'not_dispatched');
  if (
    !ok ||
    !object(body) ||
    body.jsonrpc !== '2.0' ||
    body.id !== id ||
    Object.hasOwn(body, 'error') ||
    !object(body.result)
  )
    throw new WalletProviderError(
      'wallet_provider_unavailable',
      'not_dispatched',
    );
  return body.result as Record<string, string>;
}
