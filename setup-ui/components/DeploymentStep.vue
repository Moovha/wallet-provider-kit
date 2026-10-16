<script setup lang="ts">
import { computed } from 'vue';
import type { ProviderConfiguration } from '../model';
const model = defineModel<ProviderConfiguration>({ required: true });
const http = computed({
  get: () =>
    model.value.http ?? {
      host: '127.0.0.1' as const,
      port: 8080,
      documentation: false,
    },
  set: (value) => {
    model.value.http = value;
  },
});
function updateHttp(key: 'host' | 'port' | 'documentation', value: unknown) {
  model.value.http = { ...http.value, [key]: value };
}
</script>
<template>
  <div class="step-heading">
    <span class="eyebrow">Deployment inputs</span>
    <h2>Prepare the deployment</h2>
    <p>
      Choose where the service keeps records and how it listens on the
      deployment host.
    </p>
  </div>
  <FormKit
    v-model="model.storage.directory"
    type="text"
    label="Private data directory"
    validation="required|length:1,256"
    help="Persistent local SQLite storage on one POSIX host. Relative paths resolve beside the configuration file."
  />
  <div class="field-grid">
    <FormKit
      type="select"
      label="Service listen address"
      :modelValue="http.host ?? '127.0.0.1'"
      :options="[
        { label: 'Local IPv4 · 127.0.0.1', value: '127.0.0.1' },
        { label: 'Container / all IPv4 · 0.0.0.0', value: '0.0.0.0' },
        { label: 'Local IPv6 · ::1', value: '::1' },
        { label: 'All IPv6 · ::', value: '::' },
      ]"
      @update:modelValue="updateHttp('host', $event)"
    /><FormKit
      type="number"
      :number="true"
      label="Service port"
      :modelValue="http.port ?? 8080"
      min="1"
      max="65535"
      validation="required|between:1,65535"
      @update:modelValue="updateHttp('port', $event)"
    />
  </div>
  <FormKit
    type="checkbox"
    label="Enable deployed API explorer and Try it out"
    help="Serves Swagger at your HTTPS origin /docs/. Requests use real service authentication and can have real effects. Restart with the exported configuration to apply. Disabled by default."
    :modelValue="http.documentation ?? false"
    @update:modelValue="updateHttp('documentation', $event)"
  />
  <div class="callout">
    <strong>Deployment still needs operational setup</strong>
    <p>
      Provide secrets, private storage, HTTPS ingress and backups through your
      deployment tooling. The exported checklist includes initialization and
      diagnostic commands.
    </p>
  </div>
  <h3>Activation</h3>
  <p class="help-text">
    Leave activation disabled for initial deployment. Enabling it requires your
    completed backend and recovery acceptance, plus token acceptance for
    transfer signing.
  </p>
  <FormKit
    v-model="model.activation.enabled"
    type="checkbox"
    label="Enable service activation in this export"
  />
  <template v-if="model.activation.enabled"
    ><FormKit
      v-model="model.activation.backendAcceptance"
      type="text"
      label="Backend acceptance evidence reference"
      validation="required|length:1,256"
    /><FormKit
      v-model="model.activation.recoveryAcceptance"
      type="text"
      label="Recovery acceptance evidence reference"
      validation="required|length:1,256"
    /><FormKit
      v-if="model.financial"
      v-model="model.activation.tokenAcceptance"
      type="text"
      label="Token acceptance evidence reference"
      validation="required|length:1,256"
    />
    <p class="help-text">
      These references record your attestation. Wizard validation does not
      certify provider, recovery or token acceptance.
    </p></template
  >
</template>
