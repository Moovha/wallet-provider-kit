<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type {
  SetupPlan,
  SetupProgress,
} from '../../src/deployment/setup-executor';
import type { RuntimeProgress } from '../../src/deployment/local-runtime';
import type { ProviderConfiguration } from '../model';
import { docs } from '../model';
const props = defineProps<{
  config?: ProviderConfiguration;
  request: (path: string, body?: unknown) => Promise<any>;
}>();
const emit = defineEmits<{ locked: [value: boolean] }>();
const plan = ref<SetupPlan>();
const runtime = ref<RuntimeProgress>();
let continueAfterInstall = false;
let initialPoll = true;
const progress = ref<SetupProgress>({ state: 'idle', steps: [] });
const secrets = ref<Record<string, string>>({});
const busy = ref(false);
const errors = ref<string[]>([]);
const canStart = computed(() =>
  plan.value?.secrets.every(
    ({ name, available }) => available || !!secrets.value[name],
  ),
);
let timer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
watch(
  () => props.config,
  () => {
    if (progress.value.state === 'idle') {
      plan.value = undefined;
      if (runtime.value?.state !== 'installing') runtime.value = undefined;
      secrets.value = {};
      errors.value = [];
    }
  },
);
function errorMessage(error: unknown) {
  try {
    errors.value = JSON.parse((error as Error).message);
  } catch {
    errors.value = [
      'Cannot reach the setup session. Check its terminal. Containers may still be running; use the saved deployment instructions to check or stop them.',
    ];
  }
}
async function preparePlan() {
  busy.value = true;
  errors.value = [];
  const snapshot = props.config;
  try {
    const result = await props.request('/api/setup/plan', snapshot);
    if (props.config === snapshot) plan.value = result;
  } catch (error) {
    errorMessage(error);
  } finally {
    busy.value = false;
  }
}
async function prepare() {
  busy.value = true;
  plan.value = undefined;
  errors.value = [];
  try {
    const snapshot = props.config;
    const result = await props.request('/api/runtime/check', snapshot);
    if (props.config !== snapshot) return;
    runtime.value = result;
    if (runtime.value?.state === 'ready') await preparePlan();
  } catch (error) {
    errorMessage(error);
  } finally {
    busy.value = false;
  }
}
async function installRuntime() {
  busy.value = true;
  errors.value = [];
  try {
    runtime.value = await props.request('/api/runtime/install', {});
    continueAfterInstall = true;
    emit('locked', true);
    void poll();
  } catch (error) {
    errorMessage(error);
  } finally {
    busy.value = false;
  }
}
async function poll() {
  try {
    runtime.value = await props.request('/api/runtime/status');
    progress.value = await props.request('/api/setup/status');
    if (progress.value.state !== 'idle' && progress.value.plan) {
      plan.value = progress.value.plan;
      emit('locked', true);
    }
    if (initialPoll && runtime.value?.steps.length) continueAfterInstall = true;
    initialPoll = false;
    if (runtime.value?.state === 'installing') {
      continueAfterInstall = true;
      emit('locked', true);
    } else if (continueAfterInstall && progress.value.state === 'idle') {
      emit('locked', false);
      if (runtime.value?.state !== 'ready' || props.config) {
        continueAfterInstall = false;
        if (runtime.value?.state === 'ready') await preparePlan();
      }
    }
  } catch (error) {
    errorMessage(error);
  }
  if (
    !disposed &&
    (continueAfterInstall ||
      runtime.value?.state === 'installing' ||
      ['running', 'complete'].includes(progress.value.state))
  )
    timer = setTimeout(
      poll,
      runtime.value?.state === 'installing' ||
        progress.value.state === 'running'
        ? 1500
        : 10000,
    );
}
async function start() {
  if (!plan.value || !canStart.value || busy.value) return;
  busy.value = true;
  errors.value = [];
  try {
    progress.value = await props.request('/api/setup/start', {
      plan: plan.value.id,
      secrets: secrets.value,
    });
    emit('locked', true);
    void poll();
  } catch (error) {
    errorMessage(error);
  } finally {
    secrets.value = {};
    busy.value = false;
  }
}
async function stop() {
  busy.value = true;
  errors.value = [];
  try {
    progress.value = await props.request('/api/setup/stop', {});
  } catch (error) {
    errorMessage(error);
  } finally {
    busy.value = false;
  }
}
onUnmounted(() => {
  disposed = true;
  clearTimeout(timer);
  secrets.value = {};
});
onMounted(() => {
  void poll();
});
</script>
<template>
  <section class="local-setup callout" aria-labelledby="local-setup-title">
    <h3 id="local-setup-title">Set up and run locally</h3>
    <p>
      Use Docker Compose to run the same service image and container security
      settings as a single-host deployment. Setup saves private files outside
      the checkout, prepares new persistent storage, starts the container and
      checks its health. Downloads are optional for this path.
    </p>
    <p>
      Setup checks Docker, Compose and the image builder on macOS or Linux. If
      tools are missing, install them here and continue automatically. The
      bundled OWS engine, private bundler and application paymaster support Safe
      wallets. The first image build needs network access and may take several
      minutes.
    </p>
    <p>
      Wallet operations must stay disabled. This creates a new isolated
      deployment, without changing any existing service. The public HTTPS origin
      and external acceptance remain separate tasks.
    </p>
    <ul v-if="errors.length" role="alert" class="issue-list">
      <li v-for="error in errors" :key="error">{{ error }}</li>
    </ul>
    <button
      v-if="progress.state === 'idle'"
      type="button"
      class="secondary"
      :disabled="busy || !config || runtime?.state === 'installing'"
      @click="prepare"
    >
      {{ busy ? 'Checking Docker…' : 'Check local setup prerequisites' }}
    </button>
    <div
      v-if="
        runtime && runtime.state !== 'unchecked' && progress.state === 'idle'
      "
      aria-live="polite"
    >
      <h4>Local container runtime</h4>
      <p>{{ runtime.message }}</p>
      <ul>
        <li v-for="check in runtime.checks" :key="check.id">
          {{ check.available ? '✓ Available' : 'Missing or stopped' }} ·
          {{ check.label }}
        </li>
      </ul>
      <ul v-if="runtime.canInstall">
        <li v-for="action in runtime.actions" :key="action">{{ action }}</li>
      </ul>
      <button
        v-if="runtime.canInstall"
        type="button"
        class="primary"
        :disabled="busy || !config"
        @click="installRuntime"
      >
        Install local runtime and continue
      </button>
      <ol v-if="runtime.steps.length" class="execution-progress">
        <li v-for="step in runtime.steps" :key="step.id">
          <strong>{{
            step.state === 'complete'
              ? '✓ Complete'
              : step.state === 'running'
                ? 'In progress'
                : step.state === 'failed'
                  ? 'Failed'
                  : 'Waiting'
          }}</strong>
          · {{ step.label }}
        </li>
      </ol>
      <p v-if="runtime.state === 'installing'">
        Keep the setup terminal running. Runtime installation continues if you
        close this page. Reopen the private session URL to see progress.
      </p>
    </div>
    <template v-if="plan">
      <dl class="export-summary">
        <div>
          <dt>Private deployment directory</dt>
          <dd class="local-path">{{ plan.directory }}</dd>
        </div>
        <div>
          <dt>Local API</dt>
          <dd>http://127.0.0.1:{{ plan.port }}</dd>
        </div>
        <div>
          <dt>Public origin retained in configuration</dt>
          <dd>{{ plan.config.policy.provider.origin }}</dd>
        </div>
      </dl>
      <ul>
        <li v-for="change in plan.changes" :key="change">{{ change }}</li>
      </ul>
      <template v-if="progress.state === 'idle'">
        <h4>Supply deployment secrets</h4>
        <p>
          Values are sent only to this local setup process and saved in
          provider.env with owner-only permissions. They are plaintext on the
          host and mounted read-only into the container. They are never included
          in downloads, progress or browser storage. Use isolated test
          credentials.
        </p>
        <div
          v-for="secret in plan.secrets"
          :key="secret.name"
          class="setup-secret"
        >
          <p v-if="secret.generated">
            <strong>{{ secret.name }}</strong> — generated during setup and
            retained privately.
          </p>
          <p v-else-if="secret.available">
            <strong>{{ secret.name }}</strong> — available in the wizard process
            environment; it will be copied to the private file.
          </p>
          <label v-else
            >{{ secret.name
            }}<textarea
              v-model="secrets[secret.name]"
              :aria-label="secret.name"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              rows="2"
              class="secret-value"
            />
          </label>
        </div>
        <p>
          Starting setup builds an image, writes the displayed directory and
          initializes its new database. The container stays running after you
          close the wizard while Docker is running, and uses an unless-stopped
          restart policy.
        </p>
        <button
          type="button"
          class="primary"
          :disabled="busy || !canStart"
          @click="start"
        >
          Start local setup
        </button>
      </template>
      <div
        v-if="progress.state !== 'idle'"
        aria-live="polite"
        aria-atomic="true"
      >
        <h4>
          {{
            progress.state === 'running'
              ? 'Setup in progress'
              : progress.state === 'complete'
                ? 'Local service running · wallet operations disabled'
                : progress.state === 'stopped'
                  ? 'Local service stopped'
                  : 'Setup needs attention'
          }}
        </h4>
        <ol class="execution-progress">
          <li v-for="step in progress.steps" :key="step.id">
            <strong>{{
              step.state === 'complete'
                ? '✓ Complete'
                : step.state === 'running'
                  ? 'In progress'
                  : step.state === 'failed'
                    ? 'Failed'
                    : 'Waiting'
            }}</strong>
            · {{ step.label }}
          </li>
        </ol>
        <p>{{ progress.message }}</p>
        <p v-if="progress.cleanup === 'unconfirmed'" role="alert">
          Stopping the container could not be confirmed. Use the saved Compose
          stop command before investigating.
        </p>
        <p v-if="progress.state === 'running'">
          Keep this page open to follow progress. Closing it does not cancel
          setup.
        </p>
        <p>
          Saved files: provider.config.json, provider.env, compose.json and
          provider-setup.md. The saved instructions include status, stop and
          restart commands. Do not initialize storage again or delete records to
          repair a failure.
        </p>
        <p>
          The private provider-setup.status.json file records the last observed
          step for recovery after this session ends.
        </p>
        <button
          v-if="progress.state === 'complete' || progress.state === 'failed'"
          type="button"
          class="secondary"
          :disabled="busy"
          @click="stop"
        >
          Stop local service
        </button>
        <div v-if="progress.state === 'complete' && plan.config.management">
          <p>
            Read the private
            <code>{{ plan.directory }}/installation-claim</code> file on this
            computer. Use it once to create the provider administrator; it
            expires 30 minutes after the first service startup.
          </p>
          <a
            :href="`http://127.0.0.1:${plan.port}/admin/`"
            target="_blank"
            rel="noreferrer"
            >Open provider administration ↗</a
          >
        </div>
        <p v-if="progress.state === 'complete'">
          <a
            :href="`http://127.0.0.1:${plan.port}/health/live`"
            target="_blank"
            rel="noreferrer"
            >Open local liveness ↗</a
          >
          ·
          <a
            :href="`http://127.0.0.1:${plan.port}/v1/capabilities`"
            target="_blank"
            rel="noreferrer"
            >Open local capabilities ↗</a
          >
        </p>
      </div>
      <p>
        <a :href="docs + 'local-setup.html'" target="_blank" rel="noreferrer"
          >Local setup, recovery and final-host handoff ↗</a
        >
      </p>
    </template>
    <p v-if="!plan">
      <a :href="docs + 'local-setup.html'" target="_blank" rel="noreferrer"
        >Runtime installation, prerequisites and recovery ↗</a
      >
    </p>
  </section>
</template>
