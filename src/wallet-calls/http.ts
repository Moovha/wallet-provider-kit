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
          'Optional account-scoped EIP-5792 2.0.0 JSON-RPC transport. Runtime financial authority, Safe queue, current owner consent and method-specific scopes remain required. wallet_sendCalls admits a durable atomic batch without waiting for chain inclusion. Headless wallet_showCallsStatus returns unsupported method; the client adapter can present status through an explicit host callback.',
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
      const principal = await authenticate(
        request.headers.authorization,
        'wallet:access:read',
      );
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
