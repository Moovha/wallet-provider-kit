<script setup lang="ts">
import { settings, type SettingKey } from '../guidance';
import SettingHelp from './SettingHelp.vue';
defineOptions({ inheritAttrs: false });
defineProps<{ guide: SettingKey }>();
</script>
<template>
  <FormKit v-bind="$attrs" :help="settings[guide].summary">
    <template #help="{ id }">
      <SettingHelp
        :id="'help-' + id"
        :guide="guide"
        :label="String($attrs.label ?? 'this setting')"
      />
    </template>
  </FormKit>
</template>
