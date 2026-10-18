<script setup lang="ts">
import { computed } from 'vue';
import {
  defaultReplacementPolicy,
  defaultSponsorGas,
} from '../../src/execution/defaults';
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
    ...defaultSponsorGas,
  };
}
function toggle(value: unknown) {
  if (!value) {
    delete model.value.execution;
    delete model.value.operations;
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
    recovery: { stuckAfterSeconds: 30, quarantineOnStuck: true },
    replacement: { ...defaultReplacementPolicy },
  };
  mode('erc3009-executor-v1');
}
function mode(value: unknown) {
  const execution = model.value.execution;
  if (!execution) return;
  if (value === 'erc3009-executor-v1' || value === 'approved-evm-executor-v1') {
    execution.profile = value;
    if (value !== 'approved-evm-executor-v1') delete execution.safeQueue;
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
    delete execution.replacement;
    delete execution.safeQueue;
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
function togglePool(value: unknown) {
  const execution = model.value.execution;
  if (!execution) return;
  if (value)
    execution.sponsorPool = {
      strategy: 'round-robin',
      maxInFlightPerSponsor: 4,
    };
  else delete execution.sponsorPool;
}
function toggleQueue(value: unknown) {
  const execution = model.value.execution;
  if (!execution) return;
  if (value) execution.safeQueue = { maxDepthPerSafe: 20, maxWaitSeconds: 300 };
  else delete execution.safeQueue;
}
function toggleRecovery(value: unknown) {
  if (!model.value.execution) return;
  if (value)
    model.value.execution.recovery = {
      stuckAfterSeconds: 300,
      quarantineOnStuck: true,
    };
  else {
    delete model.value.execution.recovery;
    delete model.value.execution.replacement;
  }
}
function toggleOperations(value: unknown) {
  if (value)
    model.value.operations = {
      pollIntervalSeconds: 15,
      lowBalanceWei: '1000000000000000',
      webhooks: [],
    };
  else delete model.value.operations;
}
function addWebhook() {
  const operations = model.value.operations;
  if (!operations || operations.webhooks.length >= 8) return;
  const suffix = operations.webhooks.length + 1;
  operations.webhooks.push({
    id: `payer-alerts-${suffix}`,
    endpoint: { env: `PAYER_WEBHOOK_${suffix}_URL` },
    signingSecrets: [{ env: `PAYER_WEBHOOK_${suffix}_SECRET` }],
  });
}
function toggleReplacement(value: unknown) {
  if (!model.value.execution) return;
  if (value) {
    model.value.execution.replacement = { ...defaultReplacementPolicy };
    model.value.execution.recovery ??= {
      stuckAfterSeconds: 30,
      quarantineOnStuck: true,
    };
  } else delete model.value.execution.replacement;
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
        Base Sepolia EOA transfers and explicitly approved Safe calls. Configure
        pre-existing sponsor accounts separately from owner-wallet signers. This
        does not install a Relayer, fund a sponsor or verify deployment
        readiness.
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
      <section class="feature-panel">
        <h4>Payer monitoring and recovery</h4>
        <SetupField
          guide="executionRecovery"
          type="checkbox"
          label="Detect stuck execution and nonce problems"
          :modelValue="!!model.execution.recovery"
          @update:modelValue="toggleRecovery"
        />
        <template v-if="model.execution.recovery">
          <SetupField
            guide="executionRecovery"
            type="number"
            label="Stuck suspicion threshold in seconds"
            :number="true"
            v-model="model.execution.recovery.stuckAfterSeconds"
            validation="required|between:30,86400"
          />
          <SetupField
            guide="executionRecovery"
            type="checkbox"
            label="Quarantine affected payers"
            v-model="model.execution.recovery.quarantineOnStuck"
          />
        </template>
        <template v-if="model.execution.service">
          <SetupField
            guide="replacementWorker"
            type="checkbox"
            label="Automatically replace stuck transactions within approved fees"
            :modelValue="!!model.execution.replacement"
            @update:modelValue="toggleReplacement"
          />
          <template v-if="model.execution.replacement">
            <SetupField
              guide="replacementWorker"
              type="number"
              label="Initial fee percentage in basis points"
              :number="true"
              v-model="model.execution.replacement.initialFeeBasisPoints"
              validation="required|between:1000,9000"
            />
            <SetupField
              guide="replacementWorker"
              type="number"
              label="Replacement fee increase in basis points"
              :number="true"
              v-model="model.execution.replacement.bumpBasisPoints"
              validation="required|between:1000,10000"
            />
            <SetupField
              guide="replacementWorker"
              type="number"
              label="Maximum replacement attempts"
              :number="true"
              v-model="model.execution.replacement.maxAttempts"
              validation="required|between:1,6"
            />
            <SetupField
              guide="replacementWorker"
              type="number"
              label="Minimum replacement interval in seconds"
              :number="true"
              v-model="model.execution.replacement.intervalSeconds"
              validation="required|between:30,3600"
            />
            <p class="help-text">
              Requires the pinned fee-only provider build on the designated
              executor. Existing approved gas caps remain fixed. An uncertain
              replacement is reconciled without repeating its mutation.
            </p>
          </template>
        </template>
        <SetupField
          guide="payerOperations"
          type="checkbox"
          label="Monitor payer balances, health and webhooks"
          :modelValue="!!model.operations"
          @update:modelValue="toggleOperations"
        />
        <template v-if="model.operations">
          <SetupField
            guide="payerOperations"
            type="number"
            label="Payer monitoring interval in seconds"
            :number="true"
            v-model="model.operations.pollIntervalSeconds"
            validation="required|between:5,300"
          />
          <SetupField
            guide="payerOperations"
            label="Low gas balance threshold in wei"
            v-model="model.operations.lowBalanceWei"
            validation="required"
          />
          <div
            v-for="(webhook, index) in model.operations.webhooks"
            :key="index"
            class="feature-panel"
          >
            <SetupField
              guide="payerOperations"
              label="Webhook destination ID"
              v-model="webhook.id"
              validation="required"
            />
            <SetupField
              guide="payerOperations"
              label="Webhook URL environment variable"
              v-model="webhook.endpoint.env"
              validation="required"
            />
            <SetupField
              guide="payerOperations"
              label="Webhook signing secret environment variable"
              v-model="webhook.signingSecrets[0].env"
              validation="required"
            />
            <button
              type="button"
              @click="model.operations.webhooks.splice(index, 1)"
            >
              Remove webhook
            </button>
          </div>
          <button
            type="button"
            :disabled="model.operations.webhooks.length >= 8"
            @click="addWebhook"
          >
            Add payer webhook
          </button>
          <p class="help-text">
            Health exposes aggregate counts. Webhooks use signed CloudEvents
            with durable retries. Low balance alerts do not fund a payer or
            change transaction authority. Configure equivalent monitoring and
            recovery on the execution service.
          </p>
        </template>
      </section>
      <section class="feature-panel">
        <h4>Sponsor pool and Safe queue</h4>
        <SetupField
          guide="sponsorPool"
          type="checkbox"
          label="Enable round-robin sponsor pools"
          :modelValue="!!model.execution.sponsorPool"
          @update:modelValue="togglePool"
        />
        <SetupField
          v-if="model.execution.sponsorPool"
          guide="sponsorPool"
          type="number"
          label="Maximum unfinished executions per sponsor"
          :number="true"
          v-model="model.execution.sponsorPool.maxInFlightPerSponsor"
          validation="required|between:1,100"
        />
        <p class="help-text">
          With pools enabled, add distinct sponsor addresses for the same
          application below. Selection is durable; retries retain their payer.
          Unknown attempts occupy capacity. Configure the executor's independent
          pool limits too. The application lifetime gas budget is shared across
          pool members.
        </p>
        <template v-if="model.execution.profile === 'approved-evm-executor-v1'">
          <SetupField
            guide="safeQueue"
            type="checkbox"
            label="Enable durable per-Safe request queues"
            :modelValue="!!model.execution.safeQueue"
            @update:modelValue="toggleQueue"
          />
          <template v-if="model.execution.safeQueue">
            <SetupField
              guide="safeQueue"
              type="number"
              label="Maximum pending requests per Safe"
              :number="true"
              v-model="model.execution.safeQueue.maxDepthPerSafe"
              validation="required|between:1,100"
            />
            <SetupField
              guide="safeQueue"
              type="number"
              label="Maximum queue validity in seconds"
              :number="true"
              v-model="model.execution.safeQueue.maxWaitSeconds"
              validation="required|between:30,3600"
            />
          </template>
          <p class="help-text">
            Applications enqueue exact approved requests for delayed execution.
            Only the head receives a Safe nonce and signature. Current authority
            is rechecked before effects. Expiry is also bounded by the contract
            policy; signed uncertainty blocks the lane.
          </p>
        </template>
      </section>
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
