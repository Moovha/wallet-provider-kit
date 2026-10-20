import { expect, it } from 'vitest';
import { providerNetwork, type ProviderNetwork } from '../src/networks.js';
import {
  normalizeUserOperationDomainV07,
  userOperationHashV07,
  type UserOperationV07,
} from '../src/sponsorship/user-operation.js';
const entryPoint = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
it('separates the same EntryPoint operation across Base Sepolia and Ethereum Sepolia domains', () => {
  const operation: UserOperationV07 = {
    sender: '0x1111111111111111111111111111111111111111',
    nonce: '0x0',
    callData: '0x1234',
    callGasLimit: '0x100',
    verificationGasLimit: '0x100',
    preVerificationGas: '0x100',
    maxFeePerGas: '0x2',
    maxPriorityFeePerGas: '0x1',
  };
  const base = {
    entryPoint,
    entryPointVersion: '0.7' as const,
    chainId: '0x14a34' as const,
  };
  const ethereum = { ...base, chainId: '0xaa36a7' as const };
  expect(normalizeUserOperationDomainV07(ethereum)).toEqual(ethereum);
  expect(userOperationHashV07(operation, base)).not.toBe(
    userOperationHashV07(operation, ethereum),
  );
});
it('does not infer supplied-service network activation from low-level helper support', () => {
  expect(() =>
    providerNetwork('ethereum-sepolia' as ProviderNetwork),
  ).toThrow();
  expect(() =>
    normalizeUserOperationDomainV07({
      entryPoint,
      entryPointVersion: '0.7',
      chainId: '0x1',
    } as never),
  ).toThrow();
});
