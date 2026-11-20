import {
  mkdtempSync,
  rmSync,
  chmodSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
  symlinkSync,
  linkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { TypedDataEncoder, recoverAddress } from 'ethers';
import { createWallet, listWallets } from '@open-wallet-standard/core';
import {
  createOwsWalletProvider,
  prepareOwsVault,
} from '../src/providers/ows.js';
import { EmbeddedWalletService } from '../src/domain/embedded-wallet.js';
import type { TypedDataAction } from '../src/domain/signing.js';
import { owsCommand } from '../src/providers/ows-process.js';
import { TestJournal } from './helpers/journal.js';

function scopedVault(root: string, accountId: string) {
  return join(root, 'accounts-v1', accountId);
}

describe('real OWS 1.4.3 offline engine integration', () => {
  it('prepares legacy wallets once and provisions without scanning unrelated account vaults', async () => {
    const vaultPath = mkdtempSync(join(tmpdir(), 'moovha-ows-growth-'));
    try {
      const secret = randomUUID();
      const accountId = randomUUID();
      const seed = createWallet('moovha-' + accountId, secret, 24, vaultPath);
      const source = join(vaultPath, 'wallets', seed.id + '.json');
      const originalBytes = readFileSync(source);
      const fixture = JSON.parse(originalBytes.toString('utf8'));
      // Only the original key is used for signing; copies are disposable inventory fixtures.
      for (let count = 1; count < 1000; count++) {
        const id = randomUUID();
        writeFileSync(
          join(vaultPath, 'wallets', id + '.json'),
          JSON.stringify({
            ...fixture,
            id,
            name: 'moovha-' + randomUUID(),
          }),
          { flag: 'wx', mode: 0o600 },
        );
      }
      const options = { vaultPath, passphrase: async () => secret };
      const attempts = {
        namespace: 'ows-growth-test',
        journal: new TestJournal(),
        authorizeAttempt: async () => true,
      };
      const provider = createOwsWalletProvider(options, attempts);
      const account = await provider.findAccount(accountId);
      expect(account?.address).toBe(
        seed.accounts.find((a) => a.chainId === 'eip155:1')!.address,
      );
      expect(readFileSync(source)).toEqual(originalBytes);
      expect(readdirSync(join(vaultPath, 'accounts-v1'))).toHaveLength(1000);
      expect(listWallets(scopedVault(vaultPath, accountId))).toHaveLength(1);
      // An unreadable unrelated sub-vault must not participate in lookup or creation.
      const unrelated = readdirSync(join(vaultPath, 'accounts-v1')).find(
        (id) => id !== accountId,
      )!;
      chmodSync(scopedVault(vaultPath, unrelated), 0o000);
      try {
        const nextId = randomUUID(),
          attemptId = randomUUID();
        const created = await provider.createAccount(nextId, attemptId);
        expect(await provider.createAccount(nextId, attemptId)).toEqual(
          created,
        );
        const restarted = createOwsWalletProvider(options, attempts);
        expect(await restarted.findAccount(accountId)).toEqual(account);
        expect(await restarted.findAccount(nextId)).toEqual(created);
        expect(await restarted.findAccount(randomUUID())).toBeNull();
        expect(readdirSync(join(vaultPath, 'accounts-v1'))).toHaveLength(1001);
      } finally {
        chmodSync(scopedVault(vaultPath, unrelated), 0o700);
      }
      expect(listWallets(vaultPath)).toHaveLength(1000);
      expect(
        [...attempts.journal.records.values()].every(
          (a) => a.state === 'succeeded',
        ),
      ).toBe(true);
    } finally {
      rmSync(vaultPath, { recursive: true, force: true });
    }
  }, 30000);

  it('rejects duplicate legacy names before copying and resumes an interrupted encrypted copy without overwriting it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'moovha-ows-prepare-'));
    try {
      const accountId = randomUUID();
      const seed = createWallet('moovha-' + accountId, randomUUID(), 24, root);
      const original = join(root, 'wallets', seed.id + '.json');
      const bytes = readFileSync(original);
      const duplicateId = randomUUID();
      const duplicate = join(root, 'wallets', duplicateId + '.json');
      writeFileSync(
        duplicate,
        JSON.stringify({ ...JSON.parse(bytes.toString()), id: duplicateId }),
        { flag: 'wx', mode: 0o600 },
      );
      await expect(prepareOwsVault(root)).rejects.toMatchObject({
        code: 'wallet_provider_unavailable',
      });
      expect(existsSync(join(root, 'accounts-v1'))).toBe(false);
      rmSync(duplicate);
      const directory = join(scopedVault(root, accountId), 'wallets');
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const copied = join(directory, seed.id + '.json');
      writeFileSync(copied, bytes, { flag: 'wx', mode: 0o600 });
      const interrupted = copied + '.' + randomUUID() + '.tmp';
      linkSync(copied, interrupted);
      await prepareOwsVault(root);
      expect(existsSync(interrupted)).toBe(false);
      expect(readFileSync(copied)).toEqual(bytes);
      expect(readFileSync(original)).toEqual(bytes);
      writeFileSync(copied, '{}');
      await expect(
        owsCommand({ command: 'prepare', vaultPath: root }),
      ).rejects.toThrow();
      expect(readFileSync(copied, 'utf8')).toBe('{}');
      expect(readFileSync(original)).toEqual(bytes);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a redirected account directory and rechecks authority before admitting creation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'moovha-ows-scoped-denial-'));
    const outside = mkdtempSync(join(tmpdir(), 'moovha-ows-outside-'));
    try {
      const accountId = randomUUID();
      mkdirSync(join(root, 'accounts-v1'), { mode: 0o700 });
      symlinkSync(outside, scopedVault(root, accountId));
      const journal = new TestJournal();
      const passphrase = vi.fn(async () => randomUUID());
      const authorizeAttempt = vi.fn(async () => true);
      const provider = createOwsWalletProvider(
        { vaultPath: root, passphrase },
        { namespace: 'ows-scoped-denial', journal, authorizeAttempt },
      );
      await expect(
        provider.createAccount(accountId, randomUUID()),
      ).rejects.toMatchObject({ code: 'wallet_provider_unavailable' });
      expect(readdirSync(outside)).toEqual([]);
      const records = journal.records.size;
      authorizeAttempt.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      await expect(
        provider.createAccount(randomUUID(), randomUUID()),
      ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
      expect(journal.records.size).toBe(records);
      expect(passphrase).toHaveBeenCalledOnce();
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

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
      const scoped = scopedVault(vaultPath, account.accountId);
      const seed = listWallets(scoped)[0];
      const fixture = JSON.parse(
        readFileSync(join(scoped, 'wallets', seed.id + '.json'), 'utf8'),
      );
      const id = randomUUID();
      writeFileSync(
        join(scoped, 'wallets', id + '.json'),
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
      expect(listWallets(scoped)).toHaveLength(2);
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
      expect(listWallets(scopedVault(vaultPath, accountId))).toHaveLength(1);
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
