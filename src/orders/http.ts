import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Authenticate } from '../service/auth.js';
import { selectWalletGrant } from '../service/wallet-grant.js';
import { setAuthenticatedResponseTimeout } from '../service/response-timeout.js';
import { uuidSchema, problemSchema } from '../service/schemas.js';
import type { ResolveNetwork } from '../service/network-context.js';
import type { UniswapXOrderService } from './service.js';
const units = { type: 'string', pattern: '^[1-9][0-9]{0,38}$' };
const address = { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' };
const hash = { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$' };
export const uniswapXOrderReceiptSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['order_id', 'order_hash', 'account_id', 'status', 'review'],
  properties: {
    order_id: uuidSchema,
    order_hash: hash,
    account_id: uuidSchema,
    status: {
      enum: [
        'authorizing',
        'prepared',
        'requires_approval',
        'signed',
        'open',
        'unknown',
        'succeeded',
        'expired',
        'cancelled',
        'needs_review',
      ],
    },
    chain_finalized: { type: 'boolean' },
    cancellation: {
      type: 'object',
      additionalProperties: false,
      required: ['transactionHash', 'blockHash', 'blockNumber'],
      properties: {
        transactionHash: hash,
        blockHash: hash,
        blockNumber: { type: 'integer', minimum: 0 },
      },
    },
    cancellation_calls: {
      type: 'array',
      minItems: 1,
      maxItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['to', 'value', 'data'],
        properties: {
          to: address,
          value: { const: '0x0' },
          data: { type: 'string', pattern: '^0x[0-9a-fA-F]+$', maxLength: 138 },
        },
      },
    },
    code: {
      enum: [
        'signing_pending',
        'post_unknown',
        'chain_unavailable',
        'unexpected_effect',
      ],
    },
    review: {
      type: 'object',
      additionalProperties: false,
      required: [
        'profile',
        'swapper',
        'nonce',
        'tokenIn',
        'tokenOut',
        'amountInUnits',
        'minimumAmountOutUnits',
        'deadline',
        'fee',
        'witnessHash',
        'permit2Digest',
        'safeMessageDigest',
        'cosignerDigest',
      ],
      properties: {
        profile: { const: 'uniswapx-v3-order-v1' },
        swapper: address,
        nonce: { type: 'string', pattern: '^(0|[1-9][0-9]{0,77})$' },
        tokenIn: address,
        tokenOut: address,
        amountInUnits: units,
        minimumAmountOutUnits: units,
        deadline: { type: 'integer', minimum: 1 },
        witnessHash: hash,
        permit2Digest: hash,
        safeMessageDigest: hash,
        cosignerDigest: hash,
        fee: {
          type: 'object',
          additionalProperties: false,
          required: [
            'policy',
            'token',
            'recipient',
            'basisPoints',
            'minimumAmountUnits',
            'quotedStartAmountUnits',
          ],
          properties: {
            policy: { const: 'uniswapx_output_fee_v1' },
            token: address,
            recipient: address,
            basisPoints: { type: 'integer', minimum: 1, maximum: 500 },
            minimumAmountUnits: units,
            quotedStartAmountUnits: units,
          },
        },
      },
    },
    approval_calls: {
      type: 'array',
      minItems: 1,
      maxItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['to', 'value', 'data'],
        properties: {
          to: address,
          value: { const: '0x0' },
          data: {
            type: 'string',
            pattern: '^0x[0-9a-fA-F]+$',
            maxLength: 8194,
          },
        },
      },
    },
    fill: {
      type: 'object',
      additionalProperties: false,
      required: [
        'transactionHash',
        'blockHash',
        'blockNumber',
        'finality',
        'safeBlockHash',
        'inputAmountUnits',
        'outputAmountUnits',
        'feeAmountUnits',
      ],
      properties: {
        transactionHash: hash,
        blockHash: hash,
        blockNumber: { type: 'integer', minimum: 0 },
        finality: { const: 'base-safe' },
        safeBlockHash: hash,
        inputAmountUnits: units,
        outputAmountUnits: units,
        feeAmountUnits: units,
      },
    },
  },
};
export async function registerUniswapXOrderRoutes(
  app: FastifyInstance,
  service: UniswapXOrderService | undefined,
  authenticate: Authenticate | undefined,
  resolveNetwork?: ResolveNetwork,
) {
  const selected = (request: FastifyRequest) =>
    resolveNetwork ? resolveNetwork(request).uniswapXOrders : service;
  const problems = Object.fromEntries(
    [400, 401, 403, 409, 413, 415, 422, 429, 500, 503].map((code) => [
      code,
      problemSchema,
    ]),
  );
  app.post<{
    Params: { accountId: string };
    Body: { quote: Record<string, unknown> };
  }>(
    '/v1/accounts/:accountId/uniswapx-orders',
    {
      bodyLimit: 73728,
      schema: {
        operationId: 'submitUniswapXV3Order',
        security: [{ accessToken: [] }],
        description:
          'Submit one bounded Base UniswapX V3 self-swap under an explicit orders:authorize grant. The provider decodes and validates the witness, reviews its net minimum against the canonical spot/TWAP policy, journals exact signing and posting, and verifies receipt effects before success. This is not a general signing endpoint. Retry the same idempotency key and body; unknown outcomes reconcile without another POST.',
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['accountId'],
          properties: { accountId: uuidSchema },
        },
        headers: {
          type: 'object',
          required: ['idempotency-key'],
          properties: { 'idempotency-key': uuidSchema },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['quote'],
          properties: {
            quote: {
              type: 'object',
              required: ['encodedOrder', 'orderId', 'orderInfo'],
              properties: {
                encodedOrder: {
                  type: 'string',
                  pattern: '^0x[0-9a-fA-F]+$',
                  maxLength: 32770,
                },
                orderId: hash,
                orderInfo: {
                  type: 'object',
                  required: ['chainId'],
                  properties: { chainId: { const: 8453 } },
                },
              },
            },
          },
        },
        response: { 202: uniswapXOrderReceiptSchema, ...problems },
      },
    },
    async (request, reply) => {
      if (!authenticate || !selected(request))
        throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
      const principal = selectWalletGrant(
        await authenticate(request.headers.authorization, 'wallet:sign'),
        request.headers['wallet-grant-id'],
      );
      setAuthenticatedResponseTimeout(request);
      const result = await selected(request)!.submit(
        {
          principal,
          idempotencyKey: String(request.headers['idempotency-key']),
        },
        request.params.accountId,
        request.body.quote,
      );
      return reply.code(202).header('cache-control', 'no-store').send(result);
    },
  );
  app.get<{ Params: { accountId: string; orderId: string } }>(
    '/v1/accounts/:accountId/uniswapx-orders/:orderId',
    {
      schema: {
        operationId: 'getUniswapXV3Order',
        security: [{ accessToken: [] }],
        description:
          'Read the account-authorized durable order state. Receipt effects at the Base safe block level establish success; API status, absent lookups and consumed nonces alone do not. No signature or raw order is returned.',
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['accountId', 'orderId'],
          properties: { accountId: uuidSchema, orderId: uuidSchema },
        },
        response: { 200: uniswapXOrderReceiptSchema, ...problems },
      },
    },
    async (request, reply) => {
      if (!authenticate || !selected(request))
        throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
      const principal = selectWalletGrant(
        await authenticate(
          request.headers.authorization,
          'wallet:execute:read',
        ),
        request.headers['wallet-grant-id'],
      );
      setAuthenticatedResponseTimeout(request);
      return reply
        .header('cache-control', 'no-store')
        .send(
          await selected(request)!.read(
            principal,
            request.params.accountId,
            request.params.orderId,
          ),
        );
    },
  );
}
