const waiting = new WeakMap();
const address = /^0x[0-9a-fA-F]{40}$/;
const maximum = 1n << 128n;

/** EntryPoint v0.7 reserves every operation's maximum prefund before executing a bundle. */
export function requiredPaymasterPrefund(operation) {
  const gas = [
    operation.callGasLimit,
    operation.verificationGasLimit,
    operation.preVerificationGas,
    operation.paymasterVerificationGasLimit,
    operation.paymasterPostOpGasLimit,
  ];
  if (
    !address.test(operation.paymaster ?? '') ||
    [...gas, operation.maxFeePerGas].some(
      (value) => typeof value !== 'bigint' || value < 0n || value >= maximum,
    )
  )
    throw Error('Invalid private paymaster operation');
  const required =
    gas.reduce((sum, value) => sum + value, 0n) * operation.maxFeePerGas;
  if (required <= 0n || required >= 1n << 256n)
    throw Error('Invalid private paymaster prefund');
  return required;
}

/** Reserve within one bundle; an insufficient or unavailable read defers the unchanged operation. */
export async function reservePaymasterPrefund({
  scope,
  entryPoint,
  userOp,
  balances,
  readBalance,
}) {
  const required = requiredPaymasterPrefund(userOp);
  if (!address.test(entryPoint)) throw Error('Invalid private EntryPoint');
  const paymaster = userOp.paymaster.toLowerCase();
  let checks = waiting.get(scope);
  if (!checks) {
    checks = new Map();
    waiting.set(scope, checks);
  }
  const key = entryPoint.toLowerCase() + ':' + paymaster;
  if (balances[paymaster] === undefined) {
    const previous = checks.get(key);
    // Negative evidence can delay a retry but can never authorize a smaller operation.
    if (
      previous &&
      previous.expiresAt > Date.now() &&
      previous.required <= required
    )
      return false;
    let balance;
    try {
      balance = await readBalance(paymaster);
      if (typeof balance !== 'bigint' || balance < 0n || balance >= 1n << 256n)
        throw Error('Invalid private funding balance');
    } catch {
      if (checks.size >= 128) checks.delete(checks.keys().next().value);
      checks.set(key, { required: 0n, expiresAt: Date.now() + 2000 });
      return false;
    }
    balances[paymaster] = balance;
    if (balance < required) {
      if (checks.size >= 128) checks.delete(checks.keys().next().value);
      checks.set(key, { required, expiresAt: Date.now() + 2000 });
      return false;
    }
    checks.delete(key);
  }
  if (balances[paymaster] < required) return false;
  balances[paymaster] -= required;
  return true;
}

/** Pool removal after signed expiry does not replace the provider's finalized absence proof. */
export function privateOperationExpired(operation) {
  if (
    typeof operation.signature !== 'string' ||
    !/^0x[0-9a-fA-F]{154}$/.test(operation.signature)
  )
    throw Error('Invalid private Safe signature');
  const until = BigInt('0x' + operation.signature.slice(14, 26));
  return until !== 0n && until <= BigInt(Math.floor(Date.now() / 1000));
}

/** Retry only a pre-broadcast read; successful reads are never repeated. */
export async function readBundleParameter(
  read,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      if (attempt === 3) throw error;
      await wait(1000 * 2 ** attempt);
    }
  }
}
