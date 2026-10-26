import { afterEach, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify, parseEnv } from 'node:util';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  chmod,
  rm,
  symlink,
  readdir,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  createWallet,
  listWallets,
  signTypedData,
} from '@open-wallet-standard/core';
import { recoverAddress, TypedDataEncoder } from 'ethers';
import { initializeInstallation } from '../src/deployment/installation.js';

const exec = promisify(execFile);
const temporary: string[] = [];
const helper = resolve('packaging/recovery.py');
const images = {
  api: 'ghcr.io/moovha/wallet-provider-kit@sha256:' + '1'.repeat(64),
  bundler:
    'ghcr.io/moovha/wallet-provider-kit-bundler@sha256:' + '2'.repeat(64),
};
afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});

async function fixture() {
  const work = await mkdtemp(join(tmpdir(), 'provider-recovery-'));
  temporary.push(work);
  // macOS temporary directories can have a symlinked ancestor.
  const { realpath } = await import('node:fs/promises');
  const root = await realpath(work);
  const source = join(root, 'source');
  await initializeInstallation(
    source,
    source,
    {
      name: 'Offline recovery fixture',
      origin: 'https://localhost',
      privacyUrl: 'https://localhost/privacy',
      localOrigin: 'http://127.0.0.1:8080',
      additionalNetworks: ['ethereum-sepolia'],
    },
    images,
  );
  const config = JSON.parse(
    await readFile(join(source, 'provider.config.json'), 'utf8'),
  );
  const env = parseEnv(await readFile(join(source, 'provider.env'), 'utf8'));
  const wallet = createWallet(
    'offline-recovery-fixture',
    env.OWS_OWNER_PASSPHRASE,
    24,
    join(source, '.provider-vault'),
  );
  const db = new DatabaseSync(join(source, '.provider-data/provider.sqlite'));
  db.exec(`INSERT INTO budgets VALUES ('fixture-budget','1','1');
    INSERT INTO approvals VALUES ('fixture-approval','fixture-account','sign_typed_data','fixture-fingerprint','{}',0);
    INSERT INTO admissions VALUES ('fixture','fixture','fixture-attempt','fixture-resource','fixture-fingerprint','{}','fixture-approval',NULL,'fixture-budget','1');
    INSERT INTO attempts VALUES ('fixture','fixture','fixture-attempt','unknown','fixture-lease',1,NULL,NULL);`);
  db.close();
  const identity = join(root, 'recovery.key');
  await exec('age-keygen', ['-o', identity]);
  await chmod(identity, 0o600);
  const recipient = (await exec('age-keygen', ['-y', identity])).stdout;
  const recipients = join(root, 'recipients.txt');
  await writeFile(recipients, recipient);
  const bin = join(root, 'bin');
  await mkdir(bin);
  const docker = join(bin, 'docker');
  // Only Docker lifecycle is simulated; encryption, archive parsing, SQLite and OWS are real offline engines.
  await writeFile(
    docker,
    '#!/usr/bin/env python3\nimport os,sys,json,pathlib\nif "context" in sys.argv: print(json.dumps("unix:///offline-fixture.sock"));sys.exit(0)\nstate=os.environ.get("WPK_FIXTURE_DOCKER_STATE")\nif state:\n p=pathlib.Path(state);items=json.loads(p.read_text())\n if "stop" in sys.argv:\n  for item in items: item["State"]="exited";item["Health"]=""\n  if os.environ.get("WPK_FIXTURE_MUTATE"): pathlib.Path(os.environ["WPK_FIXTURE_MUTATE"]).write_text(pathlib.Path(os.environ["WPK_FIXTURE_MUTATE"]).read_text()+" ")\n elif "start" in sys.argv:\n  if os.environ.get("WPK_FIXTURE_START_FAIL"):sys.exit(1)\n  services=sys.argv[sys.argv.index("start")+1:]\n  for item in items:\n   if item["Service"] in services:item["State"]="running";item["Health"]="healthy"\n elif "ps" not in sys.argv:sys.exit(1)\n p.write_text(json.dumps(items))\n if "ps" in sys.argv: print(json.dumps(items))\n sys.exit(0)\nif "stop" in sys.argv:sys.exit(0)\nif "ps" in sys.argv:print(os.environ.get("WPK_FIXTURE_STATES","[]"))\nelse:sys.exit(1)\n',
  );
  await chmod(docker, 0o700);
  const options: { env: NodeJS.ProcessEnv } = {
    env: { ...process.env, PATH: bin + ':' + process.env.PATH },
  };
  const archive = join(root, 'provider.age');
  const backup = () =>
    exec(
      'python3',
      [
        helper,
        'backup',
        archive,
        '--directory',
        source,
        '--recipients',
        recipients,
      ],
      options,
    );
  const verify = (path = archive, key = identity) =>
    exec('python3', [helper, 'verify', path, '--identity', key]);
  const restore = (destination = join(root, 'restored')) =>
    exec('python3', [
      helper,
      'restore',
      archive,
      destination,
      '--identity',
      identity,
    ]);
  return {
    root,
    source,
    config,
    env,
    wallet,
    identity,
    recipients,
    archive,
    options,
    backup,
    verify,
    restore,
  };
}

