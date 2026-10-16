<script setup lang="ts">
import SetupField from './SetupField.vue';
import ExplorerTokensStep from './ExplorerTokensStep.vue';
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
  <div class="callout step-orientation">
    <strong>Prepare where the exported service will run</strong>
    <p>
      Your deployment host is the server that will run the wallet service. For a
      native service behind an HTTPS gateway on the same server, the supplied
      data folder, local listen address and port are a starting point.
      Containers need the container listen address. The instructions beside each
      field explain the choice.
    </p>
    <p>
      The API testing tools are optional. Leave activation off for your first
      deployment; test your integrations and recovery before enabling it.
    </p>
  </div>
  <SetupField
    guide="storage"
    v-model="model.storage.directory"
    type="text"
    label="Private data directory"
    validation="required|length:1,256"
  />
  <div class="field-grid">
    <SetupField
      guide="listenHost"
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
    /><SetupField
      guide="port"
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
  <SetupField
    guide="explorer"
    type="checkbox"
    label="Enable deployed API explorer and Try it out"
    :modelValue="http.documentation ?? false"
    @update:modelValue="updateHttp('documentation', $event)"
  />
  <ExplorerTokensStep v-model="model" />
  <div class="callout">
    <strong>Next, prepare your server</strong>
    <p>
      After export, put secret values in your private environment file, prepare
      persistent storage, and connect your public address through an HTTPS
      gateway. This gateway forwards encrypted web traffic to the service’s
      internal port. The deployment guide walks through these tasks and backups.
    </p>
  </div>
  <h3>Enable wallet operations</h3>
  <p class="help-text">
    Leave this off for your first deployment. Complete wallet backend and
    recovery tests, then record their report references below. Transfer signing
    also requires tests of the exact token contract and signing settings.
  </p>
  <SetupField
    guide="activation"
    v-model="model.activation.enabled"
    type="checkbox"
    label="Enable wallet operations in this configuration"
  />
  <template v-if="model.activation.enabled"
    ><SetupField
      guide="backendEvidence"
      v-model="model.activation.backendAcceptance"
      type="text"
      label="Wallet backend test report reference"
      validation="required|length:1,256"
    /><SetupField
      guide="recoveryEvidence"
      v-model="model.activation.recoveryAcceptance"
      type="text"
      label="Recovery test report reference"
      validation="required|length:1,256"
    /><SetupField
      guide="tokenEvidence"
      v-if="model.financial"
      v-model="model.activation.tokenAcceptance"
      type="text"
      label="Token signing test report reference"
      validation="required|length:1,256"
    />
    <p class="help-text">
      Enter references to completed test reports or reviewed tickets. The wizard
      does not run these tests or verify the reports.
    </p></template
  >
</template>
