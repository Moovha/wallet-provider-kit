let token = '',
  expiresAt = 0,
  generation = 0;
const el = (id) => document.getElementById(id);
function message(value) {
  el('message').textContent = value;
}
async function api(path, method = 'GET', data, authorized = true) {
  const started = generation;
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
      401: authorized
        ? 'Your sign-in has ended. Please sign in again to continue.'
        : 'We couldn’t sign you in. Check your username and password, then try again.',
      403:
        path === '/v1/provider/claim'
          ? 'This setup code was not accepted. Check that it is correct, unused and less than 30 minutes old. The person who installed the service can help renew an expired code.'
          : 'Your account cannot make this change. Ask your service administrator to check your access.',
      409: 'These details may have changed. Refresh the page and check whether your change was saved before trying again.',
      422: 'Some details need attention. Check the form and try again.',
      429: 'Please wait a minute before trying again.',
      503: 'The service cannot complete this request right now. Check its status before trying again.',
    };
    throw new Error(
      descriptions[response.status] ||
        'We couldn’t confirm the result. Refresh status and check whether your change was saved before trying again.',
    );
  }
  const result = await response.json();
  if (authorized && started !== generation)
    throw new Error(
      'The session ended before we could show the result. Sign in and check whether your change was saved before trying again.',
    );
  return result;
}
function logout() {
  generation++;
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
  el('session').textContent = 'Sign-in ends in 5:00';
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
      'This connection is already saved. Its secret can only be shown once. Replace the secret if you did not save it.',
    );
    return;
  }
  el('credential-value').textContent =
    'Connection ID (client_id): ' +
    record.id +
    '\nSecret (client_secret): ' +
    record.client_secret;
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
    ['Service administration', 'Available'],
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
        'No applications yet. Add your first one above, or ask your developer to connect it using the API.',
        list,
      );
    for (const record of records) {
      const article = node('article', undefined, list);
      node('h3', record.name, article);
      const details = node('details', undefined, article);
      node('summary', 'Connection details', details);
      node('p', 'Connection ID (client_id): ' + record.id, details);
      node('p', 'Settings revision: ' + record.revision, details);
      node(
        'p',
        (record.enabled ? 'Connection active' : 'Connection paused') +
          (record.role === 'application'
            ? ' · User checks: ' +
              (record.policy?.assertionTrust
                ? 'agreement saved'
                : 'agreement needed')
            : ' · ' +
              (record.role === 'administrator'
                ? 'Administrator'
                : 'Management tool')),
        article,
      );
      const actions = node('div', undefined, article);
      actions.className = 'actions';
      if (record.role !== 'administrator') {
        action(
          actions,
          record.enabled ? 'Pause connection' : 'Resume connection',
          async () => {
            await api('/v1/provider/identities/' + record.id, 'PATCH', {
              expected_revision: record.revision,
              enabled: !record.enabled,
            });
            await refresh();
          },
        );
        action(actions, 'Replace secret', async () => {
          if (
            !confirm(
              'Replace this secret? The current secret and access tokens will stop working. Existing wallet approvals stay in place, and wallet requests still go through all permission checks.',
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
        node(
          'p',
          'Pausing this connection blocks access and ends existing wallet approvals. Resuming it does not restore those approvals.',
          article,
        );
        const form = node('form', undefined, article);
        node('h4', 'User checks and permissions', form);
        node(
          'p',
          'Agree with the application’s team how they check identity and record each person’s permission. Save the reference to your reviewed agreement below; do not include private agreement contents.',
          form,
        );
        const label = node('label', 'Agreement reference', form);
        const input = node('input', undefined, label);
        input.required = true;
        input.maxLength = 256;
        input.value = record.policy?.assertionTrust?.agreement ?? '';
        const permissionLabel = node(
          'label',
          'What people can allow this application to do',
          form,
        );
        const select = node('select', undefined, permissionLabel);
        for (const [value, text] of [
          ['read', 'View wallet details'],
          [
            'contracts',
            'View wallet details and request approved transactions',
          ],
        ]) {
          const option = node('option', text, select);
          option.value = value;
        }
        select.value = record.policy?.permissions?.includes('contracts:request')
          ? 'contracts'
          : 'read';
        node('button', 'Save access settings', form).className = 'primary';
        node(
          'p',
          'Each person must still approve wallet access. Changing this agreement or these permissions ends existing approvals, so people will need to approve access again.',
          form,
        );
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
          action(actions, 'Stop accepting user checks', async () => {
            await api('/v1/provider/identities/' + record.id, 'PATCH', {
              expected_revision: record.revision,
              trust_agreement: null,
            });
            await refresh();
          });
        node(
          'p',
          'Next, your developer can use the API to set up allowed transactions, network connections and who pays network fees. You’ll need to approve those settings separately before wallet use.',
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
    'Sign-in ends in ' +
    Math.floor(seconds / 60) +
    ':' +
    String(seconds % 60).padStart(2, '0');
  if (!seconds) {
    logout();
    message('Your session expired. Sign in again.');
  }
}, 1000);
