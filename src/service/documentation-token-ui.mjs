/** Deployed Swagger enhancement. No credentials or tokens enter browser storage. */
(() => {
  let panel;
  let session;
  let token;
  let clientId = '';
  let scopes = [];
  let managed = false;
  let requestInFlight;
  let mounted = false;
  let expiryTimer;
  let generation = 0;
  let clearManual = () => {};
  const scopeLabels = {
    'wallet:access': 'Request wallet access and share identity evidence',
    'wallet:access:read': 'Read access request status',
    'wallet:account:read': 'Read wallet account details',
    'wallet:provision': 'Create an accepted account’s wallet',
    'wallet:actions': 'Request transfer authorization',
    'wallet:actions:read': 'Read transfer authorization status',
    'wallet:sign': 'Sign an authorized transfer',
  };
  const message = (text) => {
    panel.querySelector('[role="status"]').textContent = text;
  };
  function clear() {
    generation++;
    token = undefined;
    managed = false;
    clearManual();
    clearInterval(expiryTimer);
    message(
      'Authorization cleared for future requests. Tokens already issued can still work until they expire. Reload this page to clear previous request and response details.',
    );
  }
  async function call(path, body) {
    const response = await fetch(path, {
      method: body ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    }).catch(() => {
      throw new Error(
        'Cannot reach token controls. Check your connection and try Check sign-in. If the problem continues, ask the provider administrator to check the service.',
      );
    });
    if (!response.ok) {
      if ([401, 403].includes(response.status)) {
        session = undefined;
        clear();
        throw new Error(
          'Sign in again with an account allowed to use token controls. If access is still denied, ask the provider administrator to check your account and the selected permissions. No wallet API request was retried.',
        );
      }
      throw new Error(
        response.status === 429
          ? 'Too many token requests. Wait one minute before getting or renewing a token.'
          : 'Could not get an application token. Ask the provider administrator to check this application’s registration, allowed scopes, secret and token issuer. No wallet API request was retried.',
      );
    }
    return response.json().catch(() => {
      throw new Error(
        'Token controls returned an unreadable response. Reload this page. If the problem continues, ask the provider administrator to check the service.',
      );
    });
  }
  function selection() {
    clear();
    clientId = panel.querySelector('select').value;
    const application = session?.applications.find(
      (item) => item.clientId === clientId,
    );
    scopes = [];
    const list = panel.querySelector('fieldset');
    list.replaceChildren();
    for (const scope of application?.scopes ?? []) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = scope;
      input.addEventListener('change', () => {
        clear();
        scopes = [...list.querySelectorAll('input:checked')].map(
          (item) => item.value,
        );
      });
      label.append(
        input,
        document.createTextNode(
          `${scopeLabels[scope] ?? 'API permission'} (${scope})`,
        ),
      );
      list.append(label);
    }
  }
  async function loadSession() {
    session = await call('/docs/operator/session');
    const select = panel.querySelector('select');
    select.replaceChildren();
    for (const application of session.applications) {
      const option = document.createElement('option');
      option.value = application.clientId;
      option.textContent = `${application.name} · ${application.clientId}`;
      select.append(option);
    }
    panel.querySelector('[data-controls]').hidden = false;
    selection();
    message(
      'Signed in to token controls. Select only the API permissions you need, then choose Get token.',
    );
  }
  function status() {
    if (!token) return;
    const seconds = Math.max(
      0,
      Math.floor((token.expires_at - Date.now()) / 1000),
    );
    message(
      seconds
        ? `Application token ready for ${session.applications.find((item) => item.clientId === clientId)?.name ?? 'the selected application'}; expires in ${seconds}s. Requests use its selected API permissions.`
        : 'Token expired. Renew token, or the next Execute will renew it before sending.',
    );
  }
  async function acquire() {
    if (requestInFlight) return requestInFlight;
    message('Getting application token…');
    const version = generation;
    const requestedClient = clientId;
    const requestedScopes = [...scopes];
    requestInFlight = (async () => {
      if (!clientId || !scopes.length)
        throw new Error(
          'Choose a calling application and at least one API permission (scope), then choose Get token.',
        );
      // Recheck the short operator session for every issuance; no unlimited background renewal.
      const current = await call('/docs/operator/session');
      const value = await call('/docs/operator/token', {
        client_id: requestedClient,
        scopes: requestedScopes,
        csrf: current.csrf,
      });
      if (
        typeof value.access_token !== 'string' ||
        !Number.isFinite(value.expires_at) ||
        value.expires_at <= Date.now()
      )
        throw new Error(
          'The token issuer returned a token this API cannot use. Ask the provider administrator to check the token format and expiry settings.',
        );
      if (version !== generation)
        throw new Error(
          'Token selection changed. Choose Get token for the application and permissions currently selected.',
        );
      clearManual();
      token = value;
      managed = true;
      clearInterval(expiryTimer);
      expiryTimer = setInterval(status, 1000);
      status();
    })()
      .catch((error) => {
        token = undefined;
        managed = false;
        throw error;
      })
      .finally(() => {
        requestInFlight = undefined;
      });
    return requestInFlight;
  }
  globalThis.wpkExplorerTokens = {
    attach(system) {
      clearManual = () => system.authActions.logout(['accessToken']);
    },
    async prepare(request) {
      const target = new URL(request.url, location.href);
      if (
        !target.pathname.startsWith('/v1/') ||
        target.pathname === '/v1/capabilities' ||
        !managed
      )
        return request;
      try {
        if (!token || token.expires_at <= Date.now() + 30000) await acquire();
        if (!managed || !token)
          throw new Error(
            'Token selection changed. Get a token before sending.',
          );
        request.headers = {
          ...request.headers,
          Authorization: `Bearer ${token.access_token}`,
        };
        return request;
      } catch (error) {
        message(error.message);
        throw error;
      }
    },
    mount() {
      if (mounted) return;
      mounted = true;
      panel = document.createElement('section');
      panel.className = 'wpk-token-panel';
      panel.setAttribute('aria-label', 'Application token controls');
      panel.innerHTML = `<h2>Application tokens</h2>
<p>Sign in with a staff account allowed to use these controls. Choose a calling application and the API permissions it needs, then get its access token. Application secrets stay on the server. Tokens do not replace wallet owner consent or account permissions.</p>
<p><a href="/docs/operator/login">Sign in to token controls</a> <button type="button" data-session>Check sign-in</button></p>
<div data-controls hidden><label>Calling application <select aria-label="Token application"></select></label><p>API permissions (scopes): select only what you need for this test.</p><fieldset aria-label="Token scopes"></fieldset>
<button type="button" data-get>Get token</button><button type="button" data-renew>Renew token</button><button type="button" data-clear>Clear token</button><button type="button" data-logout>Sign out of token controls</button></div>
<p role="status" aria-live="polite">Checking sign-in…</p>
<p>Renew token requests a new access token from your token service. After Get token, Execute renews a token nearing expiry before sending your request. It never retries a wallet API call automatically. Reload clears the token and earlier responses. Token requests may count toward your login provider’s usage limits.</p>`;
      document.querySelector('#swagger-ui').before(panel);
      panel.querySelector('select').addEventListener('change', selection);
      const action = (selector, callback) =>
        panel.querySelector(selector).addEventListener('click', () =>
          Promise.resolve()
            .then(callback)
            .catch((error) => message(error.message)),
        );
      action('[data-session]', loadSession);
      action('[data-get]', acquire);
      action('[data-renew]', acquire);
      action('[data-clear]', clear);
      action('[data-logout]', async () => {
        try {
          await call('/docs/operator/logout', { csrf: session.csrf });
        } finally {
          session = undefined;
          clear();
          panel.querySelector('[data-controls]').hidden = true;
          message(
            'Signed out of token controls in this browser. Sign in again to get tokens. Tokens already issued remain valid until expiry.',
          );
        }
      });
      loadSession().catch(() =>
        message(
          'Sign in with a staff account allowed to use token controls. If you already have an application access token, use Authorize instead.',
        ),
      );
    },
  };
})();
