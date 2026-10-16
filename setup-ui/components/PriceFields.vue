<script setup lang="ts">
import SetupField from './SetupField.vue';
import type { VendorPrice } from '../../src/onboarding/types.js';
const model = defineModel<VendorPrice | undefined>();
defineProps<{ label: string }>();
</script>
<template>
  <SetupField
    guide="priceEnabled"
    type="checkbox"
    :label="label + ': configure an agreed price bound'"
    :modelValue="!!model"
    @update:modelValue="
      model = $event ? { maximumMinor: 0, termsReference: '' } : undefined
    "
  />
  <div v-if="model" class="field-grid">
    <SetupField
      guide="priceMaximum"
      v-model="model.maximumMinor"
      type="number"
      :number="true"
      :label="label + ' maximum (USD cents)'"
      min="0"
      max="9007199254740991"
      validation="required|min:0|max:9007199254740991"
    />
    <SetupField
      guide="priceTerms"
      v-model="model.termsReference"
      type="text"
      :label="label + ' terms reference'"
      validation="required|length:1,256"
    />
  </div>
</template>