it('restores the same offline signer and uncertain attempt while fencing every network and container', async () => {
  const f = await fixture();
  f.config.activation = {
    enabled: true,
    backendAcceptance: 'offline fixture',
    recoveryAcceptance: 'offline fixture',
  };
  f.config.additionalNetworks[0].activation = f.config.activation;
  await writeFile(
    join(f.source, 'provider.config.json'),
    JSON.stringify(f.config),
  );
  await writeFile(
    join(f.source, '.bundler-data/offline-queue'),
    'retained pending queue',
  );
  await f.backup();
  await f.verify();
  expect((await stat(f.archive)).mode & 0o777).toBe(0o600);
  await f.restore();
  const destination = join(f.root, 'restored');
  expect(await readFile(join(destination, 'provider.env'), 'utf8')).toBe(
    await readFile(join(f.source, 'provider.env'), 'utf8'),
  );
  const wallets = listWallets(join(destination, '.provider-vault'));
  expect(wallets).toEqual([f.wallet]);
  const payload = {
    domain: { name: 'Offline recovery proof', version: '1', chainId: '84532' },
    types: { Proof: [{ name: 'value', type: 'uint256' }] },
    primaryType: 'Proof',
    message: { value: '1' },
  };
  const account = wallets[0].accounts.find((a) => a.chainId === 'eip155:1')!;
  const result = signTypedData(
    wallets[0].id,
    'eip155:84532',
    JSON.stringify({
      ...payload,
      domain: {
        ...payload.domain,
        chainId: '0x' + BigInt(84532).toString(16).padStart(64, '0'),
      },
      types: {
        ...payload.types,
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
        ],
      },
      message: { value: '0x' + '1'.padStart(64, '0') },
    }),
    f.env.OWS_OWNER_PASSPHRASE,
    0,
    join(destination, '.provider-vault'),
    account.address,
  );
  expect(
    recoverAddress(
      TypedDataEncoder.hash(payload.domain, payload.types, payload.message),
      `0x${result.signature}`,
    ).toLowerCase(),
  ).toBe(account.address.toLowerCase());
  const db = new DatabaseSync(
    join(destination, '.provider-data/provider.sqlite'),
    { readOnly: true },
  );
  expect(
    db.prepare('SELECT state,attempt_id FROM attempts').get(),
  ).toMatchObject({ state: 'unknown', attempt_id: 'fixture-attempt' });
  db.close();
  expect(
    await readFile(join(destination, '.bundler-data/offline-queue'), 'utf8'),
  ).toBe('retained pending queue');
  const config = JSON.parse(
    await readFile(join(destination, 'provider.config.json'), 'utf8'),
  );
  expect(config.activation.enabled).toBe(false);
  expect(
    config.additionalNetworks.every(
      (n: { activation: { enabled: boolean } }) => !n.activation.enabled,
    ),
  ).toBe(true);
  const compose = JSON.parse(
    await readFile(join(destination, 'compose.json'), 'utf8'),
  );
  expect(compose.name).not.toBe('wallet-provider');
  for (const service of Object.values(compose.services) as Record<
    string,
    unknown
  >[]) {
    expect(service.entrypoint).toEqual(['/bin/false']);
    expect(service.network_mode).toBe('none');
    expect(service.restart).toBe('no');
    expect(service).not.toHaveProperty('ports');
    for (const volume of service.volumes as { source: string }[])
      expect(volume.source.startsWith(destination + '/')).toBe(true);
  }
  await expect(f.restore()).rejects.toThrow();
  await expect(f.backup()).rejects.toThrow();
}, 30000);

