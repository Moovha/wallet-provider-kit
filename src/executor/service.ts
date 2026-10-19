import { ReplacementWorker } from './replacement-worker.js';
import { PayerOperations } from '../execution/operations.js';
import {
  checkedInspection,
  diagnoseExecution,
  type ProviderInspection,
  type NonceSnapshot,
} from '../execution/recovery.js';
import Fastify, { type FastifyRequest } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { randomUUID } from 'node:crypto';
import { AuthenticationError } from '../service/auth.js';
import { WalletProviderError } from '../domain/signing.js';
import { createAttemptLifecycle } from '../providers/attempt-lifecycle.js';
import { QuorumTransferObserver } from '../execution/chain.js';
import { resolveSecret } from '../deployment/config.js';
import type {
  ExecutionObserver,
  ExecutionProvider,
} from '../execution/types.js';
import {
  createServiceIdentity,
  canonicalServiceBody,
  canonicalServiceJson,
  signedServiceClient,
  serviceHash,
  type ServiceIdentity,
  type ServicePurpose,
} from './auth.js';
import {
  validateExecutionServiceConfiguration,
  type ExecutionServiceConfiguration,
} from './config.js';
import { createExecutorProvider } from './providers.js';
import {
  openExecutorDatabase,
  type ExecutorDatabase,
  type ExecutorRecord,
} from './storage.js';
import {
  executionPlanHash,
  executorProviderIdentity,
  validateExecutionDispatch,
  type ExecutionDispatch,
  type ExecutorReceipt,
} from './protocol.js';
import {
  dispatchSchema,
  executorReceiptSchema,
  executorCapabilitiesSchema,
} from './schemas.js';

