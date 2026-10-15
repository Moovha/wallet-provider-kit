<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
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

// The token is delivered in the URL fragment, never in HTTP URLs/referrers.
// Neither configuration nor access credentials are saved in browser storage.
const token = window.location.hash.slice(1);
window.history.replaceState(null, '', window.location.pathname);
const config = ref<ProviderConfiguration>();
const generation = ref(0);
const busy = ref(false);
const issues = ref<string[]>([]);
const notice = ref('');
const validated = ref<{
  config: ProviderConfiguration;
  environment: string[];
  warnings: string[];
}>();
const importInput = ref<HTMLInputElement>();
const review = ref<HTMLElement>();
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
          'Local session unavailable. Restart the setup command and open its printed URL.',
        ],
      ),
    );
  return result;
}
function showError(error: unknown) {
  try {
    issues.value = JSON.parse((error as Error).message);
  } catch {
    issues.value = [
      'The local setup service is unavailable. Restart the setup command.',
    ];
  }
}
onMounted(async () => {
  try {
    const result = await request('/api/template');
    config.value = emptyConfiguration(result.config);
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
      notice.value = 'Configuration valid. Ready to export.';
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
      throw new Error(JSON.stringify(['Configuration exceeds 64 KiB.']));
    const result = await request(
      '/api/validate',
      JSON.parse(await file.text()),
    );
    config.value = result.config;
    generation.value++;
    activeStep.value = 'provider';
    await nextTick();
    notice.value =
      'Configuration imported. Review the settings, then validate again before exporting.';
  } catch (error) {
    if (error instanceof SyntaxError)
      issues.value = ['Choose a valid provider configuration JSON file.'];
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
function stepChanged(node: {
  on: (event: string, callback: (event: { payload: string }) => void) => void;
}) {
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
        <h1>Your wallet service,<br />ready to configure.</h1>
        <p>
          Connect the services you use. Set your policies. Export a deployment
          configuration.
        </p>
      </div>
      <ol class="step-list" aria-label="Setup progress">
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
      <div class="sidebar-bottom">
        <span class="status-dot"></span> Local configuration session
        <p>
          Settings stay in memory until you download them. Refreshing discards
          edits; reopen the printed setup link to start again.
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
        <div>
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
            :disabled="busy || !config"
            @click="importInput?.click()"
          >
            Import configuration
          </button>
        </div>
      </header>
      <div class="mobile-progress">
        Step {{ stepNumber }} of 6 · {{ stepNames[activeStep] }}
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
          <p>Use the step tabs to return to the relevant settings.</p>
        </div>
        <FormKit
          v-if="config"
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
              ><ProviderStep v-model="config"
            /></FormKit>
            <FormKit type="step" name="backend" label="Backend"
              ><BackendStep v-model="config"
            /></FormKit>
            <FormKit type="step" name="connections" label="Services"
              ><ConnectionsStep v-model="config"
            /></FormKit>
            <FormKit type="step" name="policies" label="Policies"
              ><PolicyStep v-model="config"
            /></FormKit>
            <FormKit type="step" name="deployment" label="Deployment"
              ><DeploymentStep v-model="config"
            /></FormKit>
            <FormKit type="step" name="review" label="Export">
              <div ref="review" tabindex="-1" class="step-heading">
                <span class="eyebrow">Review & export</span>
                <h2>Review your configuration</h2>
                <p>
                  Validate the complete configuration, then download the files
                  for your operator workflow.
                </p>
              </div>
              <dl class="summary">
                <div>
                  <dt>Provider</dt>
                  <dd>{{ config.policy.provider.name || 'Not set' }}</dd>
                </div>
                <div>
                  <dt>Public origin</dt>
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
                        config.identity.didit ? 'Didit' : '',
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
                    {{ config.reviewers.length }} reviewer(s)
                  </dd>
                </div>
                <div>
                  <dt>Financial profile</dt>
                  <dd>
                    {{
                      config.financial
                        ? 'Owner-approved ERC-3009 signing'
                        : 'Onboarding and access only'
                    }}
                  </dd>
                </div>
                <div>
                  <dt>Activation</dt>
                  <dd>
                    {{
                      config.activation.enabled
                        ? 'Enabled by operator attestation'
                        : 'Disabled'
                    }}
                  </dd>
                </div>
              </dl>
              <div class="callout">
                <strong
                  >Validation checks configuration, not vendor
                  acceptance.</strong
                >
                <p>
                  No wallet is created and no external service is called. Your
                  deployment still needs secrets, private storage, HTTPS and
                  verified backend/recovery acceptance.
                </p>
              </div>
              <button
                type="button"
                class="primary"
                :disabled="busy"
                @click="check"
              >
                {{ busy ? 'Checking…' : 'Validate configuration' }}
              </button>
              <div v-if="validated" class="export-panel">
                <div v-if="validated.warnings.length" class="readiness-panel">
                  <h3>Before this setup can serve users</h3>
                  <ul>
                    <li v-for="warning in validated.warnings" :key="warning">
                      {{ warning }}
                    </li>
                  </ul>
                  <p>
                    These are configuration observations. External integrations
                    have not been tested.
                  </p>
                </div>
                <h3>Your deployment files</h3>
                <p>
                  Download all three files. The environment template contains
                  names only.
                </p>
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
            >Advanced: custom adapters ↗</a
          >
        </footer>
      </div>
    </main>
  </div>
</template>
