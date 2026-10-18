import { prepareLocalExecution } from './local-execution.js';
import { localExecutionImages } from './local-execution-contract.js';
import { caddyImage, caddyConfiguration } from './https-ingress.js';
import {
  generatedSecretNames,
  generateDeploymentSecrets,
} from './deployment-secrets.js';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdir, writeFile, access, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv, promisify } from 'node:util';
import {
  ConfigurationError,
  secretReferences,
  validateProviderConfiguration,
  type ProviderConfiguration,
} from './config.js';

const executeFile = promisify(execFile);
const source = fileURLToPath(new URL('../../', import.meta.url));
const reserved =
  /^(?:NODE_|LD_|DYLD_|OTEL_|DOCKER_|COMPOSE_|GAE_|OPENSSL_|SSL_|PATH$|HOME$|USER$|SHELL$|TMPDIR$|PWD$|(?:HTTP|HTTPS|ALL|NO)_PROXY$)/;
const steps = [
  ['files', 'Save private deployment files'],
  ['image', 'Build the service image'],
  ['validate', 'Validate configuration in the container'],
  ['storage', 'Initialize new persistent storage'],
  ['doctor', 'Check secrets, storage and service binding'],
  ['start', 'Start the service'],
  ['health', 'Check liveness and disabled readiness'],
] as const;

export interface SetupPlan {
  id: string;
  directory: string;
  project: string;
  port: number;
  config: ProviderConfiguration;
  secrets: { name: string; available: boolean; generated?: boolean }[];
  changes: string[];
}
export interface SetupProgress {
  state: 'idle' | 'running' | 'complete' | 'failed' | 'stopped';
  steps: {
    id: string;
    label: string;
    state: 'pending' | 'running' | 'complete' | 'failed';
  }[];
  message?: string;
  cleanup?: 'stopped' | 'unconfirmed';
  plan?: SetupPlan;
}

/** Injectable command boundary for offline executor tests; never accepted from HTTP input. */
export interface SetupExecutorOptions {
  root?: string;
  source?: string;
  environment?: NodeJS.ProcessEnv;
  dockerExecutable?: () => string;
  command?: (args: string[], timeout: number) => Promise<string>;
}

function failure(message: string): never {
  throw new ConfigurationError([message]);
}

/** Node reads this mounted file directly; Compose never interpolates its contents. */
export function setupEnvironment(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([name, value]) => {
      if (
        !/^[A-Z][A-Z0-9_]{0,127}$/.test(name) ||
        reserved.test(name) ||
        !value ||
        value.length > 16384 ||
        value.includes('\0') ||
        value.includes('\r')
      )
        failure(
          'Supply valid secret values. Runtime and Docker settings cannot be used as secret variable names.',
        );
      const quote = ['"', "'", '`'].find(
        (character) => !value.includes(character),
      );
      if (!quote)
        failure(
          'A secret contains all three quote styles. Supply it through the manual deployment path instead.',
        );
      const line = `${name}=${quote}${value}${quote}\n`;
      if (parseEnv(line)[name] !== value)
        failure(
          'A secret cannot be preserved in an environment file. Use the manual deployment path.',
        );
      return line;
    })
    .join('');
}

