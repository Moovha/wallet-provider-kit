import { createWalletAttemptRequest } from '../src/providers/attempt-lifecycle.js';
import { randomUUID } from 'node:crypto';
import {
  Wallet,
  Interface,
  keccak256,
  zeroPadValue,
  TypedDataEncoder,
  recoverAddress,
} from 'ethers';
import { describe, it, expect, vi } from 'vitest';
import { openProviderDatabase } from '../src/storage/index.js';
import { fingerprint } from '../src/onboarding/policy.js';
import {
  safeInterface,
  buildApprovedCallIntent,
} from '../src/execution/approved-calls.js';
import {
  Safe4337SigningService,
  safeUserOperationCallData,
  safeOpPayloadV07,
  safeOpActionV07,
  safeOpSignatureV07,
} from '../src/sponsorship/index.js';

import { fixture, dbs } from './helpers/safe-4337.js';
const denied = { code: 'wallet_authorization_denied' },
  conflict = { code: 'wallet_attempt_conflict' };
const code = '0x6001600055',
  codeHash = keccak256(code);
const iface = new Interface(['function work(uint256)']);
const entryInterface = new Interface([
  'function getNonce(address,uint192) view returns(uint256)',
]);
describe('durable SafeOp sponsorship and immutable operation admission', () => {
  it('cannot reset an admitted operation by changing signing backend provider identity', async () => {
    const f = await fixture(),
      source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    const other = new Safe4337SigningService(
      f.actions,
      f.db,
      f.config,
      {
        backend: { ...f.backend, provider: 'other-backend' },
        authorization: async () => 'Bearer offline-fixture',
        authorizeSponsorship: async (_c, terms) => ({
          termsHash: fingerprint(terms),
          consentReference: 'safe4337-consent',
        }),
      },
      f.request,
    );
    await expect(
      other.admit(f.context, source.action_id, f.operation),
    ).rejects.toMatchObject(denied);
    await expect(
      other.sponsor(f.context, source.action_id),
    ).rejects.toMatchObject(denied);
    expect(f.state.signs).toBe(0);
    expect(f.state.posts).toBe(0);
  });

  it('rechecks the fenced lease after authority reads before paymaster contact', async () => {
    const f = await fixture(),
      source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    f.state.consentHook = async () => {
      await f.db.onboardingStore.transaction((s) => {
        const phase = s.sponsorships![source.action_id].phases.stub;
        if (phase) phase.expiresAt = Date.now() - 1;
      });
    };
    await expect(
      f.service.sponsor(f.context, source.action_id),
    ).rejects.toMatchObject({ outcome: 'unknown' });
    expect(f.state.posts).toBe(0);
    expect(
      (await f.db.budget(f.db.sponsorship.load(source.action_id)!.gasBudgetId))
        ?.reserved,
    ).toBe('4820010');
  });

  it('requires the shared transaction for phase claims and sanitizes access after storage closes', async () => {
    const f = await fixture(),
      source = await f.source();
    expect(() =>
      f.db.sponsorship.claim(
        source.action_id,
        'stub',
        fingerprint(f.operation),
      ),
    ).toThrow('wallet_attempt_unavailable');
    expect(f.db.sponsorship.load(source.action_id)).toBeNull();
    f.db.close();
    expect(() =>
      f.db.sponsorship.claim(
        source.action_id,
        'stub',
        fingerprint(f.operation),
      ),
    ).toThrow('wallet_attempt_unavailable');
  });
  it('fences late paymaster responses after lease expiry without another request', async () => {
    const f = await fixture(),
      source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    f.state.hook = async () => {
      await f.db.onboardingStore.transaction((s) => {
        s.sponsorships![source.action_id].phases.stub!.expiresAt =
          Date.now() - 1;
      });
    };
    await expect(
      f.service.sponsor(f.context, source.action_id),
    ).rejects.toMatchObject({
      code: 'wallet_attempt_unavailable',
      outcome: 'unknown',
    });
    await f.restart();
    await expect(
      f.service.sponsor(f.context, source.action_id),
    ).rejects.toMatchObject({ outcome: 'unknown' });
    expect(f.state.posts).toBe(1);
    expect(
      (await f.db.budget(f.db.sponsorship.load(source.action_id)!.gasBudgetId))
        ?.reserved,
    ).toBe('4820010');
  });
  it('rechecks runtime claim freshness on quote replay before contacting the paymaster', async () => {
    const f = await fixture(),
      source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    await f.db.onboardingStore.transaction((s) => {
      const request = s.requests[f.grant.request_id];
      request.input.user!.identity.verified_at = new Date(
        Date.now() - 301000,
      ).toISOString();
    });
    await expect(
      f.service.sponsor(f.context, source.action_id),
    ).rejects.toMatchObject(denied);
    expect(f.state.posts).toBe(0);
  });
  it('denies changed caller identity and zero estimates without financial admission', async () => {
    const f = await fixture(),
      source = await f.source();
    await expect(
      f.service.admit(
        {
          ...f.context,
          principal: { ...f.context.principal, clientId: 'other' },
        },
        source.action_id,
        f.operation,
      ),
    ).rejects.toMatchObject(denied);
    await expect(
      f.service.admit(f.context, source.action_id, {
        ...f.operation,
        maxFeePerGas: '0x0',
        maxPriorityFeePerGas: '0x0',
      }),
    ).rejects.toMatchObject({ code: 'wallet_provider_input' });
    expect(f.db.sponsorship.load(source.action_id)).toBeNull();
    expect(f.state.posts).toBe(0);
  });
  it('shares one reservation across concurrent identical admission and successful final stubs', async () => {
    const f = await fixture();
    f.state.finalStub = true;
    const source = await f.source();
    await Promise.all([
      f.service.admit(f.context, source.action_id, f.operation),
      f.service.admit(f.context, source.action_id, f.operation),
    ]);
    const results = await Promise.allSettled([
      f.service.sponsor(f.context, source.action_id),
      f.service.sponsor(f.context, source.action_id),
    ]);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    expect(f.state.posts).toBe(1);
    expect(
      (
        await f.db.budget(
          f.db.sponsorship.load(source.action_id)!.source.budgetId,
        )
      )?.reserved,
    ).toBe('1');
  });
  it('checks grant revocation in the final transaction after the approval read, even with a warmed immutable plan', async () => {
    const f = await fixture(),
      source = await f.source();
    await f.actions.withAuthorizedCalls(
      f.context.principal,
      source.action_id,
      () => true,
    );
    const original = f.db.isApprovedAction.bind(f.db);
    const check = vi
      .spyOn(f.db, 'isApprovedAction')
      .mockImplementation(async (...args) => {
        const approved = await original(...args);
        await f.db.onboardingStore.transaction((s) => {
          s.grants[f.grant.grant_id!].state = 'revoked';
        });
        return approved;
      });
    try {
      await expect(
        f.actions.withAuthorizedCalls(
          f.context.principal,
          source.action_id,
          () => {
            throw Error('effect reached');
          },
        ),
      ).rejects.toMatchObject(denied);
    } finally {
      check.mockRestore();
    }
    expect(f.state.signs).toBe(0);
  });
  it('invalidates prepared-term reuse when the retained gas quote changes', async () => {
    const f = await fixture(),
      source = await f.source();
    f.state.finalStub = true;
    await f.service.admit(f.context, source.action_id, f.operation);
    await f.service.sponsor(f.context, source.action_id);
    await f.db.onboardingStore.transaction((s) => {
      s.sponsorships![source.action_id].preparation.operation.maxFeePerGas =
        '0x99';
    });
    await expect(
      f.service.sign(f.context, source.action_id),
    ).rejects.toMatchObject(denied);
    expect(f.state.signs).toBe(0);
  });
  it('checks fresh grant revocation between stub and final before another paymaster effect', async () => {
    const f = await fixture(),
      source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    f.state.hook = async () => {
      await f.db.onboardingStore.transaction((s) => {
        s.grants[f.grant.grant_id!].state = 'revoked';
      });
    };
    await expect(
      f.service.sponsor(f.context, source.action_id),
    ).rejects.toMatchObject(denied);
    expect(f.state.posts).toBe(1);
    expect(f.state.signs).toBe(0);
  });
  it('requires separate current sponsorship consent and denies current runtime publication changes', async () => {
    const f = await fixture(),
      source = await f.source();
    f.state.consent = false;
    await expect(
      f.service.admit(f.context, source.action_id, f.operation),
    ).rejects.toMatchObject(denied);
    expect(f.db.sponsorship.load(source.action_id)).toBeNull();
    f.state.consent = true;
    await f.service.admit(f.context, source.action_id, f.operation);
    await f.service.sponsor(f.context, source.action_id);
    f.state.consent = false;
    await expect(
      f.service.sign(f.context, source.action_id),
    ).rejects.toMatchObject(denied);
    f.state.consent = true;
    const application = await f.runtime.read(f.context.principal);
    await f.runtime.update(f.operatorContext, application.application_id, {
      expected_revision: '1',
      policy: { ...application.publication!.policy, enabled: false },
    });
    await expect(
      f.service.sign(f.context, source.action_id),
    ).rejects.toMatchObject(denied);
    expect(f.state.signs).toBe(0);
  });
  it('rejects altered quotes and wrong signing keys while retaining financial reservations', async () => {
    const f = await fixture(),
      source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    await expect(
      f.service.admit(f.context, source.action_id, {
        ...f.operation,
        maxFeePerGas: '0x15',
      }),
    ).rejects.toMatchObject(conflict);
    await f.service.sponsor(f.context, source.action_id);
    f.state.wrongSignature = true;
    await expect(
      f.service.sign(f.context, source.action_id),
    ).rejects.toMatchObject({ outcome: 'unknown' });
    expect(f.state.signs).toBe(1);
  });
});

