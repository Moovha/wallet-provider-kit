import { selectWalletGrant } from '../service/wallet-grant.js';
import { Readable } from 'node:stream';
import { setAuthenticatedResponseTimeout } from '../service/response-timeout.js';
import { uuid } from '../onboarding/policy.js';
import type { FastifyInstance } from 'fastify';
import type { Authenticate } from '../service/auth.js';
import { AuthenticationError } from '../service/auth.js';
import { uuidSchema, problemSchema } from '../service/schemas.js';
import { WalletCallsError } from './errors.js';
import { walletCallsFailure, type WalletCallsService } from './service.js';
import { rpcRequestSchema, rpcResponseSchema } from './schemas.js';

export async function registerWalletCallsRoutes(
  app: FastifyInstance,
  service: WalletCallsService | undefined,
  authenticate: Authenticate | undefined,
  ready: () => Promise<boolean>,
) {
  const streams = new Map<string, number>();
  let activeStreams = 0;
  const accountStreams = new Map<string, number>();
  app.get<{ Params: { accountId: string; batchId: string } }>(
    '/v1/accounts/:accountId/wallet/calls/:batchId/events',
    {
      schema: {
        operationId: 'streamWalletCallsStatus',
        security: [{ accessToken: [] }],
        description:
          'Authenticated bounded SSE status stream. Sends current account-authorized EIP-5792 status after durable observation changes. Reconnect after 55 seconds; ordinary status reads remain available.',
        params: {
          type: 'object',
          required: ['accountId', 'batchId'],
          properties: {
            accountId: uuidSchema,
            batchId: { type: 'string', maxLength: 8194 },
          },
        },
        response: {
          200: {
            description: 'Bounded SSE stream of authorized wallet status',
            content: { 'text/event-stream': { schema: { type: 'string' } } },
          },
          401: problemSchema,
          403: problemSchema,
          429: problemSchema,
          503: problemSchema,
        },
      },
    },
    async (request, reply) => {
      if (!service || !authenticate || !(await ready()))
        throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
      const principal = selectWalletGrant(
        await authenticate(
          request.headers.authorization,
          'wallet:execute:read',
        ),
        request.headers['wallet-grant-id'],
      );
      // Check current ownership and batch access before opening a stream.
      await service.request(
        principal,
        request.params.accountId,
        'wallet_getCallsStatus',
        [request.params.batchId],
      );
      const key = JSON.stringify([principal.issuer, principal.clientId]);
      const accountKey = JSON.stringify([
        principal.issuer,
        principal.clientId,
        request.params.accountId,
      ]);
      if (
        activeStreams >= 64 ||
        (streams.get(key) ?? 0) >= 16 ||
        (accountStreams.get(accountKey) ?? 0) >= 2
      )
        throw Object.assign(new Error('Too many status streams'), {
          statusCode: 429,
        });
      activeStreams++;
      streams.set(key, (streams.get(key) ?? 0) + 1);
      accountStreams.set(accountKey, (accountStreams.get(accountKey) ?? 0) + 1);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        activeStreams--;
        for (const [map, id] of [
          [streams, key],
          [accountStreams, accountKey],
        ] as const) {
          const count = (map.get(id) ?? 1) - 1;
          if (count) map.set(id, count);
          else map.delete(id);
        }
      };
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
        source.destroy();
        release();
      }, 55000);
      timer.unref();
      const closed = () => {
        controller.abort();
        source.destroy();
        release();
      };
      reply.raw.once('close', closed);
      const source = Readable.from(
        (async function* () {
          try {
            for await (const status of service.watch(
              principal,
              request.params.accountId,
              request.params.batchId,
              controller.signal,
            )) {
              await authenticate(
                request.headers.authorization,
                'wallet:execute:read',
              );
              if (!(await ready())) return;
              yield status
                ? 'event: status\ndata: ' + JSON.stringify(status) + '\n\n'
                : ': keepalive\n\n';
            }
          } catch {
            yield 'event: reconnect\ndata: {}\n\n';
          } finally {
            clearTimeout(timer);
            reply.raw.removeListener('close', closed);
            controller.abort();
            release();
          }
        })(),
        { objectMode: false, highWaterMark: 16384 },
      );
      return reply
        .header('content-type', 'text/event-stream')
        .header('cache-control', 'no-store')
        .header('x-accel-buffering', 'no')
        .send(source);
    },
  );
  app.get<{ Params: { accountId: string } }>(
    '/v1/accounts/:accountId/wallet',
    {
      schema: {
        operationId: 'readWalletExecutionAccount',
        security: [{ accessToken: [] }],
        params: {
          type: 'object',
          required: ['accountId'],
          properties: { accountId: uuidSchema },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['address', 'chainId'],
            properties: {
              address: { type: 'string' },
              chainId: { type: 'string' },
            },
          },
          401: problemSchema,
          403: problemSchema,
          503: problemSchema,
        },
      },
    },
    async (request) => {
      if (!service || !authenticate || !(await ready()))
        throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
      const principal = selectWalletGrant(
        await authenticate(
          request.headers.authorization,
          'wallet:execute:read',
        ),
        request.headers['wallet-grant-id'],
      );
      return service.account(principal, request.params.accountId);
    },
  );
  app.post<{ Params: { accountId: string }; Body: unknown }>(
    '/v1/accounts/:accountId/wallet',
    {
      bodyLimit: 65536,
      errorHandler: (error, _request, reply) => {
        if (error.code === 'FST_ERR_CTP_INVALID_JSON_BODY')
          return reply.code(200).send({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error' },
          });
        throw error;
      },
      // JSON-RPC validation errors must use its error envelope rather than Fastify's HTTP problem body.
      validatorCompiler: () => () => true,
      schema: {
        operationId: 'walletCallsRpc',
        security: [{ accessToken: [] }],
        description:
          'Optional account-scoped EIP-5792 2.0.0 JSON-RPC transport. Runtime financial authority, the Safe ERC-4337 driver, current owner consent and method-specific scopes remain required. wallet_sendCalls admits a durable atomic batch without waiting for chain inclusion. Headless wallet_showCallsStatus returns unsupported method; the client adapter can present status through an explicit host callback.',
        params: {
          type: 'object',
          required: ['accountId'],
          properties: { accountId: uuidSchema },
        },
        body: rpcRequestSchema,
        response: {
          200: rpcResponseSchema,
          401: problemSchema,
          403: problemSchema,
          503: problemSchema,
        },
      },
    },
    async (request) => {
      if (!service || !authenticate || !(await ready()))
        throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
      const principal = selectWalletGrant(
        await authenticate(request.headers.authorization, 'wallet:access:read'),
        request.headers['wallet-grant-id'],
      );
      setAuthenticatedResponseTimeout(request);
      const body = request.body;
      let id: string | number | null = null;
      try {
        if (!body || typeof body !== 'object' || Array.isArray(body))
          throw new WalletCallsError(-32600);
        const input = body as Record<string, unknown>;
        const validId =
          input.id === null ||
          (typeof input.id === 'string' && input.id.length <= 256) ||
          (typeof input.id === 'number' && Number.isSafeInteger(input.id));
        if (validId) id = input.id as typeof id;
        if (
          !validId ||
          input.jsonrpc !== '2.0' ||
          typeof input.method !== 'string' ||
          input.method.length > 128 ||
          Object.keys(input).some(
            (key) => !['jsonrpc', 'id', 'method', 'params'].includes(key),
          ) ||
          !uuid.test(request.params.accountId)
        )
          throw new WalletCallsError(-32600);
        if (!Array.isArray(input.params)) throw new WalletCallsError(-32602);
        const result = await service.request(
          principal,
          request.params.accountId,
          input.method,
          input.params,
        );
        return { jsonrpc: '2.0', id, result };
      } catch (error) {
        if (error instanceof AuthenticationError) throw error;
        const failure = walletCallsFailure(error);
        return {
          jsonrpc: '2.0',
          id,
          error: { code: failure.code, message: failure.message },
        };
      }
    },
  );
}
