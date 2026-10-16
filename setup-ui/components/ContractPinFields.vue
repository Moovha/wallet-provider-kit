<script setup lang="ts">
import SetupField from './SetupField.vue';
import type { PinnedContract } from '../../src/execution/approved-calls';
withDefaults(
  defineProps<{ label: string; implementationAllowed?: boolean }>(),
  { implementationAllowed: true },
);
const model = defineModel<PinnedContract>({ required: true });
</script>
<template>
  <div class="field-grid">
    <SetupField
      guide="approvedCalls"
      type="text"
      :label="label + ' address'"
      v-model="model.address"
      validation="required"
    />
    <SetupField
      guide="approvedCalls"
      type="text"
      :label="label + ' runtime code hash'"
      v-model="model.codeHash"
      validation="required"
    />
    <SetupField
      guide="approvedCalls"
      v-if="implementationAllowed !== false"
      type="checkbox"
      :label="label + ' uses an ERC-1967 implementation'"
      :modelValue="!!model.implementation"
      @update:modelValue="
        $event
          ? (model.implementation = { address: '', codeHash: '' })
          : delete model.implementation
      "
    />
    <template v-if="model.implementation">
      <SetupField
        guide="approvedCalls"
        type="text"
        :label="label + ' implementation address'"
        v-model="model.implementation.address"
        validation="required"
      />
      <SetupField
        guide="approvedCalls"
        type="text"
        :label="label + ' implementation runtime code hash'"
        v-model="model.implementation.codeHash"
        validation="required"
      />
    </template>
  </div>
</template>
