<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AdvancedSetup from './AdvancedSetup.vue';
import LocalSetup from './components/LocalSetup.vue';
import { configureSafeWalletRuntime } from '../src/deployment/application-defaults';
import { emptyConfiguration, type ProviderConfiguration } from './model';
const advanced = new URLSearchParams(window.location.search).has('advanced');
const token = advanced ? '' : window.location.hash.slice(1);
if (!advanced) window.history.replaceState(null, '', window.location.pathname);
const step = ref(1),
  target = ref('local'),
  locked = ref(false),
  busy = ref(false),
  error = ref('');
const config = ref<ProviderConfiguration>();
const origin = ref('https://localhost'),
  name = ref('Wallet provider'),
  privacy = ref('https://localhost/privacy');
const network = ref<'base' | 'base-sepolia'>('base');
const valid = computed(
  () =>
    !!name.value.trim() &&
    /^https:\/\/[^\s]+$/.test(origin.value) &&
    /^https:\/\/[^\s]+$/.test(privacy.value),
);
async function request(path: string, body?: unknown) {
  const result = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    credentials: 'omit',
    cache: 'no-store',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await result.json();
  if (!result.ok)
    throw new Error(
      JSON.stringify(
        value.issues ?? [
          'This setup session is unavailable. Reopen the private link from the setup terminal.',
        ],
      ),
    );
  return value;
}
onMounted(async () => {
  if (advanced) return;
  try {
    const value = await request('/api/template');
    if (value.execution?.plan?.config.management) {
      config.value = value.execution.plan.config;
      locked.value = true;
      step.value = 3;
      return;
    }
    const draft = emptyConfiguration(value.config);
    draft.management = {
      claim: { env: 'WALLET_INSTALLATION_CLAIM' },
      localOrigin: 'http://127.0.0.1:8080',
    };
    draft.policy.applications = [];
    draft.authorizationServer!.clients = [];
    draft.authorizationServer!.operatorClients = [];
    draft.runtimeConfiguration!.operators = [];
    delete draft.apiExplorer;
    delete draft.ownerLogin;
    draft.http = { ...draft.http, documentation: true, ingress: 'existing' };
    config.value = draft;
  } catch {
    error.value =
      'Cannot load this private setup session. Reopen the link printed by the setup command.';
  }
});
async function review() {
  if (!config.value || !valid.value) return;
  busy.value = true;
  error.value = '';
  try {
    config.value.policy.provider = {
      name: name.value,
      origin: origin.value,
      privacyUrl: privacy.value,
    };
    config.value.network = network.value;
    config.value.oauth = {
      issuer: origin.value + '/oauth',
      audience: origin.value + '/api',
      jwksUrl: origin.value + '/oauth/jwks',
    };
    // Pin the selected chain's infrastructure before server validation.
    configureSafeWalletRuntime(config.value);
    await request('/api/validate', config.value);
    step.value = 3;
  } catch (failure) {
    try {
      error.value = JSON.parse((failure as Error).message).join(' ');
    } catch {
      error.value = 'Check the deployment settings and try again.';
    }
  } finally {
    busy.value = false;
  }
}
function openAdvanced() {
  window.location.assign('/?advanced#' + token);
}
</script>
<template>
  <AdvancedSetup v-if="advanced" />
  <div v-else class="installation-shell">
    <header>
      <strong>Moovha <small>Wallet Provider Kit</small></strong
      ><button class="secondary" :disabled="locked" @click="openAdvanced">
        Advanced configuration
      </button>
    </header>
    <main>
      <span class="eyebrow">PROVIDER INSTALLATION</span>
      <h1>Deploy your wallet provider</h1>
      <p>
        Start the service and secure administrator access. Connect applications
        and configure their policies and sponsorship afterward.
      </p>
      <ol class="installation-steps" aria-label="Installation progress">
        <li
          v-for="(label, index) in [
            'Choose destination',
            'Review deployment',
            'Deploy and open administration',
          ]"
          :key="label"
          :aria-current="step === index + 1 ? 'step' : undefined"
        >
          {{ index + 1 }}. {{ label }}
        </li>
      </ol>
      <p v-if="error" role="alert">{{ error }}</p>
      <section v-if="step === 1">
        <h2>Where should it run?</h2>
        <div class="destination-options">
          <button
            v-for="[value, title, detail] in [
              ['local', 'This computer', 'Reuse your local container runtime.'],
              [
                'server',
                'Existing server',
                'Install on a Linux server you control.',
              ],
              [
                'cloud',
                'Cloud account',
                'Review a deployment template in your cloud console.',
              ],
            ]"
            :key="value"
            :aria-pressed="target === value"
            @click="target = value"
          >
            <strong>{{ title }}</strong
            ><span>{{ detail }}</span>
          </button>
        </div>
        <template v-if="target === 'local'"
          ><p>
            The source setup tool builds the current checkout. Versioned release
            bundles use prebuilt images and do not require Node or a source
            build.
          </p>
          <button class="primary" :disabled="!config" @click="step = 2">
            Continue
          </button></template
        >
        <template v-else
          ><p v-if="target === 'server'">
            Use the installer in a versioned release bundle on your server. It
            checks Docker, prepares private storage and starts the same service.
            Your SSH and cloud credentials stay with your infrastructure tools.
          </p>
          <p v-else>
            The AWS template creates one Linux VM and an encrypted persistent
            disk. Review resources, network access and costs in AWS before
            creating the stack. Cloud acceptance must be completed separately.
          </p>
          <p>
            <a
              href="https://moovha.github.io/wallet-provider-kit/docs/provider-installation.html"
              target="_blank"
              rel="noreferrer"
              >Open installation instructions ↗</a
            >
          </p>
          <p>
            <a
              href="https://github.com/Moovha/wallet-provider-kit/releases"
              target="_blank"
              rel="noreferrer"
              >View available release bundles ↗</a
            >
          </p></template
        >
      </section>
      <form v-else-if="step === 2" @submit.prevent="review">
        <h2>Review deployment</h2>
        <p>
          No application, RPC credential, sponsor funding or external identity
          provider is needed.
        </p>
        <label
          >Provider name<input v-model="name" required maxlength="100"
        /></label>
        <details>
          <summary>Provider identity and network</summary>
          <p>
            Local evaluation uses localhost. Choose the final HTTPS origin
            before connecting real applications; deployment identity is
            retained.
          </p>
          <label
            >HTTPS origin<input v-model="origin" type="url" required /></label
          ><label
            >Privacy notice URL<input
              v-model="privacy"
              type="url"
              required /></label
          ><label
            >Network<select v-model="network">
              <option value="base">Base</option>
              <option value="base-sepolia">Base Sepolia</option>
            </select></label
          >
        </details>
        <p>
          Data and secrets are saved in a private deployment directory. HTTP
          access stays on this computer’s loopback interface. Wallet operations
          start disabled.
        </p>
        <button class="secondary" type="button" @click="step = 1">Back</button>
        <button class="primary" :disabled="busy || !valid">
          {{ busy ? 'Validating…' : 'Review and deploy' }}
        </button>
      </form>
      <section v-else>
        <h2>Deploy and open administration</h2>
        <LocalSetup
          :config="config"
          :request="request"
          @locked="locked = $event"
        />
      </section>
    </main>
  </div>
