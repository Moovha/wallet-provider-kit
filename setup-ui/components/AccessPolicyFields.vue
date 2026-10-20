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
  <h3>Decide which user checks you’ll accept</h3>
  <div class="callout">
    <strong>Users stay in the application</strong>
    <p>
      The application checks each person’s identity and records their permission
      under your reviewed agreement. Your service checks that information and
      your current rules before allowing wallet access.
    </p>
    <p>
      A person’s account in one application is kept separate from their accounts
      in other applications. Connecting those accounts requires a separate,
      verified arrangement.
    </p>
    <a
      :href="docs + 'application-access.html'"
      target="_blank"
      rel="noopener noreferrer"
      >How applications request wallet access ↗</a
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
      Use lowercase names such as country. A filled-in field is not proof that
      someone’s identity was checked. Accept completed checks only from
      applications covered by your reviewed agreement.
    </p>
  </div>
</template>
