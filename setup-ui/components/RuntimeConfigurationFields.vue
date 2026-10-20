<script setup lang="ts">
import AdvancedSettings from './AdvancedSettings.vue';
import { newClientId, type ProviderConfiguration } from '../model';
function newOperator() {
  const clientId = model.value.authorizationServer
    ? newClientId('operator')
    : '';
  return { issuer: model.value.oauth.issuer, clientId, subject: clientId };
}
const model = defineModel<ProviderConfiguration>({ required: true });
</script>
<template>
  <section class="form-section">
    <h3>Manage application rules after setup</h3>
    <p>
      Your developer can use the protected API to submit the transactions an
      application needs. You decide which rules to approve and how future
      submissions are reviewed.
    </p>
    <template v-if="model.runtimeConfiguration">
      <p v-if="model.authorizationServer">
        Setup creates separate management connections and saves their secrets
        privately. Keep those details with your administration team. Connected
        applications cannot use management access.
      </p>
      <p v-else>
        Use a separate provider operator OAuth client. The API explorer's
        application token controls cannot issue provider write authority.
        Operator identity and trust roots are deployment settings; runtime
        policy edits need no redeployment.
      </p>
      <fieldset
        v-for="(operator, index) in model.runtimeConfiguration.operators"
        :key="index"
      >
        <legend>Runtime operator {{ index + 1 }}</legend>
        <p v-if="model.authorizationServer" class="help-text">
          Operator client ID: <code>{{ operator.clientId }}</code
          >. Setup registers this identity and generates its private credential.
        </p>
        <AdvancedSettings
          v-if="model.authorizationServer"
          label="Advanced operator identity"
        >
          <FormKit
            type="url"
            :readonly="!!model.authorizationServer"
            label="Operator issuer"
            v-model="operator.issuer"
            validation="required|https_url"
          />
          <FormKit
            type="text"
            label="Operator OAuth client ID"
            v-model="operator.clientId"
            validation="required"
          />
          <FormKit
            type="text"
            :readonly="!!model.authorizationServer"
            label="Operator token subject"
            v-model="operator.subject"
            validation="required"
          />
        </AdvancedSettings>
        <template v-else>
          <FormKit
            type="url"
            :readonly="!!model.authorizationServer"
            label="Operator issuer"
            v-model="operator.issuer"
            validation="required|https_url"
          />
          <FormKit
            type="text"
            label="Operator OAuth client ID"
            v-model="operator.clientId"
            validation="required"
          />
          <FormKit
            type="text"
            :readonly="!!model.authorizationServer"
            label="Operator token subject"
            v-model="operator.subject"
            validation="required"
          />
        </template>
        <button
          type="button"
          v-if="model.runtimeConfiguration.operators.length > 1"
          @click="model.runtimeConfiguration.operators.splice(index, 1)"
        >
          Remove operator
        </button>
      </fieldset>
      <button
        type="button"
        :disabled="model.runtimeConfiguration.operators.length >= 16"
        @click="model.runtimeConfiguration.operators.push(newOperator())"
      >
        Add runtime operator
      </button>
      <p>
        After setup, your team can review transaction rules, service connections
        and payment of network fees through the API. People must still pass the
        required user checks and approve access to their wallets.
      </p>
    </template>
  </section>
</template>
