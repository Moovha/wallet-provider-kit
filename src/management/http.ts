import { providerNetwork, type ProviderNetwork } from '../networks.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AuthenticationError, type Authenticate } from '../service/auth.js';
import { problemSchema, uuidSchema } from '../service/schemas.js';
import {
  managementScope,
  managementScopes,
  type ManagementService,
} from './service.js';
import { applicationScopes } from '../deployment/authorization-contract.js';
import { readFile } from 'node:fs/promises';
import { consoleHtml, consoleStyle } from './ui.js';

const identity = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'name',
    'role',
    'enabled',
    'revision',
    'credentialRevision',
    'scopes',
  ],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    role: { enum: ['administrator', 'automation', 'application'] },
    enabled: { type: 'boolean' },
    revision: { type: 'integer' },
    credentialRevision: { type: 'integer' },
    scopes: { type: 'array', items: { type: 'string' } },
    policy: { type: 'object', additionalProperties: true },
    client_secret: { type: 'string' },
    credential_replayed: { type: 'boolean' },
  },
};
const userId = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const userProperties = {
  id: userId,
  application_id: { type: 'string' },
  issuer: { type: 'string' },
  user_id: { type: 'string' },
  kyc: {
    type: 'object',
    additionalProperties: false,
    required: ['source', 'level', 'verified_at', 'accepted_until'],
    properties: {
      source: { const: 'application_attestation' },
      level: { type: 'string' },
      verified_at: { type: 'string', format: 'date-time' },
      accepted_until: { type: 'string', format: 'date-time' },
      reference: { type: 'string' },
      fields: { type: 'object', additionalProperties: { type: 'string' } },
    },
  },
};
const userSummary = {
  type: 'object',
  additionalProperties: false,
  required: Object.keys(userProperties),
  properties: userProperties,
};
const checkFields = {
  required_fields: {
    type: 'array',
    maxItems: 16,
    uniqueItems: true,
    items: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,63}$' },
    description:
      'Identity field names every application must submit. Values are nonempty strings, up to 512 characters; presence does not verify their accuracy.',
  },
  verification_level: {
    type: 'string',
    minLength: 1,
    maxLength: 100,
    description:
      'Exact agreed label for completed identity checks, such as verified.',
  },
  max_identity_age_days: { type: 'integer', minimum: 1, maximum: 365 },
  max_access_days: { type: 'integer', minimum: 1, maximum: 365 },
};
const userChecks = {
  type: 'object',
  additionalProperties: false,
  required: ['available', 'revision', ...Object.keys(checkFields)],
  properties: {
    available: { type: 'boolean' },
    revision: { type: 'integer', minimum: 1 },
    ...checkFields,
    verification_level: {
      type: 'string',
      description:
        'Agreed verification label; empty when application user-check settings are unavailable in hosted mode.',
    },
  },
};
const errors = Object.fromEntries(
  [400, 401, 403, 409, 413, 415, 422, 429, 500, 503].map((status) => [
    status,
    {
      description: 'Problem response',
      content: { 'application/problem+json': { schema: problemSchema } },
    },
  ]),
);
const schema = (operationId: string, result: object, extra = {}) => ({
  operationId,
  tags: ['Provider administration'],
  security: [{ accessToken: [] }],
  description:
    'Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending.',
  ...extra,
  response: {
    200: result,
    ...errors,
    ...(operationId === 'readProviderUser'
      ? {
          404: {
            description: 'Provider user not found',
            content: { 'application/problem+json': { schema: problemSchema } },
          },
        }
      : {}),
  },
});
const keyHeaders = {
  type: 'object',
  required: ['idempotency-key'],
  properties: { 'idempotency-key': uuidSchema },
};
const body = (required: string[], properties: object) => ({
  type: 'object',
  additionalProperties: false,
  required,
  properties,
});
const name = { type: 'string', minLength: 1, maxLength: 100 };
const target = {
  type: 'string',
  maxLength: 100,
  pattern:
    '^(?:(?:app|automation)-[a-f0-9-]{36}|operator-[a-z][a-z0-9-]{2,47})$',
};