export function localCompose(plan: SetupPlan, buildSource: string) {
  // Compose interpolation also applies to YAML/JSON path strings.
  const path = (value: string) => value.replaceAll('$', '$$');
  return {
    name: plan.project,
    services: {
      api: {
        build: { context: path(buildSource) },
        image: `${plan.project}:local`,
        user: `${process.getuid?.()}:${process.getgid?.()}`,
        entrypoint: [
          'node',
          '--env-file=/secrets/provider.env',
          'dist/main.js',
        ],
        command: ['run', '--config', '/config/provider.json'],
        ports: [`127.0.0.1:${plan.port}:8080`],
        volumes: [
          {
            type: 'bind',
            source: path(join(plan.directory, 'provider.config.json')),
            target: '/config/provider.json',
            read_only: true,
          },
          {
            type: 'bind',
            source: path(join(plan.directory, 'provider.env')),
            target: '/secrets/provider.env',
            read_only: true,
          },
          {
            type: 'bind',
            source: path(join(plan.directory, '.provider-data')),
            target: '/config/.provider-data',
          },
          ...(plan.config.backend.kind === 'ows'
            ? [
                {
                  type: 'bind',
                  source: path(join(plan.directory, '.provider-vault')),
                  target: '/config/.provider-vault',
                },
              ]
            : []),
        ],
        read_only: true,
        tmpfs: ['/tmp'],
        cap_drop: ['ALL'],
        security_opt: ['no-new-privileges:true'],
        restart: 'unless-stopped',
        ...(plan.config.localExecution
          ? {
              depends_on: {
                'local-execution': { condition: 'service_healthy' },
              },
              networks: ['default', 'execution'],
            }
          : {}),
        stop_grace_period: '15s',
      },
      ...(plan.config.localExecution
        ? {
            'local-execution': {
              image: `${plan.project}:execution`,
              build: {
                context: path(buildSource),
                dockerfile: 'Dockerfile.relayer',
              },
              user: `${process.getuid?.()}:${process.getgid?.()}`,
              volumes: [
                {
                  type: 'bind',
                  source: path(join(plan.directory, '.local-execution')),
                  target: '/app/config',
                  read_only: true,
                },
                {
                  type: 'bind',
                  source: path(join(plan.directory, 'execution.env')),
                  target: '/secrets/execution.env',
                  read_only: true,
                },
              ],
              depends_on: {
                'execution-store': { condition: 'service_healthy' },
              },
              networks: ['execution', 'execution-store'],
              read_only: true,
              tmpfs: ['/tmp'],
              cap_drop: ['ALL'],
              security_opt: ['no-new-privileges:true'],
              restart: 'unless-stopped',
              logging: { driver: 'none' },
              healthcheck: {
                test: [
                  'CMD',
                  'node',
                  '-e',
                  "fetch('http://127.0.0.1:8080/api/v1/ready',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
                ],
                interval: '5s',
                timeout: '4s',
                retries: 12,
                start_period: '10s',
              },
              stop_grace_period: '30s',
            },
            'execution-store': {
              image: localExecutionImages.store,
              user: `${process.getuid?.()}:${process.getgid?.()}`,
              command: [
                'valkey-server',
                '--appendonly',
                'yes',
                '--appendfsync',
                'always',
                '--save',
                '',
                '--protected-mode',
                'no',
                '--maxmemory-policy',
                'noeviction',
              ],
              volumes: [
                {
                  type: 'bind',
                  source: path(join(plan.directory, '.execution-data')),
                  target: '/data',
                },
              ],
              networks: ['execution-store'],
              read_only: true,
              tmpfs: ['/tmp'],
              cap_drop: ['ALL'],
              security_opt: ['no-new-privileges:true'],
              restart: 'unless-stopped',
              logging: { driver: 'none' },
              healthcheck: {
                test: ['CMD', 'valkey-cli', 'ping'],
                interval: '5s',
                timeout: '3s',
                retries: 12,
              },
              stop_grace_period: '30s',
            },
          }
        : {}),
      ...(plan.config.http?.ingress === 'caddy'
        ? {
            https: {
              image: caddyImage,
              profiles: ['https'],
              user: `${process.getuid?.()}:${process.getgid?.()}`,
              command: ['caddy', 'run', '--config', '/etc/caddy/provider.json'],
              ports: ['80:80', '443:443'],
              volumes: [
                {
                  type: 'bind',
                  source: path(join(plan.directory, 'caddy.json')),
                  target: '/etc/caddy/provider.json',
                  read_only: true,
                },
                {
                  type: 'bind',
                  source: path(join(plan.directory, '.provider-tls')),
                  target: '/data',
                },
              ],
              environment: { XDG_DATA_HOME: '/data', XDG_CONFIG_HOME: '/tmp' },
              read_only: true,
              tmpfs: ['/tmp'],
              cap_drop: ['ALL'],
              cap_add: ['NET_BIND_SERVICE'],
              security_opt: ['no-new-privileges:true'],
              sysctls: { 'net.ipv4.ip_unprivileged_port_start': '0' },
              restart: 'unless-stopped',
              depends_on: { api: { condition: 'service_healthy' } },
            },
          }
        : {}),
    },
    ...(plan.config.localExecution
      ? {
          networks: {
            default: {},
            execution: {},
            'execution-store': { internal: true },
          },
        }
      : {}),
  };
}

