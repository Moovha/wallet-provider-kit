<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue';
import type { FormKitNode } from '@formkit/core';
import type { ApiContract } from './api-reference';

import {
  backends,
  deploymentChecklist,
  docs,
  emptyConfiguration,
  type ProviderConfiguration,
} from './model';
import { explainIssue } from './validation';
import ProviderStep from './components/ProviderStep.vue';
import BackendStep from './components/BackendStep.vue';
import ConnectionsStep from './components/ConnectionsStep.vue';
import PolicyStep from './components/PolicyStep.vue';
import DeploymentStep from './components/DeploymentStep.vue';
import LocalSetup from './components/LocalSetup.vue';
import { defaultPermissions } from '../src/onboarding/types';

const ApiReference = defineAsyncComponent(
  () => import('./components/ApiReference.vue'),
);
const view = ref<'setup' | 'api'>('setup');
const contract = shallowRef<ApiContract>();
const referenceLoading = ref(false);

// The token is delivered in the URL fragment, never in HTTP URLs/referrers.
// Neither configuration nor access credentials are saved in browser storage.
const token = window.location.hash.slice(1);
window.history.replaceState(null, '', window.location.pathname);
const config = ref<ProviderConfiguration>();
const generation = ref(0);
const busy = ref(false);
const setupLocked = ref(false);
const issues = ref<string[]>([]);
const notice = ref('');
const validated = ref<{
  config: ProviderConfiguration;
  environment: string[];
  warnings: string[];
}>();
const importInput = ref<HTMLInputElement>();
const review = ref<HTMLElement>();
let setupSteps: FormKitNode | undefined;
const connectionsReturnStep = ref<'policies' | 'deployment'>();
const permissionNames: Record<string, string> = {
  'account:read': 'Read wallet accounts',
  'operations:request': 'Request wallet operations (advanced hosts)',
  'transfers:request': 'Request transfers on behalf of users',
};
const selectedBackend = computed(() =>
  backends.find((b) => b.kind === config.value?.backend.kind),
);
const stepNames: Record<string, string> = {
  provider: 'Provider details',
  backend: 'Wallet backend',
  connections: 'Connected services',
  policies: 'Policies',
  deployment: 'Deployment',
  review: 'Review & export',
};
const activeStep = ref('provider');
const stepNumber = computed(
  () => Object.keys(stepNames).indexOf(activeStep.value) + 1,
);
watch(
  config,
  () => {
    validated.value = undefined;
    notice.value = '';
    issues.value = [];
  },
  { deep: true },
);

async function request(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    credentials: 'omit',
    cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      JSON.stringify(
        result.issues ?? [
          'This setup session has expired or cannot be opened. Restart the setup command, open the full link printed in your terminal, and import your last saved configuration.',
        ],
      ),
    );
  return result;
}
async function openReference() {
  view.value = 'api';
  if (contract.value || referenceLoading.value) return;
  referenceLoading.value = true;
  try {
    contract.value = await request('/api/openapi');
  } catch (error) {
    showError(error);
  } finally {
    referenceLoading.value = false;
  }
}