export async function registerManagementRoutes(
  app: FastifyInstance,
  service?: ManagementService,
  authenticate?: Authenticate,
  executionReady?: () => Promise<boolean>,
  origin?: string,
  localOrigin?: string,
  networks: readonly ProviderNetwork[] = ['base-sepolia'],
  networkReady?: (network: ProviderNetwork) => Promise<boolean>,
  contexts?: readonly import('../service/network-context.js').NetworkContext[],
) {
  const configured = () => {
    if (!service)
      throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
    return service;
  };
  async function operator(request: FastifyRequest) {
    if (!authenticate)
      throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
    const principal = await authenticate(
      request.headers.authorization,
      managementScope,
    );
    configured().assertOperator(principal);
    return principal;
  }
  function sameOrigin(request: FastifyRequest) {
    if (
      request.headers.origin &&
      request.headers.origin !== origin &&
      request.headers.origin !== localOrigin
    )
      throw new AuthenticationError(403);
  }
  if (service) {
    app.get(
      '/admin/app.js',
      { schema: { hide: true } },
      async (_request, reply) =>
        reply
          .type('text/javascript')
          .send(
            await readFile(new URL('./console.mjs', import.meta.url), 'utf8'),
          ),
    );
    app.get(
      '/admin/style.css',
      { schema: { hide: true } },
      async (_request, reply) => reply.type('text/css').send(consoleStyle),
    );
    app.get('/admin', { schema: { hide: true } }, async (_request, reply) =>
      reply.redirect('/admin/'),
    );
    app.get('/admin/', { schema: { hide: true } }, async (_request, reply) =>
      reply.type('text/html').send(consoleHtml),
    );
  }
  const networkSettingsSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
      'revision',
      'default_network',
      'networks',
      'running_networks',
      'restart_required',
      'available',
    ],
    properties: {
      revision: { type: 'integer' },
      default_network: { type: 'string' },
      networks: { type: 'array', items: { type: 'string' } },
      running_networks: { type: 'array', items: { type: 'string' } },
      restart_required: { type: 'boolean' },
      available: {
        type: 'array',
        items: {
          type: 'object',
          properties: { network: { type: 'string' }, name: { type: 'string' } },
        },
      },
    },
  };
  const networkView = (value: {
    revision: number;
    networks: ProviderNetwork[];
  }) => ({
    ...value,
    default_network: networks[0],
    running_networks: networks,
    restart_required:
      JSON.stringify([...value.networks].sort()) !==
      JSON.stringify([...networks].sort()),
    available: (
      ['base', 'base-sepolia', 'ethereum', 'ethereum-sepolia'] as const
    ).map((network) => ({
      network,
      name:
        providerNetwork(network).label +
        (providerNetwork(network).testnet ? ' · test network' : ' · mainnet'),
    })),
  });
  app.get(
    '/v1/provider/networks',
    { schema: schema('readProviderNetworks', networkSettingsSchema) },
    async (request) =>
      networkView(
        configured().networkSettings(await operator(request), networks),
      ),
  );
  app.post<{
    Body: { expected_revision: number; networks: ProviderNetwork[] };
  }>(
    '/v1/provider/networks',
    {
      schema: schema('saveProviderNetworks', networkSettingsSchema, {
        headers: keyHeaders,
        body: body(['expected_revision', 'networks'], {
          expected_revision: { type: 'integer', minimum: 1 },
          networks: {
            type: 'array',
            minItems: 1,
            maxItems: 4,
            uniqueItems: true,
            items: {
              enum: ['base', 'base-sepolia', 'ethereum', 'ethereum-sepolia'],
            },
          },
        }),
      }),
    },
    async (request) => {
      sameOrigin(request);
      const saved = await configured().saveNetworks(
        await operator(request),
        String(request.headers['idempotency-key'] ?? ''),
        request.body,
        networks,
      );
      return networkView(saved);
    },
  );
  app.get<{
    Querystring: { limit?: string; after?: string; application_id?: string };
  }>(
    '/v1/provider/users',
    {
      schema: schema(
        'listProviderUsers',
        {
          type: 'object',
          additionalProperties: false,
          required: ['users', 'next_cursor'],
          properties: {
            users: { type: 'array', maxItems: 100, items: userSummary },
            next_cursor: { anyOf: [userId, { type: 'null' }] },
          },
        },
        {
          description:
            'List stored application-attested users in ascending provider user ID order. Defaults to 25, maximum 100. Pass next_cursor as after; null ends pagination. Optional application_id filters registrations. Each application user is distinct. Results report stored evidence, not current spending eligibility. Identity fields and wallets are available from the detail route. Concurrent changes are not a snapshot.',
          querystring: body([], {
            limit: {
              type: 'string',
              pattern: '^(?:[1-9]|[1-9][0-9]|100)$',
              description: 'Page size from 1 to 100; defaults to 25.',
            },
            after: userId,
            application_id: { type: 'string', minLength: 1, maxLength: 256 },
          }),
        },
      ),
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return configured().users(await operator(request), {
        ...request.query,
        limit:
          request.query.limit === undefined
            ? undefined
            : Number(request.query.limit),
      });
    },
  );
  app.get<{ Params: { id: string } }>(
    '/v1/provider/users/:id',
    {
      schema: schema(
        'readProviderUser',
        {
          ...userSummary,
          required: [...userSummary.required, 'wallets'],
          properties: {
            ...userProperties,
            wallets: {
              type: 'array',
              items: body(['account_id', 'wallet', 'role', 'status'], {
                account_id: uuidSchema,
                network: {
                  type: 'string',
                  enum: [
                    'base',
                    'base-sepolia',
                    'ethereum',
                    'ethereum-sepolia',
                  ],
                },
                wallet: body(['reference', 'name', 'kind'], {
                  reference: { type: 'string' },
                  name: { type: 'string' },
                  kind: { enum: ['personal', 'shared'] },
                }),
                role: { enum: ['owner', 'member'] },
                status: { enum: ['active', 'suspended'] },
                address: { type: 'string' },
                membership_state: { enum: ['invited', 'active'] },
              }),
            },
          },
        },
        {
          params: body(['id'], { id: userId }),
          description:
            'Read a stored application-scoped user, application-attested identity fields and owned, linked or invited/active member wallets. Uses the provider user ID returned by the directory, not the application user_id. Includes expired evidence and suspended accounts for administration; does not establish current KYC, consent or transaction authority. Hosted compatibility identities are outside this directory. Unknown IDs return 404.',
        },
      ),
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return configured().user(await operator(request), request.params.id);
    },
  );
  app.get(
    '/v1/provider/user-checks',
    {
      schema: schema('readProviderUserChecks', userChecks, {
        description:
          'Read the shared identity information, check age and wallet permission duration required from applications. available is false for hosted compatibility installations. No customer identity records are returned.',
      }),
    },
    async (request) => configured().readUserChecks(await operator(request)),
  );
  app.post<{
    Body: import('../onboarding/types.js').UserCheckSettings & {
      expected_revision: number;
    };
  }>(
    '/v1/provider/user-checks',
    {
      bodyLimit: 4096,
      schema: schema('saveProviderUserChecks', userChecks, {
        description:
          'Save shared user-check requirements without restarting the service. Use the current revision and a UUIDv4 idempotency key. Changed settings end all current wallet approvals and pending access requests; people must give fresh permission to the new terms. Identical settings preserve approvals. This does not perform KYC, change application trust or enable transactions.',
        headers: keyHeaders,
        body: body(['expected_revision', ...Object.keys(checkFields)], {
          expected_revision: { type: 'integer', minimum: 1 },
          ...checkFields,
        }),
      }),
    },
    async (request) => {
      sameOrigin(request);
      return configured().saveUserChecks(
        await operator(request),
        String(request.headers['idempotency-key']),
        request.body,
      );
    },
  );
  const executionSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
      'network',
      'name',
      'testnet',
      'revision',
      'enabled',
      'ready',
      'backendAcceptance',
      'recoveryAcceptance',
    ],
    properties: {
      network: { type: 'string' },
      name: { type: 'string' },
      testnet: { type: 'boolean' },
      revision: { type: 'integer' },
      enabled: { type: 'boolean' },
      ready: { type: 'boolean' },
      backendAcceptance: { type: 'string' },
      recoveryAcceptance: { type: 'string' },
    },
  };
  function executionContext(network: string) {
    const selected = contexts?.find((context) => context.network === network);
    if (!selected?.execution)
      throw Object.assign(new Error('Network execution controls unavailable'), {
        statusCode: 503,
      });
    return selected;
  }
  async function executionView(
    principal: import('../domain/principal.js').VerifiedPrincipal,
    network: string,
  ) {
    const selected = executionContext(network),
      chain = providerNetwork(selected.network);
    return {
      network: chain.name,
      name: chain.label,
      testnet: chain.testnet,
      ...configured().executionSettings(
        principal,
        chain.name,
        selected.execution!.defaults,
      ),
      ready: await selected.ready!(),
    };
  }
  const executionParams = {
    type: 'object',
    additionalProperties: false,
    required: ['network'],
    properties: {
      network: {
        enum: ['base', 'base-sepolia', 'ethereum', 'ethereum-sepolia'],
      },
    },
  };
  app.get<{ Params: { network: string } }>(
    '/v1/provider/networks/:network/execution',
    {
      schema: schema('readNetworkExecution', executionSchema, {
        params: executionParams,
      }),
    },
    async (request) =>
      executionView(await operator(request), request.params.network),
  );
  app.post<{
    Params: { network: string };
    Body: {
      expected_revision: number;
      enabled: boolean;
      backendAcceptance?: string;
      recoveryAcceptance?: string;
      mainnet_confirmed?: boolean;
    };
  }>(
    '/v1/provider/networks/:network/execution',
    {
      schema: schema('saveNetworkExecution', executionSchema, {
        params: executionParams,
        headers: keyHeaders,
        body: body(['expected_revision', 'enabled'], {
          expected_revision: { type: 'integer', minimum: 1 },
          enabled: { type: 'boolean' },
          backendAcceptance: { type: 'string', minLength: 1, maxLength: 256 },
          recoveryAcceptance: { type: 'string', minLength: 1, maxLength: 256 },
          mainnet_confirmed: { type: 'boolean' },
        }),
      }),
    },
    async (request) => {
      sameOrigin(request);
      const principal = await operator(request),
        selected = executionContext(request.params.network);
      await configured().saveExecution(
        principal,
        String(request.headers['idempotency-key'] ?? ''),
        selected.network,
        request.body,
        selected.execution!.defaults,
      );
      await selected.execution!.sync();
      return executionView(principal, selected.network);
    },
  );
  app.post<{ Body: { claim: string; username: string; password: string } }>(
    '/v1/provider/claim',
    {
      bodyLimit: 4096,
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: schema('claimProviderInstallation', identity, {
        security: [],
        description:
          'Atomically claim a new installation using its privately delivered single-use credential. Expires 30 minutes after first initialization. Restart never reopens claiming. Establishes administration only.',
        body: body(['claim', 'username', 'password'], {
          claim: { type: 'string', minLength: 43, maxLength: 128 },
          username: { type: 'string', pattern: '^[a-z][a-z0-9-]{2,47}$' },
          password: { type: 'string', minLength: 14, maxLength: 256 },
        }),
      }),
    },
    async (request) => {
      sameOrigin(request);
      return configured().claim(request.body);
    },
  );
  app.get(
    '/v1/provider/status',
    {
      schema: schema('readProviderStatus', {
        type: 'object',
        additionalProperties: false,
        required: [
          'installation_id',
          'claimed',
          'applications',
          'management_available',
          'wallet_operations_enabled',
        ],
        properties: {
          installation_id: { type: 'string' },
          claimed: { const: true },
          applications: { type: 'array', items: identity },
          management_available: { const: true },
          management_identities: { type: 'array', items: identity },
          user_checks: userChecks,
          network_settings: networkSettingsSchema,
          network_status: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                network: { type: 'string' },
                name: { type: 'string' },
                configured: { type: 'boolean' },
              },
            },
          },
          wallet_operations_enabled: { type: 'boolean' },
        },
      }),
    },
    async (request) => {
      const principal = await operator(request);
      const fallbackReady = networkReady
        ? false
        : ((await executionReady?.()) ?? false);
      const networkStatus = await Promise.all(
        networks.map(async (network) => ({
          network,
          name: providerNetwork(network).label,
          configured: networkReady
            ? await networkReady(network)
            : fallbackReady,
        })),
      );
      return {
        ...(await configured().status(principal)),
        network_settings: networkView(
          configured().networkSettings(principal, networks),
        ),
        network_status: networkStatus,
        management_available: true,
        wallet_operations_enabled: networkStatus.some(
          (network) => network.configured,
        ),
      };
    },
  );
  app.get(
    '/v1/provider/identities',
    {
      schema: schema('listProviderIdentities', {
        type: 'array',
        maxItems: 100,
        items: identity,
      }),
    },
    async (request) => configured().identities(await operator(request)),
  );
  app.post<{
    Body: {
      name: string;
      role: 'application' | 'automation';
      scopes?: string[];
    };
  }>(
    '/v1/provider/identities',
    {
      bodyLimit: 8192,
      schema: schema('createProviderIdentity', identity, {
        headers: keyHeaders,
        body: body(['name', 'role'], {
          name,
          role: { enum: ['application', 'automation'] },
          scopes: {
            type: 'array',
            minItems: 1,
            maxItems: 50,
            uniqueItems: true,
            items: {
              enum: [...new Set([...applicationScopes, ...managementScopes])],
            },
          },
        }),
      }),
    },
    async (request) => {
      sameOrigin(request);
      return configured().mutate(
        await operator(request),
        String(request.headers['idempotency-key']),
        'create',
        request.body,
      );
    },
  );
  app.patch<{
    Params: { id: string };
    Body: {
      expected_revision: number;
      scopes?: string[];
      name?: string;
      enabled?: boolean;
      trust_agreement?: string | null;
      wallet_sharing?: Omit<
        import('../onboarding/types.js').WalletSharingPolicy,
        'revision'
      > | null;
      permissions?: (
        | 'account:read'
        | 'contracts:request'
        | 'operations:request'
        | 'members:manage'
        | 'owners:manage'
      )[];
    };
  }>(
    '/v1/provider/identities/:id',
    {
      bodyLimit: 8192,
      schema: schema('updateProviderIdentity', identity, {
        headers: keyHeaders,
        params: body(['id'], { id: target }),
        body: body(['expected_revision'], {
          expected_revision: { type: 'integer', minimum: 1 },
          name,
          scopes: {
            type: 'array',
            minItems: 1,
            maxItems: 50,
            uniqueItems: true,
            items: {
              enum: [...new Set([...applicationScopes, ...managementScopes])],
            },
          },
          enabled: { type: 'boolean' },
          trust_agreement: {
            anyOf: [
              { type: 'string', minLength: 1, maxLength: 256 },
              { type: 'null' },
            ],
          },
          wallet_sharing: {
            description:
              'Allow selected applications to request these wallets under a reviewed identity-and-consent sharing agreement. Null disables sharing and ends dependent approvals. Each requester needs its own consent and permissions.',
            anyOf: [
              { type: 'null' },
              body(['applications', 'matchingFields', 'agreement'], {
                applications: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 99,
                  uniqueItems: true,
                  items: { type: 'string', maxLength: 256 },
                },
                matchingFields: {
                  ...checkFields.required_fields,
                  minItems: 3,
                  description:
                    'All fields must match exactly. Include identity_number, document_type and issuing_country; each must also be required under User checks.',
                },
                agreement: { type: 'string', minLength: 1, maxLength: 256 },
              }),
            ],
          },
          permissions: {
            type: 'array',
            minItems: 1,
            maxItems: 4,
            uniqueItems: true,
            items: {
              enum: [
                'account:read',
                'contracts:request',
                'operations:request',
                'members:manage',
                'owners:manage',
              ],
            },
          },
        }),
      }),
    },
    async (request) => {
      sameOrigin(request);
      return configured().mutate(
        await operator(request),
        String(request.headers['idempotency-key']),
        'update',
        { ...request.body, id: request.params.id },
      );
    },
  );
  app.post<{ Params: { id: string }; Body: { expected_revision: number } }>(
    '/v1/provider/identities/:id/credentials',
    {
      bodyLimit: 1024,
      schema: schema('rotateProviderIdentityCredential', identity, {
        headers: keyHeaders,
        params: body(['id'], { id: target }),
        body: body(['expected_revision'], {
          expected_revision: { type: 'integer', minimum: 1 },
        }),
      }),
    },
    async (request) => {
      sameOrigin(request);
      return configured().mutate(
        await operator(request),
        String(request.headers['idempotency-key']),
        'rotate',
        { ...request.body, id: request.params.id },
      );
    },
  );
}