it('rejects wrong recovery identities, corrupted and truncated ciphertext without publishing a restore', async () => {
  const f = await fixture();
  await f.backup();
  const wrong = join(f.root, 'wrong.key');
  await exec('age-keygen', ['-o', wrong]);
  await expect(f.verify(f.archive, wrong)).rejects.toThrow();
  const bytes = await readFile(f.archive);
  bytes[bytes.length - 20] ^= 1;
  await writeFile(f.archive, bytes);
  await expect(f.restore()).rejects.toThrow();
  expect(await readdir(f.root)).not.toContain('restored');
  await writeFile(f.archive, bytes.subarray(0, bytes.length - 50));
  await expect(f.verify()).rejects.toThrow();
  expect(
    (await readdir(f.root)).some((n) => n.startsWith('.wpk-recovery-')),
  ).toBe(false);
});

it('refuses missing components, escaping mounts, unsafe links and active writers', async () => {
  const f = await fixture();
  if (process.getuid?.() !== 0) {
    await expect(
      exec(
        'python3',
        [
          helper,
          'backup',
          f.archive,
          '--directory',
          f.source,
          '--recipients',
          f.recipients,
          '--host-administrator',
        ],
        f.options,
      ),
    ).rejects.toThrow();
  }
  if (process.getuid?.() !== 0) {
    const unreadable = join(f.source, 'unreadable');
    await mkdir(unreadable, { mode: 0o700 });
    await writeFile(join(unreadable, 'retained-record'), 'offline fixture');
    await chmod(unreadable, 0o000);
    try {
      await expect(f.backup()).rejects.toThrow();
    } finally {
      await chmod(unreadable, 0o700);
    }
  }
  await symlink(f.identity, join(f.source, 'forbidden-link'));
  await expect(f.backup()).rejects.toThrow();
  await rm(join(f.source, 'forbidden-link'));
  const composePath = join(f.source, 'compose.json');
  const original = await readFile(composePath, 'utf8');
  const compose = JSON.parse(original);
  compose.services.api.volumes[0].source = f.identity;
  await writeFile(composePath, JSON.stringify(compose));
  await expect(f.backup()).rejects.toThrow();
  await writeFile(composePath, original);
  f.options.env.WPK_FIXTURE_STATES = '[{"State":"running"}]';
  await expect(f.backup()).rejects.toThrow();
  delete f.options.env.WPK_FIXTURE_STATES;
  await rm(join(f.source, 'provider.env'));
  await expect(f.backup()).rejects.toThrow();
  expect(await readdir(f.root)).not.toContain('provider.age');
});

it('rejects correctly encrypted hostile archives before extracting paths or links', async () => {
  const f = await fixture();
  for (const kind of [
    'traversal',
    'symlink',
    'duplicate',
    'missing',
    'checksum',
  ]) {
    await exec('python3', [
      '-c',
      `import sys,tarfile,io,json\nwith tarfile.open(sys.argv[1], 'w:gz') as t:\n m=tarfile.TarInfo('../escaped' if sys.argv[2]=='traversal' else 'file')\n if sys.argv[2]=='symlink': m.type=tarfile.SYMTYPE; m.linkname='../escaped'\n t.addfile(m)\n if sys.argv[2]=='duplicate': t.addfile(m)\n if sys.argv[2]=='checksum':\n  b=json.dumps({'format':'wallet-provider-recovery-1','entries':{'file':{'type':'file','size':0,'sha256':'wrong'}}}).encode();m=tarfile.TarInfo('recovery-manifest.json');m.size=len(b);t.addfile(m,io.BytesIO(b))\n`,
      join(f.root, 'hostile.tgz'),
      kind,
    ]);
    await rm(f.archive, { force: true });
    await exec('age', [
      '--encrypt',
      '-R',
      f.recipients,
      '-o',
      f.archive,
      join(f.root, 'hostile.tgz'),
    ]);
    await expect(f.restore()).rejects.toThrow();
    expect(await readdir(f.root)).not.toContain('escaped');
    expect(await readdir(f.root)).not.toContain('restored');
  }
});

