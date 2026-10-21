const identityFieldChoices = [
  [
    'country',
    'Country',
    'For example, ZA. Agree whether this means residence or another country with each application.',
  ],
  [
    'identity_number',
    'ID number',
    'The identity document number, kept as text so leading zeros are preserved.',
  ],
  [
    'document_type',
    'Document type',
    'For example, national_id or passport. Agree the exact value with applications.',
  ],
  [
    'issuing_country',
    'Document issuing country',
    'Use an agreed country code, for example ZA. This is separate from residence.',
  ],
  ['given_name', 'Given name', 'For example, Alex.'],
  ['family_name', 'Family name', 'For example, Example.'],
  [
    'date_of_birth',
    'Date of birth',
    'Agree a date format with each application; the service checks presence, not age or date accuracy.',
  ],
  [
    'nationality',
    'Nationality',
    'Agree the accepted country codes with each application.',
  ],
];

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
function renderUserChecks(checks) {
  const container = el('user-check-settings');
  container.replaceChildren();
  if (!checks.available) {
    node(
      'p',
      'This installation uses provider-hosted identity review. Ask the service operator to review its installation settings; application user-check settings are unavailable here.',
      container,
    );
    return;
  }
  const form = node('form', undefined, container);
  node('h3', 'Information applications must provide', form);
  node(
    'p',
    'Only country is required in the starting configuration. Other fields are optional until you select them here. Applications must use the exact field names in the developer details.',
    form,
  );
  const group = node('fieldset', undefined, form);
  node('legend', 'Required information', group);
  const selected = new Map();
  for (const [name, title, example] of identityFieldChoices) {
    const label = node('label', undefined, group);
    const checkbox = node('input', undefined, label);
    checkbox.type = 'checkbox';
    checkbox.setAttribute('aria-label', title);
    checkbox.setAttribute('aria-describedby', 'user-check-help-' + name);
    checkbox.checked = checks.required_fields.includes(name);
    label.append(document.createTextNode(title));
    node('small', example, label).id = 'user-check-help-' + name;
    selected.set(name, checkbox);
  }
  const developer = node('details', undefined, form);
  node('summary', 'Developer details and additional information', developer);
  node(
    'p',
    'Field names: country (Country), given_name (Given name), family_name (Family name), date_of_birth (Date of birth), nationality (Nationality), identity_number (ID number), document_type (Document type), issuing_country (Document issuing country). Values must be nonempty text, up to 512 characters. No document upload is requested here.',
    developer,
  );
  const customLabel = node(
    'label',
    'Additional field names (one per line)',
    developer,
  );
  const custom = node('textarea', undefined, customLabel);
  custom.value = checks.required_fields
    .filter((name) => !selected.has(name))
    .join('\n');
  node(
    'small',
    'Use lowercase names such as residential_address. Start with a letter and use letters, numbers or underscores, up to 64 characters. Up to 16 fields in total. Agree their meaning and format with each application.',
    customLabel,
  );
  const levelLabel = node(
    'label',
    'Agreed label for completed identity checks',
    developer,
  );
  const level = node('input', undefined, levelLabel);
  level.value = checks.verification_level;
  level.required = true;
  level.maxLength = 100;
  node(
    'small',
    'Keep verified if that is the label you agreed with applications. The label does not describe or perform the checks; record those duties in each application’s agreement.',
    levelLabel,
  );
  function days(title, value, help) {
    const label = node('label', title, form);
    const input = node('input', undefined, label);
    Object.assign(input, {
      type: 'number',
      min: '1',
      max: '365',
      step: '1',
      required: true,
      value,
    });
    node('small', help, label);
    return input;
  }
  const age = days(
    'How recently must identity have been checked? (days)',
    checks.max_identity_age_days,
    'A check older than this is rejected. Choose 1–365 days based on your service’s requirements.',
  );
  const duration = days(
    'How long can wallet permission last? (days)',
    checks.max_access_days,
    'Choose 1–365 days. Identity or consent expiry can end access sooner. People must give permission again when access expires.',
  );
  node(
    'p',
    'Saving changed requirements ends existing wallet approvals and pending access requests for every application. People must approve the new terms before reconnecting. Saving identical settings keeps approvals in place. Wallets and their funds stay in place.',
    form,
  );
  node('button', 'Save user checks', form).className = 'primary';
  const steps = node('details', undefined, container);
  node('summary', 'How your developer connects this to wallet creation', steps);
  const sequence = node('ol', undefined, steps);
  for (const text of [
    'Read GET /v1/access-policy to see the required information and current terms.',
    'Complete the agreed checks and ask the person for permission inside the application. Submit that evidence to POST /v1/access-requests.',
    'When access is approved, use the returned account_id with POST /v1/accounts/{accountId}/provision to create the blockchain wallet. This is a separate step from obtaining permission.',
  ])
    node('li', text, sequence);
  form.onsubmit = run(async () => {
    const fields = [
      ...new Set([
        ...[...selected]
          .filter(([, checkbox]) => checkbox.checked)
          .map(([name]) => name),
        ...custom.value.split(/\s+/).filter(Boolean),
      ]),
    ];
    if (
      fields.length > 16 ||
      fields.some(
        (name) =>
          !/^[a-z][a-z0-9_]{0,63}$/.test(name) ||
          ['constructor', 'prototype'].includes(name),
      )
    )
      throw new Error(
        'Use up to 16 field names, starting with a lowercase letter and containing only lowercase letters, numbers or underscores. The names constructor and prototype are reserved.',
      );
    await api('/v1/provider/user-checks', 'POST', {
      expected_revision: checks.revision,
      required_fields: fields,
      verification_level: level.value,
      max_identity_age_days: Number(age.value),
      max_access_days: Number(duration.value),
    });
    await refresh();
    message(
      'User-check requirements saved. Applications must read the current access policy before requesting wallet permission.',
    );
  });
}
function renderWalletSharing(article, record, identities, checks) {
  const form = node('form', undefined, article);
  node('h4', 'Share wallets with selected applications', form);
  node(
    'p',
    'Let another application request access to a person’s existing wallet. The person must give that application its own permission. Wallet ownership and each application’s approvals stay separate.',
    form,
  );
  const toggleLabel = node('label', undefined, form);
  const enabled = node('input', undefined, toggleLabel);
  enabled.type = 'checkbox';
  enabled.setAttribute('aria-label', 'Allow wallet sharing');
  enabled.checked = Boolean(record.policy?.walletSharing);
  toggleLabel.append(document.createTextNode('Allow wallet sharing'));
  const group = node('fieldset', undefined, form);
  node('legend', 'Sharing settings', group);
  node('p', 'Applications allowed to request these wallets', group);
  const selectedApps = new Map();
  for (const candidate of identities.filter(
    (i) => i.role === 'application' && i.id !== record.id,
  )) {
    const label = node('label', undefined, group);
    const checkbox = node('input', undefined, label);
    checkbox.type = 'checkbox';
    checkbox.setAttribute(
      'aria-label',
      'Allow requests from ' + candidate.name,
    );
    checkbox.checked =
      record.policy?.walletSharing?.applications.includes(candidate.id) ??
      false;
    checkbox.disabled = !candidate.enabled || !candidate.policy?.assertionTrust;
    label.append(
      document.createTextNode(
        candidate.name +
          (checkbox.disabled
            ? ' — save its user-check agreement and activate it first'
            : ''),
      ),
    );
    selectedApps.set(candidate.id, checkbox);
  }
  if (!selectedApps.size)
    node('p', 'Add another application before enabling sharing.', group);
  node('p', 'Information that must match', group);
  node(
    'small',
    'Every selected value must match exactly. ID number, document type and issuing country are required for sharing. Add them under User checks first; existing users must submit updated checks. Names or country alone cannot identify a wallet owner.',
    group,
  );
  const required = ['identity_number', 'document_type', 'issuing_country'];
  const selectedFields = new Map();
  for (const field of [...new Set([...required, ...checks.required_fields])]) {
    const label = node('label', undefined, group);
    const checkbox = node('input', undefined, label);
    checkbox.type = 'checkbox';
    const title =
      identityFieldChoices.find(([name]) => name === field)?.[1] ?? field;
    checkbox.setAttribute('aria-label', 'Match ' + title);
    checkbox.checked =
      required.includes(field) ||
      (record.policy?.walletSharing?.matchingFields.includes(field) ?? false);
    checkbox.disabled = required.includes(field);
    label.append(
      document.createTextNode(
        title + (required.includes(field) ? ' (required)' : ''),
      ),
    );
    selectedFields.set(field, checkbox);
  }
  const agreementLabel = node('label', 'Sharing agreement reference', group);
  const agreement = node('input', undefined, agreementLabel);
  agreement.required = true;
  agreement.maxLength = 256;
  agreement.value = record.policy?.walletSharing?.agreement ?? '';
  node(
    'small',
    'Record your reviewed agreement to trust the selected applications to verify the same person and capture permission for this wallet connection. Save a reference, not private agreement contents.',
    group,
  );
  const sync = () => {
    group.hidden = !enabled.checked;
    group.disabled = !enabled.checked;
  };
  enabled.onchange = sync;
  sync();
  enabled.disabled =
    !checks.available ||
    (!record.policy?.assertionTrust && !record.policy?.walletSharing);
  if (enabled.disabled)
    node(
      'p',
      'Save this application’s user-check agreement before enabling sharing. Sharing is available in application-led installations.',
      form,
    );
  node(
    'p',
    'Changing or turning off sharing ends approvals granted through these settings. This application’s own wallet approvals remain in place.',
    form,
  );
  const save = node('button', 'Save wallet sharing', form);
  save.disabled = enabled.disabled;
  form.onsubmit = run(async () => {
    const applications = [...selectedApps]
      .filter(([, field]) => field.checked && !field.disabled)
      .map(([id]) => id);
    const matchingFields = [...selectedFields]
      .filter(([, field]) => field.checked)
      .map(([name]) => name);
    if (
      enabled.checked &&
      (!applications.length ||
        required.some((field) => !checks.required_fields.includes(field)))
    )
      throw new Error(
        'Select an active application with a saved user-check agreement, and require ID number, document type and issuing country under User checks.',
      );
    await api('/v1/provider/identities/' + record.id, 'PATCH', {
      expected_revision: record.revision,
      wallet_sharing: enabled.checked
        ? { applications, matchingFields, agreement: agreement.value }
        : null,
    });
    await refresh();
  });
}
async function refresh() {
  const [status, identities, checks] = await Promise.all([
    api('/v1/provider/status'),
    api('/v1/provider/identities'),
    api('/v1/provider/user-checks'),
  ]);
  renderUserChecks(checks);
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
        const memberLabel = node('label', undefined, form);
        const manageMembers = node('input', undefined, memberLabel);
        manageMembers.type = 'checkbox';
        manageMembers.setAttribute(
          'aria-label',
          'Let wallet owners manage shared-wallet members',
        );
        manageMembers.checked =
          record.policy?.permissions?.includes('members:manage') ?? false;
        memberLabel.append(
          document.createTextNode(
            'Let wallet owners manage shared-wallet members',
          ),
        );
        node(
          'small',
          'Owners must give separate permission for this. Invited people still verify their identity and approve access to the specific wallet. Existing personal wallets remain the default.',
          form,
        );
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
            permissions: [
              ...(select.value === 'contracts'
                ? ['account:read', 'contracts:request']
                : ['account:read']),
              ...(manageMembers.checked ? ['members:manage'] : []),
            ],
          });
          await refresh();
        });
        renderWalletSharing(article, record, identities, checks);
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
          'Review the shared requirements under User checks. Next, your developer can use the API to set up allowed transactions, network connections and who pays network fees. You’ll need to approve those settings separately before wallet use.',
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

// Enable form interaction only after every submit handler is installed.
for (const form of document.querySelectorAll('form[inert]')) form.inert = false;
el('console-loading').hidden = true;
