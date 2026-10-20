let token = '',
  expiresAt = 0;
const el = (id) => document.getElementById(id);
function message(value) {
  el('message').textContent = value;
}
async function api(path, method = 'GET', data, authorized = true) {
  const headers = { 'content-type': 'application/json' };
  if (authorized) {
    if (!token || Date.now() >= expiresAt) {
      logout();
      throw new Error('Your session expired. Sign in again.');
    }
    headers.authorization = 'Bearer ' + token;
  }
  if (['POST', 'PATCH'].includes(method))
    headers['idempotency-key'] = crypto.randomUUID();
  const response = await fetch(path, {
    method,
    headers,
    credentials: 'omit',
    cache: 'no-store',
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  if (!response.ok) {
    if (response.status === 401 && authorized) logout();
    const descriptions = {
      401: 'Sign-in credentials are invalid or expired.',
      403: 'Access denied. Check installation ownership, identity permissions or claim expiry.',
      409: 'The record changed or this request cannot be repeated. Refresh before trying again.',
      422: 'Check the supplied fields.',
      429: 'Too many attempts. Wait before trying again.',
      503: 'The service is unavailable. Check deployment status.',
    };
    throw new Error(
      descriptions[response.status] ||
        'The request failed. Refresh status before retrying.',
    );
  }
  return response.json();
}
function logout() {
  el('login').hidden = false;
  el('claim').hidden = true;
  el('show-login').setAttribute('aria-pressed', 'true');
  el('show-claim').setAttribute('aria-pressed', 'false');
  el('login').reset();
  el('claim').reset();
  token = '';
  expiresAt = 0;
  el('welcome').hidden = false;
  el('workspace').hidden = true;
  el('logout').hidden = true;
  el('credential-value').textContent = '';
  el('credential').hidden = true;
}
function run(action) {
  return async (event) => {
    event?.preventDefault();
    message('');
    const button = event?.submitter ?? event?.currentTarget;
    if (button instanceof HTMLButtonElement) button.disabled = true;
    try {
      await action(event);
    } catch (error) {
      message(error.message);
    } finally {
      if (button instanceof HTMLButtonElement) button.disabled = false;
    }
  };
}
async function signIn(username, password) {
  const client_id = /^(operator-|automation-)/.test(username)
    ? username
    : 'operator-' + username;
  const result = await api(
    '/oauth/token',
    'POST',
    {
      grant_type: 'client_credentials',
      client_id,
      client_secret: password,
      scope:
        'provider:manage wallet:configuration:read wallet:configuration:write wallet:execute:read',
    },
    false,
  );
  token = result.access_token;
  expiresAt = Date.now() + result.expires_in * 1000;
  el('session').textContent = 'Session: 5:00';
  el('welcome').hidden = true;
  el('workspace').hidden = false;
  el('logout').hidden = false;
  await refresh();
}
el('login').onsubmit = run(async () => {
  const form = el('login');
  const username = form.elements.username.value,
    password = form.elements.password.value;
  form.elements.password.value = '';
  await signIn(username, password);
});
el('claim').onsubmit = run(async () => {
  const form = el('claim');
  if (form.elements.password.value !== form.elements.confirmation.value)
    throw new Error('Passwords do not match.');
  const username = form.elements.username.value,
    password = form.elements.password.value;
  const input = { claim: form.elements.claim.value, username, password };
  form.reset();
  await api('/v1/provider/claim', 'POST', input, false);
  await signIn(username, password);
});
for (const mode of ['login', 'claim'])
  el('show-' + mode).onclick = () => {
    for (const other of ['login', 'claim']) {
      el(other).hidden = other !== mode;
      el('show-' + other).setAttribute('aria-pressed', String(other === mode));
    }
    message('');
  };
el('logout').onclick = logout;
for (const button of document.querySelectorAll('[data-view]'))
  button.onclick = () => {
    for (const other of document.querySelectorAll('[data-view]')) {
      const active = other === button;
      el(other.dataset.view).hidden = !active;
      other.setAttribute('aria-current', active ? 'page' : 'false');
    }
    message('');
  };
function node(tag, value, parent) {
  const n = document.createElement(tag);
  if (value !== undefined) n.textContent = value;
  parent?.append(n);
  return n;
}
function secret(record) {
  if (!record.client_secret) {
    message(
      'Request already completed. The credential is not shown again. Rotate it if it was not saved.',
    );
    return;
  }
  el('credential-value').textContent =
    'Client ID: ' + record.id + '\nClient secret: ' + record.client_secret;
  el('credential').hidden = false;
  el('credential').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
el('dismiss-secret').onclick = () => {
  el('credential-value').textContent = '';
  el('credential').hidden = true;
};
function action(parent, title, work) {
  const b = node('button', title, parent);
  b.onclick = run(work);
}
async function refresh() {
  const [status, identities] = await Promise.all([
    api('/v1/provider/status'),
    api('/v1/provider/identities'),
  ]);
  el('status-cards').replaceChildren();
  for (const [label, value] of [
    ['Management', 'Available'],
    ['Connected applications', String(status.applications.length)],
    [
      'Wallet operations',
      status.wallet_operations_enabled ? 'Enabled' : 'Disabled',
    ],
  ]) {
    const c = node('div', label, el('status-cards'));
    c.className = 'card';
    node('strong', value, c);
  }
  for (const [container, records] of [
    ['application-list', identities.filter((i) => i.role === 'application')],
    ['identity-list', identities.filter((i) => i.role !== 'application')],
  ]) {
    const list = el(container);
    list.replaceChildren();
    if (!records.length)
      node(
        'p',
        'No applications connected. Register one here or through the provider API.',
        list,
      );
    for (const record of records) {
      const article = node('article', undefined, list);
      node('h3', record.name, article);
      node('p', record.id, article);
      node(
        'p',
        (record.enabled ? 'Enabled' : 'Suspended') +
          ' · Revision ' +
          record.revision +
          (record.role === 'application'
            ? ' · Identity trust ' +
              (record.policy?.assertionTrust ? 'accepted' : 'not configured')
            : ' · ' + record.role),
        article,
      );
      const actions = node('div', undefined, article);
      actions.className = 'actions';
      if (record.role !== 'administrator') {
        action(actions, record.enabled ? 'Suspend' : 'Enable', async () => {
          await api('/v1/provider/identities/' + record.id, 'PATCH', {
            expected_revision: record.revision,
            enabled: !record.enabled,
          });
          await refresh();
        });
        action(actions, 'Rotate credential', async () => {
          if (
            !confirm(
              'Replace this identity’s credential and invalidate its existing tokens? Owner grants remain subject to current policy.',
            )
          )
            return;
          secret(
            await api(
              '/v1/provider/identities/' + record.id + '/credentials',
              'POST',
              { expected_revision: record.revision },
            ),
          );
          await refresh();
        });
      }
      if (record.role === 'application') {
        const form = node('form', undefined, article);
        const label = node(
          'label',
          'Identity and consent trust agreement reference',
          form,
        );
        const input = node('input', undefined, label);
        input.required = true;
        input.maxLength = 256;
        input.value = record.policy?.assertionTrust?.agreement ?? '';
        const permissionLabel = node(
          'label',
          'Owner permissions allowed by this registration',
          form,
        );
        const select = node('select', undefined, permissionLabel);
        for (const [value, text] of [
          ['read', 'Read accounts'],
          ['contracts', 'Read accounts and request approved contract calls'],
        ]) {
          const option = node('option', text, select);
          option.value = value;
        }
        select.value = record.policy?.permissions?.includes('contracts:request')
          ? 'contracts'
          : 'read';
        node('button', 'Save trust settings', form).className = 'primary';
        form.onsubmit = run(async () => {
          await api('/v1/provider/identities/' + record.id, 'PATCH', {
            expected_revision: record.revision,
            trust_agreement: input.value,
            permissions:
              select.value === 'contracts'
                ? ['account:read', 'contracts:request']
                : ['account:read'],
          });
          await refresh();
        });
        if (record.policy?.assertionTrust)
          action(actions, 'Remove identity trust', async () => {
            await api('/v1/provider/identities/' + record.id, 'PATCH', {
              expected_revision: record.revision,
              trust_agreement: null,
            });
            await refresh();
          });
        node(
          'p',
          'Configure action policies, service credentials and sponsorship through the application configuration APIs. Provider acceptance remains separate.',
          article,
        );
      }
    }
  }
}
for (const role of ['application', 'automation'])
  el('new-' + role).onsubmit = run(async () => {
    const form = el('new-' + role);
    const result = await api('/v1/provider/identities', 'POST', {
      name: form.elements.name.value,
      role,
    });
    form.reset();
    secret(result);
    await refresh();
  });
el('refresh').onclick = run(refresh);
setInterval(() => {
  if (!token) return;
  const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  el('session').textContent =
    'Session: ' +
    Math.floor(seconds / 60) +
    ':' +
    String(seconds % 60).padStart(2, '0');
  if (!seconds) {
    logout();
    message('Your session expired. Sign in again.');
  }
}, 1000);
