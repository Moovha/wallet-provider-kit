<script setup lang="ts">
import { computed } from 'vue';
import { docs } from '../model';
import type { ProviderConfiguration } from '../model';
const model = defineModel<ProviderConfiguration>({ required: true });
const identityDays = computed({
  get: () => model.value.policy.identity?.maxAgeDays ?? 365,
  set: (value: number) => {
    model.value.policy.identity = { maxAgeDays: value };
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
      profile: 'owner-approved-erc3009-v1',
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
  <FormKit
    v-model="model.policy.version"
    type="text"
    label="Policy version"
    validation="required|length:1,256"
    help="Change this deliberately when publishing a new policy. Updates can invalidate existing grants and approvals."
  />
  <div class="field-grid">
    <FormKit
      v-model="identityDays"
      type="number"
      :number="true"
      label="Identity acceptance age (days)"
      min="1"
      max="365"
      validation="required|between:1,365"
    /><FormKit
      v-model="accessDays"
      type="number"
      :number="true"
      label="Application access age (days)"
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
      <FormKit
        v-model="application.name"
        type="text"
        label="Application name"
        validation="required|length:1,100"
        help="Shown to the account owner on consent screens."
      /><FormKit
        v-model="application.clientId"
        type="text"
        label="Application client ID"
        validation="required|length:1,256"
      />
    </div>
    <FormKit
      v-model="application.issuer"
      type="url"
      label="Application issuer"
      validation="required|https_url"
      :placeholder="model.oauth.issuer"
      help="Inherited from the application token issuer in Connected services."
      readonly
    />
    <FormKit
      v-model="application.permissions"
      type="checkbox"
      label="Allowed permissions"
      :options="[
        { value: 'account:read', label: 'Read wallet accounts' },
        {
          value: 'operations:request',
          label: 'Request owner-approved actions',
        },
      ]"
      validation="required"
    />
    <FormKit
      type="checkbox"
      label="Configure an application funding agreement for identity costs"
      :modelValue="!!application.funding"
      @update:modelValue="
        application.funding = $event
          ? { agreement: '', monthlyLimitMinor: 0 }
          : undefined
      "
    />
    <div v-if="application.funding" class="field-grid">
      <FormKit
        v-model="application.funding.agreement"
        type="text"
        label="Funding agreement reference"
        validation="required|length:1,256"
      /><FormKit
        v-model="application.funding.monthlyLimitMinor"
        type="number"
        :number="true"
        label="Monthly identity budget (USD cents)"
        min="0"
        max="9007199254740991"
        validation="required|min:0|max:9007199254740991"
      />
    </div>
    <FormKit
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
    <FormKit
      v-model="model.reviewers[index]"
      type="text"
      :label="'Reviewer ' + (index + 1) + ' login subject'"
      validation="required|length:1,256"
      help="The staff member’s subject ID from the owner login issuer."
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
    <h3>Optional transfer authorization</h3>
    <p>
      Enable the implemented owner-approved ERC-3009 signing profile. The
      service prepares an exact action and requires fresh owner approval.
    </p>
    <FormKit
      type="checkbox"
      label="Configure owner-approved transfer signing"
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
      Base Sepolia EOA signing only. Select an independently verified ERC-3009
      token. This service does not broadcast transactions, sponsor gas or settle
      transfers.
    </p>
    <FormKit
      v-model="model.financial.token.address"
      type="text"
      label="Token contract address"
      :validation="[['required'], ['matches', /^0x[0-9a-fA-F]{40}$/]]"
    />
    <div class="field-grid">
      <FormKit
        v-model="model.financial.token.name"
        type="text"
        label="Token signing-domain name"
        validation="required|length:1,256"
      /><FormKit
        v-model="model.financial.token.version"
        type="text"
        label="Token signing-domain version"
        validation="required|length:1,256"
      /><FormKit
        v-model="model.financial.token.symbol"
        type="text"
        label="Token symbol"
        :validation="[['required'], ['matches', /^[A-Za-z0-9]{1,12}$/]]"
      /><FormKit
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
      <FormKit
        v-model="model.financial.maximumAmount"
        type="text"
        label="Maximum per action (base units)"
        :validation="[['required'], ['matches', /^[1-9][0-9]{0,77}$/]]"
        help="Integer string, not a decimal token amount. With 6 decimals, 1000000 is one token."
      /><FormKit
        v-model="model.financial.lifetimeAmount"
        type="text"
        label="Lifetime limit per account/token (base units)"
        :validation="[['required'], ['matches', /^[1-9][0-9]{0,77}$/]]"
        help="Must be at least the per-action maximum. Reservations remain held for uncertain attempts."
      />
    </div>
    <FormKit
      v-model="model.financial.maxValiditySeconds"
      type="number"
      :number="true"
      label="Authorization validity (seconds)"
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
      <FormKit
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