export interface ExecutionServiceOptions {
  configuration?: ExecutionServiceConfiguration;
  directory?: string;
  /** Trusted embedding transport; production CLI uses HTTPS fetch. */
  request?: typeof fetch;
}
/** Independent dispatcher. It has sponsor access, no owner signing or grant-management endpoint. */
export async function createExecutionService(
  options: ExecutionServiceOptions = {},
) {
  if (process.env.GAE_SERVICE === 'exchange')
    throw new WalletProviderError('wallet_provider_configuration');
  const app = Fastify({
    logger: false,
    bodyLimit: 32768,
    requestTimeout: 15000,
    connectionTimeout: 10000,
    trustProxy: false,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: false,
        useDefaults: false,
      },
    },
  });
  let config: ExecutionServiceConfiguration | undefined;
  let identity: ServiceIdentity | undefined;
  let database: ExecutorDatabase | undefined;
  let operations: PayerOperations | undefined;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  let recoveryRun: Promise<void> | undefined;
  let recoveryStopped = false;
  let recoveryCursor = 0;
  const providers = new Map<
    string,
    { provider: ExecutionProvider; observer: ExecutionObserver }
  >();
  const requests = new WeakMap<
    FastifyRequest,
    { origin: string; requestId: string; purpose: ServicePurpose }
  >();
  try {
    if (options.configuration) {
      config = validateExecutionServiceConfiguration(options.configuration);
      identity = await createServiceIdentity(
        config.origin,
        config.signing,
        config.callers,
      );
      database = openExecutorDatabase(
        config,
        options.directory ?? process.cwd(),
      );
      for (const provider of config.providers)
        providers.set(provider.id + ':' + provider.revision, {
          provider: await createExecutorProvider(
            provider,
            options.directory ?? process.cwd(),
            options.request,
          ),
          observer: new QuorumTransferObserver(
            provider.rpc.endpoints.map((entry) => resolveSecret(entry)),
            provider.rpc.genesisHash,
            10000,
            options.request,
            provider.network,
          ),
        });
    }
    if (config?.operations && database) {
      const payers = config.providers.flatMap((provider) => {
        const observer = providers.get(provider.id + ':' + provider.revision)!
          .observer as QuorumTransferObserver;
        return provider.sponsors.map((sponsor) => ({
          address: sponsor.binding.address,
          balance: () => observer.payerBalance(sponsor.binding.address),
        }));
      });
      operations = new PayerOperations(
        config.operations,
        { transaction: (operation) => database!.operations(operation) },
        payers,
        config.origin,
        resolveSecret,
        options.request,
      );
    }
    app.addHook('onClose', async () => {
      await operations?.close();
      recoveryStopped = true;
      clearTimeout(recoveryTimer);
      await recoveryRun;
      database?.close();
    });
    await app.register(helmet);
    await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
    await app.register(swagger, {
      openapi: {
        openapi: '3.0.3',
        info: {
          title: 'Designated Execution Service',
          version: '0.1.0',
          description:
            'Authenticated immutable approved-action dispatch, independent durable attempts and read-only recovery. Fresh wallet authority is required before provider effects. Unconfigured and disabled services fail closed; no generic signing, arbitrary transaction or gas-funding endpoint.',
        },
        components: {
          securitySchemes: {
            serviceProof: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'wpk-service-request+jwt',
            },
          },
        },
      },
    });
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      staticCSP: true,
      transformSpecification(document) {
        const result = structuredClone(document) as {
          paths: Record<
            string,
            Record<
              string,
              { operationId?: string; summary?: string; description?: string }
            >
          >;
        };
        for (const methods of Object.values(result.paths))
          for (const operation of Object.values(methods)) {
            operation.summary = `[${config?.activation.enabled ? 'Configured' : 'Not enabled'}] ${operation.operationId ?? 'Execution service operation'}`;
            operation.description =
              (config?.activation.enabled
                ? 'Configured service; current signed authentication and wallet authority remain mandatory.'
                : 'Not enabled: configure and explicitly accept the execution service before protected requests can succeed.') +
              '\n\n' +
              (operation.description ?? '');
          }
        return result;
      },
      uiConfig: {
        persistAuthorization: false,
        validatorUrl: null,
        supportedSubmitMethods: ['get', 'post'],
        tryItOutEnabled: false,
        defaultModelsExpandDepth: -1,
      },
    });
    app.addHook('onRequest', async (_request, reply) => {
      reply.header('cache-control', 'no-store');
    });
    app.addHook('onSend', async (request, reply, payload) => {
      const context = requests.get(request);
      if (
        context &&
        identity &&
        typeof payload === 'string' &&
        reply.getHeader('content-type')?.toString().includes('json')
      ) {
        const signed = await identity.sign(
          context.origin,
          context.purpose,
          request.method,
          request.routeOptions.url!.replace(
            ':executionId',
            (request.params as { executionId?: string })?.executionId ?? '',
          ),
          JSON.parse(payload),
          { requestId: context.requestId, status: reply.statusCode },
        );
        reply.header('execution-service-proof', signed.proof);
        return canonicalServiceJson(JSON.parse(payload));
      }
      return payload;
    });
    app.setErrorHandler((error, request, reply) => {
      let status = 500;
      let code = 'internal_error';
      let outcome: string | undefined;
      if (error instanceof AuthenticationError) {
        status = error.status;
        code = error.message;
      } else if (error instanceof WalletProviderError) {
        status =
          error.code === 'wallet_authorization_denied'
            ? 403
            : error.code === 'wallet_attempt_conflict' ||
                error.code === 'wallet_attempt_pending'
              ? 409
              : error.code === 'wallet_provider_input'
                ? 422
                : 503;
        code = error.code;
        outcome = error.outcome;
      } else if (
        error &&
        typeof error === 'object' &&
        'statusCode' in error &&
        [400, 413, 415, 429].includes(Number(error.statusCode))
      ) {
        status = Number(error.statusCode);
        code = 'invalid_request';
      }
      reply
        .code(status)
        .type('application/problem+json')
        .send({
          status,
          code,
          request_id: request.id,
          ...(outcome ? { outcome } : {}),
        });
    });
    async function authenticate(
      request: FastifyRequest,
      purpose: ServicePurpose,
      path: string,
    ) {
      if (!config || !identity || !database || !config.activation.enabled)
        throw new WalletProviderError('wallet_provider_unavailable');
      if (request.url !== path) throw new AuthenticationError(401);
      const verified = await identity.verify(
        request.headers.authorization,
        purpose,
        request.method,
        path,
        request.body ?? null,
      );
      requests.set(request, { ...verified, purpose });
      database.fence();
      return verified.origin;
    }
    async function authorize(record: ExecutorRecord) {
      database!.fence();
      const current = database!.load(
        record.dispatch.execution_id,
        record.walletOrigin,
      );
      if (
        !current ||
        current.identityHash !== record.identityHash ||
        current.effectObserved ||
        database!.quarantined(current.dispatch.plan.sponsor.binding.address) ||
        Date.parse(current.dispatch.plan.action.expires_at) <= Date.now()
      )
        throw new WalletProviderError('wallet_authorization_denied');
      const callback = signedServiceClient(
        identity!,
        record.walletOrigin,
        options.request,
      );
      const value = await callback(
        'authority',
        'POST',
        '/v1/internal/execution-authority',
        {
          provider_id: record.dispatch.provider_id,
          provider_revision: record.dispatch.provider_revision,
          execution_id: record.dispatch.execution_id,
          action_id: record.dispatch.plan.action.action_id,
          plan_hash: executionPlanHash(record.dispatch.plan),
          request_hash: record.dispatch.wallet_attempt.requestHash,
        },
      );
      const expected = {
        allowed: true,
        provider_id: record.dispatch.provider_id,
        provider_revision: record.dispatch.provider_revision,
        action_id: record.dispatch.plan.action.action_id,
        execution_id: record.dispatch.execution_id,
        plan_hash: executionPlanHash(record.dispatch.plan),
        request_hash: record.dispatch.wallet_attempt.requestHash,
      };
      if (serviceHash(value) !== serviceHash(expected))
        throw new WalletProviderError('wallet_authorization_denied');
      database!.fence();
      if (Date.parse(record.dispatch.plan.action.expires_at) <= Date.now())
        throw new WalletProviderError('wallet_authorization_denied');
    }
    async function authorizeReplacement(
      record: ExecutorRecord,
      replacement: import('../execution/replacement.js').ReplacementAuthority,
    ) {
      database!.fence();
      const current = database!.load(
        record.dispatch.execution_id,
        record.walletOrigin,
      );
      if (
        !current ||
        current.identityHash !== record.identityHash ||
        current.effectObserved ||
        !config!.callers
          .find((caller) => caller.origin === record.walletOrigin)
          ?.providers.includes(record.dispatch.provider_id) ||
        Date.parse(current.dispatch.plan.action.expires_at) <= Date.now() ||
        !database!.replacementQuarantineAllowed(
          current,
          replacement.proposal.nonce,
        )
      )
        throw new WalletProviderError('wallet_authorization_denied');
      const proof = {
        provider_id: record.dispatch.provider_id,
        provider_revision: record.dispatch.provider_revision,
        execution_id: record.dispatch.execution_id,
        action_id: record.dispatch.plan.action.action_id,
        plan_hash: executionPlanHash(record.dispatch.plan),
        request_hash: record.dispatch.wallet_attempt.requestHash,
        replacement,
      };
      const callback = signedServiceClient(
        identity!,
        record.walletOrigin,
        options.request,
      );
      if (
        serviceHash(
          await callback(
            'authority',
            'POST',
            '/v1/internal/execution-authority',
            proof,
          ),
        ) !== serviceHash({ allowed: true, ...proof })
      )
        throw new WalletProviderError('wallet_authorization_denied');
      database!.fence();
      if (Date.parse(record.dispatch.plan.action.expires_at) <= Date.now())
        throw new WalletProviderError('wallet_authorization_denied');
    }
    async function receipt(
      record: ExecutorRecord,
      refresh = false,
    ): Promise<ExecutorReceipt> {
      const request = database!.request(record);
      let claim = await database!.journal.read(request);
      const selected = providers.get(
        record.dispatch.provider_id + ':' + record.dispatch.provider_revision,
      )!;
      let ownHash: string | undefined;
      const replacementHash = record.replacements
        ?.filter((entry) => ['accepted', 'observed'].includes(entry.state))
        .at(-1)?.transactionHash;
      if (claim?.state === 'unknown' && selected.provider.recover) {
        try {
          const recovered = await selected.provider.recover(
            record.dispatch.plan,
            { executionId: record.dispatch.execution_id, request },
          );
          if (recovered.accepted) {
            if (
              !recovered.transactionId ||
              !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
                recovered.transactionId,
              )
            )
              throw new WalletProviderError('wallet_provider_response');
            await database!.reconcile(
              request,
              {
                kind: 'relay_transaction',
                transactionId: recovered.transactionId,
              },
              'provider-execution:' + record.identityHash,
              async () => recovered.accepted,
            );
          }
        } catch {
          /* A read-only recovery failure never makes the provider attempt dispatchable. */
        }
        claim = await database!.journal.read(request);
      }
      if (
        claim?.state === 'succeeded' &&
        claim.result.kind === 'relay_transaction'
      ) {
        try {
          ownHash = await selected.provider.transactionHash(
            record.dispatch.plan,
            claim.result.transactionId,
          );
        } catch {
          /* Read-only chain search can recover a missing provider hash. */
        }
      }
      const providerConfiguration = config!.providers.find(
        (entry) =>
          entry.id === record.dispatch.provider_id &&
          entry.revision === record.dispatch.provider_revision,
      )!;
      let inspection: ProviderInspection | undefined;
      if (
        providerConfiguration.recovery &&
        selected.provider.inspect &&
        claim?.state === 'succeeded' &&
        claim.result.kind === 'relay_transaction'
      ) {
        try {
          inspection = checkedInspection(
            await selected.provider.inspect(
              record.dispatch.plan,
              claim.result.transactionId,
            ),
          );
        } catch {
          /* Provider hints remain unavailable; RPC observation is independent. */
        }
      }
      ownHash = replacementHash ?? ownHash;
      let observedFresh = false;
      if (ownHash && !/^0x[0-9a-fA-F]{64}$/.test(ownHash))
        throw new WalletProviderError('wallet_provider_response');
      if (refresh) {
        try {
          const { scanNextBlock, ...observation } =
            await selected.observer.observe(
              record.dispatch.plan,
              record.transactionHashes ?? [],
              ownHash,
              record.scanNextBlock,
            );
          if (
            !database!.observe(record, observation, scanNextBlock, operations)
          )
            throw new WalletProviderError(
              'wallet_attempt_unavailable',
              'unknown',
            );
          record = database!.load(
            record.dispatch.execution_id,
            record.walletOrigin,
          )!;
          observedFresh = true;
        } catch (error) {
          // Durable acceptance remains readable during RPC outages; no chain finality is asserted here.
          record = database!.load(
            record.dispatch.execution_id,
            record.walletOrigin,
          )!;
          if (
            error instanceof WalletProviderError &&
            error.code === 'wallet_attempt_pending'
          )
            throw error;
        }
      }
      if (providerConfiguration.recovery) {
        let snapshot: NonceSnapshot | undefined;
        if (selected.observer.nonceSnapshot) {
          try {
            snapshot = await selected.observer.nonceSnapshot(
              record.dispatch.plan,
              ownHash ?? inspection?.transactionHash,
            );
          } catch {
            /* Operational uncertainty cannot authorize effects. */
          }
        }
        record.startedAt ??= Date.now();
        const diagnosis = diagnoseExecution({
          plan: record.dispatch.plan,
          configuration: providerConfiguration.recovery,
          startedAt: record.startedAt,
          observation:
            observedFresh || record.observation?.chain_status === 'finalized'
              ? record.observation
              : undefined,
          inspection,
          knownNonce: record.providerNonce,
          snapshot,
        });
        record = database!.recovery(
          record,
          diagnosis,
          observedFresh,
          operations,
        );
      }
      return {
        ...(record.replacementStatus
          ? { replacement: record.replacementStatus }
          : {}),
        ...(inspection ? { provider_inspection: inspection } : {}),
        ...(record.recovery ? { recovery: record.recovery } : {}),
        contract: 'execution-dispatch-v1',
        execution_id: record.dispatch.execution_id,
        plan_hash: executionPlanHash(record.dispatch.plan),
        dispatch_status: !claim
          ? 'not_started'
          : claim.state === 'succeeded'
            ? 'accepted'
            : claim.state === 'pending' || claim.state === 'dispatch'
              ? 'pending'
              : claim.state === 'failed' && claim.failure.outcome !== 'unknown'
                ? 'failed'
                : 'unknown',
        ...(ownHash
          ? { transaction_hash: ownHash.toLowerCase() }
          : record.observation?.verification === 'rpc-quorum' &&
              record.observation.outcome === 'succeeded'
            ? { transaction_hash: record.observation.transaction_hash }
            : {}),
      };
    }
    app.get('/health/live', { schema: { hide: true } }, async () => ({
      status: 'live',
    }));
    app.get(
      '/health/ready',
      { schema: { hide: true } },
      async (_request, reply) => {
        const ready = !!database && (await database.ready());
        return reply.code(ready ? 200 : 503).send({
          status: ready ? 'ready' : 'unconfigured',
          ...(operations
            ? {
                operations: await operations
                  .health()
                  .catch(() => ({ status: 'unavailable' })),
              }
            : {}),
        });
      },
    );
    app.get(
      '/v1/executor-capabilities',
      {
        schema: {
          operationId: 'getExecutorCapabilities',
          response: { 200: executorCapabilitiesSchema },
          security: [{ serviceProof: [] }],
          description:
            'Authenticated discovery of provider IDs/revisions allowed for the pinned wallet origin. No credentials or sponsor bindings are exposed.',
        },
      },
      async (request) => {
        const origin = await authenticate(
          request,
          'capabilities',
          '/v1/executor-capabilities',
        );
        return {
          contract: 'execution-dispatch-v1',
          profiles: ['erc3009-executor-v1', 'approved-evm-executor-v1'],
          providers: config!.providers
            .filter((provider) =>
              config!.callers
                .find((caller) => caller.origin === origin)!
                .providers.includes(provider.id),
            )
            .map((provider) => ({
              id: provider.id,
              revision: provider.revision,
              ...(provider.replacement
                ? { replacement_contract: 'wpk-fee-only-replacement-v1' }
                : {}),
            })),
        };
      },
    );
    app.post<{ Body: ExecutionDispatch }>(
      '/v1/dispatches',
      {
        preParsing: canonicalServiceBody,
        schema: {
          operationId: 'dispatchApprovedExecution',
          security: [{ serviceProof: [] }],
          description:
            'Signed exact immutable dispatch. A duplicate identity joins its original durable attempt; unknown provider effects never dispatch again. Fresh wallet owner/grant/KYC/consent/approval and durable handoff authority is checked after preparation, claim and immediately before effects.',
          body: dispatchSchema,
          response: { 200: executorReceiptSchema },
        },
      },
      async (request) => {
        const origin = await authenticate(
          request,
          'dispatch',
          '/v1/dispatches',
        );
        const dispatch = structuredClone(request.body);
        const provider = config!.providers.find(
          (entry) =>
            entry.id === dispatch.provider_id &&
            entry.revision === dispatch.provider_revision,
        );
        if (
          !provider ||
          !config!.callers
            .find((caller) => caller.origin === origin)!
            .providers.includes(provider.id)
        )
          throw new WalletProviderError('wallet_authorization_denied');
        validateExecutionDispatch(dispatch, provider);
        let record = database!.load(dispatch.execution_id, origin);
        if (record && record.identityHash !== serviceHash(dispatch))
          throw new WalletProviderError('wallet_attempt_conflict');
        if (record && (await database!.journal.read(database!.request(record))))
          return receipt(record);
        // The callback validates the original wallet attempt even before this service has admitted it.
        const provisional: ExecutorRecord = record ?? {
          walletOrigin: origin,
          dispatch,
          identityHash: serviceHash(dispatch),
          revision: database!.revision,
          providerHash: serviceHash(executorProviderIdentity(provider)),
          observationRevision: 0,
        };
        const callback = signedServiceClient(
          identity!,
          origin,
          options.request,
        );
        const proof = {
          provider_id: dispatch.provider_id,
          provider_revision: dispatch.provider_revision,
          execution_id: dispatch.execution_id,
          action_id: dispatch.plan.action.action_id,
          plan_hash: executionPlanHash(dispatch.plan),
          request_hash: dispatch.wallet_attempt.requestHash,
        };
        if (
          serviceHash(
            await callback(
              'authority',
              'POST',
              '/v1/internal/execution-authority',
              proof,
            ),
          ) !== serviceHash({ allowed: true, ...proof })
        )
          throw new WalletProviderError('wallet_authorization_denied');
        if (Date.parse(dispatch.plan.action.expires_at) <= Date.now())
          throw new WalletProviderError('wallet_authorization_denied');
        record = database!.admit(origin, provisional.dispatch, provider);
        const selected = providers.get(provider.id + ':' + provider.revision)!;
        await selected.provider.prepare(dispatch.plan);
        await selected.observer.preflight(dispatch.plan);
        const attempt = database!.request(record);
        const lifecycle = createAttemptLifecycle('designated-execution-v1', {
          namespace: 'designated-execution-v1',
          journal: database!.journal,
          authorizeAttempt: async () => {
            await authorize(record!);
            return true;
          },
        });
        await lifecycle.execute(
          attempt,
          async () => {
            await authorize(record!);
            const transactionId = await selected.provider.submit(
              dispatch.plan,
              {
                executionId: dispatch.execution_id,
                request: attempt,
                authorizeEffect: () => authorize(record!),
              },
            );
            if (
              !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
                transactionId,
              )
            )
              throw new WalletProviderError(
                'wallet_provider_response',
                'unknown',
              );
            return { kind: 'relay_transaction', transactionId };
          },
          (result) => result,
        );
        return receipt(database!.load(dispatch.execution_id, origin)!);
      },
    );
    app.get<{ Params: { executionId: string } }>(
      '/v1/dispatches/:executionId',
      {
        schema: {
          operationId: 'getExecutorDispatch',
          security: [{ serviceProof: [] }],
          description:
            'Read-only durable recovery by stable execution ID. Provider hash and exact chain searches are hints for independent wallet verification. Never claims or submits an attempt.',
          params: {
            type: 'object',
            additionalProperties: false,
            required: ['executionId'],
            properties: {
              executionId: {
                type: 'string',
                pattern:
                  '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
              },
            },
          },
          response: { 200: executorReceiptSchema },
        },
      },
      async (request) => {
        const origin = await authenticate(
          request,
          'status',
          '/v1/dispatches/' + request.params.executionId,
        );
        const record = database!.load(request.params.executionId, origin);
        if (
          record &&
          !config!.callers
            .find((caller) => caller.origin === origin)!
            .providers.includes(record.dispatch.provider_id)
        )
          throw new WalletProviderError('wallet_authorization_denied');
        if (!record)
          throw new WalletProviderError('wallet_provider_unavailable');
        return receipt(record, true);
      },
    );
    await app.ready();
    if (config?.activation.enabled) operations?.start();
    if (
      config?.activation.enabled &&
      config.providers.some((provider) => provider.recovery)
    ) {
      const tick = async () => {
        try {
          const records = database!.pendingRecovery();
          const selected = records.length
            ? Array.from(
                { length: Math.min(4, records.length) },
                (_, index) =>
                  records[(recoveryCursor + index) % records.length],
              )
            : [];
          recoveryCursor = records.length
            ? (recoveryCursor + selected.length) % records.length
            : 0;
          await Promise.allSettled(
            selected.map(async (record) => {
              await receipt(record, true);
              const provider = providers.get(
                record.dispatch.provider_id +
                  ':' +
                  record.dispatch.provider_revision,
              )!;
              await new ReplacementWorker(
                database!,
                provider.provider,
                provider.observer,
                authorizeReplacement,
                operations,
              ).run(record);
            }),
          );
        } catch {
          /* Durable claims fence replacement effects when the next bounded cycle resumes. */
        }
        if (!recoveryStopped) {
          recoveryTimer = setTimeout(schedule, 15000);
          recoveryTimer.unref();
        }
      };
      const schedule = () => {
        recoveryRun = tick();
      };
      recoveryTimer = setTimeout(schedule, 15000);
      recoveryTimer.unref();
    }
    return app;
  } catch (error) {
    await app.close().catch(() => undefined);
    database?.close();
    throw error;
  }
}