async function privateDirectory(path: string) {
  const stat = await lstat(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (stat.mode & 0o077) !== 0 ||
    stat.uid !== process.getuid?.()
  )
    failure(
      'The deployment directory must be private, owned by your account and not a symbolic link.',
    );
}

/** Creates one new local deployment per wizard session. Existing stores are never replaced. */
export function createSetupExecutor(options: SetupExecutorOptions = {}) {
  const root =
    options.root ?? join(homedir(), '.wallet-provider-kit-deployments');
  const buildSource = options.source ?? source;
  const environment = options.environment ?? process.env;
  const command =
    options.command ??
    (async (args, timeout) => {
      const result = await executeFile('docker', args, {
        timeout,
        maxBuffer: 16 * 1024 * 1024,
        env: {
          ...process.env,
          DOCKER_HOST: undefined,
          DOCKER_CONTEXT: undefined,
          COMPOSE_FILE: undefined,
          COMPOSE_PROJECT_NAME: undefined,
          COMPOSE_ENV_FILES: undefined,
        },
      });
      return result.stdout;
    });
  let endpoint: string | undefined;
  let plan: SetupPlan | undefined;
  let job: SetupProgress = { state: 'idle', steps: [] };
  let preparing = false;
  let stopping = false;
  let task: Promise<void> | undefined;
  let inherited: Record<string, string> = {};

  const compose = (args: string[], timeout = 60000) =>
    command(
      [
        '--host',
        endpoint!,
        'compose',
        '--env-file',
        '/dev/null',
        '--file',
        join(plan!.directory, 'compose.json'),
        '--project-name',
        plan!.project,
        ...args,
      ],
      timeout,
    );

  async function persistProgress() {
    const temporary = join(
      plan!.directory,
      `.progress-${randomBytes(8).toString('hex')}`,
    );
    await writeFile(temporary, JSON.stringify(job, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    await rename(
      temporary,
      join(plan!.directory, 'provider-setup.status.json'),
    );
  }

  async function prepare(input: unknown): Promise<SetupPlan> {
    if (preparing || job.state !== 'idle')
      failure(
        'A setup is already prepared or running in this session. Open a new wizard session for another deployment.',
      );
    preparing = true;
    plan = undefined;
    inherited = {};
    try {
      const config = validateProviderConfiguration(input);
      if (config.backend.kind === 'custom')
        failure(
          'Custom adapters use a reviewed custom image or native deployment. The bundled setup supports OWS, CDP and existing Relayer services.',
        );
      if (config.activation.enabled)
        failure(
          'Turn off Enable wallet operations in Deployment before starting a new local setup.',
        );
      if (
        !['darwin', 'linux'].includes(process.platform) ||
        !process.getuid?.()
      )
        failure(
          'Run local setup as an unprivileged account on macOS or Linux.',
        );
      await access(join(buildSource, 'Dockerfile'));
      if (config.localExecution)
        await access(join(buildSource, 'Dockerfile.relayer'));
      await access(join(buildSource, '.dockerignore'));
      // Select and pin a local daemon before any build, file write or container operation.
      const host = (
        await command(
          ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
          10000,
        )
      ).trim();
      if (
        environment.DOCKER_HOST ||
        !host.startsWith('unix:///') ||
        /[\r\n]/.test(host)
      )
        failure(
          'Select a local Docker context and unset DOCKER_HOST. Remote Docker engines are not supported by this setup.',
        );
      endpoint = host;
      const version = (
        await command(
          ['--host', endpoint, 'compose', 'version', '--short'],
          10000,
        )
      ).trim();
      if (!/^v?(?:2|[3-9]|[1-9]\d)\./.test(version))
        failure('Install Docker Compose v2 or newer.');
      await command(
        ['--host', endpoint, 'info', '--format', '{{.OSType}}'],
        10000,
      ).then((output) => {
        if (output.trim() !== 'linux')
          failure('Start a local Linux Docker engine before continuing.');
      });
      const names = [
        ...new Set(secretReferences(config).map((reference) => reference.env)),
      ];
      if (names.some((name) => reserved.test(name)))
        failure(
          'Use secret variable names that do not control Node, Docker or the operating system.',
        );
      inherited = Object.fromEntries(
        names
          .filter((name) => !!environment[name])
          .map((name) => [name, environment[name]!]),
      );
      setupEnvironment(inherited);
      const id = randomBytes(12).toString('hex');
      const changes = [
        'Container HTTP listen address: 0.0.0.0:8080. The published host port stays on 127.0.0.1.',
        'Container storage: .provider-data beside the saved configuration, on a private host bind mount.',
        ...(config.localExecution
          ? [
              'Start the bundled local execution engine and durable Valkey store on private container networks. Retain encrypted sponsor keystores and execution data; no public administration ports are published.',
            ]
          : []),
        ...(config.backend.kind === 'ows'
          ? [
              'OWS engine included in the image; new private .provider-vault bind mount retained alongside the database. A missing passphrase is generated and saved privately.',
            ]
          : []),
        ...(config.http?.ingress === 'caddy'
          ? [
              'Pinned Caddy HTTPS gateway and private certificate storage are included. Its https profile remains off during local evaluation.',
            ]
          : []),
        ...(config.authorizationServer
          ? [
              'Bundled application token service and client registrations. Missing issuer and client secrets are generated once and saved only in the private environment file.',
            ]
          : []),
      ];
      plan = {
        id,
        directory: join(root, `local-${id}`),
        project: `wpk-${id}`,
        port: config.http?.port ?? 8080,
        config: {
          ...config,
          storage: { kind: 'sqlite', directory: '.provider-data' },
          http: { ...config.http, host: '0.0.0.0', port: 8080 },
          ...(config.backend.kind === 'ows'
            ? {
                backend: {
                  ...config.backend,
                  vaultDirectory: '.provider-vault',
                },
              }
            : {}),
        },
        secrets: names.map((name) => ({
          name,
          available:
            !!inherited[name] || generatedSecretNames(config).includes(name),
          ...(generatedSecretNames(config).includes(name) && !inherited[name]
            ? { generated: true }
            : {}),
        })),
        changes,
      };
      return structuredClone(plan);
    } catch (error) {
      if (error instanceof ConfigurationError) throw error;
      failure(
        'Local Docker setup is unavailable. Install and start Docker with Compose, select its local context, and run the wizard from a source checkout. You can still download configuration.',
      );
    } finally {
      preparing = false;
    }
  }

  function start(id: unknown, supplied: unknown): SetupProgress {
    if (!plan || preparing || id !== plan.id)
      failure('Review a local setup plan before starting it.');
    if (job.state !== 'idle')
      failure(
        'This setup has already started. Check its progress; do not initialize it again.',
      );
    if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied))
      failure('Supply the missing secret values.');
    const entries = Object.entries(supplied);
    if (
      entries.some(
        ([name, value]) =>
          !plan!.secrets.some(
            (secret) => secret.name === name && !secret.available,
          ) || typeof value !== 'string',
      )
    )
      failure(
        'Only the missing secret variables in this plan can be supplied.',
      );
    const values = generateDeploymentSecrets(plan.config, {
      ...inherited,
      ...(supplied as Record<string, string>),
    });
    if (plan.secrets.some(({ name }) => !values[name]))
      failure('Supply every missing secret value before starting setup.');
    const secretFile = setupEnvironment(values);
    inherited = {};
    job = {
      state: 'running',
      steps: steps.map(([id, label]) => ({ id, label, state: 'pending' })),
    };
    task = run(secretFile);
    return status();
  }

  async function run(secretFile: string) {
    let composeSaved = false;
    let current: SetupProgress['steps'][number] | undefined;
    try {
      for (const step of job.steps) {
        current = step;
        step.state = 'running';
        if (step.id !== 'files') await persistProgress();
        if (step.id === 'files') {
          // The fixed parent is the account's home (or an injected test root).
          await mkdir(root, { mode: 0o700 }).catch(
            (error: NodeJS.ErrnoException) => {
              if (error.code !== 'EEXIST') throw error;
            },
          );
          await privateDirectory(root);
          await mkdir(plan!.directory, { mode: 0o700 });
          await privateDirectory(plan!.directory);
          await mkdir(join(plan!.directory, '.provider-data'), { mode: 0o700 });
          if (plan!.config.backend.kind === 'ows')
            await mkdir(join(plan!.directory, '.provider-vault'), {
              mode: 0o700,
            });
          const save = (name: string, contents: string) =>
            writeFile(join(plan!.directory, name), contents, {
              flag: 'wx',
              mode: 0o600,
            });
          let apiSecrets = secretFile;
          if (plan!.config.localExecution) {
            const values = Object.fromEntries(
              Object.entries(parseEnv(secretFile)).filter(
                (entry): entry is [string, string] => entry[1] !== undefined,
              ),
            );
            const materialized = structuredClone(plan!.config);
            const prepared = prepareLocalExecution(materialized, values);
            await mkdir(join(plan!.directory, '.local-execution'), {
              mode: 0o700,
            });
            await mkdir(join(plan!.directory, '.local-execution', 'keys'), {
              mode: 0o700,
            });
            await mkdir(join(plan!.directory, '.execution-data'), {
              mode: 0o700,
            });
            for (const key of prepared.keys)
              await save(
                '.local-execution/keys/' + key.name,
                key.contents + '\n',
              );
            await save(
              '.local-execution/config.json',
              JSON.stringify(prepared.relayer, null, 2) + '\n',
            );
            await save('execution.env', setupEnvironment(prepared.environment));
            const privateNames = [
              plan!.config.localExecution.keystorePassphrase.env,
              plan!.config.localExecution.storageKey.env,
            ];
            apiSecrets = setupEnvironment(
              Object.fromEntries(
                Object.entries(values).filter(
                  ([name]) => !privateNames.includes(name),
                ),
              ),
            );
            plan!.config = validateProviderConfiguration(materialized);
          }
          await save(
            'provider.config.json',
            JSON.stringify(plan!.config, null, 2) + '\n',
          );
          if (plan!.config.http?.ingress === 'caddy') {
            await mkdir(join(plan!.directory, '.provider-tls'), {
              mode: 0o700,
            });
            await save(
              'caddy.json',
              JSON.stringify(
                caddyConfiguration(plan!.config.policy.provider.origin),
                null,
                2,
              ) + '\n',
            );
          }
          await save('provider.env', apiSecrets);
          secretFile = '';
          await save(
            'compose.json',
            JSON.stringify(localCompose(plan!, buildSource), null, 2) + '\n',
          );
          composeSaved = true;
          await save(
            'provider-setup.md',
            setupInstructions(plan!, endpoint!, options.dockerExecutable?.()),
          );
        } else if (step.id === 'image')
          await compose(
            [
              'build',
              'api',
              ...(plan!.config.localExecution ? ['local-execution'] : []),
            ],
            15 * 60 * 1000,
          );
        else if (['validate', 'storage', 'doctor'].includes(step.id)) {
          const action = step.id === 'storage' ? 'init-storage' : step.id;
          await compose([
            'run',
            '--rm',
            '--no-deps',
            'api',
            action,
            '--config',
            '/config/provider.json',
          ]);
        } else if (step.id === 'start') {
          await compose(
            [
              'up',
              '--detach',
              '--no-build',
              '--wait',
              '--wait-timeout',
              '120',
              'api',
            ],
            150000,
          );
        } else {
          // Execute inside this project's container, rather than trust an unrelated host listener.
          await compose([
            'exec',
            '-T',
            'api',
            'node',
            '-e',
            "Promise.all(['/health/live','/health/ready'].map(p=>fetch('http://127.0.0.1:8080'+p,{signal:AbortSignal.timeout(3000)}).then(r=>r.status))).then(([live,ready])=>process.exit(live===200&&ready===503?0:1)).catch(()=>process.exit(1))",
          ]);
        }
        step.state = 'complete';
        await persistProgress();
      }
      job.state = 'complete';
      job.message =
        'Local service is running. Liveness passed; readiness is disabled as expected. Wallet operations remain disabled. Complete HTTPS and external acceptance before enabling them.';
      await persistProgress();
    } catch {
      if (current) current.state = 'failed';
      const advice: Record<string, string> = {
        files:
          'Check the deployment parent directory permissions. Files may be incomplete; no storage initialization was attempted.',
        image:
          'Check Docker, network access, disk space and VM mounts for the checkout and deployment directory.',
        validate:
          'Check that the built toolkit image matches this configuration.',
        storage:
          'Inspect this new store and its permissions before deliberately continuing. Do not repeat initialization to repair an existing store.',
        doctor:
          'Check the private secret values and storage permissions using the saved diagnosis command.',
        start:
          'Check Docker, host port availability and optional staff/hosted login reachability.',
        health:
          'Check the service status. Expected liveness is 200 and disabled readiness is 503.',
      };
      job.message = `Setup stopped at ${current?.label.toLowerCase() ?? 'preparation'}. ${advice[current?.id ?? 'files']} Private files and storage are retained. Initialization will not run again in this session.`;
      if (composeSaved) {
        try {
          await compose(['down', '--remove-orphans']);
          job.cleanup = 'stopped';
        } catch {
          job.cleanup = 'unconfirmed';
        }
      }
      job.state = 'failed';
      if (composeSaved) await persistProgress().catch(() => {});
    } finally {
      secretFile = '';
    }
  }

  function status(): SetupProgress {
    return structuredClone({ ...job, ...(plan ? { plan } : {}) });
  }
  async function liveStatus(): Promise<SetupProgress> {
    if (job.state === 'complete' && !stopping) {
      try {
        const services = await compose(
          ['ps', '--status', 'running', '--services'],
          10000,
        );
        if (
          job.state === 'complete' &&
          ![
            'api',
            ...(plan!.config.localExecution
              ? ['local-execution', 'execution-store']
              : []),
          ].every((service) => services.trim().split(/\s+/).includes(service))
        )
          throw new Error();
      } catch {
        if (job.state === 'complete') {
          job.state = 'failed';
          job.message =
            'The local container is no longer confirmed running. Check Docker and use the saved status/restart instructions. Storage is retained; do not initialize it again.';
          await persistProgress().catch(() => {});
        }
      }
    }
    return status();
  }
  async function stop() {
    if (
      stopping ||
      job.state === 'running' ||
      !plan ||
      !['complete', 'failed'].includes(job.state)
    )
      failure('Wait for setup to finish before stopping its service.');
    stopping = true;
    try {
      await compose([
        ...(plan.config.http?.ingress === 'caddy'
          ? ['--profile', 'https']
          : []),
        ...(job.state === 'failed' ? ['down', '--remove-orphans'] : ['stop']),
      ]);
      job.state = 'stopped';
      job.message =
        'Local service stopped. Private configuration, secrets and persistent records are retained.';
      job.cleanup = 'stopped';
      await persistProgress();
    } catch {
      failure(
        'The stop could not be confirmed. Use the saved Compose stop command and check Docker.',
      );
    } finally {
      stopping = false;
    }
    return status();
  }
  return {
    prepare,
    resetPlan: () => {
      if (preparing || job.state !== 'idle')
        failure('Wait for the current setup action to finish.');
      plan = undefined;
      inherited = {};
    },
    start,
    status,
    liveStatus,
    stop,
    settled: () => task ?? Promise.resolve(),
  };
}

