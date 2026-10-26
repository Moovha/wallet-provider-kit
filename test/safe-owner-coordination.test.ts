import { randomUUID } from 'node:crypto';
import { Wallet, Signature, recoverAddress, TypedDataEncoder } from 'ethers';
import { describe, expect, it, vi } from 'vitest';
import { fixture } from './helpers/safe-4337.js';
import {
  safeInterface,
  buildApprovedCallIntent,
} from '../src/execution/approved-calls.js';
import {
  initialSafeOwnerPolicy,
  prepareSafeOwnerChange,
  normalizeSafeOwnerPolicy,
  ownerManagementInterface,
} from '../src/sponsorship/owner-policy.js';
import { safeOpSignaturesV07 } from '../src/sponsorship/safe-op.js';
import { SafeOwnerAdministration } from '../src/sponsorship/owner-administration.js';
import { createServer } from '../src/service/server.js';
import type { SafeWalletRuntime } from '../src/sponsorship/safe-wallet.js';
import {
  UserOperationExecutionCoordinator,
  UserOperationWalletCallsDriver,
  userOperationExecutionBinding,
  signedUserOperationHash,
} from '../src/sponsorship/index.js';
import { createWalletsClient } from '../src/wallets/client.js';
const denied = { code: 'wallet_authorization_denied' };
const bundler = {
  profile: 'safe4337-bundler-v07' as const,
  url: 'https://bundler.example.test/rpc',
  maxLogRange: 100,
};
async function setup(threshold = 2, administration = false, count = 2) {
  const external = Array.from({ length: count - 1 }, () =>
    Wallet.createRandom(),
  );
  const f = await fixture(
    (config, provider) => {
      config.submissionBinding = userOperationExecutionBinding(bundler);
      config.basePolicy.accounts[0].ownerPolicy = {
        owners: [provider.address, ...external.map((w) => w.address)].map((a) =>
          a.toLowerCase(),
        ),
        threshold,
        providerSigner: provider.address.toLowerCase(),
        revision: '1',
      };
    },
    undefined,
    undefined,
    true,
    false,
    false,
    undefined,
    administration,
  );
  (f.context.principal.scopes as string[]).push(
    'wallet:execute',
    'wallet:access',
  );
  let chainPolicy = structuredClone(
    f.config.basePolicy.accounts[0].ownerPolicy!,
  );
  let sends = 0;
  let submittedSignature: string | undefined;
  f.state.mutate = (method, result, params) => {
    if (method === 'eth_call') {
      if (
        (params[0] as { data: string }).data ===
        safeInterface.encodeFunctionData('getOwners')
      )
        return safeInterface.encodeFunctionResult('getOwners', [
          chainPolicy.owners,
        ]);
      if (
        (params[0] as { data: string }).data ===
        safeInterface.encodeFunctionData('getThreshold')
      )
        return safeInterface.encodeFunctionResult('getThreshold', [
          chainPolicy.threshold,
        ]);
    }
    if (
      method === 'eth_getBlockByNumber' &&
      ['safe', 'finalized'].includes(String(params[0]))
    )
      return { ...(result as object), number: '0x64' };
    return result;
  };
  const transport = (async (url, init) => {
    if (new URL(String(url)).origin !== 'https://bundler.example.test') {
      const rpc = JSON.parse(String(init?.body));
      if (rpc.method === 'eth_getLogs')
        return Response.json({ jsonrpc: '2.0', id: rpc.id, result: [] });
      const response = await f.request(url, init);
      if (rpc.method === 'eth_getBlockByNumber') {
        const body = (await response.json()) as {
          result: Record<string, unknown>;
        };
        body.result.timestamp =
          '0x' + Math.floor(Date.now() / 1000).toString(16);
        return Response.json(body);
      }
      return response;
    }
    const body = JSON.parse(String(init?.body));
    let result: unknown;
    if (body.method === 'eth_chainId')
      result = f.config.acceptance.domain.chainId;
    else if (body.method === 'eth_supportedEntryPoints')
      result = [f.config.acceptance.entryPoint.address];
    else if (body.method === 'eth_sendUserOperation') {
      sends++;
      submittedSignature = body.params[0].signature;
      result = signedUserOperationHash(
        body.params[0],
        f.config.acceptance.domain,
      );
    } else throw new Error('Unexpected bundler call');
    return Response.json({ jsonrpc: '2.0', id: body.id, result });
  }) as typeof fetch;
  const coordinator = () =>
    new UserOperationExecutionCoordinator(
      f.actions,
      f.db,
      f.service,
      bundler,
      async () => 'Bearer offline',
      transport,
    );
  let execution = coordinator();
  const makeDriver = () =>
    new UserOperationWalletCallsDriver(f.actions, f.db, execution, {
      gas: f.operation,
      maxDepthPerSafe: 3,
      maxWaitSeconds: 120,
      pollIntervalSeconds: 1,
    });
  let driver = makeDriver();
  const administrationService = () =>
    new SafeOwnerAdministration(
      f.actions,
      f.db,
      f.config.basePolicy.multiSend,
      async () => f.config.acceptance,
      async () => driver,
      f.request,
    );
  const runtime = {
    signingDriver: async () => driver,
    ownerPolicy: (p, id) => administrationService().read(p, id),
    changeOwners: (context, id, input) =>
      administrationService().change(context, id, input),
  } satisfies Pick<
    SafeWalletRuntime,
    'signingDriver' | 'ownerPolicy' | 'changeOwners'
  >;
  const app = await createServer({
    documentation: false,
    service:
      {} as import('../src/domain/embedded-wallet.js').EmbeddedWalletService,
    safeWallet: runtime as unknown as SafeWalletRuntime,
    ready: async () => true,
    authenticate: async (_token, scope) => {
      if (!f.context.principal.scopes.includes(scope))
        throw Error('Missing fixture scope');
      return f.context.principal;
    },
  });
  const client = createWalletsClient({
    url: 'https://wallet.example.test',
    authorization: async () => 'Bearer offline',
    fetch: (async (url, init) => {
      const response = await app.inject({
        method: init!.method as 'GET' | 'POST',
        url: new URL(String(url)).pathname,
        headers: init!.headers as Record<string, string>,
        ...(init!.body ? { payload: String(init!.body) } : {}),
      });
      return new Response(response.body, {
        status: response.statusCode,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch,
  });
  return {
    f,
    external,
    client,
    app,
    get driver() {
      return driver;
    },
    get execution() {
      return execution;
    },
    runtime,
    get sends() {
      return sends;
    },
    get submittedSignature() {
      return submittedSignature;
    },
    setPolicy: (policy: typeof chainPolicy) => {
      chainPolicy = policy;
    },
    restart: async () => {
      await f.restart();
      execution = coordinator();
      driver = makeDriver();
    },
  };
}

it('compiles standard owner changes without provisioning signers or changing the deployment recipe', () => {
  const provider = Wallet.createRandom().address,
    external = Wallet.createRandom().address;
  const initial = initialSafeOwnerPolicy(provider);
  const added = prepareSafeOwnerChange(initial, {
    type: 'add',
    owner: external,
    threshold: 2,
  });
  expect(added.requested.owners).toEqual([
    external.toLowerCase(),
    provider.toLowerCase(),
  ]);
  expect(
    ownerManagementInterface.parseTransaction({ data: added.data })!.name,
  ).toBe('addOwnerWithThreshold');
  const removed = prepareSafeOwnerChange(added.requested, {
    type: 'remove',
    owner: external,
    threshold: 1,
  });
  expect(
    ownerManagementInterface.decodeFunctionData('removeOwner', removed.data)[0],
  ).toBe('0x0000000000000000000000000000000000000001');
  expect(() =>
    prepareSafeOwnerChange(added.requested, {
      type: 'remove',
      owner: provider,
      threshold: 1,
    }),
  ).toThrow();
  expect(() =>
    prepareSafeOwnerChange(added.requested, {
      type: 'add',
      owner: external,
      threshold: 2,
    }),
  ).toThrow();
  for (const owner of [
    '0x' + '0'.repeat(40),
    '0x' + '0'.repeat(39) + '1',
    'bad',
  ])
    expect(() =>
      prepareSafeOwnerChange(initial, { type: 'add', owner, threshold: 1 }),
    ).toThrow();
  for (const threshold of [0, 3, 1.5, NaN])
    expect(() =>
      normalizeSafeOwnerPolicy({ ...added.requested, threshold }),
    ).toThrow();
});

it('collects signatures through the HTTP client, survives restart and submits one complete sorted quorum', async () => {
  const s = await setup();
  try {
    const { f, external, client } = s;
    const source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    await expect(
      s.execution.execute(f.context, source.action_id),
    ).rejects.toMatchObject({ code: 'wallet_signatures_pending' });
    expect(f.state.signs).toBe(0);
    expect(s.sends).toBe(0);
    const request = await client.signingRequest(
      f.grant.account_id!,
      source.action_id,
    );
    expect(request.owner_policy.threshold).toBe(2);
    expect(request.signing_payload.primaryType).toBe('SafeOp');
    expect(request.signing_hash).toBe(
      TypedDataEncoder.hash(
        request.signing_payload.domain,
        request.signing_payload.types,
        request.signing_payload.message,
      ),
    );
    const signature = await external[0].signTypedData(
      request.signing_payload.domain,
      request.signing_payload.types,
      request.signing_payload.message,
    );
    const input = {
      owner: external[0].address,
      payload_revision: request.payload_revision,
      signature,
    };
    const accepted = await client.submitOwnerSignature(
      f.grant.account_id!,
      source.action_id,
      input,
      randomUUID(),
    );
    expect(accepted.collected_owners).toEqual([
      external[0].address.toLowerCase(),
    ]);
    expect(JSON.stringify(accepted)).not.toContain(signature);
    await client.submitOwnerSignature(
      f.grant.account_id!,
      source.action_id,
      input,
      randomUUID(),
    );
    await s.restart();
    await s.execution.execute(f.context, source.action_id);
    expect(f.state.signs).toBe(1);
    expect(s.sends).toBe(1);
    const encoded = s.submittedSignature!;
    expect(encoded.length).toBe(2 + 24 + 130 * 2);
    const owners = [0, 1].map((i) =>
      recoverAddress(
        request.signing_hash,
        '0x' + encoded.slice(26 + i * 130, 26 + (i + 1) * 130),
      ).toLowerCase(),
    );
    expect(owners).toEqual([...request.owner_policy.owners].sort());
    f.state.nonce = 1;
    expect(
      (
        await client.submitOwnerSignature(
          f.grant.account_id!,
          source.action_id,
          input,
          randomUUID(),
        )
      ).state,
    ).toBe('quorum-ready');
    expect(f.state.signs).toBe(1);
    expect(s.sends).toBe(1);
    await expect(
      client.signingRequest(randomUUID(), source.action_id),
    ).rejects.toMatchObject({ status: 403 });
  } finally {
    await s.app.close();
  }
});

it('rejects wrong domains, duplicate signers, unknown owners and changed payload revisions', async () => {
  const s = await setup();
  try {
    const { f, client, external } = s;
    const source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    await f.service.sponsor(f.context, source.action_id);
    await f.service.prepareSignatureRequest(f.context, source.action_id);
    const request = await client.signingRequest(
        f.grant.account_id!,
        source.action_id,
      ),
      p = request.signing_payload;
    const signature = await external[0].signTypedData(
      p.domain,
      p.types,
      p.message,
    );
    const input = {
      payload_revision: request.payload_revision,
      owner: external[0].address,
      signature,
    };
    await expect(
      client.submitOwnerSignature(
        f.grant.account_id!,
        source.action_id,
        { ...input, payload_revision: '0x' + 'a'.repeat(64) },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      client.submitOwnerSignature(
        f.grant.account_id!,
        source.action_id,
        { ...input, owner: Wallet.createRandom().address },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    const otherDomain = await external[0].signTypedData(
      { ...p.domain, chainId: '1' },
      p.types,
      p.message,
    );
    await expect(
      client.submitOwnerSignature(
        f.grant.account_id!,
        source.action_id,
        { ...input, signature: otherDomain },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 422 });
    const action = f.db.sponsorship.load(source.action_id)!.signatureCollection!
      .action;
    expect(() =>
      safeOpSignaturesV07(action, request.owner_policy, [
        { owner: external[0].address, signature },
        { owner: external[0].address, signature },
      ]),
    ).toThrow();
    expect(f.state.signs).toBe(0);
  } finally {
    await s.app.close();
  }
});

it('cancels collection without releasing reservations or permitting a later signature or dispatch', async () => {
  const s = await setup();
  try {
    const { f, client, external } = s;
    const source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    await f.service.sponsor(f.context, source.action_id);
    await f.service.prepareSignatureRequest(f.context, source.action_id);
    const request = await client.signingRequest(
        f.grant.account_id!,
        source.action_id,
      ),
      p = request.signing_payload;
    const signature = await external[0].signTypedData(
      p.domain,
      p.types,
      p.message,
    );
    expect(
      (
        await client.cancelSigningRequest(
          f.grant.account_id!,
          source.action_id,
          randomUUID(),
        )
      ).state,
    ).toBe('cancelled');
    expect(
      (
        await client.cancelSigningRequest(
          f.grant.account_id!,
          source.action_id,
          randomUUID(),
        )
      ).state,
    ).toBe('cancelled');
    await expect(
      client.submitOwnerSignature(
        f.grant.account_id!,
        source.action_id,
        {
          payload_revision: request.payload_revision,
          owner: external[0].address,
          signature,
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      s.execution.execute(f.context, source.action_id),
    ).rejects.toMatchObject(denied);
    expect(f.state.signs).toBe(0);
    expect(s.sends).toBe(0);
  } finally {
    await s.app.close();
  }
});

it('requires owner-administration consent and suspends execution when external ownership changes', async () => {
  const s = await setup();
  try {
    const { f, client } = s;
    const read = await client.ownerPolicy(f.grant.account_id!);
    expect(read.status).toBe('confirmed');
    await expect(
      client.changeOwners(
        f.grant.account_id!,
        {
          expected_policy_revision: '1',
          change: { type: 'threshold', threshold: 1 },
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    s.setPolicy({
      ...read.confirmed,
      owners: [Wallet.createRandom().address.toLowerCase()],
      threshold: 1,
    });
    expect((await client.ownerPolicy(f.grant.account_id!)).status).toBe(
      'suspended',
    );
    await expect(f.source()).rejects.toMatchObject(denied);
  } finally {
    await s.app.close();
  }
});

it('queues owner administration under the existing threshold and keeps the requested policy pending', async () => {
  const s = await setup(2, true);
  try {
    const { f, client, external } = s;
    const newOwner = Wallet.createRandom().address;
    const key = randomUUID();
    const input = {
      expected_policy_revision: '1',
      change: { type: 'add' as const, owner: newOwner, threshold: 3 },
    };
    const change = await client.changeOwners(f.grant.account_id!, input, key);
    expect(change.requested.threshold).toBe(3);
    expect(
      (await client.ownerPolicy(f.grant.account_id!)).confirmed.threshold,
    ).toBe(2);
    expect(
      (await client.changeOwners(f.grant.account_id!, input, key)).batch_id,
    ).toBe(change.batch_id);
    await s.driver.runOnce();
    const requests = await client.signingRequests(f.grant.account_id!);
    expect(requests.requests).toHaveLength(1);
    const request = requests.requests[0];
    expect(request.batch_id).toBe(change.batch_id);
    expect(request.owner_policy.threshold).toBe(2);
    expect(request.calls).toHaveLength(1);
    expect(request.calls[0].to.toLowerCase()).toBe(
      f.operation.sender.toLowerCase(),
    );
    expect(f.state.signs).toBe(0);
    const snapshot = await f.db.onboardingStore.transaction((state) =>
      Object.values(state.userOperationBatches ?? {}),
    );
    expect(snapshot[0].stage).toBe('awaiting-signatures');
    const posts = f.state.posts;
    await s.driver.runOnce();
    expect(f.state.posts).toBe(posts);
    expect(f.state.signs).toBe(0);
    const p = request.signing_payload;
    await client.submitOwnerSignature(
      f.grant.account_id!,
      request.operation_id,
      {
        payload_revision: request.payload_revision,
        owner: external[0].address,
        signature: await external[0].signTypedData(
          p.domain,
          p.types,
          p.message,
        ),
      },
      randomUUID(),
    );
    await s.driver.runOnce();
    expect(s.sends).toBe(1);
    expect(f.state.signs).toBe(1);
    expect(
      (await client.ownerPolicy(f.grant.account_id!)).confirmed.threshold,
    ).toBe(2);
    const pending = (await client.ownerPolicy(f.grant.account_id!)).pending!;
    // Model the independently verified receipt/finality boundary; this is not chain execution evidence.
    await f.db.onboardingStore.transaction((state) => {
      const execution = state.userOperationExecutions![request.operation_id];
      execution.observation.state = 'finalized';
      execution.observation.receipt = {
        status: '0x1',
        logs: [],
        blockHash: '0x' + 'b'.repeat(64),
        blockNumber: '0x64',
        gasUsed: '0x1',
        transactionHash: '0x' + 'c'.repeat(64),
      };
    });
    s.setPolicy(pending.requested);
    const confirmed = await client.ownerPolicy(f.grant.account_id!);
    expect(confirmed.confirmed.threshold).toBe(3);
    expect(confirmed.confirmed.revision).toBe('2');
    expect(confirmed.pending).toBeUndefined();
    expect(
      (await client.changeOwners(f.grant.account_id!, input, key)).batch_id,
    ).toBe(change.batch_id);
  } finally {
    await s.app.close();
  }
});

it('supports 1-of-N provider execution and a complete external quorum without an extra provider signature', async () => {
  const single = await setup(1);
  try {
    const source = await single.f.source();
    await single.f.service.admit(
      single.f.context,
      source.action_id,
      single.f.operation,
    );
    await single.execution.execute(single.f.context, source.action_id);
    expect(single.f.state.signs).toBe(1);
    expect(single.sends).toBe(1);
  } finally {
    await single.app.close();
  }
  const s = await setup(2, false, 3);
  try {
    const { f, client } = s;
    const source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    await f.service.sponsor(f.context, source.action_id);
    await f.service.prepareSignatureRequest(f.context, source.action_id);
    const request = await client.signingRequest(
        f.grant.account_id!,
        source.action_id,
      ),
      p = request.signing_payload;
    await Promise.all(
      s.external.map(async (owner) =>
        client.submitOwnerSignature(
          f.grant.account_id!,
          source.action_id,
          {
            owner: owner.address,
            signature: await owner.signTypedData(p.domain, p.types, p.message),
            payload_revision: request.payload_revision,
          },
          randomUUID(),
        ),
      ),
    );
    await s.execution.execute(f.context, source.action_id);
    expect(f.state.signs).toBe(0);
    expect(s.sends).toBe(1);
  } finally {
    await s.app.close();
  }
});

it('rejects nonce changes and expired payloads before provider signing or submission', async () => {
  const s = await setup();
  try {
    const { f, client, external } = s;
    const source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    await f.service.sponsor(f.context, source.action_id);
    await f.service.prepareSignatureRequest(f.context, source.action_id);
    const request = await client.signingRequest(
        f.grant.account_id!,
        source.action_id,
      ),
      p = request.signing_payload;
    const input = {
      owner: external[0].address,
      signature: await external[0].signTypedData(p.domain, p.types, p.message),
      payload_revision: request.payload_revision,
    };
    f.state.nonce = 1;
    await expect(
      client.submitOwnerSignature(
        f.grant.account_id!,
        source.action_id,
        input,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    f.state.nonce = 0;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.parse(request.expires_at) + 1000));
    expect(
      (await client.signingRequest(f.grant.account_id!, source.action_id))
        .state,
    ).toBe('expired');
    await expect(
      client.submitOwnerSignature(
        f.grant.account_id!,
        source.action_id,
        input,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(f.state.signs).toBe(0);
    expect(s.sends).toBe(0);
  } finally {
    vi.useRealTimers();
    await s.app.close();
  }
});

it('releases an exposed nonce only after finalized expiry and exhaustive absence-of-execution proof', async () => {
  const s = await setup();
  try {
    const { f, client, external } = s;
    const source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    await f.service.sponsor(f.context, source.action_id);
    await f.service.prepareSignatureRequest(f.context, source.action_id);
    const request = await client.signingRequest(
        f.grant.account_id!,
        source.action_id,
      ),
      p = request.signing_payload;
    await client.submitOwnerSignature(
      f.grant.account_id!,
      source.action_id,
      {
        owner: external[0].address,
        signature: await external[0].signTypedData(
          p.domain,
          p.types,
          p.message,
        ),
        payload_revision: request.payload_revision,
      },
      randomUUID(),
    );
    expect(await s.execution.reconcileSigningExpiry(source.action_id)).toBe(
      false,
    );
    await f.db.onboardingStore.transaction((state) => {
      state.sponsorships![source.action_id].funding = {
        balanceWei: '10000000',
        blockNumber: '0x64',
        checkedAt: new Date().toISOString(),
        maximumPendingWei: '10000000',
        maximumPendingOperations: 1,
        accountingOnly: false,
      };
    });
    const capacity = () =>
      f.db.onboardingStore.transaction(() =>
        f.db.sponsorship.assertFunding(source.action_id, {
          balanceWei: '0',
          blockNumber: '0x64',
          checkedAt: new Date().toISOString(),
        }),
      );
    await expect(capacity()).rejects.toMatchObject(denied);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.parse(request.expires_at) + 1000));
    expect(await s.execution.reconcileSigningExpiry(source.action_id)).toBe(
      true,
    );
    const retained = await f.db.onboardingStore.transaction((state) => ({
      source: state.supportedActions![source.action_id],
      collection: state.sponsorships![source.action_id].signatureCollection,
    }));
    await expect(capacity()).resolves.toBeUndefined();
    expect(retained.source.nonceReleased).toBe(true);
    expect(retained.source.status).toBe('denied');
    expect(retained.collection?.expiry?.finalizedBlock).toBe('100');
    expect(f.state.signs).toBe(0);
    expect(s.sends).toBe(0);
  } finally {
    vi.useRealTimers();
    await s.app.close();
  }
});

it('rechecks owner-administration consent after queue admission before collecting signatures', async () => {
  const s = await setup(2, true);
  try {
    const { f, client, external } = s;
    await client.changeOwners(
      f.grant.account_id!,
      {
        expected_policy_revision: '1',
        change: { type: 'threshold', threshold: 1 },
      },
      randomUUID(),
    );
    await s.driver.runOnce();
    const { requests } = await client.signingRequests(f.grant.account_id!);
    const request = requests[0],
      p = request.signing_payload;
    await f.db.onboardingStore.transaction((state) => {
      const grant = state.grants[f.grant.grant_id!];
      grant.permissions = grant.permissions.filter(
        (permission) => permission !== 'owners:manage',
      );
    });
    await expect(
      client.submitOwnerSignature(
        f.grant.account_id!,
        request.operation_id,
        {
          payload_revision: request.payload_revision,
          owner: external[0].address,
          signature: await external[0].signTypedData(
            p.domain,
            p.types,
            p.message,
          ),
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.state.signs).toBe(0);
    expect(s.sends).toBe(0);
  } finally {
    await s.app.close();
  }
});
