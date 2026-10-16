import { operationGuides } from './api-guides.js';

/** A presentation-only view: the canonical contract and route handlers stay intact. */
export function liveApiSpecification<T extends object>(
  document: T,
  configuredProfile: boolean,
  financial: boolean,
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

Start with GET /v1/capabilities without authorization. configured=false means readiness gates are closed; 200 discovery alone does not prove vendor acceptance.

For protected calls, use the Application tokens panel when enabled: sign in as an allowed operator, choose a client/scopes, then Get token or Renew token. Otherwise choose Authorize and paste a short-lived application access token without the Bearer prefix. Never enter client secrets, vendor keys, owner ID tokens or the local wizard session token. Tokens are kept in page memory; reload or Logout to clear authorization. Do not share screenshots containing tokens, cURL commands, personal data or signatures.

Use real IDs returned by this deployment. POST requests can create records, incur vendor charges or issue usable signatures. Use a new UUIDv4 Idempotency-Key for each distinct mutation and retain the original key for retries. Reconcile unknown outcomes before retrying. Owner login, identity verification and provider review remain separate browser steps. Transfer authority comes from the current grant and configured provider policy.

See [operator testing instructions](https://moovha.github.io/wallet-provider-kit/docs/http-api.html#try-deployed-apis) for tokens, the first test and troubleshooting. Examples and documented responses below are schemas; the Server response section appears only after Execute.`;
  // Relative origin survives TLS ingress without trusting forwarded host headers.
  api.servers = [{ url: '/' }];
  for (const [path, methods] of Object.entries(api.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      const guide = operationGuides[operation.operationId ?? ''];
      if (configuredProfile && (!guide || (guide.financial && !financial))) {
        delete methods[method];
        continue;
      }
      if (!guide) continue;
      operation.summary = guide.title;
      operation.tags = [guide.group];
      operation.description = [
        guide.scope
          ? `Required application scope: **${guide.scope}**. Scopes alone do not grant account or spending authority.`
          : 'Public discovery; no access token required.',
        guide.prerequisite,
        method === 'post'
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
  if (typeof request.url !== 'string') throw new Error('Missing request URL.');
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
      'Live testing requires this provider HTTPS origin (or local loopback).',
    );
  }
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
