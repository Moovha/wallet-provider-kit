<script setup lang="ts">
import { computed, ref } from 'vue';
import { providerNetwork, type ProviderNetwork } from '../../src/networks';
import { FunctionFragment, getAddress } from 'ethers';
import PolicyAdapterSummary from './PolicyAdapterSummary.vue';
import PolicyAdapters from './PolicyAdapters.vue';
import { validateAdapterAmounts } from '../policy-forms';
import RuntimeContracts from './RuntimeContracts.vue';
import type {
  RuntimePolicy,
  RuntimePolicyProposal,
  RuntimePolicyRevision,
  RuntimeReview,
} from '../../src/runtime-configuration/service';
import type { WalletCallsStatus } from '../../src/wallet-calls/types';

type Proposal = RuntimePolicyProposal & { published_revision?: string };
type Application = {
  application_id: string;
  name: string;
  active_revision: string;
  publication?: RuntimePolicyRevision;
  review?: RuntimeReview;
  proposals_truncated?: boolean;
  proposals: Proposal[];
  publications: RuntimePolicyRevision[];
};
type Workspace = {
  network?: ProviderNetwork;
  role: 'provider' | 'application';
  applications: Application[];
};
type Batch = WalletCallsStatus & {
  account_id: string;
  sender: string;
  queue_stage: string;
  policy_revision: string;
  expires_at: string;
  application_id: string;
};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const credential = ref('');
let bearer = '';
let pending: { path: string; body: string; key: string } | undefined;
const workspace = ref<Workspace>();
const selected = ref('');
const application = computed(() =>
  workspace.value?.applications.find(
    (app) => app.application_id === selected.value,
  ),
);
const provider = computed(() => workspace.value?.role === 'provider');
const draft = ref<RuntimePolicy>();
const proposal = ref<Proposal>();
const reviewMode = ref<'automatic' | 'manual'>('automatic');
const busy = ref(false);
const error = ref('');
const notice = ref('');
const batches = ref<Batch[]>([]);
const truncated = ref(false);
const batchNotice = ref('');
const query = ref('');
const shownBatches = computed(() =>
  batches.value.filter(
    (batch) =>
      (!selected.value || batch.application_id === selected.value) &&
      `${batch.id} ${batch.account_id} ${batch.queue_stage}`
        .toLowerCase()
        .includes(query.value.toLowerCase()),
  ),
);
const statusNames: Record<number, string> = {
  100: 'Pending / unverified',
  200: 'Included successfully',
  400: 'Cancelled / expired before admission',
  500: 'Execution reverted',
};
const selectedBatch = ref<WalletCallsStatus>();
const terms = (policy: RuntimePolicy) =>
  `${policy.enabled ? 'Enabled' : 'Disabled'} · ${policy.maximum_calls} calls · ${policy.maximum_native_value_wei} wei · ${policy.max_validity_seconds}s validity`;
