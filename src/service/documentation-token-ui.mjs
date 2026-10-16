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
      'Application token cleared. Existing issued tokens expire normally.',
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
    });
    if (!response.ok) {
      if ([401, 403].includes(response.status)) {
        session = undefined;
        clear();
        throw new Error(
          'Sign in with an allowed token-operator account again. No API request was retried.',
        );
      }
      throw new Error(
        response.status === 429
          ? 'Token issuance is rate limited. Wait before renewing.'
          : 'Could not obtain a token. Check the configured client, scopes, secret and issuer. No API request was retried.',
      );
    }
    return response.json();
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
      label.append(input, document.createTextNode(scope));
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
      'Operator signed in. Select only the scopes needed, then Get token.',
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
        ? `Application token ready for ${clientId}; expires in ${seconds}s. Requests use the selected application and scopes.`
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
        throw new Error('Choose an application and at least one scope.');
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
        throw new Error('Issuer returned an unusable token.');
      if (version !== generation)
        throw new Error(
          'Token selection changed. Request a token for the current selection.',
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
<p>Sign in as an allowed token operator, choose an application and scopes, then obtain its token here. Client secrets stay on the server. Owner consent and API authority still apply.</p>
<p><a href="/docs/operator/login">Sign in as token operator</a> <button type="button" data-session>Check operator login</button></p>
<div data-controls hidden><label>Calling application <select aria-label="Token application"></select></label><fieldset aria-label="Token scopes"></fieldset>
<button type="button" data-get>Get token</button><button type="button" data-renew>Renew token</button><button type="button" data-clear>Clear token</button><button type="button" data-logout>Sign out operator</button></div>
<p role="status" aria-live="polite">Checking operator login…</p>
<p>Renew uses a new client-credentials grant. After Get token, Execute renews a token nearing expiry before sending; it never retries an API call automatically. Reload clears the token. Issuance may count toward your identity provider's usage.</p>`;
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
            'Operator signed out of this browser. Sign in again to obtain tokens.',
          );
        }
      });
      loadSession().catch(() =>
        message(
          'Sign in as an allowed token operator to obtain application tokens. Manual Authorize remains available.',
        ),
      );
    },
  };
})();
