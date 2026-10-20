import type { EmbeddedWalletService } from '../src/domain/embedded-wallet.js';
import { randomUUID } from 'node:crypto';
import { createServer } from '../src/service/server.js';
import { expect, it, vi } from 'vitest';
import { AuthenticationError } from '../src/service/auth.js';
import type { WalletCallsService } from '../src/wallet-calls/service.js';
it('authorizes a stream before opening and rechecks the bearer token before delivering each status', async () => {
  const principal = {
    issuer: 'https://issuer.example.test',
    subject: 'application',
    clientId: 'app',
    scopes: ['wallet:execute:read'],
  };
  let authorized = true;
  const authenticate = vi.fn(async () => {
    if (!authorized) throw new AuthenticationError(401);
    return principal;
  });
  const status = {
    version: '2.0.0',
    id: 'batch',
    chainId: '0x14a34',
    status: 100,
    atomic: true,
  };
  const service = {
    request: vi.fn(async () => status),
    async *watch() {
      yield status;
      authorized = false;
      yield { ...status, status: 200 };
    },
  } as unknown as WalletCallsService;
  const app = await createServer({
    walletCalls: service,
    service: {} as EmbeddedWalletService,
    authenticate,
    ready: async () => true,
  });
  try {
    const url = '/v1/accounts/' + randomUUID() + '/wallet/calls/batch/events';
    const response = await app.inject({
      url,
      headers: { authorization: 'Bearer offline' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream');
    expect(response.headers['x-accel-buffering']).toBe('no');
    expect(response.body).toContain('"status":100');
    expect(response.body).not.toContain('"status":200');
    expect(service.request).toHaveBeenCalledOnce();
    expect(authenticate).toHaveBeenCalledTimes(3);
    expect((await app.inject({ url })).statusCode).not.toBe(200);
  } finally {
    app.server.closeAllConnections();
    await app.close();
  }
});

it('bounds streams per account and restores capacity after a client disconnects', async () => {
  const principal = {
    issuer: 'https://issuer.example.test',
    subject: 'app',
    clientId: 'app',
    scopes: ['wallet:execute:read'],
  };
  const status = {
    version: '2.0.0',
    id: 'batch',
    chainId: '0x14a34',
    status: 100,
    atomic: true,
  };
  const service = {
    request: async () => status,
    async *watch(
      _principal: unknown,
      _account: string,
      _batch: string,
      signal: AbortSignal,
    ) {
      yield status;
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener('abort', () => resolve(), { once: true });
      });
    },
  } as unknown as WalletCallsService;
  const app = await createServer({
    walletCalls: service,
    service: {} as EmbeddedWalletService,
    authenticate: async () => principal,
    ready: async () => true,
  });
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  const url =
    origin + '/v1/accounts/' + randomUUID() + '/wallet/calls/batch/events';
  const controllers = [
    new AbortController(),
    new AbortController(),
    new AbortController(),
  ];
  try {
    const first = await fetch(url, {
      signal: AbortSignal.any([
        controllers[0].signal,
        AbortSignal.timeout(2000),
      ]),
    });
    const second = await fetch(url, {
      signal: AbortSignal.any([
        controllers[1].signal,
        AbortSignal.timeout(2000),
      ]),
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await fetch(url)).status).toBe(429);
    controllers[0].abort();
    await first.body?.cancel().catch(() => {});
    await vi.waitFor(async () => {
      const next = await fetch(url, {
        signal: AbortSignal.any([
          controllers[2].signal,
          AbortSignal.timeout(2000),
        ]),
      });
      expect(next.status).toBe(200);
      controllers[2].abort();
      await next.body?.cancel().catch(() => {});
    });
  } finally {
    for (const controller of controllers) controller.abort();
    app.server.closeAllConnections();
    await app.close();
  }
});

it('wakes only the stream for the changed action and detaches its notification listener', async () => {
  const { WalletCallsService } = await import('../src/wallet-calls/service.js');
  const principal = {
    issuer: 'https://issuer.example.test',
    subject: 'app',
    clientId: 'app',
    scopes: ['wallet:execute:read'],
  };
  const record = vi.fn(async () => ({
    actionId: 'own',
    walletCalls: { id: 'batch' },
    status: 'queued',
  }));
  let notify!: (id: string) => void;
  const stop = vi.fn();
  const service = new WalletCallsService(
    {
      onboarding: { runtimeContracts: true },
      network: { hex: '0x2105' },
    } as unknown as import('../src/deployment/actions.js').SupportedActions,
    {
      walletCallsRecord: record,
    } as unknown as import('../src/execution/queue.js').SafeExecutionQueue,
    {
      subscribe: (listener: (id: string) => void) => {
        notify = listener;
        return stop;
      },
    } as unknown as import('../src/execution/application-coordinator.js').ExecutionCoordinatorPort,
  );
  const controller = new AbortController();
  const stream = service.watch(
    principal,
    randomUUID(),
    'batch',
    controller.signal,
  );
  try {
    expect((await stream.next()).value).toMatchObject({ status: 100 });
    const next = stream.next();
    notify('another-action');
    await Promise.resolve();
    expect(record).toHaveBeenCalledOnce();
    notify('own');
    await next;
    expect(record).toHaveBeenCalledTimes(2);
  } finally {
    controller.abort();
    await stream.return();
  }
  expect(stop).toHaveBeenCalledOnce();
});
