import { copyFile, chmod } from 'node:fs/promises';
for (const path of [
  'management/console.mjs',
  'service/documentation-token-ui.mjs',
]) {
  const target = new URL('../dist/' + path, import.meta.url);
  await copyFile(new URL('../src/' + path, import.meta.url), target);
  await chmod(target, 0o644);
}
