<script setup lang="ts">
import SetupField from './SetupField.vue';
import { docs } from '../model';
import type { ProviderConfiguration } from '../model';
const model = defineModel<ProviderConfiguration>({ required: true });
</script>
<template>
  <div class="step-heading">
    <span class="eyebrow">Before you start</span>
    <h2>Prepare your wallet service configuration</h2>
    <p>
      This wizard turns your service choices and access rules into files for
      your deployment. You are preparing settings locally; your wallet service
      starts serving applications after you deploy and test it on your server.
    </p>
  </div>
  <div class="callout step-orientation">
    <strong>What you’ll do and take away</strong>
    <ol class="setup-journey">
      <li>
        <strong>Choose your settings.</strong> Name the service, connect an
        existing wallet backend and token issuer, then define application trust,
        permissions and limits. Enter secret variable names here; supply their
        values privately on your server.
      </li>
      <li>
        <strong>Check and download.</strong> Export provides your configuration,
        a secret-variable template and a deployment checklist. Validation checks
        the settings for completeness and consistency.
      </li>
      <li>
        <strong>Deploy, test and enable.</strong> Follow the checklist to
        install the service, supply secrets, prepare storage and HTTPS, and test
        your integrations before enabling wallet operations.
      </li>
    </ol>
    <p>
      Editing this draft does not change a running service. To apply later
      changes, import your saved configuration, edit it, export again and
      restart your deployment with the reviewed files.
    </p>
  </div>
  <div class="section-heading"><h3>Name your wallet service</h3></div>
  <p class="help-text">
    Connected applications use this name and public address to identify your
    service and request wallet access.
  </p>
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
  <div class="callout">
    <strong>What you’ll connect next</strong>
    <p>
      A wallet backend creates accounts and signs approved actions. Connected
      applications authenticate users, complete identity checks and record
      wallet-access consent. Your provider evaluates their evidence under the
      trust agreements and policy you configure. Users remain in the
      application.
    </p>
    <a
      :href="docs + 'operator-services.html'"
      target="_blank"
      rel="noopener noreferrer"
      >Prepare the required services ↗</a
    >
  </div>
</template>
