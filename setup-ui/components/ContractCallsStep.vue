<script setup lang="ts">
import { defaultSafeProvisioning } from '../../src/provisioning/defaults';
import PolicyAdapters from './PolicyAdapters.vue';
import SetupField from './SetupField.vue';
import ContractPinFields from './ContractPinFields.vue';
import type { ProviderConfiguration } from '../model';
const model = defineModel<ProviderConfiguration>({ required: true });
const pin = () => ({ address: '', codeHash: '' });
function toggle(enabled: unknown) {
  if (!enabled) {
    delete model.value.approvedCalls;
    delete model.value.safeProvisioning;
    return;
  }
  model.value.approvedCalls = {
    maxValiditySeconds: 300,
    policy: {
      mechanism: 'safe-1.4.1',
      accounts: [{ ...pin(), accountId: '', singleton: pin() }],
      multiSend: pin(),
      maximumNativeValueWei: '0',
      lifetimeOperations: '1',
      contracts: [],
      swaps: [],
      vaults: [],
    },
  };
}
function automaticSafe(enabled: unknown) {
  if (!enabled) {
    delete model.value.safeProvisioning;
    return;
  }
  model.value.safeProvisioning = defaultSafeProvisioning();
  if (model.value.approvedCalls)
    model.value.approvedCalls.policy.accounts =
      model.value.approvedCalls.policy.accounts.filter(
        (a) =>
          a.accountId ||
          a.address ||
          a.codeHash ||
          a.singleton.address ||
          a.singleton.codeHash,
      );
}
</script>
<template>
  <section class="feature-panel">
    <h3>Approved contract calls, swaps and vault deposits</h3>
    <SetupField
      guide="approvedCalls"
      type="checkbox"
      label="Enable approved contract-call policy"
      :modelValue="!!model.approvedCalls"
      :disabled="model.execution?.profile !== 'approved-evm-executor-v1'"
      @update:modelValue="toggle"
    />
    <p>
      Choose the approved EVM execution profile first. Use automatic Safe
      provisioning with the bundled local execution engine, or configure
      existing Safe accounts. Assets used by these calls must be held by the
      Safe. Applications need separate contracts:request consent.
    </p>
    <template v-if="model.approvedCalls">
      <SetupField
        guide="approvedCalls"
        type="number"
        :number="true"
        label="Maximum service dispatch validity (seconds)"
        v-model="model.approvedCalls.maxValiditySeconds"
        validation="required"
      />
      <ContractPinFields
        :implementationAllowed="false"
        label="MultiSendCallOnly"
        v-model="model.approvedCalls.policy.multiSend"
      />
      <div class="field-grid">
        <SetupField
          guide="approvedCalls"
          type="text"
          label="Maximum native value per operation (wei)"
          v-model="model.approvedCalls.policy.maximumNativeValueWei"
          validation="required"
        />
        <SetupField
          guide="approvedCalls"
          type="text"
          label="Lifetime admitted operations per owner account"
          v-model="model.approvedCalls.policy.lifetimeOperations"
          validation="required"
        />
      </div>
      <SetupField
        guide="approvedCalls"
        type="checkbox"
        label="Automatically provision a Safe for each new wallet"
        :modelValue="!!model.safeProvisioning"
        :disabled="!model.execution?.local"
        @update:modelValue="automaticSafe"
      />
      <section v-if="model.safeProvisioning" class="feature-panel">
        <p>
          The signing wallet is the Safe’s sole owner with threshold one.
          Deployment uses the application sponsor and shares its gas budget. The
          service verifies the pinned factory, singleton and proxy code through
          both RPCs. No modules, guard, fallback handler or setup payment are
          installed.
        </p>
        <ContractPinFields
          :implementationAllowed="false"
          label="Safe proxy factory"
          v-model="model.safeProvisioning.factory"
        />
        <ContractPinFields
          :implementationAllowed="false"
          label="Safe singleton"
          v-model="model.safeProvisioning.singleton"
        />
        <SetupField
          guide="approvedCalls"
          type="text"
          label="Safe proxy runtime code hash"
          v-model="model.safeProvisioning.proxyCodeHash"
          validation="required"
        />
        <SetupField
          guide="approvedCalls"
          type="number"
          :number="true"
          label="Safe deployment dispatch validity (seconds)"
          v-model="model.safeProvisioning.maxValiditySeconds"
          validation="required|between:30,900"
        />
      </section>
      <h4>Existing Safe account bindings</h4>
      <section
        v-for="(account, index) in model.approvedCalls.policy.accounts"
        :key="index"
        class="feature-panel"
      >
        <SetupField
          guide="approvedCalls"
          type="text"
          label="Provisioned owner wallet account UUID"
          v-model="account.accountId"
          validation="required"
        />
        <ContractPinFields
          :implementationAllowed="false"
          label="Safe proxy"
          v-model="model.approvedCalls.policy.accounts[index]"
        />
        <ContractPinFields
          :implementationAllowed="false"
          label="Safe singleton"
          v-model="account.singleton"
        />
        <button
          type="button"
          class="secondary"
          @click="model.approvedCalls.policy.accounts.splice(index, 1)"
        >
          Remove account binding
        </button>
      </section>
      <button
        type="button"
        class="secondary"
        @click="
          model.approvedCalls.policy.accounts.push({
            ...pin(),
            accountId: '',
            singleton: pin(),
          })
        "
      >
        Add Safe account binding
      </button>
      <h4>Permitted contract functions</h4>
      <p>
        These rules delegate the selected functions, including their
        contract-defined effects. Review the contracts; a selector or simulation
        cannot establish a general token-spending limit.
      </p>
      <section
        v-for="(target, index) in model.approvedCalls.policy.contracts"
        :key="index"
        class="feature-panel"
      >
        <ContractPinFields
          label="Permitted target"
          v-model="model.approvedCalls.policy.contracts[index]"
        />
        <SetupField
          guide="approvedCalls"
          type="text"
          label="Permitted function selectors (comma separated)"
          :modelValue="target.selectors.join(',')"
          @update:modelValue="
            target.selectors = String($event)
              .split(',')
              .map((value) => value.trim())
          "
          validation="required"
        />
        <SetupField
          guide="approvedCalls"
          type="text"
          label="Maximum native value for this target (wei)"
          v-model="target.maximumValueWei"
          validation="required"
        />
        <button
          type="button"
          class="secondary"
          @click="model.approvedCalls.policy.contracts.splice(index, 1)"
        >
          Remove contract rule
        </button>
      </section>
      <button
        type="button"
        class="secondary"
        @click="
          model.approvedCalls.policy.contracts.push({
            ...pin(),
            selectors: [''],
            maximumValueWei: '0',
          })
        "
      >
        Add contract rule
      </button>
      <PolicyAdapters
        v-model="model.approvedCalls.policy.adapters"
        :contracts="model.approvedCalls.policy.contracts"
        :compatibility="{
          swaps: model.approvedCalls.policy.swaps,
          vaults: model.approvedCalls.policy.vaults,
        }"
        :transfer="model.financial"
        :tokenCodeHash="model.execution?.rpc.tokenCodeHash"
      />
      <details>
        <summary>Compatibility request routes</summary>
        <p>
          These routes support existing swap and vault request bodies. They do
          not enable adapters for generic calls.
        </p>
        <h4>Uniswap V3 exact-input routes</h4>
        <section
          v-for="(route, index) in model.approvedCalls.policy.swaps"
          :key="index"
          class="feature-panel"
        >
          <SetupField
            guide="approvedCalls"
            type="text"
            label="Swap route ID"
            v-model="route.id"
            validation="required"
          />
          <ContractPinFields label="Uniswap V3 router" v-model="route.router" />
          <ContractPinFields label="Input token" v-model="route.tokenIn" />
          <ContractPinFields label="Output token" v-model="route.tokenOut" />
          <SetupField
            guide="approvedCalls"
            type="number"
            :number="true"
            label="Pool fee (millionths)"
            v-model="route.fee"
            validation="required"
          />
          <SetupField
            guide="approvedCalls"
            type="text"
            label="Maximum input atomic units"
            v-model="route.maximumInput"
            validation="required"
          />
          <button
            type="button"
            class="secondary"
            @click="model.approvedCalls.policy.swaps?.splice(index, 1)"
          >
            Remove swap route
          </button>
        </section>
        <button
          type="button"
          class="secondary"
          @click="
            (model.approvedCalls.policy.swaps ??= []).push({
              id: '',
              router: pin(),
              tokenIn: pin(),
              tokenOut: pin(),
              fee: 3000,
              maximumInput: '',
            })
          "
        >
          Add swap route
        </button>
        <h4>ERC-4626 deposit routes</h4>
        <section
          v-for="(route, index) in model.approvedCalls.policy.vaults"
          :key="index"
          class="feature-panel"
        >
          <SetupField
            guide="approvedCalls"
            type="text"
            label="Vault route ID"
            v-model="route.id"
            validation="required"
          />
          <ContractPinFields
            label="Yearn4626-compatible router"
            v-model="route.router"
          />
          <ContractPinFields label="ERC-4626 vault" v-model="route.vault" />
          <ContractPinFields label="Vault asset" v-model="route.asset" />
          <SetupField
            guide="approvedCalls"
            type="text"
            label="Maximum deposited atomic units"
            v-model="route.maximumAssets"
            validation="required"
          />
          <button
            type="button"
            class="secondary"
            @click="model.approvedCalls.policy.vaults?.splice(index, 1)"
          >
            Remove vault route
          </button>
        </section>
        <button
          type="button"
          class="secondary"
          @click="
            (model.approvedCalls.policy.vaults ??= []).push({
              id: '',
              router: pin(),
              vault: pin(),
              asset: pin(),
              maximumAssets: '',
            })
          "
        >
          Add vault route
        </button>
      </details>
    </template>
  </section>
</template>
