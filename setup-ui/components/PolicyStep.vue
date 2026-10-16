<script setup lang="ts">
import SetupField from './SetupField.vue';
import { computed } from 'vue';
import { docs } from '../model';
import type { ProviderConfiguration } from '../model';
const model = defineModel<ProviderConfiguration>({ required: true });
const identityDays = computed({
  get: () => model.value.policy.identity?.maxAgeDays ?? 365,
  set: (value: number) => {
    model.value.policy.identity = {
      ...model.value.policy.identity,
      maxAgeDays: value,
    };
  },
});
const accessDays = computed({
  get: () => model.value.policy.access?.maxAgeDays ?? 30,
  set: (value: number) => {
    model.value.policy.access = { maxAgeDays: value };
  },
});
function financial(enabled: unknown) {
  if (enabled)
    model.value.financial = {
      profile: 'provider-authorized-erc3009-v1',
      token: { address: '', name: '', version: '', symbol: '', decimals: 6 },
      recipients: [''],
      maximumAmount: '',
      lifetimeAmount: '',
      maxValiditySeconds: 300,
    };
  else delete model.value.financial;
}
</script>
<template>
  <div class="step-heading">
    <span class="eyebrow">Access and limits</span>
    <h2>Set your policies</h2>
    <p>
      Decide which applications can request access, who reviews identity, and
      which actions are supported.
    </p>
  </div>
  <div class="callout step-orientation">
    <strong>Decide who can use the service and who pays</strong>
    <p>
      A connected application is a product that calls your wallet API. Add its
      registration below and name the staff who review submitted records or
      identity evidence. Vendor verification also needs an agreement about who
      covers its costs. Agree these rules with the people operating the
      connected applications.
    </p>
    <p>
      Transfer signing is optional. Leave it off if you only need wallet
      onboarding and account access. Keep the starting policy version for a
      first setup; review the access periods against your own requirements.
    </p>
  </div>
  <SetupField
    guide="policyVersion"
    v-model="model.policy.version"
    type="text"
    label="Policy version"
    validation="required|length:1,256"
  />
  <div class="field-grid">
    <SetupField
      guide="identityAge"
      v-model="identityDays"
      type="number"
      :number="true"
      :label="
        model.policy.identity?.records
          ? 'Maximum age of accepted records (days)'
          : 'Maximum age of identity checks (days)'
      "
      min="1"
      max="365"
      validation="required|between:1,365"
    /><SetupField
      guide="accessAge"
      v-model="accessDays"
      type="number"
      :number="true"
      label="Maximum access duration (days)"
      min="1"
      max="365"
      validation="required|between:1,365"
    />
  </div>
  <div class="section-heading">
    <h3>Connected applications</h3>
    <button
      type="button"
      class="secondary"
      :disabled="model.policy.applications.length >= 100"
      @click="
        model.policy.applications.push({
          issuer: model.oauth.issuer,
          clientId: '',
          name: '',
          permissions: ['account:read'],
        })
      "
    >
      Add application
    </button>
  </div>
  <fieldset
    v-for="(application, index) in model.policy.applications"
    :key="index"
    class="repeat-row"
  >
    <legend>Application {{ index + 1 }}</legend>
    <div class="field-grid">
      <SetupField
        guide="applicationName"
        v-model="application.name"
        type="text"
        label="Application name"
        validation="required|length:1,100"
      /><SetupField
        guide="applicationClient"
        v-model="application.clientId"
        type="text"
        label="Application client ID"
        validation="required|length:1,256"
      />
    </div>
    <SetupField
      guide="applicationIssuer"
      v-model="application.issuer"
      type="url"
      label="Application issuer"
      validation="required|https_url"
      :placeholder="model.oauth.issuer"
      readonly
    />
    <SetupField
      guide="permissions"
      v-model="application.permissions"
      type="checkbox"
      label="Allowed permissions"
      :options="
        model.policy.identity?.records
          ? [{ value: 'account:read', label: 'Read wallet accounts' }]
          : [
              { value: 'account:read', label: 'Read wallet accounts' },
              {
                value: 'operations:request',
                label: 'Request wallet operations (advanced hosts)',
              },
              {
                value: 'transfers:request',
                label: 'Request transfers on behalf of users',
              },
            ]
      "
      validation="required"
    />
    <SetupField
      v-if="!model.policy.identity?.records"
      guide="fundingEnabled"
      type="checkbox"
      label="Record an identity funding agreement for this application"
      :modelValue="!!application.funding"
      @update:modelValue="
        application.funding = $event
          ? { agreement: '', monthlyLimitMinor: 0 }
          : undefined
      "
    />
    <div
      v-if="!model.policy.identity?.records && application.funding"
      class="field-grid"
    >
      <SetupField
        guide="fundingReference"
        v-model="application.funding.agreement"
        type="text"
        label="Funding agreement reference"
        validation="required|length:1,256"
      /><SetupField
        guide="monthlyBudget"
        v-model="application.funding.monthlyLimitMinor"
        type="number"
        :number="true"
        label="Monthly identity budget (USD cents)"
        min="0"
        max="9007199254740991"
        validation="required|min:0|max:9007199254740991"
      />
    </div>
    <SetupField
      guide="applicationEnabled"
      type="checkbox"
      label="Application access enabled"
      :modelValue="application.enabled !== false"
      @update:modelValue="application.enabled = $event === true"
    />
    <button
      type="button"
      class="text-button"
      :disabled="model.policy.applications.length === 1"
      @click="model.policy.applications.splice(index, 1)"
    >
      Remove application {{ index + 1 }}
    </button>
  </fieldset>
  <div class="section-heading">
    <h3>Provider identity reviewers</h3>
    <button type="button" class="secondary" @click="model.reviewers.push('')">
      Add reviewer
    </button>
  </div>
  <div v-for="(_, index) in model.reviewers" :key="index" class="inline-row">
    <SetupField
      guide="reviewer"
      v-model="model.reviewers[index]"
      type="text"
      :label="'Reviewer ' + (index + 1) + ' account ID (sub)'"
      validation="required|length:1,256"
    /><button
      type="button"
      class="text-button"
      :disabled="model.reviewers.length === 1"
      @click="model.reviewers.splice(index, 1)"
    >
      Remove reviewer {{ index + 1 }}
    </button>
  </div>
  <div class="feature-panel">
    <h3>Optional delegated transfer signing</h3>
    <p v-if="model.policy.identity?.records" class="help-text">
      Application-record evaluation keeps wallets unfunded and permits reads
      only. Select external identity verification in Services before configuring
      transfers.
    </p>
    <p>
      Allow applications to request token transfers within limits that owners
      accept during onboarding. Your service checks each transfer and signs its
      authorization without asking the owner again. The application submits the
      transaction separately.
    </p>
    <SetupField
      guide="financialEnabled"
      type="checkbox"
      label="Configure delegated transfer signing"
      :disabled="!!model.policy.identity?.records"
      :modelValue="!!model.financial"
      @update:modelValue="financial($event)"
    />
  </div>
  <template v-if="model.financial">
    <p class="help-text">
      <a
        :href="docs + 'setup.html#supported-financial-policy'"
        target="_blank"
        rel="noopener noreferrer"
        >Token acceptance and signing profile instructions ↗</a
      >
    </p>
    <p class="callout">
      Use an independently verified ERC-3009 token and a key-controlled wallet
      account (EOA) on Base Sepolia. Signing does not send the transaction, pay
      network fees or confirm that a transfer completed.
    </p>
    <SetupField
      guide="tokenAddress"
      v-model="model.financial.token.address"
      type="text"
      label="Token contract address"
      :validation="[['required'], ['matches', /^0x[0-9a-fA-F]{40}$/]]"
    />
    <div class="field-grid">
      <SetupField
        guide="tokenName"
        v-model="model.financial.token.name"
        type="text"
        label="Token signing-domain name"
        validation="required|length:1,256"
      /><SetupField
        guide="tokenVersion"
        v-model="model.financial.token.version"
        type="text"
        label="Token signing-domain version"
        validation="required|length:1,256"
      /><SetupField
        guide="tokenSymbol"
        v-model="model.financial.token.symbol"
        type="text"
        label="Token symbol"
        :validation="[['required'], ['matches', /^[A-Za-z0-9]{1,12}$/]]"
      /><SetupField
        guide="tokenDecimals"
        v-model="model.financial.token.decimals"
        type="number"
        :number="true"
        label="Token decimals"
        min="0"
        max="36"
        validation="required|between:0,36"
      />
    </div>
    <div class="field-grid">
      <SetupField
        guide="maximumAmount"
        v-model="model.financial.maximumAmount"
        type="text"
        label="Maximum per transfer (base units)"
        :validation="[['required'], ['matches', /^[1-9][0-9]{0,77}$/]]"
      /><SetupField
        guide="lifetimeAmount"
        v-model="model.financial.lifetimeAmount"
        type="text"
        label="Total limit per account and token (base units)"
        :validation="[['required'], ['matches', /^[1-9][0-9]{0,77}$/]]"
      />
    </div>
    <SetupField
      guide="validity"
      v-model="model.financial.maxValiditySeconds"
      type="number"
      :number="true"
      label="Time to use a signed authorization (seconds)"
      min="60"
      max="3600"
      validation="required|between:60,3600"
    />
    <div class="section-heading">
      <h3>Allowed recipients</h3>
      <button
        type="button"
        class="secondary"
        :disabled="model.financial.recipients.length >= 100"
        @click="model.financial.recipients.push('')"
      >
        Add recipient
      </button>
    </div>
    <div
      v-for="(_, index) in model.financial.recipients"
      :key="index"
      class="inline-row"
    >
      <SetupField
        guide="recipient"
        v-model="model.financial.recipients[index]"
        type="text"
        :label="'Recipient ' + (index + 1) + ' address'"
        :validation="[['required'], ['matches', /^0x[0-9a-fA-F]{40}$/]]"
      /><button
        type="button"
        class="text-button"
        :disabled="model.financial.recipients.length === 1"
        @click="model.financial.recipients.splice(index, 1)"
      >
        Remove recipient {{ index + 1 }}
      </button>
    </div>
  </template>
</template>
