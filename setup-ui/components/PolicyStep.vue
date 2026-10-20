<script setup lang="ts">
import AdvancedSettings from './AdvancedSettings.vue';
import RuntimeConfigurationFields from './RuntimeConfigurationFields.vue';
import SetupField from './SetupField.vue';
import AccessPolicyFields from './AccessPolicyFields.vue';
import { computed } from 'vue';
import { newClientId, type ProviderConfiguration } from '../model';
const model = defineModel<ProviderConfiguration>({ required: true });
const identityDays = computed({
  get: () => model.value.policy.identity?.maxAgeDays ?? 90,
  set: (value: number) => {
    model.value.policy.identity = {
      ...model.value.policy.identity,
      maxAgeDays: value,
    };
  },
});
const accessDays = computed({
  get: () => model.value.policy.access?.maxAgeDays ?? 7,
  set: (value: number) => {
    model.value.policy.access = {
      ...model.value.policy.access,
      mode: 'application',
      maxAgeDays: value,
    };
  },
});
function addApplication() {
  model.value.policy.applications.push({
    issuer: model.value.oauth.issuer,
    clientId: newClientId('application'),
    name: '',
    permissions: ['account:read', 'contracts:request'],
    assertionTrust: { agreement: '' },
  });
}
</script>
<template>
  <div class="step-heading">
    <span class="eyebrow">Access and limits</span>
    <h2>Connect trusted applications</h2>
    <p>
      Applications submit identity and consent, then register their action
      policies, RPC credentials and gas sponsorship through authenticated APIs.
      Each user receives one Safe account.
    </p>
  </div>
  <details>
    <summary>Provider identity baseline and access duration</summary>
    <AccessPolicyFields v-model="model" />
    <AdvancedSettings label="Advanced policy metadata"
      ><SetupField
        guide="policyVersion"
        v-model="model.policy.version"
        type="text"
        label="Policy version"
        validation="required|length:1,256"
    /></AdvancedSettings>
    <div class="field-grid">
      <SetupField
        guide="identityAge"
        v-model="identityDays"
        type="number"
        :number="true"
        label="Maximum age of identity checks (days)"
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
  </details>
  <fieldset
    v-for="(application, index) in model.policy.applications"
    :key="index"
    class="application-panel"
  >
    <legend>Application {{ index + 1 }}</legend>
    <SetupField
      guide="applicationName"
      v-model="application.name"
      type="text"
      label="Application name"
      validation="required|length:1,100"
    />
    <AdvancedSettings label="Advanced application identity"
      ><SetupField
        guide="applicationClient"
        v-model="application.clientId"
        type="text"
        label="Application client ID"
        validation="required|length:1,256" /><SetupField
        v-if="!model.authorizationServer"
        guide="applicationIssuer"
        v-model="application.issuer"
        type="url"
        label="Application issuer"
        readonly
        validation="required|https_url"
    /></AdvancedSettings>
    <SetupField
      guide="assertionTrust"
      v-model="application.assertionTrust!.agreement"
      type="text"
      label="Identity and consent trust agreement reference"
      validation="required|length:1,256"
    />
    <SetupField
      guide="permissions"
      v-model="application.permissions"
      type="checkbox"
      label="Allowed permissions"
      :options="[
        { value: 'account:read', label: 'Read wallet accounts' },
        {
          value: 'contracts:request',
          label: 'Request user-authorized application calls',
        },
      ]"
      validation="required"
    />
    <SetupField
      guide="applicationEnabled"
      type="checkbox"
      label="Application enabled"
      :modelValue="application.enabled !== false"
      @update:modelValue="application.enabled = !!$event"
    />
    <button
      type="button"
      class="secondary"
      :disabled="model.policy.applications.length === 1"
      @click="model.policy.applications.splice(index, 1)"
    >
      Remove application
    </button>
  </fieldset>
  <button
    type="button"
    class="secondary"
    :disabled="model.policy.applications.length >= 100"
    @click="addApplication"
  >
    Add application
  </button>
  <RuntimeConfigurationFields v-model="model" />
</template>
