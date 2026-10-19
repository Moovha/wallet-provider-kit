import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { validateProviderConfiguration } from '../src/deployment/config.js';
import { validateExecutionServiceConfiguration } from '../src/executor/config.js';

it.each([
  ['contract', '21000', true],
  ['contract', '2200000', true],
  ['contract', '5000000', true],
  ['contract', '5000001', false],
  ['contract', '20999', false],
  ['transfer', '1000000', true],
  ['transfer', '1000001', false],
] as const)(
  'enforces %s sponsor gas %s in wallet and executor configuration',
  async (kind, gas, accepted) => {
    const wallet = JSON.parse(
      await readFile('docs/provider.config.contracts.example.json', 'utf8'),
    );
    const executor = JSON.parse(
      await readFile(
        kind === 'contract'
          ? 'docs/executor.contracts.config.example.json'
          : 'docs/executor.config.example.json',
        'utf8',
      ),
    );
    if (kind === 'transfer') {
      delete wallet.approvedCalls;
      wallet.execution.profile = 'erc3009-executor-v1';
      wallet.financial = {
        profile: 'provider-authorized-erc3009-v1',
        token: executor.providers[0].token,
        recipients: ['0x4444444444444444444444444444444444444444'],
        maximumAmount: '1',
        lifetimeAmount: '1',
        maxValiditySeconds: 300,
      };
      wallet.policy.applications[0].permissions.push('transfers:request');
      wallet.execution.rpc.tokenCodeHash =
        executor.providers[0].rpc.tokenCodeHash;
      delete wallet.execution.safeQueue;
    }
    for (const sponsor of [
      ...wallet.execution.sponsors,
      ...executor.providers[0].sponsors,
    ]) {
      sponsor.gasLimit = gas;
      sponsor.lifetimeBudgetWei = '100000000000000000';
    }
    if (accepted) {
      expect(() => validateProviderConfiguration(wallet)).not.toThrow();
      expect(() =>
        validateExecutionServiceConfiguration(executor),
      ).not.toThrow();
    } else {
      expect(() => validateProviderConfiguration(wallet)).toThrow();
      expect(() => validateExecutionServiceConfiguration(executor)).toThrow();
    }
  },
);

it('keeps exact gas reservations bounded by the configured lifetime budget', async () => {
  const wallet = JSON.parse(
    await readFile('docs/provider.config.contracts.example.json', 'utf8'),
  );
  wallet.execution.sponsors[0].gasLimit = '2200000';
  wallet.execution.sponsors[0].lifetimeBudgetWei = '1';
  expect(() => validateProviderConfiguration(wallet)).toThrow();
});
