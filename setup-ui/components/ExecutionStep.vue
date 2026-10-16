<script setup lang="ts">
import { computed } from 'vue';
import SetupField from './SetupField.vue';
import type { ProviderConfiguration } from '../model';
const model = defineModel<ProviderConfiguration>({ required: true });
const applications = computed(() =>
  model.value.policy.applications
    .filter(
      (app) =>
        app.enabled !== false && app.permissions?.includes('transfers:request'),
    )
    .map((app) => ({ label: app.name, value: app.clientId })),
);
function sponsor() {
  return {
    clientId: applications.value[0]?.value ?? '',
    accountId: crypto.randomUUID(),
    binding: { relayerId: '', signerId: '', address: '', bindingRevision: '1' },
    fundingAgreement: '',
    gasLimit: '150000',
    maxFeePerGas: '',
    maxPriorityFeePerGas: '',
    l1FeeReserveWei: '',
    lifetimeBudgetWei: '',
  };
}
function toggle(value: unknown) {
  if (!value) {
    delete model.value.execution;
    return;
  }
  model.value.execution = {
    profile: 'erc3009-relayer-v1',
    relayer: { url: '', apiKey: { env: 'EXECUTION_RELAYER_API_KEY' } },
    rpc: {
      endpoints: [
        { env: 'EXECUTION_RPC_PRIMARY_URL' },
        { env: 'EXECUTION_RPC_SECONDARY_URL' },
      ],
      genesisHash: '',
      tokenCodeHash: '',
    },
    sponsors: [sponsor()],
    pollIntervalSeconds: 15,
    maxLogRange: 10000,
  };
}
</script>
<template>
  <section class="feature-panel">
    <h3>Optional transfer execution and verified status</h3>
    <p>
      Coordinate approved transfers with a dedicated application gas sponsor.
      The service checks the same current wallet authority, simulates the exact
      token call, records one durable dispatch and checks receipts through
      independent RPC sources. Lost responses never permit another submission.
    </p>
    <SetupField
      guide="executionEnabled"
      type="checkbox"
      label="Configure transfer execution and RPC verification"
      :disabled="!model.financial"
      :modelValue="!!model.execution"
      @update:modelValue="toggle"
    />
    <p v-if="!model.financial" class="help-text">
      Configure delegated transfer signing in Policies first.
    </p>
    <template v-if="model.execution">
      <p class="callout">
        Base Sepolia EOA token transfers only. Configure pre-existing sponsor
        signers separately from owner-wallet signers. This does not install a
        Relayer, fund a sponsor or verify deployment readiness.
      </p>
      <div class="field-grid">
        <SetupField
          guide="executionSponsor"
          v-model="model.execution.relayer.url"
          type="text"
          label="Execution Relayer HTTPS origin"
          validation="required"
        />
        <SetupField
          guide="executionSponsor"
          v-model="model.execution.relayer.apiKey.env"
          type="text"
          label="Execution Relayer API key variable name"
          validation="required"
        />
      </div>
      <div class="field-grid">
        <SetupField
          v-for="(endpoint, index) in model.execution.rpc.endpoints"
          :key="index"
          guide="executionRpc"
          v-model="endpoint.env"
          type="text"
          :label="`RPC endpoint ${index + 1} variable name`"
          validation="required"
        />
        <SetupField
          guide="executionRpc"
          v-model="model.execution.rpc.genesisHash"
          type="text"
          label="Accepted Base Sepolia genesis hash"
          validation="required"
        />
        <SetupField
          guide="executionToken"
          v-model="model.execution.rpc.tokenCodeHash"
          type="text"
          label="Accepted token runtime code hash"
          validation="required"
        />
      </div>
      <p class="help-text">
        Supply complete private HTTPS RPC URLs in the named environment
        variables. Use two independently operated sources with different
        origins. The service requires agreement, checks the chain and genesis,
        and never falls back to a weaker confirmation policy.
      </p>
      <section
        v-for="(entry, index) in model.execution.sponsors"
        :key="entry.accountId"
        class="feature-panel"
      >
        <h4>Application gas sponsor {{ index + 1 }}</h4>
        <SetupField
          guide="executionSponsor"
          v-model="entry.clientId"
          type="select"
          :label="`Execution application ${index + 1}`"
          :options="applications"
          validation="required"
        />
        <div class="field-grid">
          <SetupField
            guide="executionSponsor"
            v-model="entry.binding.relayerId"
            type="text"
            :label="`Sponsor Relayer ID ${index + 1}`"
            validation="required"
          />
          <SetupField
            guide="executionSponsor"
            v-model="entry.binding.signerId"
            type="text"
            :label="`Sponsor signer ID ${index + 1}`"
            validation="required"
          />
          <SetupField
            guide="executionSponsor"
            v-model="entry.binding.address"
            type="text"
            :label="`Sponsor address ${index + 1}`"
            validation="required"
          />
          <SetupField
            guide="executionSponsor"
            v-model="entry.binding.bindingRevision"
            type="text"
            :label="`Sponsor binding revision ${index + 1}`"
            validation="required"
          />
        </div>
        <SetupField
          guide="executionSponsor"
          v-model="entry.fundingAgreement"
          type="text"
          :label="`Gas funding agreement reference ${index + 1}`"
          validation="required"
        />
        <div class="field-grid">
          <SetupField
            guide="executionGas"
            v-model="entry.gasLimit"
            type="text"
            :label="`Gas limit ${index + 1}`"
            validation="required"
          />
          <SetupField
            guide="executionGas"
            v-model="entry.maxFeePerGas"
            type="text"
            :label="`Maximum fee per gas in wei ${index + 1}`"
            validation="required"
          />
          <SetupField
            guide="executionGas"
            v-model="entry.maxPriorityFeePerGas"
            type="text"
            :label="`Maximum priority fee per gas in wei ${index + 1}`"
            validation="required"
          />
          <SetupField
            guide="executionGas"
            v-model="entry.l1FeeReserveWei"
            type="text"
            :label="`L1 fee reserve in wei ${index + 1}`"
            validation="required"
          />
          <SetupField
            guide="executionGas"
            v-model="entry.lifetimeBudgetWei"
            type="text"
            :label="`Lifetime gas budget in wei ${index + 1}`"
            validation="required"
          />
        </div>
        <button
          v-if="model.execution.sponsors.length > 1"
          type="button"
          class="secondary"
          @click="model.execution.sponsors.splice(index, 1)"
        >
          Remove gas sponsor {{ index + 1 }}
        </button>
      </section>
      <button
        type="button"
        class="secondary"
        @click="model.execution.sponsors.push(sponsor())"
      >
        Add application gas sponsor
      </button>
      <div class="field-grid">
        <SetupField
          guide="executionRpc"
          v-model="model.execution.pollIntervalSeconds"
          type="number"
          :number="true"
          label="Execution observation interval in seconds"
          min="5"
          max="300"
          validation="required|between:5,300"
        />
        <SetupField
          guide="executionRpc"
          v-model="model.execution.maxLogRange"
          type="number"
          :number="true"
          label="Maximum authorization log batch in blocks"
          min="100"
          max="10000"
          validation="required|between:100,10000"
        />
      </div>
      <p class="help-text">
        Budgets reserve gas limit × maximum fee per gas plus the L1 reserve.
        Reservations are retained after failure and uncertainty. This is an
        admission budget, not a guarantee that Relayer recovery costs or actual
        L1 fees can never exceed it.
      </p>
    </template>
  </section>
</template>
