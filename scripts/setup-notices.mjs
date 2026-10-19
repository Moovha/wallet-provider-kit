import { createRequire } from 'node:module';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
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
  'ethers',
  '@noble/hashes',
  '@noble/curves',
  '@adraffy/ens-normalize',
  'aes-js',
];
let notices = 'Bundled setup interface: third-party license notices\n\n';
const runtimeDependency = createRequire(import.meta.resolve('ethers'));
const runtimeEntries = {
  ethers: 'ethers',
  '@noble/hashes': '@noble/hashes/sha3',
  '@noble/curves': '@noble/curves/abstract/utils',
  '@adraffy/ens-normalize': '@adraffy/ens-normalize',
  'aes-js': 'aes-js',
};
for (const name of packages) {
  let folder = dirname(
    runtimeEntries[name]
      ? runtimeDependency.resolve(runtimeEntries[name])
      : fileURLToPath(import.meta.resolve(name)),
  );
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
  const license =
    name === 'ethers'
      ? 'LICENSE.md'
      : name === 'aes-js'
        ? 'LICENSE.txt'
        : 'LICENSE';
  notices += `${name}@${version}\n${await readFile(join(dirname(manifest), license), 'utf8')}\n\n`;
}
await copyFile(
  new URL('../setup-ui/ASSETS.md', import.meta.url),
  new URL('../dist/setup-ui/PROVIDER_ASSETS.txt', import.meta.url),
);

// Copy the pinned, maintained renderer; it remains a build dependency only.
const swaggerFolder = dirname(
  fileURLToPath(import.meta.resolve('swagger-ui-dist/package.json')),
);
const referenceFolder = new URL('../dist/setup-ui/reference/', import.meta.url);
await mkdir(referenceFolder, { recursive: true });
for (const name of [
  'swagger-ui-bundle.js',
  'swagger-ui.css',
  'swagger-ui-bundle.js.LICENSE.txt',
  'LICENSE',
  'NOTICE',
]) {
  await copyFile(join(swaggerFolder, name), new URL(name, referenceFolder));
}
const swaggerPackage = JSON.parse(
  await readFile(join(swaggerFolder, 'package.json'), 'utf8'),
);
await writeFile(
  new URL('VERSION.txt', referenceFolder),
  `swagger-ui-dist@${swaggerPackage.version}\n`,
);

await writeFile(
  new URL('../dist/setup-ui/THIRD_PARTY_NOTICES.txt', import.meta.url),
  notices +
    `swagger-ui-dist@${swaggerPackage.version}\n` +
    (await readFile(join(swaggerFolder, 'LICENSE'), 'utf8')) +
    '\n' +
    (await readFile(join(swaggerFolder, 'NOTICE'), 'utf8')) +
    '\n' +
    (await readFile(
      join(swaggerFolder, 'swagger-ui-bundle.js.LICENSE.txt'),
      'utf8',
    )),
);

await copyFile(
  new URL('../src/service/documentation-token-ui.mjs', import.meta.url),
  new URL('../dist/service/documentation-token-ui.mjs', import.meta.url),
);
