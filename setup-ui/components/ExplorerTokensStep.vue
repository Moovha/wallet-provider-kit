<script setup lang="ts">
import SetupField from './SetupField.vue';
import { computed } from 'vue';
import type { ProviderConfiguration } from '../model';
import {
  apiTokenScopes,
  apiTokenScopeLabels,
} from '../../src/service/api-token-scopes.js';
import SecretField from './SecretField.vue';
const scopeOptions = apiTokenScopes.map((scope) => ({
  value: scope,
  label: `${apiTokenScopeLabels[scope]} (${scope})`,
}));
const model = defineModel<ProviderConfiguration>({ required: true });
const emit = defineEmits<{ 'configure-services': [] }>();
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
    model.value.ownerLogin ??= {
      issuer: '',
      clientId: '',
      clientSecret: { env: 'PROVIDER_LOGIN_SECRET' },
    };
    model.value.http = { ...model.value.http, documentation: true };
    model.value.apiExplorer = { operators: [], clients: [] };
  } else {
    delete model.value.apiExplorer;
    if (model.value.policy.access?.mode === 'application')
      delete model.value.ownerLogin;
  }
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
      clientSecret: model.value.authorizationServer?.clients.find(
        (entry) => entry.clientId === clientId,
      )?.clientSecret ?? { env: `WALLET_EXPLORER_APP_${index + 1}_SECRET` },
      scopes: ['wallet:access:read', 'wallet:account:read'],
    });
}
</script>
<template>
  <section aria-label="Integrated application tokens">
    <h3>Try the API as an application</h3>
    <SetupField
      guide="operatorControls"
      type="checkbox"
      label="Enable application token controls for staff"
      :modelValue="!!model.apiExplorer"
      @update:modelValue="toggle($event)"
    />
    <template v-if="model.apiExplorer">
      <p class="help-text">
        First, set up staff sign-in in Services. Only approved staff can use
        these testing tools; wallet users do not sign in here.
      </p>
      <button
        type="button"
        class="secondary step-shortcut"
        @click="emit('configure-services')"
      >
        Configure staff login in Services
      </button>
      <SetupField
        guide="operators"
        v-model="operators"
        type="textarea"
        label="Staff account IDs allowed to test (sub)"
        validation="required"
      />
      <p class="help-text">
        Choose applications whose teams have approved staff testing, then select
        only the permissions needed. Save each application’s secret privately
        when you set up the service. Test access still requires the wallet
        owner’s permission and all identity and transaction checks.
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
          :label="`Allow staff to get tokens for ${application.name || `application ${index + 1}`}`"
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
            label="Allowed API permissions (scopes)"
            :options="scopeOptions"
          />
        </template>
      </fieldset>
      <div class="callout">
        <strong>Get ready to try a request</strong>
        <p>
          After export and deployment, sign in at the explorer, select scopes
          and choose Get token or Renew token. Execute renews a token nearing
          expiry before sending the request. Your staff login lasts at most five
          minutes; sign in again when asked. Tokens are not renewed in the
          background, and API requests are never retried automatically.
        </p>
      </div>
    </template>
  </section>
</template>
