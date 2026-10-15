<script setup lang="ts">
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
      The kit handles permissions and signing coordination for all three
      supported choices.
    </p>
  </div>
  <div class="provider-cards" role="group" aria-label="Wallet backend">
    <button
      v-for="backend in backends"
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
  <FormKit
    v-model="model.backend.binding"
    type="text"
    label="Stable backend binding"
    placeholder="acme-sepolia-wallets"
    validation="required|length:1,256"
    help="A permanent name for this wallet environment. Retain it across credential rotations and restarts."
  />
  <template v-if="model.backend.kind === 'cdp'">
    <div class="callout">
      <strong>Prepare your CDP project</strong>
      <p>
        Create API and wallet credentials in your existing CDP project. Enter
        the names of their deployment variables below.
      </p>
    </div>
    <SecretField v-model="model.backend.apiKeyId" label="CDP API key ID" />
    <SecretField
      v-model="model.backend.apiKeySecret"
      label="CDP API key secret"
    />
    <SecretField
      v-model="model.backend.walletSecret"
      label="CDP wallet secret"
    />
  </template>
  <template v-if="model.backend.kind === 'ows'">
    <div class="callout">
      <strong>Prepare your local vault</strong>
      <p>
        Install the pinned OWS engine and create a private, persistent vault on
        the deployment host. Preserve both vault and database backups. The
        reference Docker image does not include the engine.
      </p>
    </div>
    <FormKit
      v-model="model.backend.vaultDirectory"
      type="text"
      label="OWS vault directory"
      validation="required|length:1,256"
      help="Relative paths resolve beside the exported configuration on your deployment host."
    />
    <SecretField
      v-model="model.backend.passphrase"
      label="OWS owner passphrase"
    />
    <p class="help-text">
      Use an owner passphrase of 16–4096 characters at deployment. Agent tokens
      cannot be used.
    </p>
  </template>
  <template v-if="model.backend.kind === 'openzeppelin-relayer'">
    <FormKit
      v-model="relayer.url"
      type="url"
      label="Relayer HTTPS origin"
      placeholder="https://relayer.acme.com"
      validation="required|https_origin"
    />
    <SecretField v-model="relayer.apiKey" label="Relayer API key" />
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
        <FormKit
          v-model="signer.relayerId"
          type="text"
          label="Relayer ID"
          :validation="[['required'], ['matches', /^[a-zA-Z0-9_-]{1,64}$/]]"
        /><FormKit
          v-model="signer.signerId"
          type="text"
          label="Signer ID"
          :validation="[['required'], ['matches', /^[a-zA-Z0-9_-]{1,64}$/]]"
        />
      </div>
      <FormKit
        v-model="signer.address"
        type="text"
        label="Signer wallet address"
        :validation="[['required'], ['matches', /^0x[0-9a-fA-F]{40}$/]]"
        help="Base Sepolia EOA address already assigned to this signer. Binding revision is fixed at 1."
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
    Need another backend?
    <a
      :href="docs + 'custom-adapters.html'"
      target="_blank"
      rel="noopener noreferrer"
      >Custom adapters are the advanced development path ↗</a
    >
  </p>
</template>
