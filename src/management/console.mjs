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

let cognitoSession = false;
let token = '',
  expiresAt = 0,
  generation = 0;
const el = (id) => document.getElementById(id);
function message(value, error = false) {
  el('message').textContent = value;
  el('message').dataset.kind = error ? 'error' : 'status';
}
async function api(path, method = 'GET', data, authorized = true, network) {
  const started = generation;
  const headers = { 'content-type': 'application/json' };
  if (network) headers['wallet-network'] = network;
  if (authorized) {
    if (!token || Date.now() >= expiresAt) {
      logout();
      throw new Error('Your session expired. Sign in again.');
    }
    headers.authorization = 'Bearer ' + token;
  }
  if (['POST', 'PATCH', 'PUT'].includes(method))
    headers['idempotency-key'] = crypto.randomUUID();
  const response = await fetch(path, {
    method,
    headers,
    credentials: path.startsWith('/admin/auth/') ? 'same-origin' : 'omit',
    cache: 'no-store',
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  if (!response.ok) {
    if (response.status === 401 && authorized) logout();
    const descriptions = {
      401: authorized
        ? 'Your sign-in has ended. Please sign in again to continue.'
        : path.startsWith('/admin/auth/email/')
          ? 'The email code could not be verified or the verification session has expired. Check the code or sign in again.'
          : path.startsWith('/admin/auth/')
            ? 'Your sign-in could not be completed. Sign in again.'
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
      message(error.message, true);
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
  await acceptSession(result);
}
async function acceptSession(result) {
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
el('cognito-send-code').onclick = run(async () => {
  await api('/admin/auth/email/send', 'POST', {}, false);
  message('Check your administrator email for the verification code.');
});
el('cognito-verify-form').onsubmit = run(async () => {
  const form = el('cognito-verify-form');
  const code = form.elements.code.value;
  form.reset();
  const result = await api('/admin/auth/email/verify', 'POST', { code }, false);
  location.assign(result.url);
});
el('logout').onclick = run(async () => {
  const external = cognitoSession;
  cognitoSession = false;
  logout();
  if (external) {
    const result = await api('/admin/auth/logout', 'POST', {}, false);
    location.assign(result.url);
  }
});
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
function renderNetworks(settings) {
  const root = el('network-settings');
  root.replaceChildren();
  const form = node('form', undefined, root);
  const selected = new Map();
  for (const network of settings.available) {
    const label = node('label', undefined, form),
      input = node('input', undefined, label);
    input.type = 'checkbox';
    input.checked = settings.networks.includes(network.network);
    input.disabled = network.network === settings.default_network;
    label.append(
      document.createTextNode(
        network.name + (input.disabled ? ' · default' : ''),
      ),
    );
    selected.set(network.network, input);
  }
  node(
    'p',
    'Your default stays unchanged for existing applications. New networks start with wallet operations disabled and need their own transaction rules and fee funding.',
    form,
  );
  node(
    'p',
    settings.restart_required
      ? 'Saved changes are waiting. Ask the service operator to restart the provider to apply them. Current wallets continue using the running settings until then.'
      : 'Saved network choices match the running service.',
    form,
  );
  const button = node('button', 'Save network choices', form);
  button.className = 'primary';
  form.onsubmit = run(async () => {
    const networks = [...selected]
      .filter(([, input]) => input.checked)
      .map(([network]) => network);
    const saved = await api('/v1/provider/networks', 'POST', {
      expected_revision: settings.revision,
      networks,
    });
    renderNetworks(saved);
    message('Network choices saved. Restart the provider to apply changes.');
  });
}
async function renderNetworkFees(parent, record, networks) {
  const section = node('details', undefined, parent);
  node('summary', 'Wallet services', section);
  node(
    'p',
    'Configure connections, agree fee limits and prepare wallet services for this application.',
    section,
  );
  if (!record.enabled || !record.policy?.assertionTrust) {
    node(
      'p',
      'Save the user-check agreement and enable this connection first.',
      section,
    );
    return;
  }
  const label = node('label', 'Network', section);
  const selector = node('select', undefined, label);
  for (const network of networks.networks) {
    const option = node('option', network.name, selector);
    option.value = network.network;
  }
  selector.value = networks.default_network;
  const content = node('div', undefined, section);
  const applicationId = [
    ...new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(
          JSON.stringify([
            'runtime-application-v1',
            record.policy.issuer,
            record.id,
          ]),
        ),
      ),
    ),
  ]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const chains = {
    base: 'eip155:8453',
    'base-sepolia': 'eip155:84532',
    ethereum: 'eip155:1',
    'ethereum-sepolia': 'eip155:11155111',
  };
  let loadVersion = 0;
  async function load() {
    const version = ++loadVersion;
    const network = selector.value;
    const networkName = networks.networks.find(
      (entry) => entry.network === network,
    )?.name;
    const request = (path, method = 'GET', data) =>
      api(path, method, data, true, network);
    content.replaceChildren();
    node('p', 'Checking fee setup…', content);
    try {
      const [obligations, funding] = await Promise.all([
        request('/v1/provider/applications/' + applicationId + '/obligations'),
        request(
          '/v1/provider/applications/' + applicationId + '/wallet-services',
        ),
      ]);
      if (version !== loadVersion || !token) return;
      content.replaceChildren();
      if (
        funding.chain_id !== chains[network] ||
        funding.application_id !== applicationId
      )
        throw new Error(
          'The funding details do not match this application and network. Check the setup before sharing the address.',
        );
      const terms = obligations.resources.find(
        (entry) => entry.kind === 'sponsorship',
      );
      if (terms && terms.value.chain_id !== chains[network])
        throw new Error(
          'The fee terms belong to another network. Ask the application team to correct them.',
        );
      node('h4', 'Fee terms', content);
      if (!terms) {
        node(
          'p',
          'Set the fee limits below to offer terms to this application.',
          content,
        );
      } else {
        node('p', 'Agreement: ' + terms.value.funding_agreement, content);
        node('p', 'Revision: ' + terms.revision, content);
        const eth = (value) => {
          const amount = BigInt(value);
          return (
            (amount / 10n ** 18n).toString() +
            '.' +
            (amount % 10n ** 18n).toString().padStart(18, '0')
          ).replace(/\.?0+$/, '');
        };
        if (terms.value.funding_mode === 'balance') {
          node('p', 'Funding: Application’s available ETH', content);
          node(
            'p',
            'Per-transaction limit: ' +
              eth(terms.value.maximum_transaction_fee_wei) +
              ' ETH',
            content,
          );
          node(
            'p',
            'Pending-fee limit: ' +
              eth(terms.value.maximum_pending_fees_wei) +
              ' ETH',
            content,
          );
        }
        if (terms.value.maximum_gas_budget_wei !== undefined)
          node(
            'p',
            'Total network-fee budget: ' +
              eth(terms.value.maximum_gas_budget_wei) +
              ' ETH (optional cumulative limit)',
            content,
          );
        node(
          'p',
          'Approval: ' +
            ({
              pending:
                terms.proposed_by === 'provider'
                  ? 'Awaiting application acceptance'
                  : 'Awaiting your review',
              accepted:
                terms.proposed_by === 'provider'
                  ? 'Application accepted'
                  : 'Approved',
              rejected: 'Declined',
            }[terms.decision] ?? 'Unavailable'),
          content,
        );
        if (terms.value.maximum_execution_accounts !== undefined)
          node(
            'p',
            'Maximum wallets covered: ' +
              terms.value.maximum_execution_accounts,
            content,
          );
        if (terms.value.maximum_in_flight_per_sponsor !== undefined)
          node(
            'p',
            'Pending-operation limit: ' +
              terms.value.maximum_in_flight_per_sponsor,
            content,
          );
        const developer = node('details', undefined, content);
        node('summary', 'Developer details', developer);
        node('pre', JSON.stringify(terms, null, 2), developer);
        if (terms.proposed_by !== 'provider' && terms.decision !== 'accepted') {
          action(content, 'Approve fee terms', async () => {
            if (
              !confirm(
                'Approve these fee terms on ' +
                  networkName +
                  '? No funds will be sent.',
              )
            )
              return;
            await request(
              '/v1/provider/applications/' +
                applicationId +
                '/obligations/sponsorship/decision',
              'POST',
              {
                expected_revision: terms.revision,
                expected_decision_revision: terms.decision_revision,
                decision: 'accepted',
              },
            );
            await load();
          });
        }
      }
      const editor = node('details', undefined, content);
      node('summary', terms ? 'Change fee limits' : 'Set fee limits', editor);
      if (!terms) editor.open = true;
      const form = node('form', undefined, editor);
      const input = (title, value = '', required = true) => {
        const label = node('label', title, form);
        const control = node('input', undefined, label);
        control.value = value;
        control.required = required;
        return control;
      };
      const toEth = (value) => {
        if (value === undefined) return '';
        const amount = BigInt(value);
        const fraction = (amount % 10n ** 18n)
          .toString()
          .padStart(18, '0')
          .replace(/0+$/, '');
        return (
          (amount / 10n ** 18n).toString() + (fraction ? '.' + fraction : '')
        );
      };
      const fromEth = (value) => {
        if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/.test(value))
          throw new Error(
            'Enter a positive ETH amount with at most 18 decimal places.',
          );
        const [whole, fraction = ''] = value.split('.');
        const amount =
          BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
        if (amount <= 0n || amount >= 2n ** 256n)
          throw new Error(
            'Enter a positive ETH amount within the supported range.',
          );
        return amount.toString();
      };
      const agreement = input(
        'Agreement reference',
        terms?.value.funding_agreement,
      );
      agreement.maxLength = 256;
      const perTransaction = input(
        'Per-transaction limit (ETH)',
        toEth(terms?.value.maximum_transaction_fee_wei),
      );
      const pending = input(
        'Pending-fee limit (ETH)',
        toEth(terms?.value.maximum_pending_fees_wei),
      );
      node(
        'p',
        'Pending fees cover transactions whose final result is not yet confirmed.',
        form,
      );
      const total = input(
        'Total budget (ETH, optional)',
        toEth(terms?.value.maximum_gas_budget_wei),
        false,
      );
      const wallets = input(
        'Maximum wallets covered',
        String(terms?.value.maximum_execution_accounts ?? ''),
      );
      const operations = input(
        'Maximum pending transactions',
        String(terms?.value.maximum_in_flight_per_sponsor ?? '1'),
      );
      for (const [control, max] of [
        [wallets, 100000],
        [operations, 16],
      ]) {
        control.type = 'number';
        control.min = '1';
        control.max = String(max);
        control.step = '1';
      }
      node(
        'p',
        'Saving replaces the current fee terms and requires fresh application acceptance. No funds are sent.',
        form,
      );
      const save = node('button', 'Save fee terms', form);
      save.type = 'submit';
      form.onsubmit = run(async () => {
        const value = {
          chain_id: chains[network],
          funding_agreement: agreement.value.trim(),
          funding_mode: 'balance',
          maximum_transaction_fee_wei: fromEth(perTransaction.value.trim()),
          maximum_pending_fees_wei: fromEth(pending.value.trim()),
          ...(total.value.trim()
            ? { maximum_gas_budget_wei: fromEth(total.value.trim()) }
            : {}),
          account_model: 'provider-controlled-user-safe',
          asset_model: 'individual-user-wallets',
          maximum_execution_accounts: Number(wallets.value),
          maximum_in_flight_per_sponsor: Number(operations.value),
          ...(terms?.value.gas_limits
            ? { gas_limits: terms.value.gas_limits }
            : {}),
        };
        await request(
          '/v1/provider/applications/' +
            applicationId +
            '/obligations/sponsorship',
          'PUT',
          { expected_revision: terms?.revision ?? '0', value },
        );
        await load();
      });
      node('h4', 'Blockchain connections', content);
      const services = obligations.resources.find(
        (entry) => entry.kind === 'services',
      );
      node(
        'p',
        services?.decision === 'accepted'
          ? 'Connections approved for this application and network.'
          : 'Add connections to read blockchain state and submit transactions.',
        content,
      );
      if (services?.decision === 'accepted') {
        const saved = node('div', undefined, content);
        saved.setAttribute('role', 'status');
        node('strong', 'Connections saved for ' + networkName + '.', saved);
        const purposes = [
          ['rpc-verification', 'Blockchain checks'],
          ['rpc-submission', 'Transaction submission'],
          ['rpc-observation', 'Extra transaction checks'],
        ];
        const list = node('ul', undefined, saved);
        for (const [kind, title] of purposes) {
          const count = services.value.filter(
            (entry) => entry.kind === kind,
          ).length;
          if (count) node('li', title + ': ' + count + ' saved', list);
        }
        node(
          'small',
          'API keys are hidden. Blank inputs do not mean they are missing.',
          saved,
        );
      }
      const connections = node('details', undefined, content);
      node(
        'summary',
        services ? 'Replace connections' : 'Configure connections',
        connections,
      );
      const connectionForm = node('form', undefined, connections);
      connectionForm.className = 'connection-form';
      node(
        'p',
        'Add your provider API keys. We use the network selected above.',
        connectionForm,
      );
      if (services)
        node(
          'small',
          'Saved keys are hidden. Enter the complete set of replacement keys to change these connections.',
          connectionForm,
        );
      const providerGrid = node('div', undefined, connectionForm);
      providerGrid.className = 'provider-grid';
      const providers = [
        {
          id: 'alchemy',
          name: 'Alchemy',
          role: 'Primary connection',
          description: 'Reads blockchain state and submits transactions.',
          link: 'https://dashboard.alchemy.com/',
        },
        {
          id: 'drpc',
          name: 'dRPC',
          role: 'Independent check · backup',
          description:
            'Checks results independently and provides a second connection.',
          link: 'https://drpc.org/dashboard',
        },
        {
          id: 'etherscan',
          name: 'Etherscan',
          role: 'Transaction checks · optional',
          description: 'Checks transaction results and contract data.',
          link: 'https://etherscan.io/myapikey',
        },
      ].map((provider) => {
        const card = node('fieldset', undefined, providerGrid);
        card.className = 'provider-card';
        node('legend', provider.name, card);
        node('small', provider.role, card).className = 'provider-role';
        node('p', provider.description, card);
        const label = node('label', provider.name + ' API key', card);
        const control = node('input', undefined, label);
        control.type = 'password';
        control.autocomplete = 'off';
        control.spellcheck = false;
        control.maxLength = 256;
        control.placeholder = services
          ? 'Enter replacement API key'
          : 'Paste API key';
        const link = node('a', 'Get an API key', card);
        link.href = provider.link;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.referrerPolicy = 'no-referrer';
        return { ...provider, control };
      });
      const custom = node('div', undefined, connectionForm);
      const customInputs = [];
      let customNumber = 0;
      const addCustom = node('button', 'Add custom provider', connectionForm);
      addCustom.type = 'button';
      addCustom.onclick = () => {
        if (customInputs.length >= 3) return;
        const card = node('fieldset', undefined, custom);
        node('legend', 'Custom provider ' + ++customNumber, card);
        const urlLabel = node('label', 'Custom HTTPS URL', card);
        const control = node('input', undefined, urlLabel);
        control.type = 'password';
        control.autocomplete = 'off';
        control.spellcheck = false;
        control.maxLength = 4096;
        control.required = true;
        control.placeholder = 'https://…';
        const roleLabel = node('label', 'Use this connection for', card);
        const role = node('select', undefined, roleLabel);
        for (const [value, title] of [
          ['full', 'Blockchain checks and submission'],
          ['verification', 'Blockchain checks only'],
          ['submission', 'Submission only'],
          ['observation', 'Extra transaction checks only'],
        ]) {
          node('option', title, role).value = value;
        }
        const item = { control, role, card };
        customInputs.push(item);
        const remove = node('button', 'Remove custom provider', card);
        remove.type = 'button';
        remove.onclick = () => {
          control.value = '';
          customInputs.splice(customInputs.indexOf(item), 1);
          card.remove();
          addCustom.disabled = false;
        };
        if (customInputs.length >= 3) addCustom.disabled = true;
        control.focus();
      };
      node(
        'small',
        funding.setup?.verification_mode === 'single'
          ? 'Add at least one connection for blockchain checks and submission.'
          : 'Independent verification requires two different providers, such as Alchemy and dRPC.',
        connectionForm,
      );
      node(
        'small',
        'Keys are encrypted when saved and are never shown again. Saving approves these connections; it sends no transactions.',
        connectionForm,
      );
      const saveConnections = node(
        'button',
        'Save and approve connections',
        connectionForm,
      );
      saveConnections.type = 'submit';
      saveConnections.className = 'primary';
      connectionForm.onsubmit = run(async () => {
        const selected = [];
        const add = (endpoint, role) => {
          if (role === 'full' || role === 'verification')
            selected.push({ kind: 'rpc-verification', endpoint });
          if (role === 'full' || role === 'submission')
            selected.push({ kind: 'rpc-submission', endpoint });
          if (role === 'observation')
            selected.push({ kind: 'rpc-observation', endpoint });
        };
        const alchemyNetworks = {
          base: 'base-mainnet',
          'base-sepolia': 'base-sepolia',
          ethereum: 'eth-mainnet',
          'ethereum-sepolia': 'eth-sepolia',
        };
        const drpcNetworks = {
          base: 'base',
          'base-sepolia': 'base-sepolia',
          ethereum: 'ethereum',
          'ethereum-sepolia': 'sepolia',
        };
        for (const { id, name, control } of providers) {
          const key = control.value.trim();
          if (!key) continue;
          if (
            !/^[A-Za-z0-9_-]{1,256}$/.test(key) ||
            (id === 'etherscan' && key.length < 8)
          )
            throw new Error(
              'Enter the ' + name + ' API key, without a URL or spaces.',
            );
          if (id === 'alchemy')
            add(
              'https://' +
                alchemyNetworks[network] +
                '.g.alchemy.com/v2/' +
                encodeURIComponent(key),
              'full',
            );
          else if (id === 'drpc')
            add(
              'https://lb.drpc.live/' +
                drpcNetworks[network] +
                '/' +
                encodeURIComponent(key),
              'full',
            );
          else
            add(
              'https://api.etherscan.io/v2/api?chainid=' +
                chains[network].split(':')[1] +
                '&apikey=' +
                encodeURIComponent(key),
              'observation',
            );
        }
        for (const { control, role } of customInputs) {
          const endpoint = control.value.trim();
          let url;
          try {
            url = new URL(endpoint);
          } catch {
            throw new Error(
              'Enter a complete HTTPS URL for the custom provider.',
            );
          }
          if (
            url.protocol !== 'https:' ||
            url.username ||
            url.password ||
            url.hash
          )
            throw new Error(
              'Use an HTTPS connection without a username, password or fragment.',
            );
          if (url.search && url.hostname !== 'api.etherscan.io')
            throw new Error(
              'Use a provider HTTPS URL with the API key in its path. Query-string credentials are not supported here.',
            );
          if (
            url.hostname === 'api.etherscan.io' &&
            role.value !== 'observation'
          )
            throw new Error(
              'Use Etherscan for extra transaction checks, or enter its API key in the Etherscan card.',
            );
          add(endpoint, role.value);
        }
        const checks = selected.filter((c) => c.kind === 'rpc-verification');
        const required = funding.setup?.verification_mode === 'single' ? 1 : 2;
        if (
          new Set(checks.map((c) => new URL(c.endpoint).origin)).size < required
        )
          throw new Error(
            required === 2
              ? 'Add Alchemy and dRPC keys, or two different custom providers, for independent checks.'
              : 'Add a provider for blockchain checks.',
          );
        if (!selected.some((c) => c.kind === 'rpc-submission'))
          throw new Error('Add a connection that can submit transactions.');
        for (const kind of [
          'rpc-verification',
          'rpc-submission',
          'rpc-observation',
        ])
          if (selected.filter((c) => c.kind === kind).length > 3)
            throw new Error('Use at most three connections for each purpose.');
        await request(
          '/v1/provider/applications/' + applicationId + '/connections',
          'PUT',
          {
            expected_revision: services?.revision ?? '0',
            connections: selected,
          },
        );
        for (const { control } of [...providers, ...customInputs])
          control.value = '';
        message(
          'Connections saved for ' + networkName + '. API keys are hidden.',
        );
        await load();
      });
      node('h4', 'Provisioning status', content);
      const progress = node('div', undefined, content);
      progress.setAttribute('aria-live', 'polite');
      let preparing = false;
      const phases = {
        'not-started': 'Not prepared',
        checking: 'Checking contracts and connections',
        deploying: 'Preparing the fee-paying contract',
        funding: 'Funding the fee deposit and transaction submitter',
        publishing: 'Configuring transaction submission',
        ready: 'Wallet services prepared',
        attention: 'Setup needs attention',
      };
      const showSetup = (status) => {
        progress.replaceChildren();
        const setup = status.setup;
        node('p', phases[setup?.phase] ?? 'Setup status unavailable', progress);
        if (setup) {
          node(
            'p',
            'Maximum cost per preparation: ' +
              toEth(setup.maximum_cost_wei) +
              ' ETH, including funds moved into wallet services.',
            progress,
          );
          if (setup.funding_allocation) {
            const allocation = setup.funding_allocation;
            node(
              'p',
              'Automatic funding targets: ' +
                allocation.paymasterBasisPoints / 100 +
                '% paymaster · ' +
                allocation.bundlerBasisPoints / 100 +
                '% bundler · ' +
                (allocation.provisioningBasisPoints
                  ? allocation.provisioningBasisPoints / 100 +
                    '% wallet provisioning · '
                  : '') +
                allocation.reserveBasisPoints / 100 +
                '% reserve, after the transaction-fee buffer.',
              progress,
            );
          }
          if (!setup.execution_enabled)
            node(
              'p',
              'User wallet execution is disabled. Preparing services does not enable it.',
              progress,
            );
          const steps = node('ul', undefined, progress);
          const labels = {
            'fee-contract': 'Fee-paying contract',
            'fee-deposit': 'Fee deposit',
            'submission-funding': 'Transaction submitter funding',
            'wallet-setup': 'Wallet setup',
          };
          const states = {
            confirmed: 'Confirmed',
            submitted: 'Waiting for confirmation',
            uncertain: 'Outcome uncertain — check before retrying',
            prepared: 'Prepared, awaiting dispatch',
          };
          for (const step of setup.transactions)
            node('li', labels[step.step] + ': ' + states[step.status], steps);
          if (
            !setup.running &&
            [
              'checking',
              'deploying',
              'funding',
              'publishing',
              'attention',
            ].includes(setup.phase)
          )
            node(
              'p',
              'Setup did not report completion. Refresh status before retrying; retries retain recorded transactions.',
              progress,
            );
        }
        if (preparing || setup?.running)
          node('p', 'Preparation in progress…', progress);
        else if (terms?.decision !== 'accepted')
          node(
            'p',
            'Fee terms must be accepted before preparing wallet services.',
            progress,
          );
        else if (services?.decision !== 'accepted')
          node('p', 'Save and approve blockchain connections first.', progress);
        else if (!setup)
          node(
            'p',
            'Update this service to show preparation progress before starting.',
            progress,
          );
        else
          action(
            progress,
            setup.phase === 'ready'
              ? 'Check and prepare wallet services'
              : 'Prepare wallet services',
            async () => {
              if (
                !confirm(
                  'Prepare wallet services on ' +
                    networkName +
                    '? This can deploy contracts and use up to ' +
                    toEth(setup.maximum_cost_wei) +
                    ' ETH from the application funding address. User wallet execution stays unchanged.',
                )
              )
                return;
              preparing = true;
              showSetup(status);
              const timer = setInterval(() => {
                void refreshSetup().catch(() => undefined);
              }, 2000);
              try {
                const result = await request(
                  '/v1/provider/applications/' +
                    applicationId +
                    '/wallet-services',
                  'POST',
                  { maximum_cost_wei: setup.maximum_cost_wei },
                );
                if (version === loadVersion && token) {
                  if (
                    result.application_id !== applicationId ||
                    result.chain_id !== chains[network]
                  )
                    throw new Error(
                      'Setup result belongs to another application or network.',
                    );
                  preparing = false;
                  showSetup(result);
                  message(
                    result.setup?.phase === 'ready'
                      ? 'Wallet services prepared.'
                      : 'Preparation returned without completion. Refresh status before retrying.',
                  );
                }
              } catch (error) {
                if (version === loadVersion && token) {
                  preparing = false;
                  await refreshSetup().catch(() => undefined);
                  message(
                    'Preparation did not report success. Check the recorded progress before retrying. ' +
                      error.message,
                    true,
                  );
                }
              } finally {
                clearInterval(timer);
                preparing = false;
              }
            },
          );
      };
      let polling = false;
      let setupStillRunning = funding.setup?.running ?? false;
      async function refreshSetup() {
        if (polling || version !== loadVersion || !token) return;
        polling = true;
        try {
          const latest = await request(
            '/v1/provider/applications/' + applicationId + '/wallet-services',
          );
          if (version !== loadVersion || !token) return;
          if (
            latest.application_id !== applicationId ||
            latest.chain_id !== chains[network]
          )
            throw new Error(
              'Setup status belongs to another application or network.',
            );
          setupStillRunning = latest.setup?.running ?? false;
          showSetup(latest);
        } finally {
          polling = false;
        }
      }
      showSetup(funding);
      if (funding.setup?.running) {
        const timer = setInterval(async () => {
          if (
            version !== loadVersion ||
            !token ||
            !section.open ||
            !setupStillRunning
          ) {
            clearInterval(timer);
            return;
          }
          await refreshSetup().catch(() => undefined);
        }, 2000);
      }
      action(content, 'Refresh provisioning status', refreshSetup);
      node('h4', 'Application funding address', content);
      if (
        funding.funding_address &&
        /^0x[0-9a-fA-F]{40}$/.test(funding.funding_address)
      ) {
        node('p', 'Network: ' + networkName + ' · Asset: ETH', content);
        node('code', funding.funding_address, content);
        node(
          'p',
          'Share this address with the application team for ETH funding on this network. It is separate from user deposits.',
          content,
        );
        node(
          'p',
          funding.setup?.phase === 'ready'
            ? 'Wallet services prepared. User-wallet readiness is separate.'
            : terms?.decision === 'accepted'
              ? 'The application can supply ETH on this network.'
              : 'Application acceptance is required before funding.',
          content,
        );
      } else {
        node(
          'p',
          'Prepare a dedicated address after saving the terms. No funds are sent.',
          content,
        );
        if (
          terms?.decision === 'accepted' ||
          (terms?.proposed_by === 'provider' && terms.decision === 'pending')
        )
          action(content, 'Prepare funding address', async () => {
            await request(
              '/v1/provider/applications/' +
                applicationId +
                '/wallet-services/funding-address',
              'POST',
              {},
            );
            await load();
          });
        else node('p', 'Save or approve the fee terms first.', content);
      }
    } catch (error) {
      if (version !== loadVersion || !token) return;
      content.replaceChildren();
      node(
        'p',
        'Wallet services are unavailable. Check the network and application agreement, then refresh.',
        content,
      );
      message(error.message, true);
    }
  }
  selector.onchange = run(load);
  action(section, 'Refresh wallet services', load);
  section.ontoggle = run(async () => {
    if (section.open) await load();
    else loadVersion++;
  });
}

async function refresh() {
  const status = await api('/v1/provider/status');
  const identities = [...status.applications, ...status.management_identities];
  const checks = status.user_checks;
  const networkSettings = status.network_settings;
  const networks = {
    default_network: networkSettings.default_network,
    networks: status.network_status,
  };
  renderUserChecks(checks);
  renderNetworks(networkSettings);
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
  for (const network of networks.networks ?? []) {
    const card = node(
      'div',
      network.name +
        (network.network === networks.default_network ? ' · default' : ''),
      el('status-cards'),
    );
    card.className = 'card';
    node(
      'strong',
      network.configured
        ? 'Wallet operations enabled'
        : 'Wallet operations disabled',
      card,
    );
    node(
      'p',
      'Shared user checks. Separate wallets, application approvals and fee funding.',
      card,
    );
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
        await renderNetworkFees(article, record, networks);
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
          'Review user checks, transaction rules, service connections and network fees before enabling wallet use.',
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

// Discover optional administrator sign-in without persisting authentication tokens.
(async () => {
  try {
    const response = await fetch('/admin/auth/options', {
      credentials: 'same-origin',
    });
    if (!response.ok) return;
    const options = await response.json();
    if (!options.cognito) return;
    el('cognito-login').hidden = false;
    if (new URL(location.href).searchParams.get('signin') === 'failed') {
      history.replaceState(null, '', '/admin/');
      message(
        'Sign-in was not completed. Use an approved administrator account and try again.',
        true,
      );
    }
    el('cognito-verify').hidden = !options.verifyEmail;
    if (options.sessionAvailable) {
      const session = await api('/admin/auth/session', 'POST', {}, false);
      cognitoSession = true;
      await acceptSession(session);
    }
  } catch {
    message(
      'Administrator sign-in is temporarily unavailable. Try again.',
      true,
    );
  }
})();