</template>
<style scoped>
.installation-shell {
  max-width: 1100px;
  margin: 0 auto;
  padding: 28px;
}
.installation-shell header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 24px;
  border-bottom: 1px solid #d5dde3;
}
.installation-shell header strong {
  font-size: 24px;
  color: #0f2338;
}
.installation-shell header small {
  font-size: 13px;
  font-weight: 450;
  display: block;
}
.installation-shell main {
  margin: 46px 0;
}
.installation-shell h1 {
  font-size: clamp(30px, 5vw, 42px);
  line-height: 1.2;
}
.installation-shell p {
  max-width: 800px;
  line-height: 1.7;
  color: #4a6070;
}
.installation-shell section,
.installation-shell form {
  background: white;
  border: 1px solid #d5dde3;
  border-radius: 12px;
  padding: 28px;
}
.installation-steps {
  display: flex;
  list-style: none;
  gap: 20px;
  padding: 0;
  flex-wrap: wrap;
  margin: 32px 0;
  color: #526575;
}
.installation-steps [aria-current='step'] {
  font-weight: 700;
  color: #0f2338;
}
.destination-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
}
.destination-options button {
  padding: 22px;
  text-align: left;
  border: 1px solid #b6c6d1;
  background: #fff;
  border-radius: 9px;
}
.destination-options button[aria-pressed='true'] {
  background: #e5f8fc;
  border-color: #12a5bf;
}
.destination-options strong,
.destination-options span {
  display: block;
}
.destination-options span {
  font-size: 14px;
  margin-top: 10px;
  font-weight: 400;
  color: #4a6070;
}
.installation-shell label {
  display: block;
  margin: 18px 0;
  font-weight: 600;
}
.installation-shell input,
.installation-shell select {
  display: block;
  width: 100%;
  max-width: 640px;
  padding: 12px;
  border: 1px solid #9eb1bf;
  border-radius: 6px;
  margin-top: 7px;
}
.installation-shell details {
  margin: 24px 0;
}
.installation-shell summary {
  cursor: pointer;
}
.installation-shell [role='alert'] {
  color: #982d29;
}
:focus-visible {
  outline: 3px solid #12bfde;
  outline-offset: 3px;
}
@media (max-width: 700px) {
  .destination-options {
    grid-template-columns: 1fr;
  }
  .installation-shell {
    padding: 20px;
  }
  .installation-shell section,
  .installation-shell form {
    padding: 20px;
  }
}
</style>
