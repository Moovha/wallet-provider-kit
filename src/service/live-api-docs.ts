import {
  operationGuides,
  operationUnavailableReason,
  transactionBoundaryDescription,
  type ApiFeatures,
} from './api-guides.js';

/** A presentation-only view: the canonical contract and route handlers stay intact. */
export function liveApiSpecification<T extends object>(
  document: T,
  features: ApiFeatures,
): T {
  const result = structuredClone(document);
  const api = result as {
    info: { title: string; description?: string };
    servers?: { url: string }[];
    paths: Record<
      string,
      Record<
        string,
        {
          operationId?: string;
          description?: string;
          summary?: string;
          tags?: string[];
        }
      >
    >;
  };
  api.info.title = 'Provider API · Live testing';
  api.info.description = `**Live service: Execute sends a real request to this domain.**

All implemented provider API endpoints are listed, including unavailable profiles. **Not enabled** identifies a missing configuration prerequisite; **Configured** does not establish current access or readiness.

${transactionBoundaryDescription}

Start with GET /v1/capabilities without authorization. configured=false means the service is not ready for wallet operations. A 200 discovery response does not confirm that wallet creation, identity checks or recovery work.

For protected calls, use the Application tokens panel when enabled: sign in as an allowed operator, choose a calling application and the API permissions (scopes) you need, then Get token or Renew token. Otherwise choose Authorize and paste a short-lived application access token without the Bearer prefix. Never enter client secrets, vendor keys, owner ID tokens or the local wizard session token. Tokens are kept in page memory; reload or Logout to clear authorization. Do not share screenshots containing tokens, cURL commands, personal data or signatures.

Use real IDs returned by this deployment. POST requests can create records, incur vendor charges or issue usable signatures. Use a new UUIDv4 Idempotency-Key for each distinct mutation and retain the original key for retries. Reconcile unknown outcomes before retrying. In standard application-led access, first read GET /v1/access-policy. Submit identity and consent attestations from a trusted application; users remain in that application. Provider login and manual review apply only to hosted compatibility deployments. Optional staff sign-in is for token controls, not wallet users. Delegated transfers require the owner’s current access and transfer consent, identity acceptance and provider policy checks.

For a 401, obtain a current application token. For a 403, check the required scope and current owner access. For a 409, inspect the original attempt. For a 503 or a connection error, check service readiness and the outcome before retrying. A failed connection does not prove the request had no effect; preserve its idempotency key.

See [operator testing instructions](https://moovha.github.io/wallet-provider-kit/docs/http-api.html#try-deployed-apis) for tokens, the first test and troubleshooting. The request examples and response schemas below explain the format. After Execute, read Server response for the actual result from this deployment.`;
  // Relative origin survives TLS ingress without trusting forwarded host headers.
  api.servers = [{ url: '/' }];
  for (const [path, methods] of Object.entries(api.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      const guide = operationGuides[operation.operationId ?? ''];
      if (!guide) continue;
      const reason = operationUnavailableReason(
        operation.operationId!,
        features,
      );
      operation.summary = `[${reason ? 'Not enabled' : guide.scope || guide.serviceAuthenticated ? 'Configured' : 'Public'}] ${guide.title}`;
      operation.tags = [guide.group];
      operation.description = [
        reason
          ? `**Not enabled:** ${reason}. Visibility does not enable this operation.`
          : guide.scope || guide.serviceAuthenticated
            ? '**Configured:** Current authentication, authority and service readiness are still required.'
            : '**Public:** No token is required. Discovery reports readiness without enabling wallet operations.',
        guide.scope
          ? `Required application scope: **${guide.scope}**. Scopes alone do not grant account or spending authority.`
          : guide.serviceAuthenticated
            ? 'Requires a pinned signed service request. Application OAuth tokens are not accepted.'
            : 'Public discovery; no access token required.',
        guide.prerequisite,
        method === 'post' && !guide.serviceAuthenticated
          ? '**Live mutation.** Execute may create records, incur vendor charges or issue a usable signature. Supply your own real inputs and retain the idempotency key.'
          : '',
        operation.description ?? '',
        guide.success,
      ]
        .filter(Boolean)
        .join('\n\n');
    }
    if (!Object.keys(methods).length) delete api.paths[path];
  }
  return result;
}

/** Serialized by Swagger UI: keep this function self-contained for browser execution. */
export function liveRequestInterceptor(request: Record<string, unknown>) {
  if (typeof request.url !== 'string')
    throw new Error(
      'The request has no destination address. Reload the explorer and try again.',
    );
  const location = (
    globalThis as unknown as {
      location: {
        href: string;
        origin: string;
        hostname: string;
        protocol: string;
      };
    }
  ).location;
  const target = new URL(request.url, location.href);
  const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(
    location.hostname,
  );
  if (
    target.origin !== location.origin ||
    (location.protocol !== 'https:' && !loopback)
  ) {
    throw new Error(
      'Send requests only to the provider address shown in this explorer, using HTTPS. Local testing is supported on localhost. Requests to other sites are blocked.',
    );
  }
  if (target.pathname === '/v1/internal/execution-authority')
    throw new Error(
      'This endpoint requires a request-bound execution-service proof and cannot be called with an application token from the explorer.',
    );
  request.credentials = 'omit';
  request.redirect = 'error';
  const controller = (
    globalThis as unknown as {
      wpkExplorerTokens?: {
        prepare: (
          value: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>;
      };
    }
  ).wpkExplorerTokens;
  return controller ? controller.prepare(request) : request;
}

/** Called after Swagger renders; the optional local theme supplies the controller. */
export function mountDocumentationTokens() {
  (
    globalThis as unknown as { wpkExplorerTokens?: { mount: () => void } }
  ).wpkExplorerTokens?.mount();
}

/** Capture only the ability to clear manual bearer authorization when using managed tokens. */
export function documentationTokenPlugin(system: unknown) {
  (
    globalThis as unknown as {
      wpkExplorerTokens?: { attach: (value: unknown) => void };
    }
  ).wpkExplorerTokens?.attach(system);
  return {};
}
