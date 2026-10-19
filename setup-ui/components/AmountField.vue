<script setup lang="ts">
import { ref, watch } from 'vue';
import { displayAmount, parseDisplayAmount } from '../policy-forms';
const props = defineProps<{ label: string; decimals: number }>();
const model = defineModel<string>({ required: true });
const draft = ref(displayAmount(model.value, props.decimals));
const error = ref('');
let editing = false;
watch(
  model,
  (value) => {
    if (
      !editing &&
      !(error.value && value === '') &&
      parseDisplayAmount(draft.value, props.decimals) !== value
    ) {
      draft.value = displayAmount(value, props.decimals);
      error.value = '';
    }
  },
  { flush: 'sync' },
);
function input(value: string) {
  draft.value = value;
  const parsed = parseDisplayAmount(value, props.decimals);
  error.value =
    parsed === undefined
      ? `Enter a nonnegative decimal with at most ${props.decimals} decimal places.`
      : '';
  editing = true;
  model.value = parsed ?? '';
  editing = false;
}
</script>
<template>
  <label
    >{{ label
    }}<input
      :value="draft"
      @input="input(($event.target as HTMLInputElement).value)"
      required
      inputmode="decimal"
      :aria-invalid="!!error"
  /></label>
  <p v-if="error" role="alert">{{ error }}</p>
</template>

<style scoped>
label {
  display: grid;
  gap: 0.4rem;
  margin: 0.7rem 0;
}
input {
  font: inherit;
  width: 100%;
  box-sizing: border-box;
  padding: 0.65rem;
  border: 1px solid #cbd5d1;
  border-radius: 6px;
}
p[role='alert'] {
  color: #862d26;
}
</style>
