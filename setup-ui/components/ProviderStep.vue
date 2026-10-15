<script setup lang="ts">
import type { ProviderConfiguration } from '../model';
const model = defineModel<ProviderConfiguration>({ required: true });
</script>
<template>
  <div class="step-heading">
    <span class="eyebrow">Your service</span>
    <h2>Make it yours</h2>
    <p>Set the name and address that account owners will recognise.</p>
  </div>
  <FormKit
    v-model="model.policy.provider.name"
    type="text"
    label="Provider name"
    placeholder="Acme Wallets"
    validation="required|length:1,100"
  />
  <div class="field-grid">
    <FormKit
      v-model="model.policy.provider.origin"
      type="url"
      label="Service HTTPS origin"
      placeholder="https://wallet.acme.com"
      validation="required|https_origin"
      help="Your public wallet service origin, without a path."
    />
    <FormKit
      v-model="model.policy.provider.privacyUrl"
      type="url"
      label="Privacy notice URL"
      placeholder="https://acme.com/privacy"
      validation="required|https_url"
    />
  </div>
  <div class="callout">
    <strong>Existing services come first.</strong>
    <p>
      You will need a login provider, an identity verification vendor and a
      supported wallet backend. Their setup links are included in the next
      steps.
    </p>
  </div>
</template>
