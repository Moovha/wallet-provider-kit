import {
  mkdtempSync,
  rmSync,
  chmodSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { TypedDataEncoder, recoverAddress } from 'ethers';
import { listWallets } from '@open-wallet-standard/core';
import { createOwsWalletProvider } from '../src/providers/ows.js';
import { EmbeddedWalletService } from '../src/domain/embedded-wallet.js';
import type { TypedDataAction } from '../src/domain/signing.js';
import { TestJournal } from './helpers/journal.js';

describe('real OWS 1.4.3 offline engine integration', () => {
  it('provisions across the worker inventory limit and finds wallets after further vault growth', async () => {
    const vaultPath = mkdtempSync(join(tmpdir(), 'moovha-ows-growth-'));
    try {
      const secret = randomUUID();
      const options = { vaultPath, passphrase: async () => secret };
      const attempts = {
        namespace: 'ows-growth-test',
        journal: new TestJournal(),
        authorizeAttempt: async () => true,
      };
      const provider = createOwsWalletProvider(options, attempts);
      const original = await provider.createAccount(randomUUID(), randomUUID());
      const seed = listWallets(vaultPath)[0];
      const fixture = JSON.parse(
        readFileSync(join(vaultPath, 'wallets', seed.id + '.json'), 'utf8'),
      );
      const entry = {
        id: seed.id,
        name: seed.name,
        accounts: seed.accounts.filter((a) => a.chainId === 'eip155:1'),
      };
      const entryBytes = Buffer.byteLength(JSON.stringify(entry)) + 1;
      const lastFittingCount = Math.floor((65536 - 1) / entryBytes);
      // Inventory-only copies of one ephemeral encrypted fixture avoid generating hundreds of keys.
      const addInventoryWallet = () => {
        const id = randomUUID();
        writeFileSync(
          join(vaultPath, 'wallets', id + '.json'),
          JSON.stringify({ ...fixture, id, name: 'moovha-' + randomUUID() }),
          { flag: 'wx', mode: 0o600 },
        );
      };
      for (let count = 1; count < lastFittingCount; count++)
        addInventoryWallet();
      expect(listWallets(vaultPath)).toHaveLength(lastFittingCount);
      expect(await provider.findAccount(original.accountId)).toEqual(original);
      expect(await provider.findAccount(randomUUID())).toBeNull();

      const accountId = randomUUID();
      const attemptId = randomUUID();
      const account = await provider.createAccount(accountId, attemptId);
      const inventory = listWallets(vaultPath).map((wallet) => ({
        id: wallet.id,
        name: wallet.name,
        accounts: wallet.accounts.filter((a) => a.chainId === 'eip155:1'),
      }));
      expect(Buffer.byteLength(JSON.stringify(inventory))).toBeGreaterThan(
        65536,
      );
      expect(await provider.createAccount(accountId, attemptId)).toEqual(
        account,
      );
      expect(listWallets(vaultPath)).toHaveLength(lastFittingCount + 1);

      for (let count = lastFittingCount + 1; count < 1000; count++)
        addInventoryWallet();
      const restarted = createOwsWalletProvider(options, attempts);
      expect(await restarted.findAccount(original.accountId)).toEqual(original);
      expect(await restarted.findAccount(accountId)).toEqual(account);
      expect(await restarted.findAccount(randomUUID())).toBeNull();
      const additional = await restarted.createAccount(
        randomUUID(),
        randomUUID(),
      );
      expect(await restarted.findAccount(additional.accountId)).toEqual(
        additional,
      );
      expect(listWallets(vaultPath)).toHaveLength(1001);
      expect(
        [...attempts.journal.records.values()].every(
          (a) => a.state === 'succeeded',
        ),
      ).toBe(true);
    } finally {
      rmSync(vaultPath, { recursive: true, force: true });
    }
  }, 30000);

  it('rejects ambiguous wallet names without creating another key', async () => {
    const vaultPath = mkdtempSync(join(tmpdir(), 'moovha-ows-duplicate-'));
    try {
      const secret = randomUUID();
      const options = { vaultPath, passphrase: async () => secret };
      const provider = createOwsWalletProvider(options, {
        namespace: 'ows-duplicate-test',
        journal: new TestJournal(),
        authorizeAttempt: async () => true,
      });
      const account = await provider.createAccount(randomUUID(), randomUUID());
      const seed = listWallets(vaultPath)[0];
      const fixture = JSON.parse(
        readFileSync(join(vaultPath, 'wallets', seed.id + '.json'), 'utf8'),
      );
      const id = randomUUID();
      writeFileSync(
        join(vaultPath, 'wallets', id + '.json'),
        JSON.stringify({ ...fixture, id }),
        { flag: 'wx', mode: 0o600 },
      );
      await expect(
        provider.findAccount(account.accountId),
      ).rejects.toMatchObject({
        code: 'wallet_provider_unavailable',
      });
      const freshJournal = createOwsWalletProvider(options, {
        namespace: 'ows-duplicate-test',
        journal: new TestJournal(),
        authorizeAttempt: async () => true,
      });
      await expect(
        freshJournal.createAccount(account.accountId, randomUUID()),
      ).rejects.toMatchObject({ code: 'wallet_provider_unavailable' });
      expect(listWallets(vaultPath)).toHaveLength(2);
    } finally {
      rmSync(vaultPath, { recursive: true, force: true });
    }
  });

  it('provisions, restarts, signs exact large/nested integers, replays and denies revoked authority', async () => {
    const vaultPath = mkdtempSync(join(tmpdir(), 'moovha-ows-test-'));
    try {
      const options = {
        vaultPath,
        passphrase: vi.fn(async () => randomSecret),
      };
      const randomSecret = randomUUID();
      const journal = new TestJournal();
      const authorizeAttempt = vi.fn(async () => true);
      const attempts = {
        namespace: 'ows-offline-test',
        journal,
        authorizeAttempt,
      };
      const provider = createOwsWalletProvider(options, attempts);
      const accountId = randomUUID();
      const provisionAttempt = randomUUID();
      const account = await provider.createAccount(accountId, provisionAttempt);
      const restarted = createOwsWalletProvider(options, attempts);
      expect(
        await restarted.createAccount(accountId, provisionAttempt),
      ).toEqual(account);
      expect(await restarted.findAccount(accountId)).toEqual(account);
      expect(listWallets(vaultPath)).toHaveLength(1);
      expect(options.passphrase).toHaveBeenCalledOnce();

      const payload = {
        domain: {
          name: 'Offline engine conformance',
          version: '1',
          chainId: '84532',
        },
        types: {
          Proof: [
            { name: 'entries', type: 'Entry[]' },
            { name: 'approved', type: 'bool' },
          ],
          Entry: [
            { name: 'amount', type: 'uint256' },
            { name: 'delta', type: 'int256' },
          ],
        },
        primaryType: 'Proof',
        message: {
          entries: [
            {
              amount: ((1n << 256n) - 1n).toString(),
              delta: (-(1n << 255n)).toString(),
            },
            { amount: '1', delta: '10' },
          ],
          approved: true,
        },
      };
      const action: TypedDataAction = {
        action_id: randomUUID(),
        operation_id: randomUUID(),
        kind: 'sign_typed_data',
        profile: 'safe_owner_v1',
        profile_revision: '1',
        status: 'ready',
        chain_id: 'eip155:84532',
        chain_account_id: `eip155:84532:${account.address}`,
        binding_revision: '1',
        capability_revision: '1',
        plan_revision: '1',
        plan_hash: '0x' + '1'.repeat(64),
        dependencies: [],
        expires_at: new Date(Date.now() + 120000).toISOString(),
        payload,
        payload_hash: TypedDataEncoder.hash(
          payload.domain,
          payload.types,
          payload.message,
        ),
      };
      const signingAttempt = randomUUID();
      const service = new EmbeddedWalletService(
        {
          provision: async () => null,
          sign: async () => ({
            sessionSubject: 'owner',
            ownerSubject: 'owner',
            currentUserStatus: 'ID VERIFIED',
            accountId,
            attemptId: signingAttempt,
            account,
            chainAccountId: action.chain_account_id,
            bindingRevision: '1',
            capabilityRevision: '1',
            action,
          }),
        },
        restarted,
      );
      const context = {
        principal: {
          issuer: 'https://identity.example.test',
          subject: 'owner',
          clientId: 'client',
          scopes: ['wallet:sign'],
        },
        idempotencyKey: randomUUID(),
      };
      const signature = await service.sign(context, action.action_id);
      expect(recoverAddress(action.payload_hash, signature)).toBe(
        account.address,
      );
      expect(await service.sign(context, action.action_id)).toBe(signature);
      expect(options.passphrase).toHaveBeenCalledTimes(2);
      expect(journal.records.size).toBe(2);
      // Fail the real signature's result commit; retry must not call the engine again.
      const lost = structuredClone(action);
      lost.action_id = randomUUID();
      const lostAttempt = randomUUID();
      const completion = vi
        .spyOn(journal, 'complete')
        .mockRejectedValueOnce(new Error('offline storage outage'));
      await expect(
        restarted.signTypedData(account, lost, lostAttempt),
      ).rejects.toMatchObject({
        code: 'wallet_attempt_unavailable',
        outcome: 'unknown',
      });
      completion.mockRestore();
      await expect(
        restarted.signTypedData(account, lost, lostAttempt),
      ).rejects.toMatchObject({ code: 'wallet_attempt_pending' });
      expect(options.passphrase).toHaveBeenCalledTimes(3);
      for (const change of ['chain', 'expired', 'digest'] as const) {
        const invalid = structuredClone(action);
        invalid.action_id = randomUUID();
        if (change === 'chain') invalid.chain_id = 'eip155:8453';
        if (change === 'expired')
          invalid.expires_at = new Date(0).toISOString();
        if (change === 'digest') invalid.payload_hash = '0x' + '2'.repeat(64);
        await expect(
          restarted.signTypedData(account, invalid, randomUUID()),
        ).rejects.toMatchObject({ code: 'wallet_provider_input' });
      }
      expect(options.passphrase).toHaveBeenCalledTimes(3);
      authorizeAttempt.mockResolvedValue(false);
      await expect(
        service.sign(context, action.action_id),
      ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
      expect(options.passphrase).toHaveBeenCalledTimes(3);
    } finally {
      rmSync(vaultPath, { recursive: true, force: true });
    }
  }, 30000);

  it('denies missing host authority before touching the real engine or credential store', async () => {
    const vaultPath = mkdtempSync(join(tmpdir(), 'moovha-ows-deny-'));
    try {
      const passphrase = vi.fn(async () => randomUUID());
      const provider = createOwsWalletProvider(
        { vaultPath, passphrase },
        {
          namespace: 'ows-denied-test',
          journal: new TestJournal(),
          authorizeAttempt: async () => false,
        },
      );
      const service = new EmbeddedWalletService(
        { provision: async () => null, sign: async () => null },
        provider,
      );
      const context = {
        principal: {
          issuer: 'https://identity.example.test',
          subject: 'owner',
          clientId: 'client',
          scopes: ['wallet:provision'],
        },
        idempotencyKey: randomUUID(),
      };
      await expect(
        service.provision(context, randomUUID()),
      ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
      await expect(
        provider.createAccount(randomUUID(), randomUUID()),
      ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
      expect(passphrase).not.toHaveBeenCalled();
      expect(listWallets(vaultPath)).toHaveLength(0);
      chmodSync(vaultPath, 0o755);
      expect(() =>
        createOwsWalletProvider(
          { vaultPath, passphrase },
          {
            namespace: 'ows-denied-test',
            journal: new TestJournal(),
            authorizeAttempt: async () => true,
          },
        ),
      ).toThrow('wallet_provider_configuration');
    } finally {
      rmSync(vaultPath, { recursive: true, force: true });
    }
  });
});
