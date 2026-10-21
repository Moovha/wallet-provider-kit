<script setup lang="ts">
import AdvancedSettings from './AdvancedSettings.vue';
import SetupField from './SetupField.vue';
import ExplorerTokensStep from './ExplorerTokensStep.vue';
import { computed } from 'vue';
import type { ProviderConfiguration } from '../model';
const model = defineModel<ProviderConfiguration>({ required: true });
const emit = defineEmits<{ 'configure-services': [] }>();
const http = computed<NonNullable<ProviderConfiguration['http']>>({
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
  key: 'host' | 'port' | 'documentation' | 'ingress' | 'requestsPerMinute',
  value: unknown,
) {
  model.value.http = { ...http.value, [key]: value };
}
</script>
<template>
  <div class="step-heading">
    <span class="eyebrow">Getting ready to launch</span>
    <h2>Choose how your service will run</h2>
    <p>
      Start with the supplied settings, then choose any extra tools you need.
      Wallet operations stay off until you have tested your setup.
    </p>
  </div>
  <div class="callout step-orientation">
    <strong>The essentials are already filled in</strong>
    <p>
      Setup prepares a private place for your service and its data. It uses port
      8080 by default and includes Caddy for secure HTTPS access. Open advanced
      settings if your team needs different storage, ports or an existing
      gateway.
    </p>
    <p>
      API testing tools are optional. For your first setup, leave wallet
      operations off while you test connections, permissions and recovery.
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
    Secure public access needs a separate step: connect your web address to the
    server and make ports 80 and 443 reachable. Keep wallet operations off until
    your team has completed the required tests.
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
  <SetupField
    guide="httpRequestLimit"
    type="number"
    label="Request limit per connecting address, per minute"
    :min="1"
    :max="6000"
    :modelValue="http.requestsPerMinute ?? 60"
    @update:modelValue="updateHttp('requestsPerMinute', Number($event))"
  />
  <div class="callout">
    <strong>Next, choose local setup or a manual deployment</strong>
    <p>
      Run the service on this computer, or save the settings for another server.
      Local access stays on this computer. For a public service, your team will
      also need to set up secure web access and backups.
    </p>
  </div>
  <div v-if="model.safeWallet" class="callout">
    <strong>Personal and shared Safe wallets</strong>
    <p>
      Each person keeps their default Personal wallet and can add separate
      wallets. Shared-wallet members approve their own access. Wallet signing
      keys stay private. Connected applications arrange funding for network
      fees; connecting an application does not fund those fees automatically.
    </p>
  </div>
  <h3>Enable wallet operations</h3>
  <p class="help-text">
    Leave this off until your team has tested wallet creation, approved
    transactions, network fee funding and recovery. Then add the references to
    your completed test reports below.
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
    />
    <p class="help-text">
      Enter references to completed test reports or reviewed tickets. The wizard
      does not run these tests or verify the reports.
    </p></template
  >
</template>
