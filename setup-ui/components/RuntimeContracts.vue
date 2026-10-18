<script setup lang="ts">
import ContractDiscovery from './ContractDiscovery.vue';
import type { RuntimePolicy } from '../../src/runtime-configuration/service';
const model = defineModel<RuntimePolicy['contracts']>({ required: true });
function add() {
  model.value.push({
    address: '',
    code_hash: '',
    methods: [{ signature: '', maximum_value_wei: '0' }],
  });
}
</script>
<template>
  <section aria-labelledby="contracts-heading">
    <div class="section-title">
      <h3 id="contracts-heading">Contracts and methods</h3>
      <button type="button" @click="add" :disabled="model.length >= 32">
        Add contract
      </button>
    </div>
    <p>
      Enter a deployed address and load its verified methods, or import an ABI.
      You can also enter bytecode pins and canonical method signatures manually.
      Values are decimal wei.
    </p>
    <p v-if="!model.length">No contracts registered.</p>
    <fieldset v-for="(contract, index) in model" :key="index">
      <legend>Contract {{ index + 1 }}</legend>
      <label
        >Contract address<input
          v-model="contract.address"
          required
          pattern="0x[0-9a-fA-F]{40}"
          autocomplete="off"
      /></label>
      <ContractDiscovery v-model="model[index]" />
      <label
        >Bytecode hash<input
          v-model="contract.code_hash"
          required
          pattern="0x[0-9a-f]{64}"
          autocomplete="off"
      /></label>
      <label
        ><input
          type="checkbox"
          :checked="!!contract.implementation"
          @change="
            contract.implementation = ($event.target as HTMLInputElement)
              .checked
              ? { address: '', code_hash: '' }
              : undefined
          "
        />
        Proxy implementation pin</label
      >
      <template v-if="contract.implementation">
        <label
          >Implementation address<input
            v-model="contract.implementation.address"
            required
            pattern="0x[0-9a-fA-F]{40}"
        /></label>
        <label
          >Implementation bytecode hash<input
            v-model="contract.implementation.code_hash"
            required
            pattern="0x[0-9a-f]{64}"
        /></label>
      </template>
      <div
        v-for="(method, methodIndex) in contract.methods"
        :key="methodIndex"
        class="method-row"
      >
        <label
          >Method signature<input
            v-model="method.signature"
            required
            maxlength="256"
            placeholder="deposit(uint256,address)"
        /></label>
        <label
          >Method maximum wei<input
            v-model="method.maximum_value_wei"
            required
            pattern="0|[1-9][0-9]{0,77}"
            inputmode="numeric"
        /></label>
        <button
          type="button"
          :disabled="contract.methods.length <= 1"
          @click="contract.methods.splice(methodIndex, 1)"
        >
          Remove method {{ methodIndex + 1 }}
        </button>
      </div>
      <div class="actions">
        <button
          type="button"
          @click="
            contract.methods.push({ signature: '', maximum_value_wei: '0' })
          "
          :disabled="contract.methods.length >= 32"
        >
          Add method</button
        ><button type="button" @click="model.splice(index, 1)">
          Remove contract {{ index + 1 }}
        </button>
      </div>
    </fieldset>
  </section>
</template>
