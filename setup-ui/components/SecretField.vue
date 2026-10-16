<script setup lang="ts">
import SetupField from './SetupField.vue';
import type { SettingKey } from '../guidance';
const model = defineModel<{ env: string }>({ required: true });
defineProps<{ label: string; guide: SettingKey }>();
</script>
<template>
  <SetupField
    :guide="guide"
    v-model="model.env"
    type="text"
    :label="label + ' variable'"
    :validation="[['required'], ['matches', /^[A-Z][A-Z0-9_]{0,127}$/]]"
    autocomplete="off"
    spellcheck="false"
  />
</template>
