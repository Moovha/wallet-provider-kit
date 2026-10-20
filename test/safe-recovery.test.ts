import { expect, it, vi } from 'vitest';
import {
  Interface,
  Wallet,
  ZeroAddress,
  keccak256,
  toBeHex,
  zeroPadValue,
} from 'ethers';
import {
  createSafeRecoveryManifest,
  inspectSafeRecovery,
  predictSafeAddress,
} from '../src/provisioning/recovery.js';
import { safeFactoryInterface } from '../src/provisioning/safe.js';
vi.mock('../src/provisioning/atomic-safe.js', async (original) => {
  const actual =
    await original<typeof import('../src/provisioning/atomic-safe.js')>();
  const { keccak256 } = await import('ethers');
  return {
    ...actual,
    safeModuleSetup: {
      ...actual.safeModuleSetup,
      codeHash: keccak256('0x6001600055'),
    },
  };
});
const code = '0x6001600055',
  hash = keccak256(code);
const pin = () => ({ address: Wallet.createRandom().address, codeHash: hash });
const abi = new Interface([
  'function getOwners() view returns(address[])',
  'function getThreshold() view returns(uint256)',
  'function masterCopy() view returns(address)',
  'function getModulesPaginated(address,uint256) view returns(address[],address)',
  'function SUPPORTED_ENTRYPOINT() view returns(address)',
]);
function fixture() {
  const m = createSafeRecoveryManifest({
    config: {
      profile: 'safe-1.4.1',
      factory: pin(),
      singleton: pin(),
      proxyCodeHash: hash,
      maxValiditySeconds: 300,
    },
    owner: Wallet.createRandom().address,
    module: pin(),
    entryPoint: pin(),
    saltNonce: '12',
    proxyCreationCode: '0x6001',
  });
  const genesisHash = '0x' + '11'.repeat(32),
    blockHash = '0x' + '22'.repeat(32);
  const state = {
    chainId: 84532,
    deployed: false,
    owner: m.owner,
    threshold: 1,
    module: m.module.address,
    handler: m.module.address,
    guard: ZeroAddress,
    singleton: m.singleton.address,
    foreignCode: false,
    moduleEntryPoint: m.entryPoint.address,
    next: '0x0000000000000000000000000000000000000001',
    reorg: false,
  };
  const calls: string[] = [];
  const reader = {
    async call(method: string, params: unknown[]): Promise<unknown> {
      calls.push(method);
      if (method === 'eth_chainId') return toBeHex(state.chainId);
      if (method === 'eth_getBlockByNumber')
        return {
          number: '0x1',
          hash:
            params[0] === '0x0'
              ? genesisHash
              : state.reorg && params[0] === '0x1'
                ? genesisHash
                : blockHash,
        };
      if (method === 'eth_getCode')
        return params[0] === m.address
          ? state.deployed
            ? state.foreignCode
              ? '0x60'
              : code
            : '0x'
          : code;
      if (method === 'eth_getStorageAt')
        return zeroPadValue(
          String(params[1]).toLowerCase() ===
            keccak256(
              new TextEncoder().encode('fallback_manager.handler.address'),
            )
            ? state.handler
            : state.guard,
          32,
        );
      if (method === 'eth_call') {
        const tx = params[0] as { to: string; data: string };
        if (tx.to === m.factory.address) {
          const parsed = safeFactoryInterface.parseTransaction(tx)!;
          return safeFactoryInterface.encodeFunctionResult(parsed.name, [
            parsed.name === 'proxyCreationCode'
              ? m.proxyCreationCode
              : m.address,
          ]);
        }
        const parsed = abi.parseTransaction(tx)!;
        const result: Record<string, unknown[]> = {
          getOwners: [[state.owner]],
          getThreshold: [state.threshold],
          masterCopy: [state.singleton],
          getModulesPaginated: [[state.module], state.next],
          SUPPORTED_ENTRYPOINT: [state.moduleEntryPoint],
        };
        return abi.encodeFunctionResult(parsed.name, result[parsed.name]);
      }
      throw Error('Unexpected method');
    },
  };
  return { m, state, reader, target: { chainId: 84532, genesisHash }, calls };
}
it('predicts independently of chain and changes address when deployment inputs change', () => {
  const { m } = fixture();
  expect(predictSafeAddress(m)).toBe(m.address);
  for (const changed of [
    { saltNonce: '13' },
    { initializer: '0x12' },
    { proxyCreationCode: '0x6002' },
    { singleton: pin() },
    { factory: pin() },
  ])
    expect(predictSafeAddress({ ...m, ...changed })).not.toBe(m.address);
});
it('rejects another chain or genesis before inspecting or preparing deployment', async () => {
  const { m, state, reader, target, calls } = fixture();
  state.chainId = 11155111;
  await expect(inspectSafeRecovery(reader, m, target)).rejects.toMatchObject({
    code: 'wallet_authorization_denied',
  });
  expect(calls).not.toContain('eth_call');
  state.chainId = target.chainId;
  await expect(
    inspectSafeRecovery(reader, m, {
      ...target,
      genesisHash: '0x' + '33'.repeat(32),
    }),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
});
it('rejects a modified deployment recipe and dependency code without preparing a transaction', async () => {
  const { m, reader, target } = fixture();
  await expect(
    inspectSafeRecovery(reader, { ...m, saltNonce: '13' }, target),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  await expect(
    inspectSafeRecovery(
      reader,
      { ...m, factory: { ...m.factory, codeHash: '0x' + '00'.repeat(32) } },
      target,
    ),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
});

it('prepares only exact deployment calldata, then recognizes the deployed Safe without preparing a second deployment', async () => {
  const { m, reader, target, state } = fixture();
  const before = await inspectSafeRecovery(reader, m, target);
  expect(before.status).toBe('undeployed');
  expect(before.transaction?.to).toBe(m.factory.address);
  const decoded = safeFactoryInterface.decodeFunctionData(
    'createProxyWithNonce',
    before.transaction!.data,
  );
  expect([...decoded]).toEqual([m.singleton.address, m.initializer, 12n]);
  state.deployed = true;
  expect(await inspectSafeRecovery(reader, m, target)).toMatchObject({
    status: 'deployed',
    address: m.address,
  });
  expect(
    (await inspectSafeRecovery(reader, m, target)).transaction,
  ).toBeUndefined();
});
it.each([
  'owner',
  'module',
  'handler',
  'guard',
  'singleton',
  'moduleEntryPoint',
  'next',
] as const)(
  'blocks recovery when existing %s differs from the reviewed account',
  async (key) => {
    const { m, reader, target, state } = fixture();
    state.deployed = true;
    state[key] = Wallet.createRandom().address;
    await expect(inspectSafeRecovery(reader, m, target)).rejects.toMatchObject({
      code: 'wallet_authorization_denied',
    });
  },
);
it('blocks occupied foreign code, changed threshold and reorganized observations', async () => {
  const { m, reader, target, state } = fixture();
  state.deployed = true;
  state.foreignCode = true;
  await expect(inspectSafeRecovery(reader, m, target)).rejects.toMatchObject({
    code: 'wallet_authorization_denied',
  });
  state.foreignCode = false;
  state.threshold = 2;
  await expect(inspectSafeRecovery(reader, m, target)).rejects.toMatchObject({
    code: 'wallet_authorization_denied',
  });
  state.threshold = 1;
  state.reorg = true;
  await expect(inspectSafeRecovery(reader, m, target)).rejects.toMatchObject({
    code: 'wallet_authorization_denied',
  });
});
