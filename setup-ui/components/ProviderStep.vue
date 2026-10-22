<script setup lang="ts">
import { providerNetwork } from '../../src/networks';
import SetupField from './SetupField.vue';
import { docs } from '../model';
import type { ProviderConfiguration } from '../model';
const model = defineModel<ProviderConfiguration>({ required: true });
</script>
<template>
  <div class="step-heading">
    <span class="eyebrow">Before you start</span>
    <h2>Make your wallet service yours</h2>
    <p>
      Choose a name, connect the services you need and decide which applications
      can ask for wallet access. You can run the service here or save the
      settings for another server.
    </p>
  </div>
  <div class="callout step-orientation">
    <strong>A few steps to get you started</strong>
    <ol class="setup-journey">
      <li>
        <strong>Choose your settings.</strong> Name your service, keep the
        included wallet tools and choose how applications can connect. Setup
        fills in the internal details for you. You can connect existing services
        if you need them.
      </li>
      <li>
        <strong>Validate and start.</strong> At the final step, review your
        settings and the setup plan. Add any missing passwords or secrets, then
        let setup start and check your service.
      </li>
      <li>
        <strong>Test and enable.</strong> Wallet operations start disabled. Test
        secure access, application permissions, wallet behavior and recovery
        before enabling them. You can also download the settings for a separate
        server.
      </li>
    </ol>
    <p>
      Editing this draft does not change a running service. To apply later
      changes, import your saved configuration, edit it, export again and
      restart your deployment with the reviewed files.
    </p>
  </div>
  <label for="provider-network">Blockchain network</label>
  <select
    id="provider-network"
    :value="model.network ?? 'base-sepolia'"
    @change="
      model.network = ($event.target as HTMLSelectElement).value as
        'base' | 'base-sepolia' | 'ethereum-sepolia'
    "
  >
    <option value="base">Base mainnet (8453)</option>
    <option value="base-sepolia">Base Sepolia testnet (84532)</option>
    <option value="ethereum-sepolia">
      Ethereum Sepolia testnet (11155111)
    </option>
  </select>
  <p class="help-text">
    Keep test and live networks in separate installations. Mainnet uses real
    assets and charges real network fees. Checking these settings does not test
    a transaction.
  </p>
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
      label="Privacy notice address"
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
      Local setup runs containers on this machine. It does not buy a domain or
      configure public hosting. The selected network is
      {{ providerNetwork(model.network).label }}. It is experimental and is not
      approved for production custody.
    </p>
  </div>
  <div class="callout">
    <strong>What you’ll connect next</strong>
    <p>
      The wallet service keeps wallet signing details private. Connected
      applications sign people in, check their identity and ask for permission
      to use their wallets. Your service accepts those checks only under an
      agreement you have reviewed with the application’s team.
    </p>
    <a
      :href="docs + 'operator-services.html'"
      target="_blank"
      rel="noopener noreferrer"
      >Prepare the required services ↗</a
    >
  </div>
</template>
