<script setup lang="ts">
import AdvancedSettings from './AdvancedSettings.vue';
import SetupField from './SetupField.vue';
import SecretField from './SecretField.vue';
import { docs, type ProviderConfiguration } from '../model';
const model = defineModel<ProviderConfiguration>({ required: true });
</script>
<template>
  <div class="step-heading">
    <span class="eyebrow">Wallet infrastructure</span>
    <h2>Your Safe wallet backend</h2>
    <p>
      Each user receives one Safe address for deposits, balances and
      transactions. The bundled OWS engine holds its private signer. A private
      ERC-4337 bundler submits approved operations and an application-owned
      paymaster covers gas.
    </p>
  </div>
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
  <p class="help-text">
    Keep the wallet environment ID with the saved configuration across restarts.
  </p>
  <AdvancedSettings label="Advanced wallet environment settings">
    <SetupField
      guide="binding"
      v-model="model.backend.binding"
      type="text"
      label="Wallet environment name"
      validation="required|length:1,256"
    />
  </AdvancedSettings>
  <p class="help-text">
    <a
      :href="docs + 'self-hosted-sponsorship.html'"
      target="_blank"
      rel="noopener noreferrer"
      >Safe wallets and sponsorship guide ↗</a
    >
  </p>
</template>
