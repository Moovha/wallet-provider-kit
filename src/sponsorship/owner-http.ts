import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { VerifiedPrincipal } from '../domain/principal.js';
import type { SafeWalletRuntime } from './safe-wallet.js';
import type { SafeOwnerChange } from './owner-policy.js';
import { problemSchema, uuidSchema } from '../service/schemas.js';
import { WalletProviderError } from '../domain/signing.js';
const revision = { type: 'string', pattern: '^(0|[1-9][0-9]{0,19})$' };
const address = { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' };
const policy = {
  type: 'object',
  additionalProperties: false,
  required: ['owners', 'threshold', 'providerSigner', 'revision'],
  properties: {
    owners: { type: 'array', minItems: 1, maxItems: 32, items: address },
    threshold: { type: 'integer', minimum: 1, maximum: 32 },
    providerSigner: address,
    revision,
  },
};
const payload = { type: 'object', additionalProperties: true };
const signingRequest = {
  type: 'object',
  additionalProperties: false,
  required: [
    'operation_id',
    'batch_id',
    'account_id',
    'payload_revision',
    'chain_id',
    'safe_address',
    'nonce',
    'expires_at',
    'owner_policy',
    'signing_payload',
    'signing_hash',
    'calls',
    'collected_owners',
    'signatures_required',
    'additional_signatures_required',
    'state',
  ],
  properties: {
    operation_id: uuidSchema,
    batch_id: { type: 'string', nullable: true },
    account_id: uuidSchema,
    payload_revision: { type: 'string' },
    chain_id: { type: 'string' },
    safe_address: address,
    nonce: { type: 'string' },
    expires_at: { type: 'string' },
    owner_policy: policy,
    signing_payload: payload,
    signing_hash: { type: 'string' },
    calls: { type: 'array', items: payload },
    requested_action: payload,
    collected_owners: { type: 'array', items: address },
    signatures_required: { type: 'integer' },
    additional_signatures_required: { type: 'integer' },
    state: { enum: ['collecting', 'quorum-ready', 'cancelled', 'expired'] },
  },
};
const errors = {
  400: problemSchema,
  403: problemSchema,
  409: problemSchema,
  422: problemSchema,
  503: problemSchema,
};
export function registerOwnerRoutes(
  app: FastifyInstance,
  options: {
    authorize(request: FastifyRequest, scope: string): Promise<void>;
    principal(request: FastifyRequest): VerifiedPrincipal;
    runtime(request: FastifyRequest): SafeWalletRuntime | undefined;
    ready(request: FastifyRequest): Promise<boolean>;
  },
) {
  const runtime = async (request: FastifyRequest) => {
    const service = options.runtime(request);
    if (!service || !(await options.ready(request)))
      throw new WalletProviderError('wallet_provider_unavailable');
    return service;
  };
  const context = (r: FastifyRequest) => ({
    principal: options.principal(r),
    idempotencyKey: String(r.headers['idempotency-key']),
  });
  const headers = {
    type: 'object',
    required: ['idempotency-key'],
    properties: { 'idempotency-key': uuidSchema },
  };
  const params = (operation = false) => ({
    type: 'object',
    additionalProperties: false,
    required: ['accountId', ...(operation ? ['operationId'] : [])],
    properties: {
      accountId: uuidSchema,
      ...(operation ? { operationId: uuidSchema } : {}),
    },
  });
  const base = {
    security: [{ accessToken: [] }],
    tags: ['Wallet owners and signatures'],
  };
  app.get<{ Params: { accountId: string } }>(
    '/v1/accounts/:accountId/owners',
    {
      onRequest: (r) => options.authorize(r, 'wallet:access'),
      schema: {
        ...base,
        operationId: 'getSafeOwnerPolicy',
        summary: 'Read confirmed and observed Safe ownership',
        description:
          'Read current chain ownership and reconcile a finalized toolkit owner change. Unexpected changes suspend provider execution. Application membership is independent.',
        params: params(),
        response: { 200: payload, ...errors },
      },
    },
    async (r) =>
      (await runtime(r)).ownerPolicy(options.principal(r), r.params.accountId),
  );
  app.post<{
    Params: { accountId: string };
    Body: { expected_policy_revision: string; change: SafeOwnerChange };
  }>(
    '/v1/accounts/:accountId/owner-changes',
    {
      onRequest: (r) => options.authorize(r, 'wallet:execute'),
      schema: {
        ...base,
        operationId: 'requestSafeOwnerChange',
        summary: 'Request a Safe owner or threshold change',
        description:
          'Requires an owner-only owners:manage grant plus current contract and execution authority. The current on-chain quorum authorizes the exact generated Safe call. The provider signer is retained. Poll owners after batch finality to confirm the new policy.',
        headers,
        params: params(),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['expected_policy_revision', 'change'],
          properties: {
            expected_policy_revision: revision,
            change: {
              oneOf: ['add', 'remove', 'threshold'].map((type) => ({
                type: 'object',
                additionalProperties: false,
                required: [
                  'type',
                  'threshold',
                  ...(type === 'threshold' ? [] : ['owner']),
                ],
                properties: {
                  type: { const: type },
                  threshold: { type: 'integer', minimum: 1, maximum: 32 },
                  ...(type === 'threshold' ? {} : { owner: address }),
                },
              })),
            },
          },
        },
        response: { 200: payload, ...errors },
      },
    },
    async (r) =>
      (await runtime(r)).changeOwners(context(r), r.params.accountId, r.body),
  );
  app.get<{ Params: { accountId: string } }>(
    '/v1/accounts/:accountId/signing-requests',
    {
      onRequest: (r) => options.authorize(r, 'wallet:access'),
      schema: {
        ...base,
        operationId: 'listSafeSigningRequests',
        summary: 'Read wallet signing requests',
        description:
          'Returns up to 100 most recent admitted signing requests for this caller and wallet. Typed payloads become available after final sponsorship preparation. No signatures or keys are exported.',
        params: params(),
        response: {
          200: {
            type: 'object',
            required: ['requests'],
            properties: { requests: { type: 'array', items: signingRequest } },
          },
          ...errors,
        },
      },
    },
    async (r) =>
      (
        await (
          await runtime(r)
        ).signingDriver(options.principal(r), r.params.accountId)
      ).signingRequests(options.principal(r), r.params.accountId),
  );
  const path = '/v1/accounts/:accountId/signing-requests/:operationId';
  app.get<{ Params: { accountId: string; operationId: string } }>(
    path,
    {
      onRequest: (r) => options.authorize(r, 'wallet:access'),
      schema: {
        ...base,
        operationId: 'getSafeSigningRequest',
        summary: 'Read an exact Safe signing payload and quorum status',
        params: params(true),
        response: { 200: signingRequest, ...errors },
      },
    },
    async (r) =>
      (
        await (
          await runtime(r)
        ).signingDriver(options.principal(r), r.params.accountId)
      ).signingRequest(
        options.principal(r),
        r.params.accountId,
        r.params.operationId,
      ),
  );
  app.post<{
    Params: { accountId: string; operationId: string };
    Body: { payload_revision: string; owner: string; signature: string };
  }>(
    path + '/signatures',
    {
      onRequest: (r) => options.authorize(r, 'wallet:sign'),
      schema: {
        ...base,
        operationId: 'submitSafeOwnerSignature',
        summary: 'Deliver an owner signature for an admitted operation',
        description:
          'The authenticated application delivers an external owner signature. The owner needs no provider account. Current authority, chain ownership, immutable payload and strict EIP-712 ECDSA are verified. Duplicate delivery of the same signature is idempotent; different signatures for the same owner conflict.',
        params: params(true),
        headers,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['payload_revision', 'owner', 'signature'],
          properties: {
            payload_revision: { type: 'string', pattern: '^0x[0-9a-f]{64}$' },
            owner: address,
            signature: { type: 'string', pattern: '^0x[0-9a-fA-F]{130}$' },
          },
        },
        response: { 200: signingRequest, ...errors },
      },
    },
    async (r) =>
      (
        await (
          await runtime(r)
        ).signingDriver(options.principal(r), r.params.accountId)
      ).submitSignature(
        context(r),
        r.params.accountId,
        r.params.operationId,
        r.body,
      ),
  );
  app.post<{ Params: { accountId: string; operationId: string } }>(
    path + '/cancel',
    {
      onRequest: (r) => options.authorize(r, 'wallet:actions'),
      schema: {
        ...base,
        operationId: 'cancelSafeSigningRequest',
        summary: 'Stop collecting and dispatching a signing request',
        description:
          'Stops further toolkit signing and submission before dispatch. Previously issued signatures cannot be recalled. Nonce and budget reservations are retained.',
        params: params(true),
        headers,
        body: { type: 'object', additionalProperties: false },
        response: { 200: signingRequest, ...errors },
      },
    },
    async (r) =>
      (
        await (
          await runtime(r)
        ).signingDriver(options.principal(r), r.params.accountId)
      ).cancelSigning(context(r), r.params.accountId, r.params.operationId),
  );
}