async function scheduledFixture() {
  const f = await fixture();
  const output = join(f.root, 'backups');
  await mkdir(output, { mode: 0o700 });
  const state = join(f.root, 'containers.json');
  await writeFile(
    state,
    JSON.stringify([
      {
        ID: 'fixture-api',
        Service: 'api',
        State: 'running',
        Health: 'healthy',
      },
      {
        ID: 'fixture-bundler',
        Service: 'bundler',
        State: 'running',
        Health: '',
      },
      { ID: 'fixture-disabled', Service: 'https', State: 'exited', Health: '' },
    ]),
  );
  f.options.env.WPK_FIXTURE_DOCKER_STATE = state;
  f.options.env.WPK_FIXTURE_UPLOAD = join(f.root, 'upload.json');
  const aws = join(f.root, 'bin/aws');
  await writeFile(
    aws,
    `#!/usr/bin/env python3
import json,os,sys,pathlib,hashlib,base64
args=sys.argv
operation=args[args.index('s3api')+1]
if operation=='put-object' and '--generate-cli-skeleton' in args:print(json.dumps({'IfNoneMatch':'','ChecksumSHA256':''}));sys.exit(0)
if operation=='get-bucket-location':print(json.dumps({'LocationConstraint':'eu-north-1'}));sys.exit(0)
if operation=='get-public-access-block':print(json.dumps({'PublicAccessBlockConfiguration':{key:not bool(os.environ.get('WPK_FIXTURE_PUBLIC')) for key in ['BlockPublicAcls','IgnorePublicAcls','BlockPublicPolicy','RestrictPublicBuckets']}}));sys.exit(0)
p=pathlib.Path(os.environ['WPK_FIXTURE_UPLOAD'])
if operation=='put-object':
 if os.environ.get('WPK_FIXTURE_UPLOAD_FAIL'):sys.exit(1)
 assert args[args.index('--if-none-match')+1]=='*'
 data=pathlib.Path(args[args.index('--body')+1]).read_bytes();checksum=base64.b64encode(hashlib.sha256(data).digest()).decode();assert checksum==args[args.index('--checksum-sha256')+1]
 p.write_text(json.dumps({'ChecksumSHA256':checksum,'ContentLength':len(data),'ServerSideEncryption':'AES256','key':args[args.index('--key')+1]}));print('{}')
elif operation=='head-object':
 result=json.loads(p.read_text())
 if os.environ.get('WPK_FIXTURE_CHECKSUM_FAIL'):result['ChecksumSHA256']='bad'
 print(json.dumps(result))
else:sys.exit(1)
`,
  );
  await chmod(aws, 0o700);
  const config = {
    configVersion: 1,
    enabled: true,
    directory: f.source,
    outputDirectory: output,
    recipients: f.recipients,
    resumeSource: true,
    hostAdministrator: false,
    localKeep: 1,
    schedule: '*-*-* 02:00:00 UTC',
    s3: {
      bucket: 'offline-backup-fixture',
      prefix: 'provider/daily',
      region: 'eu-north-1',
      expectedOwner: '123456789012',
    },
  };
  const path = join(f.root, 'backup.config.json');
  await writeFile(path, JSON.stringify(config), { mode: 0o600 });
  const scheduled = (command = 'run') =>
    exec(
      'python3',
      [resolve('packaging/scheduled-backup.py'), command, '--config', path],
      f.options,
    );
  return { ...f, output, state, config, configPath: path, scheduled };
}

