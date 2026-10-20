import { copyFile } from 'node:fs/promises';
await copyFile(
  new URL('../src/management/console.mjs', import.meta.url),
  new URL('../dist/management/console.mjs', import.meta.url),
);
