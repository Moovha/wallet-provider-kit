<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from 'vue';
import { useData } from 'vitepress';

const props = defineProps<{ encoded: string }>();
const source = computed(() =>
  new TextDecoder().decode(
    Uint8Array.from(atob(props.encoded), (char) => char.charCodeAt(0)),
  ),
);
const { isDark } = useData();
const id = `wallet-diagram-${useId().replaceAll(':', '')}`;
const svg = ref('');
const failed = ref(false);

async function render() {
  try {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: isDark.value ? 'dark' : 'default',
    });
    const result = await mermaid.render(id, source.value);
    svg.value = result.svg;
    failed.value = false;
  } catch {
    failed.value = true;
  }
}

onMounted(render);
watch(isDark, render);
</script>

<template>
  <figure
    class="wallet-diagram"
    :class="{ sequence: source.trimStart().startsWith('sequenceDiagram') }"
  >
    <div class="drawing" v-html="svg" />
    <details :open="failed">
      <summary>
        {{
          failed
            ? 'Diagram unavailable — view its source'
            : 'View diagram source'
        }}
      </summary>
      <pre>{{ source }}</pre>
    </details>
  </figure>
</template>

<style scoped>
.wallet-diagram {
  margin: 24px 0;
}
.drawing {
  overflow-x: auto;
}
.drawing :deep(svg) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: auto;
  min-width: 480px;
}
.sequence .drawing :deep(svg) {
  min-width: 760px;
}
summary {
  cursor: pointer;
  color: var(--vp-c-text-2);
  font-size: 13px;
}
pre {
  overflow-x: auto;
  font-size: 12px;
}
</style>
