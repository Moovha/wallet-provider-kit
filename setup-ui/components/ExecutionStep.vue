<script setup lang="ts">
import { computed } from 'vue';
import SetupField from './SetupField.vue';
import type { ProviderConfiguration } from '../model';
const model = defineModel<ProviderConfiguration>({ required: true });
const applications = computed(() =>
  model.value.policy.applications
    .filter(
      (app) =>
        app.enabled !== false &&
        app.permissions?.some((permission) =>
          ['transfers:request', 'contracts:request'].includes(permission),
        ),
    )
    .map((app) => ({ label: app.name, value: app.clientId })),
);
function sponsor() {
  return {
    clientId: applications.value[0]?.value ?? '',
    accountId: crypto.randomUUID(),
    binding: {
      ...(model.value.execution?.profile === 'erc3009-relayer-v1'
        ? { relayerId: '', signerId: '' }
        : {}),
      address: '',
      bindingRevision: '1',
    },
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
  mode('erc3009-executor-v1');
}
function mode(value: unknown) {
  const execution = model.value.execution;
  if (!execution) return;
  if (value === 'erc3009-executor-v1' || value === 'approved-evm-executor-v1') {
    execution.profile = value;
    if (value === 'approved-evm-executor-v1' && !model.value.financial)
      delete execution.rpc.tokenCodeHash;
    delete execution.relayer;
    execution.service = {
      url: '',
      providerId: '',
      providerRevision: '1',
      signing: {
        id: 'wallet-2026',
        privateKey: { env: 'EXECUTION_WALLET_PRIVATE_KEY' },
      },
      keys: [
        {
          id: 'executor-2026',
          publicKey: { env: 'EXECUTION_SERVICE_PUBLIC_KEY' },
        },
      ],
    };
    for (const entry of execution.sponsors) {
      delete entry.binding.relayerId;
      delete entry.binding.signerId;
    }
  } else {
    execution.profile = 'erc3009-relayer-v1';
    delete execution.service;
    execution.relayer = {
      url: '',
      apiKey: { env: 'EXECUTION_RELAYER_API_KEY' },
    };
    for (const entry of execution.sponsors) {
      entry.binding.relayerId = '';
      entry.binding.signerId = '';
    }
  }
}
</script>
<template>
  <section class="feature-panel">
    <h3>Optional approved-action execution and verified status</h3>
    <p>
      Coordinate approved actions with a dedicated application gas sponsor. The
      service checks the same current wallet authority, simulates the exact call
      batch, records one durable dispatch and checks receipts through
      independent RPC sources. Lost responses never permit another submission.
    </p>
    <SetupField
      guide="executionEnabled"
      type="checkbox"
      label="Configure transfer execution and RPC verification"
      :modelValue="!!model.execution"
      @update:modelValue="toggle"
    />
    <p v-if="!model.financial && !model.approvedCalls" class="help-text">
      Configure delegated transfer signing in Policies or an approved
      contract-call policy below.
    </p>
    <template v-if="model.execution">
      <SetupField
        guide="executionEnabled"
        type="select"
        label="Execution submission service"
        :modelValue="model.execution.profile"
        :options="[
          {
            label: 'Approved EVM actions through designated service',
            value: 'approved-evm-executor-v1',
          },
          {
            label: 'Designated execution service',
            value: 'erc3009-executor-v1',
          },
          { label: 'Direct OpenZeppelin Relayer', value: 'erc3009-relayer-v1' },
        ]"
        @update:modelValue="mode"
      />
      <section v-if="model.execution.service" class="feature-panel">
        <h4>Designated execution service connection</h4>
        <p>
          Deploy the execution service separately with its own storage, provider
          registry and sponsor credentials. These settings connect the wallet
          service to that deployment; applications cannot choose the executor or
          provider.
        </p>
        <div class="field-grid">
          <SetupField
            guide="executionService"
            v-model="model.execution.service.url"
            type="text"
            label="Designated execution service HTTPS origin"
            validation="required"
          />
          <SetupField
            guide="executionService"
            v-model="model.execution.service.providerId"
            type="text"
            label="Execution provider ID"
            validation="required"
          />
          <SetupField
            guide="executionService"
            v-model="model.execution.service.providerRevision"
            type="text"
            label="Execution provider revision"
            validation="required"
          />
          <SetupField
            guide="executionService"
            v-model="model.execution.service.signing.id"
            type="text"
            label="Wallet service signing key ID"
            validation="required"
          />
          <SetupField
            guide="executionService"
            v-model="model.execution.service.signing.privateKey.env"
            type="text"
            label="Wallet service private signing key variable name"
            validation="required"
          />
        </div>
        <div
          v-for="(key, index) in model.execution.service.keys"
          :key="index"
          class="field-grid"
        >
          <SetupField
            guide="executionService"
            v-model="key.id"
            type="text"
            :label="`Execution service public key ID ${index + 1}`"
            validation="required"
          />
          <SetupField
            guide="executionService"
            v-model="key.publicKey.env"
            type="text"
            :label="`Execution service public key variable name ${index + 1}`"
            validation="required"
          />
          <button
            v-if="model.execution.service.keys.length > 1"
            type="button"
            class="secondary"
            @click="model.execution.service.keys.splice(index, 1)"
          >
            Remove verification key {{ index + 1 }}
          </button>
        </div>
        <button
          v-if="model.execution.service.keys.length < 8"
          type="button"
          class="secondary"
          @click="
            model.execution.service.keys.push({
              id: '',
              publicKey: { env: '' },
            })
          "
        >
          Add execution service verification key
        </button>
      </section>
      <p class="callout">
        Base Sepolia EOA token transfers only. Configure pre-existing sponsor
        accounts separately from owner-wallet signers. This does not install a
        Relayer, fund a sponsor or verify deployment readiness.
      </p>
      <div v-if="model.execution.relayer" class="field-grid">
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
          v-if="model.financial"
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
            v-if="model.execution.relayer"
            v-model="entry.binding.relayerId"
            type="text"
            :label="`Sponsor Relayer ID ${index + 1}`"
            validation="required"
          />
          <SetupField
            guide="executionSponsor"
            v-if="model.execution.relayer"
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
