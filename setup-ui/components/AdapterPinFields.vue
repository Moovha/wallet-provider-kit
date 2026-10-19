<script setup lang="ts">
import { pinForAdapter } from '../policy-forms';
import type { PinnedContract } from '../../src/execution/approved-calls';
const props = defineProps<{ label: string; contracts?: PinnedContract[] }>();
const model = defineModel<PinnedContract>({ required: true });
function select(value: string) {
  const pin = props.contracts?.find((p) => p.address === value);
  if (pin) model.value = pinForAdapter(pin);
}
</script>
<template>
  <fieldset class="adapter-pin">
    <legend>{{ label }}</legend>
    <label v-if="contracts?.length"
      >{{ label }} registered contract<select
        :aria-label="label + ' registered contract'"
        value=""
        @change="select(($event.target as HTMLSelectElement).value)"
      >
        <option value="">Choose an existing pin</option>
        <option
          v-for="pin in contracts"
          :key="pin.address"
          :value="pin.address"
        >
          {{ pin.address }}
        </option>
      </select></label
    >
    <label
      >{{ label }} address<input
        v-model="model.address"
        required
        pattern="0x[0-9a-fA-F]{40}"
        autocomplete="off"
    /></label>
    <label
      >{{ label }} code hash<input
        v-model="model.codeHash"
        required
        pattern="0x[0-9a-f]{64}"
        autocomplete="off"
    /></label>
    <label
      ><input
        type="checkbox"
        :checked="!!model.implementation"
        @change="
          ($event.target as HTMLInputElement).checked
            ? (model.implementation = { address: '', codeHash: '' })
            : delete model.implementation
        "
      />{{ label }} implementation pin</label
    >
    <template v-if="model.implementation"
      ><label
        >{{ label }} implementation address<input
          v-model="model.implementation.address"
          required
          pattern="0x[0-9a-fA-F]{40}" /></label
      ><label
        >{{ label }} implementation code hash<input
          v-model="model.implementation.codeHash"
          required
          pattern="0x[0-9a-f]{64}" /></label
    ></template>
  </fieldset>
</template>
