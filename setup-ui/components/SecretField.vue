<script setup lang="ts">
const model = defineModel<{ env: string }>({ required: true });
defineProps<{ label: string }>();
</script>
<template>
  <FormKit
    v-model="model.env"
    type="text"
    :label="label + ' variable'"
    :validation="[['required'], ['matches', /^[A-Z][A-Z0-9_]{0,127}$/]]"
    help="Environment variable name only. Supply its value through your deployment secret store."
    autocomplete="off"
    spellcheck="false"
  />
</template>