function showError(error: unknown) {
  try {
    issues.value = JSON.parse((error as Error).message);
  } catch {
    issues.value = [
      'Cannot reach the setup wizard. Check that its terminal is still running. If needed, restart the setup command, open the full printed link and import your last saved configuration.',
    ];
  }
}
onMounted(async () => {
  try {
    const result = await request('/api/template');
    if (result.execution?.state !== 'idle' && result.execution?.plan) {
      config.value = result.execution.plan.config;
      setupLocked.value = true;
      await nextTick();
      goToStep('review');
    } else if (result.runtimeConfiguration) {
      config.value = result.runtimeConfiguration;
      setupLocked.value = result.runtime?.state === 'installing';
      await nextTick();
      await check();
      goToStep('review');
    } else config.value = emptyConfiguration(result.config);
  } catch (error) {
    showError(error);
  }
});
async function check() {
  if (busy.value || !config.value) return;
  busy.value = true;
  issues.value = [];
  validated.value = undefined;
  const snapshot = JSON.stringify(config.value);
  try {
    const result = await request('/api/validate', JSON.parse(snapshot));
    if (JSON.stringify(config.value) === snapshot) {
      validated.value = result;
      notice.value =
        'Configuration valid. Set up a local container deployment below, or download the files for manual deployment. Wallet operations remain disabled until acceptance and explicit activation.';
    }
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
  await nextTick();
  review.value?.focus();
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  busy.value = true;
  issues.value = [];
  try {
    if (file.size > 65536)
      throw new Error(
        JSON.stringify([
          'This file is too large. Choose a provider configuration JSON file no larger than 64 KiB (65,536 bytes).',
        ]),
      );
    const result = await request(
      '/api/validate',
      JSON.parse(await file.text()),
    );
    config.value = result.config;
    generation.value++;
    activeStep.value = 'provider';
    connectionsReturnStep.value = undefined;
    await nextTick();
    notice.value =
      'Configuration imported. Review the settings, then validate again before exporting.';
  } catch (error) {
    if (error instanceof SyntaxError)
      issues.value = [
        'This file is not valid JSON. Choose the provider.config.json file downloaded from the wizard, or correct its JSON syntax before importing it.',
      ];
    else showError(error);
  } finally {
    busy.value = false;
    input.value = '';
  }
}
function download(name: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportConfig() {
  if (validated.value)
    download(
      'provider.config.json',
      JSON.stringify(validated.value.config, null, 2) + '\n',
      'application/json',
    );
}
function exportChecklist() {
  if (validated.value)
    download(
      'provider-setup.md',
      deploymentChecklist(
        validated.value.config,
        validated.value.environment,
        validated.value.warnings,
      ),
    );
}
function exportEnvironment() {
  if (validated.value)
    download(
      'provider.env.example',
      '# Variable names only. Supply real values through your deployment secret store.\n' +
        validated.value.environment.map((name) => `${name}=`).join('\n') +
        '\n',
    );
}
function stepChanged(node: FormKitNode) {
  setupSteps = node;
  node.on('prop:activeStep', ({ payload }) => {
    activeStep.value = payload;
    nextTick(() => {
      const heading = document.querySelector<HTMLElement>(
        '.formkit-step[data-active="true"] h2',
      );
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
      }
    });
  });
}
function goToStep(step: 'connections' | 'policies' | 'deployment' | 'review') {
  if (setupSteps) setupSteps.props.activeStep = step;
}
function configureServices(returnStep: 'policies' | 'deployment') {
  connectionsReturnStep.value = returnStep;
  goToStep('connections');
}
function enableDocumentation() {
  if (config.value)
    config.value.http = { ...config.value.http, documentation: true };
}
</script>
<template>
  <div class="wizard-shell">
    <aside class="sidebar">
      <a
        href="https://moovha.com/"
        class="brand"
        target="_blank"
        rel="noopener noreferrer"
        ><img src="/moovha-logo.svg" alt="Moovha" width="48" height="48" /><span
          >Moovha<small>Wallet Provider Kit</small></span
        ></a
      >
      <div class="sidebar-copy">
        <span class="eyebrow">Operator setup</span>
        <h1>Configure your service.<br />Run it locally.</h1>
        <p>
          Choose settings and access rules, then let local setup prepare
          storage, start the service and show its progress. You can also export
          files.
        </p>
      </div>
      <ol
        v-show="view === 'setup'"
        class="step-list"
        aria-label="Setup progress"
      >
        <li
          v-for="(name, key, index) in stepNames"
          :key="key"
          :class="{ current: activeStep === key }"
          :aria-current="activeStep === key ? 'step' : undefined"
        >
          <span>{{ index + 1 }}</span
          >{{ name }}
        </li>
      </ol>
      <p v-if="view === 'api'" class="api-sidebar-note">
        API reference<br /><small
          >Requests, responses and configuration prerequisites</small
        >
      </p>
      <div class="sidebar-bottom">
        <span class="status-dot"></span> Local configuration session
        <p>
          Keep this session open while completing the fields. Downloads become
          available after validation in Export; incomplete drafts cannot be
          saved. Refreshing or closing this page discards unsaved edits. Import
          a previously exported configuration to resume.
        </p>
        <a
          :href="docs + 'setup-wizard.html'"
          target="_blank"
          rel="noopener noreferrer"
          >Setup guide ↗</a
        >
      </div>
    </aside>
    <main>
      <header class="topbar">
        <span class="badge">Base Sepolia · experimental</span>
        <div class="topbar-actions">
          <div class="view-switch" role="group" aria-label="Workspace view">
            <button
              type="button"
              :aria-pressed="view === 'setup'"
              @click="view = 'setup'"
            >
              Setup configuration
            </button>
            <button
              type="button"
              :aria-pressed="view === 'api'"
              :disabled="!config"
              @click="openReference"
            >
              API reference
            </button>
          </div>
          <input
            ref="importInput"
            class="visually-hidden"
            type="file"
            accept=".json,application/json"
            aria-label="Import provider configuration"
            @change="importFile"
          /><button
            type="button"
            class="secondary"
            :disabled="busy || !config || setupLocked"
            @click="importInput?.click()"
          >
            Import configuration
          </button>
        </div>
      </header>
      <div class="mobile-progress">
        {{
          view === 'api'
            ? 'API reference · configuration preview'
            : `Step ${stepNumber} of 6 · ${stepNames[activeStep]}`
        }}
      </div>
      <div class="workspace">
        <div v-if="notice" class="notice" role="status">{{ notice }}</div>
        <div v-if="issues.length" class="error-panel" role="alert">
          <strong>Check these settings</strong>
          <ul>
            <li v-for="issue in issues" :key="issue">
              {{ explainIssue(issue) }}
            </li>
          </ul>
          <p v-if="config">
            For a setting error, open the named step and follow the field
            instructions.
          </p>
        </div>
        <FormKit
          v-if="config"
          v-show="view === 'setup'"
          :key="generation"
          type="form"
          :actions="false"
          :aria-busy="busy"
          @submit="check"
        >
          <FormKit
            id="setup-steps"
            type="multi-step"
            name="setup"
            tab-style="progress"
            :allow-incomplete="true"
            @node="stepChanged"
          >
            <FormKit type="step" name="provider" label="Provider"
              ><fieldset class="configuration-fields" :disabled="setupLocked">
                <ProviderStep v-model="config" /></fieldset
            ></FormKit>
            <FormKit type="step" name="backend" label="Backend"
              ><fieldset class="configuration-fields" :disabled="setupLocked">
                <BackendStep v-model="config" /></fieldset
            ></FormKit>
            <FormKit type="step" name="connections" label="Services"
              ><fieldset class="configuration-fields" :disabled="setupLocked">
                <ConnectionsStep
                  v-model="config"
                  :return-label="
                    connectionsReturnStep
                      ? stepNames[connectionsReturnStep]
                      : undefined
                  "
                  @return-to-step="
                    connectionsReturnStep && goToStep(connectionsReturnStep)
                  "
                /></fieldset
            ></FormKit>
            <FormKit type="step" name="policies" label="Policies"
              ><fieldset class="configuration-fields" :disabled="setupLocked">
                <PolicyStep
                  v-model="config"
                  @configure-services="configureServices('policies')"
                /></fieldset
            ></FormKit>
            <FormKit type="step" name="deployment" label="Deployment"
              ><fieldset class="configuration-fields" :disabled="setupLocked">
                <DeploymentStep
                  v-model="config"
                  @configure-services="configureServices('deployment')"
                /></fieldset
            ></FormKit>
            <FormKit type="step" name="review" label="Export">
              <div ref="review" tabindex="-1" class="step-heading">
                <span class="eyebrow">Review & export</span>
                <h2>Review your configuration</h2>
                <p>
                  You’ve prepared a configuration draft. Check it for
                  completeness and consistency, then start a local container
                  deployment below or download files for your server. Validation
                  does not test credentials, connect external services or deploy
                  your wallet service.
                </p>
              </div>
              <dl class="summary">
                <div>
                  <dt>Provider</dt>
                  <dd>{{ config.policy.provider.name || 'Not set' }}</dd>
                </div>
                <div>
                  <dt>Public service address</dt>
                  <dd>{{ config.policy.provider.origin || 'Not set' }}</dd>
                </div>
                <div>
                  <dt>Wallet backend</dt>
                  <dd>{{ selectedBackend?.name }}</dd>
                </div>
                <div>
                  <dt>Identity services</dt>
                  <dd>
                    {{
                      [
                        config.policy.access?.mode === 'application'
                          ? 'Trusted application identity attestations'
                          : '',
                        config.identity.didit ? 'Didit' : '',
                        config.policy.identity?.records
                          ? 'Application records · evaluation'
                          : '',
                        config.identity.sumsub ? 'Sumsub' : '',
                      ]
                        .filter(Boolean)
                        .join(', ') || 'Not set'
                    }}
                  </dd>
                </div>
                <div>
                  <dt>Application access</dt>
                  <dd>
                    {{ config.policy.applications.length }} application(s) ·
                    {{
                      config.policy.access?.mode === 'application'
                        ? 'Application-led · no provider user login or review'
                        : (config.reviewers?.length ?? 0) +
                          ' reviewer(s) · hosted compatibility'
                    }}
                  </dd>
                </div>
                <div>
                  <dt>Transfer signing</dt>
                  <dd>
                    {{
                      config.financial
                        ? 'Delegated token transfer signing'
                        : 'Not configured'
                    }}
                  </dd>
                </div>
                <div>
                  <dt>Transfer execution</dt>
                  <dd>
                    {{
                      config.execution
                        ? 'Dedicated application gas sponsors and RPC-quorum verification'
                        : 'Not configured; applications submit separately'
                    }}
                  </dd>
                </div>
                <div v-if="config.policy.access?.mode === 'application'">
                  <dt>Identity requirements</dt>
                  <dd>
                    {{ config.policy.identity?.application?.verificationLevel }}
                    · required fields:
                    {{
                      config.policy.identity?.application?.requiredFields.join(
                        ', ',
                      ) || 'none'
                    }}
                    · maximum age
                    {{ config.policy.identity?.maxAgeDays ?? 365 }} days
                  </dd>
                </div>
                <div>
                  <dt>Access limit</dt>
                  <dd>
                    {{ config.policy.access?.maxAgeDays ?? 30 }} days maximum;
                    identity or consent expiry can end access sooner
                  </dd>
                </div>
                <div>
                  <dt>Wallet operations after deployment</dt>
                  <dd>
                    {{
                      config.activation.enabled
                        ? 'Enabled in this configuration'
                        : 'Disabled in this configuration'
                    }}
                  </dd>
                </div>
              </dl>
              <h3>Application permissions to review</h3>
              <ul class="export-file-guide">
                <li
                  v-for="(application, index) in config.policy.applications"
                  :key="index"
                >
                  <strong
                    >{{
                      application.name || `Application ${index + 1}`
                    }}:</strong
                  >
                  {{
                    application.enabled === false
                      ? 'access disabled'
                      : 'access enabled'
                  }}
                  ·
                  {{
                    (application.permissions ?? defaultPermissions)
                      .map((permission) => permissionNames[permission])
                      .join(', ')
                  }}
                </li>
              </ul>
              <div class="callout">
                <strong
                  >Test your services before enabling wallet operations.</strong
                >
                <p>
                  Validation creates no wallet and calls no external service.
                  Local setup can prepare secrets, storage and service startup;
                  your deployment also needs HTTPS. Test wallet creation,
                  signing where enabled, backup and recovery using the
                  deployment guide before enabling operations.
                </p>
              </div>
              <button
                type="button"
                class="primary"
                :disabled="busy || setupLocked"
                @click="check"
              >
                {{ busy ? 'Checking…' : 'Validate configuration' }}
              </button>
              <LocalSetup
                :config="validated?.config"
                :request="request"
                @locked="setupLocked = $event"
              />
              <div v-if="validated" class="export-panel">
                <div v-if="validated.warnings.length" class="readiness-panel">
                  <h3>Deployment reminders</h3>
                  <ul>
                    <li v-for="warning in validated.warnings" :key="warning">
                      {{ warning }}
                    </li>
                  </ul>
                  <p>
                    These checks use your settings only. Test external services
                    on your deployment before allowing users to connect.
                  </p>
                </div>
                <h3>Or download for manual deployment</h3>
                <ul class="export-file-guide">
                  <li>
                    <strong>provider.config.json:</strong> your service settings
                    and policy. Your server loads this file; you can also import
                    it here to make future changes.
                  </li>
                  <li>
                    <strong>provider-setup.md:</strong> your deployment
                    checklist, with preparation tasks and commands to validate,
                    initialize and run your service.
                  </li>
                  <li>
                    <strong>provider.env.example:</strong> variable names with
                    empty entries for secret values. Fill these privately on the
                    deployment host or through your secret manager, following
                    the deployment guide. The wizard exports names only.
                  </li>
                </ul>
                <div class="download-actions">
                  <button type="button" class="primary" @click="exportConfig">
                    Download configuration</button
                  ><button
                    type="button"
                    class="secondary"
                    @click="exportChecklist"
                  >
                    Download checklist</button
                  ><button
                    type="button"
                    class="secondary"
                    @click="exportEnvironment"
                  >
                    Download variable template
                  </button>
                </div>
                <h3>What to do after downloading</h3>
                <ol class="setup-journey">
                  <li>
                    Build the same toolkit revision on your deployment host.
                    Copy all three files into a private directory outside the
                    checkout. Rename provider.env.example to provider.env and
                    supply secret values there or through your secret manager.
                  </li>
                  <li>
                    Follow provider-setup.md to validate, initialize new storage
                    once and start the service with wallet operations disabled.
                    Add HTTPS and follow the staging walkthrough for backend,
                    access-policy and recovery tests. Some checks need explicit
                    activation in an isolated test deployment with reviewed
                    evidence. Disabled readiness is expected during initial
                    setup.
                  </li>
                  <li>
                    Before admitting wider traffic, import the saved
                    configuration here, record completed test report references
                    in Deployment and enable wallet operations. Validate and
                    export again, then replace the server configuration and
                    restart with the same storage and backend binding.
                  </li>
                </ol>
                <p>
                  <a
                    :href="docs + 'operator-deployment.html'"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open the deployment guide ↗
                  </a>
                  for host preparation, exact commands and HTTPS. Use the
                  <a
                    :href="docs + 'staging-walkthrough.html'"
                    target="_blank"
                    rel="noreferrer"
                    >staging walkthrough ↗</a
                  >
                  for acceptance testing.
                </p>
                <details>
                  <summary>Preview configuration</summary>
                  <pre>{{ JSON.stringify(validated.config, null, 2) }}</pre>
                </details>
              </div>
              <template #stepNext></template>
            </FormKit>
          </FormKit>
        </FormKit>
        <p v-else-if="!issues.length" role="status">
          Opening your setup session…
        </p>
        <p v-if="referenceLoading" role="status">Opening the API reference…</p>
        <ApiReference
          v-if="config && contract"
          v-show="view === 'api'"
          :config="config"
          :contract="contract"
          @enable-documentation="enableDocumentation"
        />
        <footer>
          <span
            >Built with
            <a
              href="https://formkit.com/"
              target="_blank"
              rel="noopener noreferrer"
              ><img
                src="/providers/formkit.png"
                alt=""
                width="18"
                height="18"
              />
              FormKit</a
            ></span
          ><a
            :href="docs + 'custom-adapters.html'"
            target="_blank"
            rel="noopener noreferrer"
            >Developer guide: custom wallet backends ↗</a
          >
        </footer>
      </div>
    </main>
  </div>
</template>
