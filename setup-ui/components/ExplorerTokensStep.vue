<script setup lang="ts">
import SetupField from './SetupField.vue';
import { computed } from 'vue';
import type { ProviderConfiguration } from '../model';
import { apiTokenScopes } from '../../src/service/api-token-scopes.js';
import SecretField from './SecretField.vue';
const model = defineModel<ProviderConfiguration>({ required: true });
const operators = computed({
  get: () => model.value.apiExplorer?.operators.join('\n') ?? '',
  set: (value) => {
    if (model.value.apiExplorer)
      model.value.apiExplorer.operators = value
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);
  },
});
function toggle(enabled: unknown) {
  if (enabled) {
    model.value.http = { ...model.value.http, documentation: true };
    model.value.apiExplorer = { operators: [], clients: [] };
  } else delete model.value.apiExplorer;
}
function client(clientId: string) {
  return model.value.apiExplorer?.clients.find(
    (item) => item.clientId === clientId,
  );
}
function toggleClient(clientId: string, index: number, enabled: unknown) {
  if (!model.value.apiExplorer) return;
  model.value.apiExplorer.clients = model.value.apiExplorer.clients.filter(
    (item) => item.clientId !== clientId,
  );
  if (enabled)
    model.value.apiExplorer.clients.push({
      clientId,
      clientSecret: { env: `WALLET_EXPLORER_APP_${index + 1}_SECRET` },
      scopes: ['wallet:access:read', 'wallet:account:read'],
    });
}
</script>
<template>
  <section aria-label="Integrated application tokens">
    <h3>Get application tokens in the deployed GUI</h3>
    <SetupField
      guide="operatorControls"
      type="checkbox"
      label="Enable operator token controls"
      :modelValue="!!model.apiExplorer"
      @update:modelValue="toggle($event)"
    />
    <template v-if="model.apiExplorer">
      <SetupField
        guide="operators"
        v-model="operators"
        type="textarea"
        label="Token operator login subjects"
        validation="required"
      />
      <p class="help-text">
        Select applications whose owners authorize operator testing, then limit
        their token scopes. Supply each calling application's client secret
        privately at deployment. Tokens do not bypass owner access, identity or
        transfer policy.
      </p>
      <fieldset
        v-for="(application, index) in model.policy.applications"
        :key="application.clientId + index"
        class="vendor-panel"
      >
        <legend>{{ application.name || `Application ${index + 1}` }}</legend>
        <SetupField
          guide="operatorApplication"
          type="checkbox"
          :label="`Allow GUI tokens for ${application.name || `application ${index + 1}`}`"
          :modelValue="!!client(application.clientId)"
          @update:modelValue="toggleClient(application.clientId, index, $event)"
        />
        <template v-if="client(application.clientId)">
          <SecretField
            guide="applicationSecret"
            v-model="client(application.clientId)!.clientSecret"
            label="Application client secret"
          />
          <SetupField
            guide="operatorScopes"
            v-model="client(application.clientId)!.scopes"
            type="checkbox"
            label="Allowed explorer token scopes"
            :options="[...apiTokenScopes]"
          />
        </template>
      </fieldset>
      <div class="callout">
        <strong>Renew in the GUI</strong>
        <p>
          After export and deployment, sign in at the explorer, select scopes
          and choose Get token or Renew token. Execute renews a token nearing
          expiry before sending. Operator sessions last at most five minutes;
          sign in again when requested. No background renewal or automatic API
          retries.
        </p>
      </div>
    </template>
  </section>
</template>
