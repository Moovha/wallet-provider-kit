import { expect, it } from 'vitest';
import {
  providerNetwork,
  networkForChain,
  type ProviderNetwork,
} from '../src/networks.js';
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
it('selects Ethereum Sepolia explicitly while rejecting unsupported service and signing domains', () => {
  expect(providerNetwork('ethereum-sepolia')).toMatchObject({
    chainId: '11155111',
    caip: 'eip155:11155111',
    hex: '0xaa36a7',
    testnet: true,
  });
  expect(networkForChain('eip155:11155111')).toBe('ethereum-sepolia');
  expect(() => providerNetwork('ethereum' as ProviderNetwork)).toThrow();
  expect(() =>
    normalizeUserOperationDomainV07({
      entryPoint,
      entryPointVersion: '0.7',
      chainId: '0x1',
    } as never),
  ).toThrow();
});

it('uses an explicit Ethereum Sepolia sponsorship allowance without a rollup data-fee reserve', async () => {
  const { normalizeObligation, sponsorshipGas } =
    await import('../src/runtime-configuration/obligations.js');
  const sponsorship = {
    chain_id: 'eip155:11155111' as const,
    funding_agreement: 'Offline test fee allowance',
    maximum_gas_budget_wei: '10000000000000000',
    account_model: 'provider-controlled-user-safe' as const,
    maximum_execution_accounts: 2,
    asset_model: 'individual-user-wallets' as const,
    gas_limits: {
      gas_limit: '500000',
      max_fee_per_gas: '3000000000',
      max_priority_fee_per_gas: '1000000000',
      l1_fee_reserve_wei: '0',
    },
  };
  expect(normalizeObligation('sponsorship', sponsorship)).toEqual(sponsorship);
  expect(sponsorshipGas(sponsorship).l1FeeReserveWei).toBe('0');
  expect(
    sponsorshipGas({ ...sponsorship, gas_limits: undefined }).l1FeeReserveWei,
  ).toBe('0');
  expect(() =>
    normalizeObligation('sponsorship', {
      ...sponsorship,
      chain_id: 'eip155:84532',
    }),
  ).toThrow();
});
