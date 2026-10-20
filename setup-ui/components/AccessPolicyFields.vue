<script setup lang="ts">
import { computed } from 'vue';
import SetupField from './SetupField.vue';
import { docs, type ProviderConfiguration } from '../model';
const model = defineModel<ProviderConfiguration>({ required: true });
const requiredFields = computed({
  get: () =>
    model.value.policy.identity?.application?.requiredFields.join('\n') ?? '',
  set: (value: string) => {
    if (model.value.policy.identity?.application)
      model.value.policy.identity.application.requiredFields = value
        .split('\n')
        .map((field) => field.trim())
        .filter(Boolean);
  },
});
</script>
<template>
  <h3>Application identity requirements</h3>
  <div class="callout">
    <strong>Users stay in the application</strong>
    <p>
      The application attests identity and consent under its trust agreement.
      The provider checks current evidence, ownership and policy before granting
      access to the user's Safe.
    </p>
    <p>
      User IDs are private to each application. Linking users across
      applications requires a separately verified integration.
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
      Use lowercase field names such as country. Required fields alone do not
      establish KYC; only trusted applications may attest completed checks.
    </p>
  </div>
</template>
