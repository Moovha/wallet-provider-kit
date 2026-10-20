import { Interface, Wallet } from 'ethers';
import { expect, it } from 'vitest';
import {
  moduleSetupAction,
  moduleSetupCallData,
} from '../src/sponsorship/account-setup.js';
const wallet = Wallet.createRandom().address;
const owner = Wallet.createRandom().address;
const module = Wallet.createRandom().address;
function action() {
  return moduleSetupAction(
    wallet,
    owner,
    module,
    'enableModule',
    '0',
    new Date(Date.now() + 60000).toISOString(),
    'bootstrap',
  );
}
it('encodes only fixed zero-value Safe self-calls for module bootstrap', () => {
  const a = action();
  const abi = new Interface([
    'function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) returns(bool)',
  ]);
  const call = abi.decodeFunctionData(
    'execTransaction',
    moduleSetupCallData(a, '0x', wallet, module),
  );
  expect(call[0]).toBe(wallet);
  expect(call[1]).toBe(0n);
  expect(call[3]).toBe(0n);
});
it.each([
  'to',
  'value',
  'operation',
  'data',
  'safeTxGas',
  'baseGas',
  'gasPrice',
  'gasToken',
  'refundReceiver',
])('denies a changed %s before forwarding bootstrap calldata', (field) => {
  const a = action();
  a.payload.message[field] = field === 'data' ? '0x' : '1';
  expect(() => moduleSetupCallData(a, '0x', wallet, module)).toThrow();
});
it('rejects an unpinned module or another Safe', () => {
  expect(() =>
    moduleSetupCallData(action(), '0x', wallet, Wallet.createRandom().address),
  ).toThrow();
  expect(() =>
    moduleSetupCallData(action(), '0x', Wallet.createRandom().address, module),
  ).toThrow();
});
