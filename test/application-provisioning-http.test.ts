import type { EmbeddedWalletService } from '../src/domain/embedded-wallet.js';
import type { WalletCallsService } from '../src/wallet-calls/service.js';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { createServer } from '../src/service/server.js';
import type { RuntimeConfigurationService } from '../src/runtime-configuration/service.js';
import type { ApplicationSafeService } from '../src/provisioning/application.js';
import type { ApplicationSponsorService } from '../src/provisioning/application-sponsor.js';

it.each(['safe', 'sponsorship/provision'])(
  'keeps an authenticated %s response open during retained provisioning',
  async (resource) => {
    const applicationId = 'a'.repeat(64);
    const result =
      resource === 'safe'
        ? {
            application_id: applicationId,
            funding_addresses: [],
            status: 'pending',
            asset_model: 'individual-user-wallets',
            account_model: 'provider-controlled-application-safe',
          }
        : {
            application_id: applicationId,
            funding_address: '0x' + '1'.repeat(40),
            status: 'ready',
          };
    const provision = async () => {
      await delay(150);
      return result;
    };
    const server = await createServer({
      runtimeConfiguration: {} as RuntimeConfigurationService,
      applicationSafes: { provision } as unknown as ApplicationSafeService,
      applicationSponsors: {
        provision,
      } as unknown as ApplicationSponsorService,
      authenticate: async () => ({
        issuer: 'https://issuer.example.test',
        clientId: 'operator',
        subject: 'operator',
        scopes: ['wallet:configuration:write'],
      }),
    });
    // Accelerate the ordinary idle timeout while retaining the route's bounded allowance.
    server.server.setTimeout(50);
    try {
      const origin = await server.listen({ host: '127.0.0.1', port: 0 });
      const response = await fetch(
        origin + '/v1/provider/applications/' + applicationId + '/' + resource,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
            connection: 'close',
          },
          body: '{}',
          signal: AbortSignal.timeout(3000),
        },
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(result);
    } finally {
      await server.close();
    }
  },
);

it('keeps an authenticated wallet status response open during RPC reconciliation', async () => {
  const result = {
    version: '2.0.0',
    id: 'retained-batch',
    chainId: '0x2105',
    status: 100,
    atomic: true,
  };
  const server = await createServer({
    service: {} as EmbeddedWalletService,
    walletCalls: {
      request: async () => {
        await delay(150);
        return result;
      },
    } as unknown as WalletCallsService,
    ready: async () => true,
    authenticate: async () => ({
      issuer: 'https://issuer.example.test',
      clientId: 'application',
      subject: 'application',
      scopes: ['wallet:access:read'],
    }),
  });
  server.server.setTimeout(50);
  try {
    const origin = await server.listen({ host: '127.0.0.1', port: 0 });
    const response = await fetch(
      origin + '/v1/accounts/' + randomUUID() + '/wallet',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', connection: 'close' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'wallet_getCallsStatus',
          params: ['retained-batch'],
        }),
        signal: AbortSignal.timeout(3000),
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result,
    });
  } finally {
    await server.close();
  }
});
