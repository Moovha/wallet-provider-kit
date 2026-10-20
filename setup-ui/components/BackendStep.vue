<script setup lang="ts">
import AdvancedSettings from './AdvancedSettings.vue';
import SetupField from './SetupField.vue';
import SecretField from './SecretField.vue';
import { docs, type ProviderConfiguration } from '../model';
const model = defineModel<ProviderConfiguration>({ required: true });
</script>
<template>
  <div class="step-heading">
    <span class="eyebrow">Looking after wallets</span>
    <h2>A wallet for each person</h2>
    <p>
      Each person gets their own Safe wallet address for deposits and approved
      transactions. The included wallet tools keep signing keys private.
      Connected applications arrange payment of network fees separately.
    </p>
  </div>
  <template v-if="model.backend.kind === 'ows'">
    <div class="callout">
      <strong>Private wallet storage is included</strong>
      <p>
        Setup creates a private vault that stays in place when the service
        restarts. It also creates a password if one is missing. Keep the saved
        passwords and back up both the vault and the service records so you can
        recover them together.
      </p>
    </div>
    <AdvancedSettings label="Advanced vault settings">
      <SetupField
        guide="vault"
        v-model="model.backend.vaultDirectory"
        type="text"
        label="Private wallet folder"
        validation="required|length:1,256"
      />
      <SecretField
        guide="passphrase"
        v-model="model.backend.passphrase"
        label="Wallet storage password"
      />
      <p class="help-text">
        Use a password of 16–4096 characters to unlock the vault. An OWS agent
        token cannot replace this password.
      </p>
    </AdvancedSettings>
  </template>
  <p class="help-text">
    Keep the generated wallet environment ID with your saved settings. Changing
    it can disconnect stored accounts from their wallets.
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
