import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packages = [
  '@formkit/vue',
  '@formkit/core',
  '@formkit/addons',
  '@formkit/auto-animate',
  '@formkit/inputs',
  '@formkit/utils',
  '@formkit/observer',
  '@formkit/validation',
  '@formkit/rules',
  '@formkit/i18n',
  '@formkit/themes',
  '@formkit/icons',
  'vue',
  '@vue/shared',
  '@vue/reactivity',
  '@vue/runtime-core',
  '@vue/runtime-dom',
];
let notices =
  'Bundled operator setup interface: third-party license notices\n\n';
for (const name of packages) {
  let folder = dirname(fileURLToPath(import.meta.resolve(name)));
  let manifest;
  while (!manifest) {
    try {
      const candidate = join(folder, 'package.json');
      if (JSON.parse(await readFile(candidate, 'utf8')).name === name)
        manifest = candidate;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (!manifest) {
      const parent = dirname(folder);
      if (parent === folder)
        throw new Error(`Package license unavailable: ${name}`);
      folder = parent;
    }
  }
  const { version } = JSON.parse(await readFile(manifest, 'utf8'));
  notices += `${name}@${version}\n${await readFile(join(dirname(manifest), 'LICENSE'), 'utf8')}\n\n`;
}
await writeFile(
  new URL('../dist/setup-ui/THIRD_PARTY_NOTICES.txt', import.meta.url),
  notices,
);
await copyFile(
  new URL('../setup-ui/ASSETS.md', import.meta.url),
  new URL('../dist/setup-ui/PROVIDER_ASSETS.txt', import.meta.url),
);
