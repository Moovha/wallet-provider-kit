import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const [apiDigest, bundlerDigest] = process.argv.slice(2);
if (
  ![apiDigest, bundlerDigest].every((value) =>
    /^sha256:[a-f0-9]{64}$/.test(value ?? ''),
  )
)
  throw new Error('Image digests are required');
const root = new URL('../artifacts/provider-release/', import.meta.url);
await mkdir(root, { recursive: true });
for (const file of [
  'install.sh',
  'backup.sh',
  'restore.sh',
  'verify-backup.sh',
  'recovery.py',
  'scheduled-backup.py',
  'backup.config.example.json',
  'backup-iam-policy.example.json',
  'setup-vpn.sh',
  'connect-development-vpn.sh',
  'README.md',
  'aws-cloudformation.json',
  'aws-cognito.json',
])
  await copyFile(
    new URL('../packaging/' + file, import.meta.url),
    new URL(file, root),
  );
await writeFile(
  new URL('release.env', root),
  `API_IMAGE=ghcr.io/moovha/wallet-provider-kit@${apiDigest}\nBUNDLER_IMAGE=ghcr.io/moovha/wallet-provider-kit-bundler@${bundlerDigest}\n`,
);
const entries = [];
for (const name of [
  'install.sh',
  'backup.sh',
  'restore.sh',
  'verify-backup.sh',
  'recovery.py',
  'scheduled-backup.py',
  'backup.config.example.json',
  'backup-iam-policy.example.json',
  'setup-vpn.sh',
  'connect-development-vpn.sh',
  'README.md',
  'aws-cloudformation.json',
  'aws-cognito.json',
  'release.env',
])
  entries.push(
    createHash('sha256')
      .update(await readFile(new URL(name, root)))
      .digest('hex') +
      '  ' +
      name,
  );
await writeFile(new URL('SHA256SUMS', root), entries.join('\n') + '\n');
