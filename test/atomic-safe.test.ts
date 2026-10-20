import { expect, it } from 'vitest';
import { Interface, Wallet, ZeroAddress } from 'ethers';
import {
  atomicSafeInitializer,
  safeModuleSetup,
} from '../src/provisioning/atomic-safe.js';
import { safeSetupInterface } from '../src/provisioning/safe.js';

it('initializes exactly one owner and module without an initialization payment or arbitrary delegate call', () => {
  const owner = Wallet.createRandom().address,
    module = Wallet.createRandom().address;
  const decoded = safeSetupInterface.decodeFunctionData(
    'setup',
    atomicSafeInitializer(owner, module),
  );
  expect([...decoded[0]]).toEqual([owner]);
  expect(decoded[1]).toBe(1n);
  expect(decoded[2]).toBe(safeModuleSetup.address);
  const helper = new Interface(['function enableModules(address[])']);
  expect([
    ...helper.decodeFunctionData('enableModules', decoded[3])[0],
  ]).toEqual([module]);
  expect([...decoded].slice(4)).toEqual([module, ZeroAddress, 0n, ZeroAddress]);
  expect(atomicSafeInitializer(owner, module)).toBe(
    atomicSafeInitializer(owner, module),
  );
  expect(atomicSafeInitializer(Wallet.createRandom().address, module)).not.toBe(
    atomicSafeInitializer(owner, module),
  );
});