describe('accepted Safe4337 account and operation signatures', () => {
  it('matches an independent viem 2.57.7 SafeOp digest vector for the accepted module type', () => {
    const payload = safeOpPayloadV07(
      {
        sender: '0x1111111111111111111111111111111111111111',
        nonce: '0x1',
        callData: '0x12345678',
        verificationGasLimit: '0xc350',
        callGasLimit: '0x186a0',
        preVerificationGas: '0x5208',
        maxPriorityFeePerGas: '0x2',
        maxFeePerGas: '0x14',
        paymaster: '0x2222222222222222222222222222222222222222',
        paymasterVerificationGasLimit: '0x9c40',
        paymasterPostOpGasLimit: '0x7530',
        paymasterData: '0xabcdef',
      },
      {
        chainId: '0x14a34',
        entryPointVersion: '0.7',
        entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
      },
      '0x3333333333333333333333333333333333333333',
      '0',
      '2000000000',
    );
    expect(
      TypedDataEncoder.hash(payload.domain, payload.types, payload.message),
    ).toBe(
      '0x4e419557335470be90838b0ab4d6ff65c38c54606560fcc1cc00afa408523a75',
    );
  });

  it.each([
    'wrong-chain',
    'code',
    'owner',
    'module',
    'handler',
    'guard',
    'nonce',
    'quorum',
  ])('denies %s before gas reservation or paymaster contact', async (fault) => {
    const f = await fixture(),
      source = await f.source();
    f.state.mutate = (method, result, params, origin) => {
      if (fault === 'wrong-chain' && method === 'eth_chainId') return '0x1';
      if (fault === 'code' && method === 'eth_getCode') return '0x00';
      if (
        fault === 'handler' &&
        method === 'eth_getStorageAt' &&
        params[1] ===
          keccak256(
            new TextEncoder().encode('fallback_manager.handler.address'),
          )
      )
        return zeroPadValue('0x00', 32);
      if (
        fault === 'guard' &&
        method === 'eth_getStorageAt' &&
        params[1] ===
          keccak256(new TextEncoder().encode('guard_manager.guard.address'))
      )
        return zeroPadValue('0x01', 32);
      if (
        fault === 'quorum' &&
        method === 'eth_getBlockByNumber' &&
        params[0] !== '0x0' &&
        origin === 'https://secondary.example.test'
      )
        return { ...(result as object), hash: '0x' + 'c'.repeat(64) };
      if (method === 'eth_call') {
        if (
          fault === 'owner' &&
          (params[0] as { data: string }).data ===
            safeInterface.encodeFunctionData('getOwners')
        )
          return safeInterface.encodeFunctionResult('getOwners', [
            [Wallet.createRandom().address],
          ]);
        if (
          fault === 'module' &&
          (params[0] as { data: string }).data.startsWith(
            safeInterface.getFunction('getModulesPaginated')!.selector,
          )
        )
          return safeInterface.encodeFunctionResult('getModulesPaginated', [
            [],
            '0x0000000000000000000000000000000000000001',
          ]);
        if (
          fault === 'nonce' &&
          (params[0] as { data: string }).data.startsWith(
            entryInterface.getFunction('getNonce')!.selector,
          )
        )
          return entryInterface.encodeFunctionResult('getNonce', [1]);
      }
      return result;
    };
    await expect(
      f.service.admit(f.context, source.action_id, f.operation),
    ).rejects.toMatchObject(denied);
    expect(f.state.posts).toBe(0);
    expect(f.db.sponsorship.load(source.action_id)).toBeNull();
  });
  it('binds the SafeOp domain, fee, paymaster and validity into a strict single-owner signature', async () => {
    const f = await fixture(),
      until = String(Math.floor(Date.now() / 1000) + 60);
    const operation = {
      ...f.operation,
      paymaster: f.config.acceptance.paymaster.address,
      paymasterData: '0x02',
      paymasterVerificationGasLimit: '0x9c40',
      paymasterPostOpGasLimit: '0x7530',
    };
    const payload = safeOpPayloadV07(
      operation,
      f.config.acceptance.domain,
      f.config.acceptance.module.address,
      '0',
      until,
    );
    const action = safeOpActionV07(
      payload,
      { accountId: randomUUID(), address: f.wallet.address },
      randomUUID(),
      randomUUID(),
    );
    const signature = await f.wallet.signTypedData(
      payload.domain,
      payload.types,
      payload.message,
    );
    expect(recoverAddress(action.payload_hash, signature)).toBe(
      f.wallet.address,
    );
    expect(
      safeOpSignatureV07(action, f.wallet.address, signature),
    ).toHaveLength(156);
    expect(() =>
      safeOpSignatureV07(
        {
          ...action,
          payload: {
            ...payload,
            message: { ...payload.message, maxFeePerGas: '21' },
          },
        },
        f.wallet.address,
        signature,
      ),
    ).toThrow();
    expect(() =>
      safeOpSignatureV07(action, f.wallet.address, signature + '00'),
    ).toThrow();
    expect(() =>
      safeOpPayloadV07(
        operation,
        f.config.acceptance.domain,
        f.config.acceptance.module.address,
        '0',
        '0',
      ),
    ).toThrow();
  });
});