it('schedules verified S3 snapshots, resumes only the original writers, and prunes only verified local copies', async () => {
  const f = await scheduledFixture();
  await writeFile(join(f.output, 'manual-backup.age'), 'unmanaged archive');
  await f.scheduled('validate');
  await f.scheduled();
  await f.scheduled();
  const status = JSON.parse(
    await readFile(join(f.output, 'backup-status.json'), 'utf8'),
  );
  expect(status.state).toBe('succeeded');
  expect(status.receipt.verified).toBe(true);
  expect(status.receipt.key).toMatch(/^provider\/daily\/backup-.*\.age$/);
  expect(
    (await readdir(f.output)).filter((n) => n.endsWith('.age')),
  ).toHaveLength(2);
  expect(await readFile(join(f.output, 'manual-backup.age'), 'utf8')).toBe(
    'unmanaged archive',
  );
  const states = JSON.parse(await readFile(f.state, 'utf8'));
  expect(states.map((s: { State: string }) => s.State)).toEqual([
    'running',
    'running',
    'exited',
  ]);
  const db = new DatabaseSync(
    join(f.source, '.provider-data/provider.sqlite'),
    { readOnly: true },
  );
  expect(db.prepare('SELECT state FROM attempts').get()?.state).toBe('unknown');
  db.close();
  const archive = (await readdir(f.output)).find(
    (n) => n.startsWith('backup-') && n.endsWith('.age'),
  )!;
  await f.verify(join(f.output, archive));
}, 30000);

it('keeps the same source running and retains local ciphertext when S3 upload or checksum verification fails', async () => {
  for (const failure of [
    'WPK_FIXTURE_UPLOAD_FAIL',
    'WPK_FIXTURE_CHECKSUM_FAIL',
  ]) {
    const f = await scheduledFixture();
    f.options.env[failure] = '1';
    await expect(f.scheduled()).rejects.toThrow();
    expect(
      (await readdir(f.output)).filter((n) => n.endsWith('.age')),
    ).toHaveLength(1);
    expect(
      (await readdir(f.output)).filter((n) => n.endsWith('.receipt.json')),
    ).toHaveLength(0);
    expect(JSON.parse(await readFile(f.state, 'utf8'))[0].State).toBe(
      'running',
    );
    expect(
      JSON.parse(await readFile(join(f.output, 'backup-status.json'), 'utf8'))
        .state,
    ).toBe('failed');
  }
});

it('fails before stopping writers for public storage or disabled automation', async () => {
  const f = await scheduledFixture();
  f.options.env.DOCKER_HOST = 'tcp://remote.example.test:2375';
  await expect(f.scheduled()).rejects.toThrow();
  expect(JSON.parse(await readFile(f.state, 'utf8'))[0].State).toBe('running');
  delete f.options.env.DOCKER_HOST;
  f.options.env.WPK_FIXTURE_PUBLIC = '1';
  await expect(f.scheduled()).rejects.toThrow();
  expect(JSON.parse(await readFile(f.state, 'utf8'))[0].State).toBe('running');
  delete f.options.env.WPK_FIXTURE_PUBLIC;
  f.config.enabled = false;
  await writeFile(f.configPath, JSON.stringify(f.config));
  await expect(f.scheduled()).rejects.toThrow();
  expect(JSON.parse(await readFile(f.state, 'utf8'))[0].State).toBe('running');
  expect(
    (await readdir(f.output)).filter((n) => n.endsWith('.age')),
  ).toHaveLength(0);
});

it('refuses automatic resumption after source configuration changes or container startup failure', async () => {
  for (const failure of ['mutation', 'startup']) {
    const f = await scheduledFixture();
    if (failure === 'mutation')
      f.options.env.WPK_FIXTURE_MUTATE = join(f.source, 'provider.config.json');
    else f.options.env.WPK_FIXTURE_START_FAIL = '1';
    await expect(f.scheduled()).rejects.toThrow();
    expect(JSON.parse(await readFile(f.state, 'utf8'))[0].State).toBe('exited');
    expect(
      (await readdir(f.output)).filter((n) => n.endsWith('.receipt.json')),
    ).toHaveLength(0);
  }
});
