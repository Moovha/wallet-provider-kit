<script setup lang="ts">
import type { ProviderConfiguration } from '../model';
const model = defineModel<ProviderConfiguration>({ required: true });
function enable(enabled: boolean) {
  if (enabled && !model.value.runtimeConfiguration)
    model.value.runtimeConfiguration = {
      operators: [
        { issuer: model.value.oauth.issuer, clientId: '', subject: '' },
      ],
    };
  else if (!enabled) delete model.value.runtimeConfiguration;
}
</script>
<template>
  <section class="form-section">
    <h3>Runtime contract workspace</h3>
    <p>
      Let applications register contracts and methods after deployment.
      Providers publish policies and choose automatic or manual registration
      review at /operator/ on the running service.
    </p>
    <label
      ><input
        type="checkbox"
        :checked="!!model.runtimeConfiguration"
        @change="enable(($event.target as HTMLInputElement).checked)"
      />
      Enable runtime configuration</label
    >
    <template v-if="model.runtimeConfiguration">
      <p v-if="model.authorizationServer">
        The bundled issuer registers separate provider service operators and
        generates their credentials during setup. The token subject equals the
        operator client ID. Keep these credentials with the provider; connected
        applications cannot obtain operator tokens.
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
        @click="
          model.runtimeConfiguration.operators.push({
            issuer: model.oauth.issuer,
            clientId: '',
            subject: '',
          })
        "
      >
        Add runtime operator
      </button>
      <FormKit
        type="checkbox"
        label="Use runtime policies for contract authorization"
        v-model="model.runtimeConfiguration.authorizeContracts"
      />
      <p>
        Financial authorization requires application-led access, approved
        contract calls and the Safe execution profile. Registration does not
        grant wallet access. The designated executor must also explicitly enable
        runtime contracts.
      </p>
    </template>
  </section>
</template>
