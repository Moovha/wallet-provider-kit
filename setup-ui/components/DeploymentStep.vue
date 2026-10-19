<script setup lang="ts">
import AdvancedSettings from './AdvancedSettings.vue';
import SetupField from './SetupField.vue';
import ExecutionStep from './ExecutionStep.vue';
import ContractCallsStep from './ContractCallsStep.vue';
import ExplorerTokensStep from './ExplorerTokensStep.vue';
import { computed } from 'vue';
import type { ProviderConfiguration } from '../model';
const model = defineModel<ProviderConfiguration>({ required: true });
const emit = defineEmits<{ 'configure-services': [] }>();
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
function updateHttp(
  key: 'host' | 'port' | 'documentation' | 'ingress',
  value: unknown,
) {
  model.value.http = { ...http.value, [key]: value };
}
</script>
<template>
  <div class="step-heading">
    <span class="eyebrow">Deployment inputs</span>
    <h2>Prepare the deployment</h2>
    <p>
      Review the supplied deployment settings, then choose any optional features
      and acceptance requirements.
    </p>
  </div>
  <div class="callout step-orientation">
    <strong>Prepare where the exported service will run</strong>
    <p>
      Setup prepares private persistent storage and container networking
      automatically. The default host port is 8080, and bundled Caddy supplies
      the HTTPS gateway configuration. Expand advanced settings to use a
      different data directory, port or existing gateway.
    </p>
    <p>
      The API testing tools are optional. Leave activation off for your first
      deployment; test your integrations and recovery before enabling it.
    </p>
  </div>
  <p class="help-text">
    Private data: <code>{{ model.storage.directory }}</code> · Host port:
    <code>{{ http.port ?? 8080 }}</code> · HTTPS gateway:
    {{ http.ingress === 'caddy' ? 'bundled Caddy' : 'existing gateway' }}.
  </p>
  <AdvancedSettings label="Advanced deployment settings">
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
      guide="httpsGateway"
      type="select"
      label="HTTPS gateway"
      :modelValue="http.ingress ?? 'existing'"
      :options="[
        {
          label: 'Bundled Caddy automatic HTTPS (recommended)',
          value: 'caddy',
        },
        { label: 'Connect an existing HTTPS gateway', value: 'existing' },
      ]"
      @update:modelValue="updateHttp('ingress', $event)"
    />
  </AdvancedSettings>
  <p class="help-text">
    Local setup saves the gateway configuration. Public HTTPS starts separately
    after your domain points to the deployment host and ports 80/443 are
    reachable. Wallet operations stay disabled until acceptance.
  </p>
  <SetupField
    guide="explorer"
    type="checkbox"
    label="Enable deployed API explorer and Try it out"
    :modelValue="http.documentation ?? false"
    @update:modelValue="updateHttp('documentation', $event)"
  />
  <ExplorerTokensStep
    v-model="model"
    @configure-services="emit('configure-services')"
  />
  <div class="callout">
    <strong>Next, choose local setup or a manual deployment</strong>
    <p>
      Local setup can save private files, prepare persistent storage and start a
      container for you. It uses 0.0.0.0:8080 inside the container and publishes
      your selected port only on this machine. The bundled Caddy profile
      supplies automatic HTTPS for your public address when you start it on the
      final host; you can also connect an existing gateway. The deployment guide
      walks through these tasks and backups.
    </p>
  </div>
  <ExecutionStep v-model="model" />
  <ContractCallsStep v-model="model" />
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
    <SetupField
      v-if="model.execution"
      guide="executionEvidence"
      v-model="model.activation.executionAcceptance"
      type="text"
      label="Execution, RPC and submission recovery test report reference"
      validation="required|length:1,256"
    />
    <SetupField
      v-if="model.safeProvisioning"
      guide="executionEvidence"
      v-model="model.activation.safeProvisioningAcceptance"
      type="text"
      label="Safe provisioning, gas budget and deployment recovery test report reference"
      validation="required|length:1,256"
    />
    <p class="help-text">
      Enter references to completed test reports or reviewed tickets. The wizard
      does not run these tests or verify the reports.
    </p></template
  >
</template>
