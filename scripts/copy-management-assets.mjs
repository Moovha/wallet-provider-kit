import { copyFile } from 'node:fs/promises';
for (const path of [
  'management/console.mjs',
  'service/documentation-token-ui.mjs',
])
  await copyFile(
    new URL('../src/' + path, import.meta.url),
    new URL('../dist/' + path, import.meta.url),
  );
