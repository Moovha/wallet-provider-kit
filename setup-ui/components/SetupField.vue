<script setup lang="ts">
import { settings, type SettingKey } from '../guidance';
import SettingHelp from './SettingHelp.vue';
import { fieldValidationMessages } from '../validation';
defineOptions({ inheritAttrs: false });
defineProps<{ guide: SettingKey }>();
</script>
<template>
  <FormKit
    v-bind="$attrs"
    :help="settings[guide].summary"
    :validation-messages="fieldValidationMessages(guide)"
  >
    <template #help="{ id }">
      <SettingHelp
        :id="'help-' + id"
        :guide="guide"
        :label="String($attrs.label ?? 'this setting')"
      />
    </template>
  </FormKit>
</template>
