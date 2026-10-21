import {
  operationGuides,
  apiTasks,
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
  api.info.title = 'Wallet service API · Try a request';
  api.info.description = `**Choose a task to see the requests you need. Start with Wallet access for the everyday user journey.**

Service operators can manage connections and user checks in [/admin/](/admin/). Application developers use the wallet and application setup requests. Optional identity integrations are for custom hosts and can be skipped in the standard flow.

**You are connected to a running service.** Execute sends a real request. Read why the request exists, who uses it, and its result before trying it. Not enabled means setup is missing; Configured means settings are present, while current permission and readiness are still checked.

Use an application token for application requests and a provider operator token for administration and review. Authorize accepts a short-lived access token, not a client secret, vendor key or identity token. The optional Application tokens panel supplies application tokens; it does not grant provider administration.

Start with GET /v1/capabilities to check connectivity without a token. Keep original IDs and retry keys after an uncertain result. A 401 needs a current token; for 403 check the caller’s permissions and owner access; for 409 inspect the original request and current revision. Investigate 503 or connection errors before repeating a mutation.

${transactionBoundaryDescription}

[Task guide and endpoint map](https://moovha.github.io/wallet-provider-kit/docs/api-endpoints.html) · [Authentication and retry guide](https://moovha.github.io/wallet-provider-kit/docs/http-api.html)`;
  Object.assign(api, { tags: apiTasks.map((task) => ({ ...task })) });
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
      const setupCode = operation.operationId === 'claimProviderInstallation';
      operation.summary = `[${reason ? 'Not enabled' : setupCode ? 'Setup code' : guide.scope || guide.serviceAuthenticated ? 'Configured' : 'Public'}] ${guide.title}`;
      operation.tags = [guide.group];
      operation.description = [
        reason
          ? `**Not enabled:** ${reason}. Visibility does not enable this operation.`
          : guide.scope || guide.serviceAuthenticated
            ? '**Configured:** Current authentication, authority and service readiness are still required.'
            : '**Public:** No token is required. Discovery reports readiness without enabling wallet operations.',
        guide.scope
          ? `Required token scope: **${guide.scope}**. Scopes alone do not grant account or spending authority.`
          : guide.serviceAuthenticated
            ? 'Requires a pinned signed service request. Application OAuth tokens are not accepted.'
            : setupCode
              ? 'Requires the private, unexpired, single-use installation setup code. No application token can replace it.'
              : 'Public read; no access token required.',
        ['post', 'put', 'patch'].includes(method) && !guide.serviceAuthenticated
          ? '**Live mutation.** Execute may create records, incur vendor charges or issue a usable signature. Supply your own real inputs and retain the idempotency key.'
          : '',
        operation.description ?? '',
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

/** Called after Swagger renders; task navigation never sends API requests. */
export function mountApiDocumentation() {
  (
    globalThis as unknown as { wpkApiNavigation?: { mount(): void } }
  ).wpkApiNavigation?.mount();
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

/** Serialized by Swagger UI; all navigation state stays in the page. */
export function apiNavigationPlugin(system: unknown) {
  interface NavigationElement {
    id: string;
    className: string;
    textContent: string | null;
    value: string;
    onchange: (() => void) | null;
    append(...children: NavigationElement[]): void;
    before(child: NavigationElement): void;
    setAttribute(name: string, value: string): void;
  }
  const document = (
    globalThis as unknown as {
      document: {
        getElementById(id: string): NavigationElement | null;
        querySelector(selector: string): NavigationElement | null;
        createElement(tag: string): NavigationElement;
      };
    }
  ).document;
  const ui = system as {
    getConfigs(): { walletApiTasks?: { name: string; description: string }[] };
    layoutActions: { updateFilter(value: string): void };
  };
  (
    globalThis as unknown as { wpkApiNavigation: { mount(): void } }
  ).wpkApiNavigation = {
    mount() {
      if (document.getElementById('wallet-api-navigation')) return;
      const root = document.querySelector('#swagger-ui');
      if (!root) return;
      const panel = document.createElement('section');
      panel.id = 'wallet-api-navigation';
      panel.className = 'wpk-api-navigation';
      panel.setAttribute('aria-label', 'Choose an API task');
      const heading = document.createElement('h2');
      heading.textContent = 'What do you want to do?';
      const label = document.createElement('label');
      label.textContent = 'Browse requests by task';
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Browse requests by task');
      const tasks = ui.getConfigs().walletApiTasks ?? [];
      for (const task of [
        ...tasks,
        {
          name: 'All requests',
          description:
            'Complete technical reference, including optional integrations. Each request still requires its own configured service and authority.',
        },
      ]) {
        const option = document.createElement('option');
        option.value = task.name === 'All requests' ? '' : task.name;
        option.textContent = task.name;
        select.append(option);
      }
      select.value = 'Wallet access';
      const description = document.createElement('p');
      description.textContent =
        tasks.find((task) => task.name === select.value)?.description ?? '';
      select.onchange = () => {
        ui.layoutActions.updateFilter(select.value);
        description.textContent =
          tasks.find((task) => task.name === select.value)?.description ??
          'Complete technical reference, including optional integrations. Choose a task to narrow the list.';
      };
      label.append(select);
      panel.append(heading, label, description);
      root.before(panel);
    },
  };
  return {};
}
