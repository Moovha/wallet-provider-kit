import { readUserOperationGasEstimate } from '../src/sponsorship/estimated-gas.js';
import { it, expect } from 'vitest';
import { applyEstimatedUserOperationGas } from '../src/sponsorship/estimated-gas.js';
import type { UserOperationV07 } from '../src/sponsorship/user-operation.js';
const operation: UserOperationV07 = {
  sender: '0x' + '1'.repeat(40),
  nonce: '0x0',
  callData: '0x',
  callGasLimit: '0x493e0',
  verificationGasLimit: '0x493e0',
  preVerificationGas: '0x493e0',
  maxFeePerGas: '0x64',
  maxPriorityFeePerGas: '0xa',
};
const estimate = {
  callGasLimit: '0x7a120',
  verificationGasLimit: '0xc350',
  preVerificationGas: '0xc350',
};
const ceilings = { ...operation, callGasLimit: '0xf4240' };
it('permits a composed operation inside the accepted total and preserves its payload', () => {
  const result = applyEstimatedUserOperationGas(
    operation,
    estimate,
    ceilings,
    '1000000',
  );
  expect(BigInt(result.callGasLimit)).toBe(600000n);
  expect(result.callData).toBe(operation.callData);
  expect(result.nonce).toBe(operation.nonce);
});
it('counts all buffered fields and paymaster gas against the accepted limit', () => {
  expect(() =>
    applyEstimatedUserOperationGas(operation, estimate, ceilings, '869999'),
  ).toThrow('wallet_authorization_denied');
  expect(() =>
    applyEstimatedUserOperationGas(operation, estimate, ceilings, '870000'),
  ).not.toThrow();
});
it('retains the default per-field bound when no application override exists', () => {
  expect(() =>
    applyEstimatedUserOperationGas(operation, estimate, operation),
  ).toThrow('wallet_authorization_denied');
});
it.each(['0x0', '0x-1', 'invalid', '0x' + 'f'.repeat(31)])(
  'rejects an invalid estimator gas value %s',
  (value) => {
    expect(() =>
      applyEstimatedUserOperationGas(
        operation,
        { ...estimate, callGasLimit: value },
        ceilings,
        '1000000',
      ),
    ).toThrow('wallet_authorization_denied');
  },
);

it('classifies only a correlated execution revert as terminal before dispatch', () => {
  expect(() =>
    readUserOperationGasEstimate(
      true,
      { jsonrpc: '2.0', id: 'read', error: { code: -32521 } },
      'read',
    ),
  ).toThrow('wallet_provider_rejected');
  for (const code of [-32500, -32603, -32000])
    expect(() =>
      readUserOperationGasEstimate(
        true,
        { jsonrpc: '2.0', id: 'read', error: { code } },
        'read',
      ),
    ).toThrow('wallet_provider_unavailable');
  expect(() =>
    readUserOperationGasEstimate(
      false,
      { jsonrpc: '2.0', id: 'read', error: { code: -32521 } },
      'read',
    ),
  ).toThrow('wallet_provider_unavailable');
  expect(() =>
    readUserOperationGasEstimate(
      true,
      { jsonrpc: '2.0', id: 'other', error: { code: -32521 } },
      'read',
    ),
  ).toThrow('wallet_provider_unavailable');
});