function setupInstructions(
  plan: SetupPlan,
  endpoint: string,
  executable = 'docker',
) {
  const shell = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  const command = `${shell(executable)} --host ${shell(endpoint)} compose --env-file /dev/null --file ${shell(join(plan.directory, 'compose.json'))} --project-name ${plan.project}`;
  return `# Local wallet service

This deployment uses the toolkit Docker image, private host storage and a restart policy. Docker must remain running. Closing the wizard does not stop the container. Wallet operations are disabled.

Host API: http://127.0.0.1:${plan.port}
Configured HTTPS origin: ${plan.config.policy.provider.origin}

These commands pin the local Docker daemon selected during setup. Run them as the account owning this directory. The private provider-setup.status.json file records the last observed setup step; a running step after interruption has an uncertain outcome and must be investigated before retrying:

\`\`\`sh
${command} ps
${command}${plan.config.http?.ingress === 'caddy' ? ' --profile https' : ''} stop
${command} up --detach --no-build api
\`\`\`

Do not rerun init-storage or delete records to fix startup. Diagnose with:

\`\`\`sh
${command} run --rm --no-deps api doctor --config /config/provider.json
\`\`\`

If setup failed before initialization, inspect its failed step before deliberately initializing this new store. If a start or stop could not be confirmed, use ps and stop before investigating. Build failures require working Docker, network access for pinned image/package downloads and enough disk space. Never share raw logs or secrets.

${plan.config.localExecution ? 'The local execution engine and Valkey start automatically with the API. Their readiness is required at startup. Retain .local-execution encrypted sponsor keys, execution.env credentials and .execution-data queue/nonce records together with SQLite and OWS state. No engine administration ports are published. Configured sponsor public addresses are recorded in provider.config.json; fund them and complete execution acceptance before activation. Never regenerate keys or restore only one store after an uncertain dispatch.\n\n' : ''}The private provider.env file is plaintext and mounted read-only; Node loads it without Compose interpolation. Keep it outside source control and protect host storage/backups. Local Docker administrators can access container secrets.

The host API is loopback HTTP. ${plan.config.http?.ingress === 'caddy' ? 'The saved Caddy gateway supplies automatic HTTPS for the configured origin. After DNS points to this host, ports 80/443 are reachable and you approve public exposure of the disabled service, start the gateway with the same Compose command followed by --profile https up --detach --no-build. This contacts a public certificate authority and publishes the hostname in certificate transparency logs. Retain .provider-tls; do not enable the profile on a local evaluation machine without that DNS and network setup.' : 'Connect your existing HTTPS gateway to the loopback API.'} Arrange encrypted backups and perform application authority, backend and recovery acceptance. Do not copy this local database to create an independent provider. Reuse the reviewed image and configuration pattern on the final host with separate secrets and a fresh, isolated test store.

See https://moovha.github.io/wallet-provider-kit/docs/local-setup.html and https://moovha.github.io/wallet-provider-kit/docs/staging-walkthrough.html
`;
}
