import { describe, expect, it } from 'vitest';
import {
  displayAmount,
  pinForAdapter,
  parseDisplayAmount,
  validateAdapterAmounts,
} from '../setup-ui/policy-forms.js';
describe('operator amount forms', () => {
  it.each([
    ['0.01', 18, '10000000000000000'],
    ['3', 9, '3000000000'],
    ['0.000000001', 9, '1'],
    [
      '9007199254740993.000000000000000001',
      18,
      '9007199254740993000000000000000001',
    ],
  ])(
    'converts exact decimal display amounts: %s',
    (value, decimals, atomic) => {
      expect(parseDisplayAmount(String(value), Number(decimals))).toBe(atomic);
      expect(
        parseDisplayAmount(
          displayAmount(String(atomic), Number(decimals)),
          Number(decimals),
        ),
      ).toBe(atomic);
    },
  );
  it.each([
    '',
    '-1',
    '1e9',
    '0.0000000001',
    '1,000',
    '01',
    'Infinity',
    (2n ** 256n).toString(),
  ])(
    'rejects invalid or excessive gwei without silently retaining a configured amount: %s',
    (value) => expect(parseDisplayAmount(value, 9)).toBeUndefined(),
  );
  it('keeps cumulative policy optional and validates only selected adapter amounts', () => {
    expect(() => validateAdapterAmounts()).not.toThrow();
    const token = { address: '', codeHash: '' };
    expect(() =>
      validateAdapterAmounts({
        tokenTransfers: [{ token, recipients: [], maximumAmount: '10' }],
      }),
    ).not.toThrow();
    expect(() =>
      validateAdapterAmounts({
        tokenTransfers: [
          { token, recipients: [], maximumAmount: '10', lifetimeAmount: '0' },
        ],
      }),
    ).toThrow();
  });
});

it('copies only adapter pin fields from registered targets', () => {
  const target = {
    address: '0x' + '1'.repeat(40),
    codeHash: '0x' + '1'.repeat(64),
    selectors: ['0x12345678'],
    maximumValueWei: '5',
  };
  expect(pinForAdapter(target)).toEqual({
    address: target.address,
    codeHash: target.codeHash,
  });
});
