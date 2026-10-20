import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function patchBundlerScheduling(source, expectedHash) {
  if (createHash('sha256').update(source).digest('hex') !== expectedHash)
    throw Error('Bundler scheduler source mismatch');
  const needle = 'this.sendBundleToExecutor(bundle)';
  if (source.split(needle).length !== 2)
    throw Error('Unexpected bundler scheduler layout');
  return source.replace(needle, 'await ' + needle);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [path, hash] of [
    [
      '/app/src/executor/executorManager.ts',
      '844f0ee38b42dbc42c7e8700b2b74093a0c89cc0a487bd2db3d97f1df901e88c',
    ],
    [
      '/app/src/esm/executor/executorManager.js',
      'e10751e61fbed810445999e746dd7200e2c667b6e1f7694eb3e9a4aeceda652d',
    ],
  ]) {
    await writeFile(
      path,
      patchBundlerScheduling(await readFile(path, 'utf8'), hash),
    );
  }
}