function baseline(): RuntimePolicy {
  return {
    version: '1',
    enabled: true,
    chain_id: providerNetwork(workspace.value?.network).caip,
    contracts: [],
    maximum_calls: 4,
    maximum_native_value_wei: '0',
    max_validity_seconds: 300,
    claim_requirements: [],
  };
}
async function request(path: string, body?: unknown) {
  if (
    location.protocol !== 'https:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  )
    throw new Error('Open this workspace over HTTPS.');
  const serialized = body === undefined ? undefined : JSON.stringify(body);
  if (serialized !== undefined) {
    if (!pending || pending.path !== path || pending.body !== serialized)
      pending = { path, body: serialized, key: crypto.randomUUID() };
  }
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${bearer}`,
      ...(body === undefined
        ? {}
        : {
            'content-type': 'application/json',
            'idempotency-key': pending!.key,
          }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    if (response.status === 409)
      throw new Error(
        'The policy or review decision changed. Refresh the workspace and review the latest revision before submitting again.',
      );
    if ([401, 403].includes(response.status))
      throw new Error(
        'Access denied. Check token expiry, scopes and the configured application or provider operator identity.',
      );
    throw new Error(
      `Request failed (${response.status}). Refresh and inspect the recorded outcome before submitting again.`,
    );
  }
  const result = await response.json();
  if (body !== undefined) pending = undefined;
  return result;
}
async function task(operation: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    await operation();
  } catch (failure) {
    error.value =
      failure instanceof Error ? failure.message : 'Request failed.';
  } finally {
    busy.value = false;
  }
}
function choose(id: string) {
  selected.value = id;
  proposal.value = undefined;
  draft.value = clone(application.value?.publication?.policy ?? baseline());
  reviewMode.value = application.value?.review?.mode ?? 'automatic';
}
async function load() {
  workspace.value = await request('/v1/runtime-configuration/workspace');
  await loadApplication(
    workspace.value!.applications.some(
      (app) => app.application_id === selected.value,
    )
      ? selected.value
      : (workspace.value!.applications[0]?.application_id ?? ''),
  );
}
async function loadApplication(id: string) {
  if (id) {
    workspace.value = await request(
      '/v1/runtime-configuration/workspace?application_id=' +
        encodeURIComponent(id),
    );
  }
  choose(id);
}
async function connect() {
  await task(async () => {
    bearer = credential.value.trim().replace(/^Bearer\s+/i, '');
    credential.value = '';
    await load();
  });
}
function disconnect() {
  pending = undefined;
  bearer = '';
  credential.value = '';
  workspace.value = undefined;
  draft.value = undefined;
  batches.value = [];
  selectedBatch.value = undefined;
  error.value = '';
  notice.value = '';
  batchNotice.value = '';
}
function editProposal(item: Proposal) {
  proposal.value = item;
  draft.value = clone(item.policy);
}
function validateDraft(policy: RuntimePolicy) {
  validateAdapterAmounts(policy.call_adapters);
  const maximum = BigInt(policy.maximum_native_value_wei);
  if (maximum >= 2n ** 256n)
    throw new Error('Total maximum wei must fit an unsigned 256-bit integer.');
  for (const [index, contract] of policy.contracts.entries()) {
    if (contract.methods.length < 1 || contract.methods.length > 32)
      throw new Error(
        `Contract ${index + 1}: select between 1 and 32 methods.`,
      );
    try {
      getAddress(contract.address);
      if (contract.implementation) getAddress(contract.implementation.address);
    } catch {
      throw new Error(`Check the address checksum for contract ${index + 1}.`);
    }
    const signatures = new Set<string>();
    for (const [methodIndex, method] of contract.methods.entries()) {
      try {
        if (
          FunctionFragment.from(method.signature).format('sighash') !==
          method.signature
        )
          throw new Error();
      } catch {
        throw new Error(
          `Contract ${index + 1}, method ${methodIndex + 1}: use a canonical ABI signature, for example deposit(uint256,address).`,
        );
      }
      if (signatures.has(method.signature))
        throw new Error(`Contract ${index + 1} contains a duplicate method.`);
      signatures.add(method.signature);
      if (BigInt(method.maximum_value_wei) > maximum)
        throw new Error(
          `Contract ${index + 1}, method ${methodIndex + 1}: maximum wei exceeds the provider total limit.`,
        );
    }
  }
  for (const claim of policy.claim_requirements) {
    if (
      claim.allowed_values.some((value) => !value.trim()) ||
      new Set(claim.allowed_values).size !== claim.allowed_values.length
    )
      throw new Error(
        'Each claim needs distinct, nonempty allowed values. Remove blank lines and duplicate values.',
      );
  }
}
const changes = computed(() => {
  if (!draft.value) return [];
  const current = application.value?.publication?.policy;
  if (!current)
    return [
      'Create the initial provider policy with the displayed contracts and requirements.',
    ];
  const result: string[] = [];
  for (const [name, before, after] of [
    ['Enabled', String(current.enabled), String(draft.value.enabled)],
    [
      'Maximum calls',
      String(current.maximum_calls),
      String(draft.value.maximum_calls),
    ],
    [
      'Total maximum wei',
      current.maximum_native_value_wei,
      draft.value.maximum_native_value_wei,
    ],
    [
      'Validity seconds',
      String(current.max_validity_seconds),
      String(draft.value.max_validity_seconds),
    ],
  ])
    if (before !== after) result.push(`${name}: ${before} → ${after}`);
  if (
    JSON.stringify(current.claim_requirements) !==
    JSON.stringify(draft.value.claim_requirements)
  )
    result.push(
      'Application claim requirements change. Review the required names, allowed values and evidence ages below.',
    );
  for (const [key, name] of [
    ['native_transfers', 'Native recipient permissions'],
    ['call_adapters', 'Optional operation adapters'],
  ] as const) {
    if (JSON.stringify(current[key]) !== JSON.stringify(draft.value[key]))
      result.push(
        `${name} change. Review the complete policy before publishing.`,
      );
  }
  for (const contract of current.contracts)
    if (
      !draft.value.contracts.some(
        (value) =>
          value.address.toLowerCase() === contract.address.toLowerCase(),
      )
    )
      result.push(`Remove contract ${contract.address}.`);
  for (const contract of draft.value.contracts) {
    const previous = current.contracts.find(
      (value) => value.address.toLowerCase() === contract.address.toLowerCase(),
    );
    if (!previous)
      result.push(
        `Add contract ${contract.address || '(address required)'} with ${contract.methods.length} methods.`,
      );
    else {
      if (
        previous.code_hash !== contract.code_hash ||
        JSON.stringify(previous.implementation) !==
          JSON.stringify(contract.implementation)
      )
        result.push(
          `Change bytecode or implementation pin for ${contract.address}.`,
        );
      for (const method of previous.methods)
        if (
          !contract.methods.some(
            (value) => value.signature === method.signature,
          )
        )
          result.push(`Remove ${method.signature} from ${contract.address}.`);
      for (const method of contract.methods) {
        const before = previous.methods.find(
          (value) => value.signature === method.signature,
        );
        if (!before || before.maximum_value_wei !== method.maximum_value_wei)
          result.push(
            `${before ? 'Update' : 'Add'} ${method.signature || '(signature required)'} on ${contract.address}: maximum ${method.maximum_value_wei} wei.`,
          );
      }
    }
  }
  return result.length
    ? result
    : [
        'No policy changes. Publishing a new revision still requires renewed financial consent.',
      ];
});
async function submit() {
  await task(async () => {
    const app = application.value!;
    validateDraft(draft.value!);
    if (provider.value) {
      if (
        proposal.value &&
        JSON.stringify(draft.value) === JSON.stringify(proposal.value.policy)
      ) {
        await request(
          `/v1/runtime-configuration/proposals/${proposal.value.proposal_id}/publish`,
          { expected_revision: app.active_revision },
        );
      } else {
        await request(
          `/v1/runtime-configuration/applications/${app.application_id}/revisions`,
          { expected_revision: app.active_revision, policy: draft.value },
        );
      }
      await load();
      notice.value =
        'Policy published. Financial access requires consent to the new revision.';
    } else {
      await request('/v1/runtime-configuration/proposals', {
        expected_revision: app.active_revision,
        policy: draft.value,
      });
      await load();
      notice.value =
        'Registration submitted. Check its publication status below.';
    }
  });
}
async function setReview() {
  await task(async () => {
    const app = application.value!;
    await request(
      `/v1/runtime-configuration/applications/${app.application_id}/review`,
      {
        expected_revision: app.active_revision,
        expected_review_revision: app.review?.revision ?? '0',
        mode: reviewMode.value,
      },
    );
    await load();
    notice.value = 'Contract registration review mode saved.';
  });
}
async function loadBatches() {
  await task(async () => {
    const result = await request('/v1/runtime-configuration/batches');
    batches.value = result.batches;
    truncated.value = result.truncated;
    batchNotice.value =
      'Stored observations loaded. Pending batches need an individual status refresh for current inclusion evidence.';
  });
}
async function refreshBatch(batch: Batch) {
  await task(async () => {
    const response = await request(
      `/v1/accounts/${encodeURIComponent(batch.account_id)}/wallet`,
      {
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'wallet_getCallsStatus',
        params: [batch.id],
      },
    );
    if (response.error)
      throw new Error(
        `Status unavailable (${response.error.code}). Check current owner access and token scopes.`,
      );
    selectedBatch.value = response.result;
    Object.assign(batch, response.result);
  });
}
</script>
<template>
  <div class="runtime-workspace">
    <header>
      <div>
        <span class="eyebrow">WALLET PROVIDER KIT</span>
        <h1>Runtime workspace</h1>
        <p>Register contracts, review policy and follow wallet batches.</p>
      </div>
      <a href="/docs/">API explorer</a>
    </header>
    <p role="alert" v-if="error" class="error">{{ error }}</p>
    <p role="status" v-if="notice" class="notice">{{ notice }}</p>
    <section v-if="!workspace" class="card connect">
      <h2>Connect to your provider</h2>
      <p>
        Use a short-lived provider API access token. Applications use
        configuration read and propose scopes; providers use a separately
        configured operator identity with configuration write scope. Obtain
        tokens through your authorization server or the application token
        controls in the API explorer.
      </p>
      <form @submit.prevent="connect">
        <label
          >Access token<input
            v-model="credential"
            type="password"
            required
            autocomplete="off"
            spellcheck="false" /></label
        ><button :disabled="busy" class="primary">Connect</button>
      </form>
      <p>
        Credentials stay in memory and clear on disconnect or reload. Never
        enter a client secret, wallet key or owner identity token.
      </p>
    </section>
    <template v-else>
      <nav class="toolbar">
        <strong>{{ provider ? 'Provider operator' : 'Application' }}</strong
        ><button @click="task(load)" :disabled="busy">Refresh workspace</button
        ><button @click="disconnect" :disabled="busy">Disconnect</button>
      </nav>
      <section class="card">
        <h2>{{ provider ? 'Connected applications' : 'Your application' }}</h2>
        <label
          >Application<select
            :value="selected"
            @change="
              task(() =>
                loadApplication(($event.target as HTMLSelectElement).value),
              )
            "
            :disabled="busy"
          >
            <option
              v-for="app in workspace.applications"
              :key="app.application_id"
              :value="app.application_id"
            >
              {{ app.name }}
            </option>
          </select></label
        >
        <p v-if="!workspace.applications.length">
          No enabled applications are configured. Ask your provider to register
          your OAuth application.
        </p>
        <template v-if="application">
          <p class="identifier">{{ application.application_id }}</p>
          <div class="summary">
            <strong>Published revision {{ application.active_revision }}</strong
            ><span>{{
              application.publication
                ? terms(application.publication.policy)
                : 'Awaiting initial provider publication'
            }}</span
            ><span>{{
              application.review?.mode === 'automatic'
                ? 'Automatic contract registration allowed'
                : 'Provider review required'
            }}</span>
          </div>
          <details v-if="application.publication">
            <summary>Current published requirements and pins</summary>
            <PolicyAdapterSummary
              :adapters="application.publication.policy.call_adapters"
            />
            <p v-if="!application.publication.policy.claim_requirements.length">
              No additional runtime claim requirements.
            </p>
            <ul>
              <li
                v-for="claim in application.publication.policy
                  .claim_requirements"
                :key="claim.name"
              >
                {{ claim.name }}: {{ claim.allowed_values.join(', ') }} ·
                maximum age {{ claim.max_age_seconds }} seconds
              </li>
            </ul>
            <article
              v-for="contract in application.publication.policy.contracts"
              :key="contract.address"
            >
              <p class="identifier">
                {{ contract.address }}<br />Bytecode {{ contract.code_hash
                }}<template v-if="contract.implementation"
                  ><br />Implementation {{ contract.implementation.address }} ·
                  {{ contract.implementation.code_hash }}</template
                >
              </p>
              <ul>
                <li v-for="method in contract.methods" :key="method.signature">
                  {{ method.signature }} · maximum
                  {{ method.maximum_value_wei }} wei
                </li>
              </ul>
            </article>
          </details>
          <form v-if="provider" @submit.prevent="setReview" class="review-mode">
            <h3>Allow this application to register contracts</h3>
            <p>
              Automatic acceptance is the default when you allow an application.
              Publish its baseline policy first. Only contract and method
              changes matching the published provider terms are accepted
              automatically. Other proposals need review.
            </p>
            <label for="registration-review">Registration review</label
            ><select
              id="registration-review"
              v-model="reviewMode"
              :disabled="busy"
            >
              <option value="automatic">Automatic acceptance</option>
              <option value="manual">Manual provider review</option>
            </select>
            <button :disabled="busy || !application.publication">
              {{
                application.review
                  ? 'Save review mode'
                  : 'Allow contract registrations'
              }}
            </button>
          </form>
        </template>
      </section>
      <div class="columns" v-if="application && draft">
        <section class="card">
          <h2>
            {{ provider ? 'Review and publish policy' : 'Register contracts' }}
          </h2>
          <p v-if="proposal">
            Reviewing proposal {{ proposal.proposal_id }} based on revision
            {{ proposal.based_on_revision }}.
          </p>
          <form @submit.prevent="submit">
            <fieldset class="editor" :disabled="busy">
              <section aria-labelledby="changes-heading">
                <h3 id="changes-heading">Policy changes</h3>
                <ul>
                  <li v-for="change in changes" :key="change">{{ change }}</li>
                </ul>
              </section>
              <fieldset v-if="provider">
                <legend>Provider requirements</legend>
                <label
                  ><input v-model="draft.enabled" type="checkbox" /> Enable
                  policy</label
                >
                <label
                  >Maximum calls<input
                    v-model.number="draft.maximum_calls"
                    type="number"
                    min="1"
                    max="16"
                    required
                /></label>
                <label
                  >Total maximum wei<input
                    v-model="draft.maximum_native_value_wei"
                    pattern="0|[1-9][0-9]{0,77}"
                    required
                    inputmode="numeric"
                /></label>
                <label
                  >Validity in seconds<input
                    v-model.number="draft.max_validity_seconds"
                    type="number"
                    min="1"
                    max="3600"
                    required
                /></label>
                <h3>Required application claims</h3>
                <fieldset
                  v-for="(claim, index) in draft.claim_requirements"
                  :key="index"
                >
                  <legend>Claim {{ index + 1 }}</legend>
                  <label
                    >Claim name<input
                      v-model="claim.name"
                      pattern="[a-z][a-z0-9_]{0,63}"
                      required
                  /></label>
                  <label
                    >Allowed values (one per line)<textarea
                      :value="claim.allowed_values.join('\n')"
                      @input="
                        claim.allowed_values = (
                          $event.target as HTMLTextAreaElement
                        ).value.split('\n')
                      "
                      required
                    />
                  </label>
                  <label
                    >Maximum evidence age in seconds<input
                      v-model.number="claim.max_age_seconds"
                      type="number"
                      min="1"
                      max="31536000"
                      required
                  /></label>
                  <button
                    type="button"
                    @click="draft.claim_requirements.splice(index, 1)"
                  >
                    Remove claim {{ index + 1 }}
                  </button>
                </fieldset>
                <button
                  type="button"
                  @click="
                    draft.claim_requirements.push({
                      name: '',
                      allowed_values: [''],
                      max_age_seconds: 3600,
                    })
                  "
                  :disabled="draft.claim_requirements.length >= 16"
                >
                  Add claim
                </button>
              </fieldset>
              <p v-else>
                Provider terms: {{ terms(draft) }}. Registered methods still
                require current owner consent and execution authority.
              </p>
              <RuntimeContracts
                v-model="draft.contracts"
                :network="workspace?.network"
              />
              <PolicyAdapters
                v-if="provider"
                v-model="draft.call_adapters"
                :contracts="
                  draft.contracts.map((c) => ({
                    address: c.address,
                    codeHash: c.code_hash,
                    ...(c.implementation
                      ? {
                          implementation: {
                            address: c.implementation.address,
                            codeHash: c.implementation.code_hash,
                          },
                        }
                      : {}),
                  }))
                "
              />
              <p v-if="provider">
                Runtime calls must also match registered contracts and methods.
                Gas sponsor budgets are deployment settings in the setup wizard.
                Publishing this policy does not change sponsor capacity. Adapter
                changes require renewed owner consent.
              </p>
              <p>
                Network: {{ providerNetwork(workspace?.network).label }}.
                Publishing changes financial consent terms; registration alone
                cannot sign or execute a transaction.
              </p>
              <button :disabled="busy" class="primary">
                {{ provider ? 'Publish policy' : 'Submit registration' }}
              </button>
            </fieldset>
          </form>
        </section>
        <aside class="card">
          <h2>Registration history</h2>
          <details>
            <summary>Published policy history</summary>
            <p>
              Latest 20 immutable publications. Older revisions remain available
              through the API.
            </p>
            <article
              v-for="publication in [...application.publications].reverse()"
              :key="publication.revision"
              class="proposal"
            >
              <strong
                >Revision {{ publication.revision }} ·
                {{ publication.published_at }}</strong
              >
              <p>{{ terms(publication.policy) }}</p>
              <PolicyAdapterSummary
                :adapters="publication.policy.call_adapters"
              />
              <p class="identifier">
                Published by {{ publication.published_by }}
              </p>
              <ul>
                <li
                  v-for="claim in publication.policy.claim_requirements"
                  :key="claim.name"
                >
                  {{ claim.name }}: {{ claim.allowed_values.join(', ') }} ·
                  {{ claim.max_age_seconds }} seconds
                </li>
                <li
                  v-for="contract in publication.policy.contracts"
                  :key="contract.address"
                >
                  <span class="identifier"
                    >{{ contract.address }} · bytecode {{ contract.code_hash
                    }}<template v-if="contract.implementation">
                      · implementation {{ contract.implementation.address }} ·
                      {{ contract.implementation.code_hash }}</template
                    ></span
                  >
                  <ul>
                    <li
                      v-for="method in contract.methods"
                      :key="method.signature"
                    >
                      {{ method.signature }} ·
                      {{ method.maximum_value_wei }} wei
                    </li>
                  </ul>
                </li>
              </ul>
            </article>
          </details>
          <p v-if="application.proposals_truncated">
            Showing the latest 20 proposals. Older proposals remain available by
            ID through the API.
          </p>
          <p v-if="!application.proposals.length">No proposals yet.</p>
          <article
            v-for="item in [...application.proposals].reverse()"
            :key="item.proposal_id"
            class="proposal"
          >
            <strong>{{
              item.published_revision
                ? `Published as revision ${item.published_revision}`
                : item.based_on_revision === application.active_revision
                  ? 'Awaiting review'
                  : 'Stale — submit against the latest revision'
            }}</strong>
            <p>
              {{ item.created_at }} ·
              {{ item.policy.contracts.length }} contracts
            </p>
            <p>{{ terms(item.policy) }}</p>
            <PolicyAdapterSummary :adapters="item.policy.call_adapters" />
            <ul>
              <li
                v-for="contract in item.policy.contracts"
                :key="contract.address"
              >
                <span class="identifier">{{ contract.address }}</span>
                <ul>
                  <li
                    v-for="method in contract.methods"
                    :key="method.signature"
                  >
                    {{ method.signature }} · {{ method.maximum_value_wei }} wei
                  </li>
                </ul>
              </li>
            </ul>
            <button
              :disabled="
                busy ||
                !!item.published_revision ||
                item.based_on_revision !== application.active_revision
              "
              @click="editProposal(item)"
            >
              {{ provider ? 'Review proposal' : 'Edit proposal' }}
            </button>
          </article>
        </aside>
      </div>
      <section class="card">
        <div class="section-title">
          <h2>Wallet batches</h2>
          <button @click="loadBatches" :disabled="busy">Load batches</button>
        </div>
        <p>
          Queue stage describes scheduling. Inclusion and finality require
          independent chain evidence. This view never submits or retries a
          batch.
        </p>
        <label>Filter batches<input v-model="query" type="search" /></label>
        <p role="status">{{ batchNotice }}</p>
        <p v-if="truncated">
          Showing up to 100 currently readable batches. Older or
          no-longer-authorized batches may be omitted. Applications can look up
          a retained batch by its original ID through the wallet API.
        </p>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Batch / account</th>
                <th>Policy</th>
                <th>Queue stage</th>
                <th>Verified result</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="batch in shownBatches"
                :key="batch.account_id + batch.id"
              >
                <td>
                  <span class="identifier">{{ batch.id }}</span
                  ><br /><span class="identifier">{{ batch.account_id }}</span>
                </td>
                <td>{{ batch.policy_revision }}</td>
                <td>{{ batch.queue_stage }}</td>
                <td>{{ statusNames[batch.status] }}</td>
                <td>
                  <button
                    v-if="!provider"
                    @click="refreshBatch(batch)"
                    :disabled="busy"
                  >
                    Refresh status</button
                  ><span v-else>Stored observation</span>
                  <details v-if="batch.receipts?.length">
                    <summary>Receipts</summary>
                    <p
                      v-for="receipt in batch.receipts"
                      :key="receipt.transactionHash"
                      class="identifier"
                    >
                      Transaction {{ receipt.transactionHash }} · block
                      {{ receipt.blockNumber }}
                    </p>
                  </details>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="!shownBatches.length">
          No batches loaded for this application.
        </p>
        <div v-if="selectedBatch" role="status">
          Batch {{ selectedBatch.id }}: {{ statusNames[selectedBatch.status] }}
          <p
            v-for="receipt in selectedBatch.receipts ?? []"
            :key="receipt.transactionHash"
            class="identifier"
          >
            Transaction {{ receipt.transactionHash }} · block
            {{ receipt.blockNumber }} · gas {{ receipt.gasUsed }}
          </p>
        </div>
      </section>
    </template>
    <footer><a href="/operator/notices">Third-party notices</a></footer>
  </div>
</template>
