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
it('selects Ethereum Sepolia explicitly while rejecting unsupported service and signing domains', () => {
  expect(
    normalizeUserOperationDomainV07({
      entryPoint,
      entryPointVersion: '0.7',
      chainId: '0xaa36a7',
    }),
  ).toEqual({ entryPoint, entryPointVersion: '0.7', chainId: '0xaa36a7' });
  expect(providerNetwork('ethereum-sepolia')).toMatchObject({
    chainId: '11155111',
    caip: 'eip155:11155111',
    hex: '0xaa36a7',
    testnet: true,
  });
  expect(networkForChain('eip155:11155111')).toBe('ethereum-sepolia');
  expect(() => providerNetwork('unsupported' as ProviderNetwork)).toThrow();
  expect(() =>
    normalizeUserOperationDomainV07({
      entryPoint,
      entryPointVersion: '0.7',
      chainId: '0x2',
    } as never),
  ).toThrow();
});

it.each(['eip155:1', 'eip155:11155111'] as const)(
  'uses an explicit native Ethereum sponsorship allowance on %s without a rollup data-fee reserve',
  async (chain) => {
    const { normalizeObligation, sponsorshipGas } =
      await import('../src/runtime-configuration/obligations.js');
    const sponsorship = {
      chain_id: chain,
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
    expect(normalizeObligation('sponsorship', sponsorship)).toEqual(
      sponsorship,
    );
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
  },
);

it('pins Ethereum mainnet identity and separates operation hashes from every other supported network', async () => {
  const { applicationGenesis } =
    await import('../src/deployment/application-defaults.js');
  expect(providerNetwork('ethereum')).toMatchObject({
    name: 'ethereum',
    chainId: '1',
    caip: 'eip155:1',
    hex: '0x1',
    testnet: false,
  });
  expect(networkForChain('eip155:1')).toBe('ethereum');
  expect(applicationGenesis('ethereum')).toBe(
    '0xd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3',
  );
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
  const hashes = (
    ['ethereum', 'ethereum-sepolia', 'base', 'base-sepolia'] as const
  ).map((network) =>
    userOperationHashV07(operation, {
      entryPoint,
      entryPointVersion: '0.7',
      chainId: providerNetwork(network).hex,
    }),
  );
  expect(new Set(hashes).size).toBe(4);
});
