<script setup lang="ts">
import { computed } from 'vue';
import { settings, type SettingKey } from '../guidance';
const props = defineProps<{ guide: SettingKey; label: string }>();
const guidance = computed(() => settings[props.guide]);
</script>
<template>
  <div class="formkit-help setting-help" :data-setting="guide">
    <p>{{ guidance.summary }}</p>
    <details>
      <summary :aria-label="'Why do I need this? Where do I get it? ' + label">
        Why do I need this? Where do I get it?
      </summary>
      <dl>
        <dt>Why it’s needed</dt>
        <dd>{{ guidance.why }}</dd>
        <dt>Where to get it / what to choose</dt>
        <dd>{{ guidance.source }}</dd>
      </dl>
      <a :href="guidance.url" target="_blank" rel="noopener noreferrer"
        >Step-by-step instructions ↗</a
      >
    </details>
  </div>
</template>
