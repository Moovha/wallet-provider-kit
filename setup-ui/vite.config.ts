import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  build: {
    outDir: '../dist/setup-ui',
    emptyOutDir: true,
    sourcemap: false,
    rolldownOptions: {
      input: {
        setup: fileURLToPath(new URL('index.html', import.meta.url)),
        operator: fileURLToPath(new URL('operator.html', import.meta.url)),
      },
    },
  },
});
