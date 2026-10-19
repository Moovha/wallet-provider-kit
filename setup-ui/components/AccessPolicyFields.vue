<script setup lang="ts">
import { computed } from 'vue';
import SetupField from './SetupField.vue';
import { docs } from '../model';
import type { ProviderConfiguration } from '../model';
const model = defineModel<ProviderConfiguration>({ required: true });
const emit = defineEmits<{ 'configure-services': [] }>();
const recordFields = computed({
  get: () =>
    model.value.policy.identity?.records?.requiredFields.join('\n') ?? '',
  set: (value: string) => {
    if (model.value.policy.identity?.records)
      model.value.policy.identity.records.requiredFields = value
        .split(/\r?\n/)
        .map((field) => field.trim())
        .filter(Boolean);
  },
});
function records(enabled: unknown) {
  const identity = (model.value.policy.identity ??= {});
  if (enabled) {
    identity.records = { requiredFields: ['display_name', 'country'] };
    model.value.identity = {};
    delete model.value.financial;
    delete model.value.execution;
    for (const app of model.value.policy.applications) {
      app.permissions = ['account:read'];
      delete app.funding;
    }
  } else delete identity.records;
}
const flow = computed(() => model.value.policy.access?.mode ?? 'hosted');
function setFlow(value: unknown) {
  if (value !== 'application' && value !== 'hosted') return;
  model.value.policy.access = { ...model.value.policy.access, mode: value };
  const identity = (model.value.policy.identity ??= {});
  delete identity.records;
  model.value.identity = {};
  if (value === 'application') {
    identity.application = {
      requiredFields: ['country'],
      verificationLevel: 'verified',
    };
    if (!model.value.apiExplorer) delete model.value.ownerLogin;
    delete model.value.reviewers;
    for (const app of model.value.policy.applications)
      app.assertionTrust ??= { agreement: '' };
  } else {
    delete identity.application;
    model.value.ownerLogin ??= {
      issuer: '',
      clientId: '',
      clientSecret: { env: 'PROVIDER_LOGIN_SECRET' },
    };
    model.value.reviewers = [''];
    for (const app of model.value.policy.applications)
      delete app.assertionTrust;
  }
}
const requiredFields = computed({
  get: () =>
    model.value.policy.identity?.application?.requiredFields.join('\n') ?? '',
  set: (value: string) => {
    if (model.value.policy.identity?.application)
      model.value.policy.identity.application.requiredFields = value
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
  },
});
</script>
<template>
  <h3>Access flow and identity requirements</h3>
  <FormKit
    v-if="!model.runtimeConfiguration?.sharedApplicationSafes"
    type="select"
    label="Access flow"
    :modelValue="flow"
    :options="[
      { label: 'Application-led access (standard)', value: 'application' },
      { label: 'Provider-hosted access (compatibility)', value: 'hosted' },
    ]"
    @update:modelValue="setFlow($event)"
    help="Use application-led access for new deployments. Existing hosted deployments retain their own identity and consent flow."
  />
  <div v-if="flow === 'application'" class="callout">
    <strong>Users stay in the application</strong>
    <p>
      The application attests identity and consent under the trust agreement you
      record below. The provider checks the evidence and issues access
      automatically when policy passes. No provider user login or staff review
      is required.
    </p>
    <p>
      User IDs are private to each application. A different application cannot
      connect to an existing wallet by claiming the same user ID. Linking users
      across applications requires a separately verified integration.
    </p>
    <a
      :href="docs + 'application-access.html'"
      target="_blank"
      rel="noopener noreferrer"
      >Application-led access contract ↗</a
    >
    <SetupField
      guide="identityLevel"
      type="text"
      v-model="model.policy.identity!.application!.verificationLevel"
      label="Required identity level"
      validation="required|length:1,100"
    />
    <SetupField
      guide="identityFields"
      type="textarea"
      v-model="requiredFields"
      label="Required identity fields (one per line)"
      validation="identity_fields"
    />
    <p>
      Use lowercase field names such as country. Matching fields do not prove
      KYC by themselves: only explicitly trusted applications may attest
      completed checks.
    </p>
  </div>
  <template v-if="flow === 'hosted'">
    <p class="help-text">
      Configure hosted login in Services. For external identity verification,
      connect a vendor there and set its price limits below. Alternatively,
      select unfunded record evaluation here; users consent and staff review
      those records before access.
    </p>
    <button
      type="button"
      class="secondary step-shortcut"
      @click="emit('configure-services')"
    >
      Configure hosted connections in Services
    </button>
    <fieldset class="vendor-panel">
      <legend>Application records · starter evaluation</legend>
      <SetupField
        guide="applicationRecords"
        type="checkbox"
        label="Use application-supplied records for an unfunded evaluation"
        :modelValue="!!model.policy.identity?.records"
        @update:modelValue="records($event)"
      />
      <SetupField
        v-if="model.policy.identity?.records"
        guide="recordFields"
        type="textarea"
        label="Required record fields"
        v-model="recordFields"
        validation="required|identity_fields"
      />
    </fieldset>
  </template>
</template>
