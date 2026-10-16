<script setup lang="ts">
import SetupField from './SetupField.vue';
import { docs } from '../model';
import type { ProviderConfiguration } from '../model';
const model = defineModel<ProviderConfiguration>({ required: true });
</script>
<template>
  <div class="step-heading">
    <span class="eyebrow">Your service</span>
    <h2>Name your wallet service</h2>
    <p>
      Give your wallet service a name and a public web address. People will see
      these when they sign in and approve access to their wallets.
    </p>
  </div>
  <div class="callout step-orientation">
    <strong>Start with the address you plan to host</strong>
    <p>
      If your company website is acme.com, you could use wallet.acme.com for
      this service. You choose that hostname under a domain you own, then
      connect it to your server and add HTTPS during deployment.
      <a
        :href="docs + 'operator-deployment.html#publish-through-https'"
        target="_blank"
        rel="noopener noreferrer"
        >How to prepare the address ↗</a
      >
    </p>
    <p>
      This local wizard only prepares configuration files. It does not buy a
      domain or set up hosting. The supported service uses Base Sepolia, a
      blockchain test network. It is experimental and is not approved for
      production custody.
    </p>
  </div>
  <SetupField
    guide="providerName"
    v-model="model.policy.provider.name"
    type="text"
    label="Provider name"
    placeholder="Acme Wallets"
    validation="required|length:1,100"
  />
  <div class="field-grid">
    <SetupField
      guide="origin"
      v-model="model.policy.provider.origin"
      type="url"
      label="Public wallet service address"
      placeholder="https://wallet.acme.com"
      validation="required|https_origin"
    />
    <SetupField
      guide="privacy"
      v-model="model.policy.provider.privacyUrl"
      type="url"
      label="Privacy notice URL"
      placeholder="https://acme.com/privacy"
      validation="required|https_url"
    />
  </div>
  <div class="callout">
    <strong>What you’ll connect next</strong>
    <p>
      A wallet backend creates accounts and signs approved actions. A login
      service signs people in. Start with application-supplied records for an
      unfunded evaluation, or connect a vendor for external identity checks.
      Your staff review the submitted records or evidence. Each step explains
      which details to copy and which values you choose yourself.
    </p>
    <a
      :href="docs + 'operator-services.html'"
      target="_blank"
      rel="noopener noreferrer"
      >Prepare the required services ↗</a
    >
  </div>
</template>
