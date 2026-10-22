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
  name = ref('Wallet service'),
  privacy = ref('https://localhost/privacy');
const network = ref<'base' | 'base-sepolia' | 'ethereum-sepolia'>('base');
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
      <span class="eyebrow">GETTING STARTED</span>
      <h1>Let’s set up your wallet service</h1>
      <p>
        Choose where your service will run. Once it’s ready, you can sign in,
        add applications and decide how they use wallets.
      </p>
      <ol class="installation-steps" aria-label="Installation progress">
        <li
          v-for="(label, index) in [
            'Choose where to run',
            'Review your setup',
            'Start and sign in',
          ]"
          :key="label"
          :aria-current="step === index + 1 ? 'step' : undefined"
        >
          {{ index + 1 }}. {{ label }}
        </li>
      </ol>
      <p v-if="error" role="alert">{{ error }}</p>
      <section v-if="step === 1">
        <h2>Where would you like to run it?</h2>
        <div class="destination-options">
          <button
            v-for="[value, title, detail] in [
              ['local', 'This computer', 'Try it on this computer first.'],
              [
                'server',
                'Existing server',
                'Install on a Linux server you control.',
              ],
              [
                'cloud',
                'Cloud account',
                'Set it up in your own cloud account.',
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
            This setup builds the service on your computer. It uses Docker to
            keep your service and its data separate from other installations.
          </p>
          <button class="primary" :disabled="!config" @click="step = 2">
            Continue
          </button></template
        >
        <template v-else
          ><p v-if="target === 'server'">
            Your server keeps your service running independently of this
            computer. Open the installation guide for the release installer and
            the settings you’ll need. Keep your server sign-in details in your
            usual administration tools.
          </p>
          <p v-else>
            For AWS, the supplied template sets up one server and encrypted
            storage. Review what it will create and what it will cost in AWS
            before starting. This cloud option still needs deployment testing.
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
        <h2>Make it yours</h2>
        <p>
          Just a name to get started. You can connect applications, arrange
          network fees and set up user checks later.
        </p>
        <label
          >Service name<input v-model="name" required maxlength="100"
        /></label>
        <details>
          <summary>Service address and network</summary>
          <p>
            For a local trial, keep the supplied addresses. Before connecting
            real applications, choose the secure web address your service will
            keep using.
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
              <option value="ethereum-sepolia">Ethereum Sepolia</option>
            </select></label
          >
        </details>
        <p>
          Your settings and private data stay in a separate folder on this
          computer. Only this computer can open the local service. Wallet
          operations start disabled.
        </p>
        <div class="installation-actions">
          <button class="secondary" type="button" @click="step = 1">
            Back
          </button>
          <button class="primary" :disabled="busy || !valid">
            {{ busy ? 'Validating…' : 'Continue to setup' }}
          </button>
        </div>
      </form>
      <section v-else>
        <h2>Let’s get your service running</h2>
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
.installation-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
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
