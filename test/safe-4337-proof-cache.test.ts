import { expect, it } from 'vitest';
import { Interface, Wallet } from 'ethers';
import { fixture } from './helpers/safe-4337.js';
import { UserOperationReceiptObserver } from '../src/sponsorship/receipts.js';
import { Safe4337Verifier } from '../src/sponsorship/verifier.js';

it('reuses a complete account proof only at the freshly matching canonical block, and still checks the chain and requested nonce', async () => {
  const f = await fixture((config) => {
    config.acceptance.rpcVerification = 'single';
    config.acceptance.rpcUrls = [config.acceptance.rpcUrls[0]];
  });
  const abi = new Interface(['function getOwners() view returns(address[])']);
  let epoch = 0,
    ownerReads = 0,
    wrongChain = false,
    wrongOwner = false;
  f.state.mutate = (method, result, params) => {
    if (method === 'eth_chainId' && wrongChain) return '0x1';
    if (method === 'eth_getBlockByNumber' && params[0] !== '0x0')
      return {
        number:
          params[0] === 'latest'
            ? '0x' + (100 + epoch).toString(16)
            : params[0],
        hash: '0x' + (epoch ? 'c' : 'b').repeat(64),
      };
    if (
      method === 'eth_call' &&
      (params[0] as { data: string }).data ===
        abi.encodeFunctionData('getOwners')
    ) {
      ownerReads++;
      if (wrongOwner)
        return abi.encodeFunctionResult('getOwners', [
          [Wallet.createRandom().address],
        ]);
    }
    return result;
  };
  const verifier = new Safe4337Verifier(f.config.acceptance, f.request);
  const intent = {
    account: f.config.basePolicy.accounts[0],
    multiSend: f.config.basePolicy.multiSend,
    calls: [],
    contracts: [],
  };
  expect(await verifier.verify(intent, f.wallet.address)).toBe('0');
  expect(await verifier.verify(intent, f.wallet.address, '0')).toBe('0');
  expect(ownerReads).toBe(1);
  await expect(
    verifier.verify(intent, f.wallet.address, '1'),
  ).rejects.toThrow();
  wrongChain = true;
  await expect(
    verifier.verify(intent, f.wallet.address, '0'),
  ).rejects.toThrow();
  wrongChain = false;
  epoch = 1;
  wrongOwner = true;
  await expect(
    verifier.verify(intent, f.wallet.address, '0'),
  ).rejects.toThrow();
  expect(ownerReads).toBe(2);
});

it('requires explicit single-source acceptance rather than accepting an incomplete quorum configuration', async () => {
  const f = await fixture();
  const incomplete = {
    ...f.config.acceptance,
    rpcUrls: [f.config.acceptance.rpcUrls[0]],
  };
  expect(
    () => new UserOperationReceiptObserver(incomplete, 100, f.request),
  ).toThrow();
  expect(() => new Safe4337Verifier(incomplete, f.request)).toThrow();
  expect(
    () =>
      new UserOperationReceiptObserver(
        { ...incomplete, rpcVerification: 'single' },
        100,
        f.request,
      ),
  ).not.toThrow();
});

it('preserves existing signing and execution identities when equivalent aggregate reads are enabled', async () => {
  const f = await fixture();
  const before = f.service.executionBinding();
  f.config.acceptance.aggregateReads = true;
  f.config.acceptance.observationRpcUrls = [
    'https://api.etherscan.io/v2/api?chainid=84532&apikey=offlinefixture',
  ];
  await f.restart();
  const after = f.service.executionBinding();
  expect(after.configurationHash).toBe(before.configurationHash);
  expect(after.submissionBinding).toBe(before.submissionBinding);
});
