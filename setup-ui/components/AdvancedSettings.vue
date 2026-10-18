<script setup lang="ts">
defineProps<{ label: string }>();
</script>
<template>
  <details class="advanced-settings">
    <summary>{{ label }}</summary>
    <div class="advanced-settings-content"><slot /></div>
  </details>
</template>
