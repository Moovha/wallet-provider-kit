/** Acquire integrity-pinned upstream contract artifacts before offline integration tests. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(
  await readFile(join(root, 'test/fixtures/contracts/provenance.json'), 'utf8'),
);
const directory = await mkdtemp(join(tmpdir(), 'wpk-contract-download-'));
try {
  const destination = join(root, 'artifacts/integration-contracts');
  await mkdir(destination, { recursive: true });
  for (const name of new Set(manifest.map((record) => record.package))) {
    const records = manifest.filter((record) => record.package === name);
    const { stdout } = await execute(
      'npm',
      [
        'pack',
        name,
        '--ignore-scripts',
        '--pack-destination',
        directory,
        '--json',
      ],
      { timeout: 120000, maxBuffer: 2 * 1024 * 1024 },
    );
    const [{ filename }] = JSON.parse(stdout);
    const tarball = join(directory, filename);
    const digest =
      'sha512-' +
      createHash('sha512')
        .update(await readFile(tarball))
        .digest('base64');
    assert.ok(
      records.every((record) => record.tarballIntegrity === digest),
      'Contract package integrity mismatch',
    );
    for (const record of records) {
      const { stdout: source } = await execute(
        'tar',
        ['-xOf', tarball, 'package/' + record.sourcePath],
        { maxBuffer: 4 * 1024 * 1024 },
      );
      assert.equal(
        createHash('sha256').update(source).digest('hex'),
        record.sourceSha256,
        'Upstream contract artifact changed',
      );
      const contract = JSON.parse(source);
      const fixture =
        JSON.stringify(
          { abi: contract.abi, bytecode: contract.bytecode },
          null,
          2,
        ) + '\n';
      assert.equal(
        createHash('sha256').update(fixture).digest('hex'),
        record.fixtureSha256,
        'Prepared contract artifact changed',
      );
      await writeFile(join(destination, record.file), fixture);
    }
  }
  console.log(
    'Prepared integrity-pinned Safe 1.4.1, Safe4337Module 0.3.0 and EntryPoint 0.7 fixtures',
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
