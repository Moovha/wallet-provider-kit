// Internal short-lived process. No HTTP listener, ambient vault or key-export command.
import {
  createWallet,
  listWallets,
  signTypedData,
} from '@open-wallet-standard/core';
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  linkSync,
  unlinkSync,
  writeFileSync,
  fstatSync,
} from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

const accountName =
  /^moovha-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;
const walletId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function privateDirectory(path: string, create = false) {
  if (create) {
    try {
      mkdirSync(path, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  const stat = lstatSync(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.mode & 0o077 ||
    stat.uid !== process.getuid?.()
  )
    throw new Error();
}
function sync(path: string) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function encryptedFile(path: string) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      stat.mode & 0o077 ||
      stat.uid !== process.getuid?.() ||
      stat.size > 65536
    )
      throw new Error();
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}
function accountVault(root: string, name: string, create = false) {
  const match = accountName.exec(name);
  if (!match) throw new Error();
  privateDirectory(root);
  const accounts = join(root, 'accounts-v1');
  if (!create && !existsSync(accounts)) return null;
  privateDirectory(accounts, create);
  const path = join(accounts, match[1]);
  if (!create && !existsSync(path)) return null;
  privateDirectory(path, create);
  return path;
}
function publishCopy(path: string, bytes: Buffer) {
  if (existsSync(path)) {
    // Recover a crash after atomic publication but before removing its temporary link.
    const published = lstatSync(path);
    if (published.isFile() && published.nlink > 1) {
      const prefix = basename(path) + '.';
      for (const name of readdirSync(dirname(path))) {
        if (
          !name.startsWith(prefix) ||
          !name.endsWith('.tmp') ||
          !walletId.test(name.slice(prefix.length, -4))
        )
          continue;
        const candidate = join(dirname(path), name);
        const info = lstatSync(candidate);
        if (
          info.isFile() &&
          info.dev === published.dev &&
          info.ino === published.ino
        )
          unlinkSync(candidate);
      }
      sync(dirname(path));
    }
    if (!encryptedFile(path).equals(bytes)) throw new Error();
    return;
  }
  const temporary = path + '.' + randomUUID() + '.tmp';
  try {
    writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 });
    sync(temporary);
    try {
      linkSync(temporary, path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  if (!encryptedFile(path).equals(bytes)) throw new Error();
}
/** Legacy encrypted files remain intact. Preparation is repeatable after interruption. */
function prepareVault(root: string) {
  privateDirectory(root);
  const legacy = join(root, 'wallets');
  if (!existsSync(legacy)) return;
  privateDirectory(legacy);
  const names = new Set<string>();
  const hashes = new Map<string, string>();
  // Validate the complete legacy namespace before copying any account.
  const entries = readdirSync(legacy).filter((name) => name.endsWith('.json'));
  for (const entry of entries) {
    const bytes = encryptedFile(join(legacy, entry));
    hashes.set(entry, createHash('sha256').update(bytes).digest('hex'));
    const wallet = JSON.parse(bytes.toString('utf8'));
    if (!walletId.test(wallet.id) || entry !== wallet.id + '.json')
      throw new Error();
    if (!accountName.test(wallet.name)) continue;
    if (names.has(wallet.name)) throw new Error();
    names.add(wallet.name);
  }
  for (const entry of entries) {
    const bytes = encryptedFile(join(legacy, entry));
    if (hashes.get(entry) !== createHash('sha256').update(bytes).digest('hex'))
      throw new Error();
    const wallet = JSON.parse(bytes.toString('utf8'));
    if (!accountName.test(wallet.name)) continue;
    const scoped = accountVault(root, wallet.name, true)!;
    const directory = join(scoped, 'wallets');
    privateDirectory(directory, true);
    publishCopy(join(directory, entry), bytes);
    sync(directory);
    sync(scoped);
  }
  if (existsSync(join(root, 'accounts-v1'))) sync(join(root, 'accounts-v1'));
  sync(root);
}

function findWallet(vaultPath: string, walletName: string) {
  const directory = join(vaultPath, 'wallets');
  let expected = 0;
  if (existsSync(directory)) {
    privateDirectory(directory);
    const files = readdirSync(directory).filter((name) =>
      name.endsWith('.json'),
    );
    expected = files.length;
    if (files.length > 1) throw new Error();
    for (const file of files) {
      const wallet = JSON.parse(
        encryptedFile(join(directory, file)).toString('utf8'),
      );
      if (
        !walletId.test(wallet.id) ||
        file !== wallet.id + '.json' ||
        wallet.name !== walletName
      )
        throw new Error();
    }
  }
  const matches = listWallets(vaultPath).filter(
    (wallet) => wallet.name === walletName,
  );
  if (matches.length !== expected) throw new Error();
  const wallet = matches[0];
  if (!wallet) return null;
  // Keep the pipe response independent of vault size and exclude unrelated wallets.
  return {
    id: wallet.id,
    name: wallet.name,
    accounts: wallet.accounts.filter(
      (account) => account.chainId === 'eip155:1',
    ),
  };
}

async function run(): Promise<void> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 65536) throw new Error();
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  let result: unknown;
  switch (input.command) {
    case 'prepare':
      prepareVault(input.vaultPath);
      result = null;
      break;
    case 'find': {
      const scoped = accountVault(input.vaultPath, input.walletName);
      result = scoped ? findWallet(scoped, input.walletName) : null;
      break;
    }
    case 'create': {
      const scoped = accountVault(input.vaultPath, input.name, true)!;
      if (findWallet(scoped, input.name)) throw new Error();
      const created = createWallet(input.name, input.secret, 24, scoped);
      sync(join(scoped, 'wallets', created.id + '.json'));
      sync(join(scoped, 'wallets'));
      sync(scoped);
      sync(join(input.vaultPath, 'accounts-v1'));
      sync(input.vaultPath);
      result = null;
      break;
    }
    case 'sign': {
      // Resolve the current vault binding in the same short-lived process as signing.
      const scoped = accountVault(input.vaultPath, input.walletName);
      if (!scoped) throw new Error();
      const wallet = findWallet(scoped, input.walletName);
      if (!wallet) throw new Error();
      const accounts = wallet.accounts;
      if (
        accounts.length !== 1 ||
        accounts[0].address.toLowerCase() !== input.address.toLowerCase()
      )
        throw new Error();
      result = signTypedData(
        wallet.id,
        input.chainId,
        input.payload,
        input.secret,
        0,
        scoped,
        input.address,
      );
      break;
    }
    default:
      throw new Error();
  }
  process.stdout.write(JSON.stringify(result));
}

run().catch(() => {
  process.exitCode = 1;
});
