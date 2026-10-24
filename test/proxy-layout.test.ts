import { describe, it, expect } from 'vitest';
import { Ajv } from 'ajv';
import { operationAdaptersSchema } from '../src/execution/call-schemas.js';
import {
  proxyImplementationSlot,
  implementationSlot,
  zeppelinosImplementationSlot,
  type PinnedContract,
} from '../src/execution/approved-calls.js';
const pin: PinnedContract = {
  address: '0x1111111111111111111111111111111111111111',
  codeHash: '0x' + 'a'.repeat(64),
  implementation: {
    address: '0x2222222222222222222222222222222222222222',
    codeHash: '0x' + 'b'.repeat(64),
  },
};
describe('approved proxy storage layouts', () => {
  it('retains EIP-1967 for existing policies and explicitly selects ZeppelinOS', () => {
    expect(proxyImplementationSlot(pin)).toBe(implementationSlot);
    expect(
      proxyImplementationSlot({
        ...pin,
        implementation: { ...pin.implementation!, storageLayout: 'zeppelinos' },
      }),
    ).toBe(zeppelinosImplementationSlot);
  });
  it('rejects unknown layouts before reading arbitrary storage', () => {
    const invalid = structuredClone(pin);
    Object.assign(invalid.implementation!, { storageLayout: 'arbitrary' });
    expect(() => proxyImplementationSlot(invalid)).toThrow();
    const validate = new Ajv().compile(operationAdaptersSchema);
    const adapter = {
      tokenTransfers: [
        { token: invalid, recipients: [pin.address], maximumAmount: '10000' },
      ],
    };
    expect(validate(adapter)).toBe(false);
    adapter.tokenTransfers[0].token = {
      ...pin,
      implementation: { ...pin.implementation!, storageLayout: 'zeppelinos' },
    };
    expect(validate(adapter)).toBe(true);
  });
});

it('checks the configured implementation slot and implementation bytecode during receipt verification', async () => {
  const { UserOperationReceiptObserver } =
    await import('../src/sponsorship/receipts.js');
  const { RpcReader } = await import('../src/execution/chain.js');
  const { keccak256, zeroPadValue } = await import('ethers');
  const { vi } = await import('vitest');
  const proxyCode = '0x6001600055',
    implementationCode = '0x6002600055';
  const approved: PinnedContract = {
    ...pin,
    codeHash: keccak256(proxyCode),
    implementation: {
      ...pin.implementation!,
      codeHash: keccak256(implementationCode),
      storageLayout: 'zeppelinos',
    },
  };
  let slotValue = zeroPadValue(
    approved.implementation!.address,
    32,
  ).toLowerCase();
  let implementation = implementationCode;
  const transport = vi.fn(async (_url: unknown, init: unknown) => {
    const request = JSON.parse((init as RequestInit).body as string);
    let result: string;
    if (request.method === 'eth_getStorageAt') {
      expect(request.params).toEqual([
        approved.address,
        zeppelinosImplementationSlot,
        '0x123',
      ]);
      result = slotValue;
    } else {
      expect(request.method).toBe('eth_getCode');
      result =
        request.params[0] === approved.address ? proxyCode : implementation;
    }
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', id: request.id, result }),
    );
  });
  const reader = new RpcReader(
    'https://offline.example.test',
    transport as typeof fetch,
  );
  const observer = Object.create(
    UserOperationReceiptObserver.prototype,
  ) as import('../src/sponsorship/receipts.js').UserOperationReceiptObserver;
  await expect(
    observer['pin'](reader, approved, '0x123'),
  ).resolves.toBeUndefined();
  slotValue = zeroPadValue('0x3333333333333333333333333333333333333333', 32);
  await expect(observer['pin'](reader, approved, '0x123')).rejects.toThrow();
  slotValue = zeroPadValue(approved.implementation!.address, 32).toLowerCase();
  implementation = '0x6003600055';
  await expect(observer['pin'](reader, approved, '0x123')).rejects.toThrow();
});
