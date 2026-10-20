<script setup lang="ts">
import AdvancedSettings from './AdvancedSettings.vue';
import SetupField from './SetupField.vue';
import { computed } from 'vue';
import {
  backends,
  docs,
  newBackend,
  type BackendKind,
  type ProviderConfiguration,
} from '../model';
import SecretField from './SecretField.vue';
const model = defineModel<ProviderConfiguration>({ required: true });
const selected = computed(() =>
  backends.find((b) => b.kind === model.value.backend.kind)!,
);
function select(kind: BackendKind) {
  if (model.value.backend.kind !== kind) model.value.backend = newBackend(kind);
}
const relayer = computed(() => {
  const backend = model.value.backend;
  if (backend.kind !== 'openzeppelin-relayer')
    throw new Error('Relayer not selected');
  return backend;
});
function addSigner() {
  const backend = model.value.backend;
  if (backend.kind === 'openzeppelin-relayer' && backend.signers.length < 100)
    backend.signers.push({
      relayerId: '',
      signerId: '',
      address: '',
      bindingRevision: '1',
    });
}
function removeSigner(index: number) {
  const backend = model.value.backend;
  if (backend.kind === 'openzeppelin-relayer' && backend.signers.length > 1)
    backend.signers.splice(index, 1);
}
</script>
<template>
  <div class="step-heading">
    <span class="eyebrow">Wallet infrastructure</span>
    <h2>Choose your wallet backend</h2>
    <p>
      The signing engine authorizes approved operations. In the Safe-only
      profile, each user receives one Safe address for deposits, balances and
      transactions.
    </p>
  </div>
  <div class="callout step-orientation">
    <strong>Choose one option to set up</strong>
    <p>
      The recommended OWS option includes a local engine and private wallet
      vault. CDP optionally connects to a managed Coinbase project. Relayer
      connects to a separate signing service you already operate. All three
      profiles are experimental and support Base mainnet or Base Sepolia
      accounts only.
    </p>
    <p>
      Credential fields below contain variable names: labels that tell the
      server where to find each secret. Keep the supplied names for a first
      setup. Bundled setup generates missing local credentials privately. Supply
      external-service credential values during deployment.
    </p>
  </div>
  <div class="provider-cards" role="group" aria-label="Wallet backend">
    <button
      v-for="backend in backends.filter(
        (b) => !model.safeWallet || b.kind === 'ows',
      )"
      :key="backend.kind"
      type="button"
      class="provider-card"
      :class="{ selected: model.backend.kind === backend.kind }"
      :aria-pressed="model.backend.kind === backend.kind"
      :aria-label="backend.name"
      @click="select(backend.kind)"
    >
      <img
        :src="'/providers/' + backend.image"
        :alt="backend.name + ' logo'"
        width="44"
        height="44"
      />
      <strong>{{ backend.name }}</strong
      ><span>{{ backend.detail }}</span>
      <p>{{ backend.description }}</p>
    </button>
  </div>
  <div class="reference-links">
    <a :href="selected.url" target="_blank" rel="noopener noreferrer"
      >{{ selected.name }} documentation ↗</a
    ><a :href="selected.guide" target="_blank" rel="noopener noreferrer"
      >Kit adapter guide ↗</a
    >
  </div>
  <template v-if="model.backend.kind === 'cdp'">
    <div class="callout">
      <strong>Prepare your CDP project</strong>
      <p>
        Supply API and wallet credentials from your existing CDP project
        privately during deployment. Standard variable names are supplied.
      </p>
    </div>
    <AdvancedSettings label="Advanced CDP credential variables">
      <SecretField
        guide="cdpKeyId"
        v-model="model.backend.apiKeyId"
        label="CDP API key ID"
      />
      <SecretField
        guide="cdpKeySecret"
        v-model="model.backend.apiKeySecret"
        label="CDP API key secret"
      />
      <SecretField
        guide="cdpWalletSecret"
        v-model="model.backend.walletSecret"
        label="CDP wallet secret"
      />
    </AdvancedSettings>
  </template>
  <template v-if="model.backend.kind === 'ows'">
    <div class="callout">
      <strong>Your local vault is included</strong>
      <p>
        The pinned engine is included in the standard image. Setup creates a
        private, persistent vault and generates a missing owner passphrase.
        Retain the environment file and back up both vault and database.
      </p>
    </div>
    <AdvancedSettings label="Advanced vault settings">
      <SetupField
        guide="vault"
        v-model="model.backend.vaultDirectory"
        type="text"
        label="OWS vault directory"
        validation="required|length:1,256"
      />
      <SecretField
        guide="passphrase"
        v-model="model.backend.passphrase"
        label="OWS owner passphrase"
      />
      <p class="help-text">
        Use an owner passphrase of 16–4096 characters at deployment. Agent
        tokens cannot be used.
      </p>
    </AdvancedSettings>
  </template>
  <template v-if="model.backend.kind === 'openzeppelin-relayer'">
    <SetupField
      guide="relayerOrigin"
      v-model="relayer.url"
      type="url"
      label="Relayer service address"
      placeholder="https://relayer.acme.com"
      validation="required|https_origin"
    />
    <AdvancedSettings label="Advanced Relayer credential variable">
      <SecretField
        guide="relayerKey"
        v-model="relayer.apiKey"
        label="Relayer API key"
      />
    </AdvancedSettings>
    <div class="section-heading">
      <h3>Existing signer pool</h3>
      <button
        type="button"
        class="secondary"
        :disabled="relayer.signers.length >= 100"
        @click="addSigner"
      >
        Add signer
      </button>
    </div>
    <fieldset
      v-for="(signer, index) in relayer.signers"
      :key="index"
      class="repeat-row"
    >
      <legend>Signer {{ index + 1 }}</legend>
      <div class="field-grid">
        <SetupField
          guide="relayerId"
          v-model="signer.relayerId"
          type="text"
          label="Relayer ID"
          :validation="[['required'], ['matches', /^[a-zA-Z0-9_-]{1,64}$/]]"
        /><SetupField
          guide="signerId"
          v-model="signer.signerId"
          type="text"
          label="Signer ID"
          :validation="[['required'], ['matches', /^[a-zA-Z0-9_-]{1,64}$/]]"
        />
      </div>
      <SetupField
        guide="signerAddress"
        v-model="signer.address"
        type="text"
        label="Signer wallet address"
        :validation="[['required'], ['matches', /^0x[0-9a-fA-F]{40}$/]]"
      />
      <button
        type="button"
        class="text-button"
        :disabled="relayer.signers.length === 1"
        @click="removeSigner(index)"
      >
        Remove signer {{ index + 1 }}
      </button>
    </fieldset>
  </template>
  <p class="help-text">
    Setup supplies a stable wallet environment ID. Keep it with your saved
    configuration across restarts and credential rotations.
  </p>
  <AdvancedSettings label="Advanced wallet environment settings">
    <SetupField
      guide="binding"
      v-model="model.backend.binding"
      type="text"
      label="Wallet environment name"
      placeholder="acme-sepolia-wallets"
      validation="required|length:1,256"
    />
  </AdvancedSettings>
  <p class="help-text">
    Need another backend?
    <a
      :href="docs + 'custom-adapters.html'"
      target="_blank"
      rel="noopener noreferrer"
      >Custom adapters are the advanced development path ↗</a
    >
  </p>
</template>
