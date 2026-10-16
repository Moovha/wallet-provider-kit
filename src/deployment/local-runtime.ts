import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rmdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { ConfigurationError } from './config.js';

const execute = promisify(execFile);
const brewRevision = 'be041513824fd2666a0e93cf5c3b0ca3bb0eb4b6';
const brewDigest =
  '5f333bbe53bc490e51e7ccb1df8779b3dd6ee73a1a7379efda216edb08ccb148';
const profile = 'wallet-provider-kit';
class RuntimeInstallationInterrupted extends Error {}
export interface RuntimeProgress {
  state:
    | 'unchecked'
    | 'checking'
    | 'missing'
    | 'installing'
    | 'ready'
    | 'failed'
    | 'blocked';
  checks: { id: string; label: string; available: boolean }[];
  steps: {
    id: string;
    label: string;
    state: 'pending' | 'running' | 'complete' | 'failed';
  }[];
  actions: string[];
  canInstall: boolean;
  message: string;
}
/** Command and host overrides are test-only ports, never HTTP parameters. */
export interface LocalRuntimeOptions {
  platform?: NodeJS.Platform;
  arch?: string;
  uid?: number;
  home?: string;
  source?: string;
  root?: string;
  environment?: NodeJS.ProcessEnv;
  command?: (file: string, args: string[], timeout: number) => Promise<string>;
  bootstrap?: () => Promise<void>;
  interactive?: boolean;
  desktop?: boolean;
}
const fail = (message: string): never => {
  throw new ConfigurationError([message]);
};
const shell = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** Downloads a pinned Homebrew installer; OS permission prompts remain in a terminal. */
async function installHomebrew(
  interactive: boolean,
  platform: NodeJS.Platform,
) {
  const response = await fetch(
    `https://raw.githubusercontent.com/Homebrew/install/${brewRevision}/install.sh`,
    { signal: AbortSignal.timeout(30000), redirect: 'error' },
  );
  if (!response.ok) throw new Error('Installer download unavailable');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== brewDigest)
    throw new Error('Installer integrity check failed');
  const folder = await mkdtemp(join(tmpdir(), 'wallet-runtime-'));
  const script = join(folder, 'install.sh');
  try {
    await writeFile(script, bytes, { mode: 0o600, flag: 'wx' });
    if (interactive) {
      await new Promise<void>((resolve, reject) => {
        const child = spawn('/bin/bash', [script], {
          stdio: 'inherit',
          env: {
            PATH: process.env.PATH,
            HOME: homedir(),
            USER: process.env.USER,
            SHELL: process.env.SHELL,
            TERM: process.env.TERM,
            INTERACTIVE: '1',
          },
        });
        child.once('error', reject);
        child.once('exit', (code) =>
          code === 0 ? resolve() : reject(new Error('Installation incomplete')),
        );
      });
    } else {
      const result = join(folder, 'result');
      const launcher = join(folder, 'install.command');
      // Only fixed code and shell-quoted private paths enter this terminal command.
      await writeFile(
        launcher,
        `#!/bin/bash\nenv -i HOME=${shell(homedir())} USER=${shell(process.env.USER ?? '')} PATH=/usr/bin:/bin:/usr/sbin:/sbin TERM=xterm-256color INTERACTIVE=1 /bin/bash ${shell(script)}\ncode=$?\nprintf '%s' "$code" > ${shell(result)}\nexit "$code"\n`,
        { mode: 0o700, flag: 'wx' },
      );
      if (platform === 'darwin')
        await execute('/usr/bin/open', ['-a', 'Terminal', launcher]);
      else {
        const child = spawn(
          'x-terminal-emulator',
          ['-e', '/bin/bash', launcher],
          { stdio: 'ignore' },
        );
        await new Promise<void>((resolve, reject) => {
          child.once('spawn', resolve);
          child.once('error', reject);
        });
        child.unref();
      }
      const deadline = Date.now() + 25 * 60 * 1000;
      while (true) {
        const code = await readFile(result, 'utf8').catch(() => undefined);
        if (code !== undefined) {
          if (code !== '0') throw new Error('Installation incomplete');
          break;
        }
        if (Date.now() > deadline)
          throw new RuntimeInstallationInterrupted('Installation timed out');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

export function createLocalRuntime(options: LocalRuntimeOptions = {}) {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const home = options.home ?? homedir();
  const environment = options.environment ?? process.env;
  const root = options.root ?? join(home, '.wallet-provider-kit-deployments');
  const source =
    options.source ?? fileURLToPath(new URL('../../', import.meta.url));
  const command =
    options.command ??
    (async (file, args, timeout) => {
      const result = await execute(file, args, {
        timeout,
        maxBuffer: 4 * 1024 * 1024,
        env: {
          PATH: [
            join(home, '.linuxbrew/bin'),
            '/home/linuxbrew/.linuxbrew/bin',
            '/opt/homebrew/bin',
            '/usr/local/bin',
            environment.PATH ?? '/usr/bin:/bin',
          ].join(':'),
          HOME: home,
          USER: environment.USER,
          TMPDIR: environment.TMPDIR,
          HOMEBREW_NO_AUTO_UPDATE: '1',
          HOMEBREW_NO_INSTALL_CLEANUP: '1',
          DOCKER_CONFIG: environment.DOCKER_CONFIG,
        },
      });
      return result.stdout;
    });
  let docker = 'docker';
  let brew: string | undefined;
  let colima: string | undefined;
  let endpoint: string | undefined;
  let desktop = false;
  let needsPackages = false;
  let needsPlugins = false;
  let needsQemu = false;
  let checking = false;
  let task: Promise<void> | undefined;
  let progress: RuntimeProgress = {
    state: 'unchecked',
    checks: [],
    steps: [],
    actions: [],
    canInstall: false,
    message:
      'Check your local container runtime before preparing a deployment.',
  };
  const status = () => structuredClone(progress);
  const invokeDocker = (args: string[], timeout: number) =>
    command(docker, args, timeout);
  async function find(name: string, candidates: string[]) {
    for (const file of [...candidates, name]) {
      try {
        await command(file, ['--version'], 10000);
        return file;
      } catch {
        /* Try a standard installation path. */
      }
    }
    return undefined;
  }
  async function probe() {
    const found = await find('docker', [
      '/opt/homebrew/bin/docker',
      '/usr/local/bin/docker',
      '/home/linuxbrew/.linuxbrew/bin/docker',
      join(home, '.linuxbrew/bin/docker'),
      '/Applications/Docker.app/Contents/Resources/bin/docker',
    ]);
    if (found) docker = found;
    let host = endpoint;
    if (found && !host) {
      try {
        host = (
          await invokeDocker(
            ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
            10000,
          )
        ).trim();
      } catch {
        /* No context yet. */
      }
    }
    if (host && (!host.startsWith('unix:///') || /[\r\n]/.test(host)))
      fail(
        'Select a local Docker context. Remote engines are not supported by local setup.',
      );
    let compose = false;
    let build = false;
    let engine = false;
    if (found) {
      try {
        compose = /^v?(?:2|[3-9]|[1-9]\d)\./.test(
          (await invokeDocker(['compose', 'version', '--short'], 10000)).trim(),
        );
      } catch {
        /* Missing plugin. */
      }
      try {
        await invokeDocker(['buildx', 'version'], 10000);
        build = true;
      } catch {
        /* Missing plugin. */
      }
      if (host)
        try {
          engine =
            (
              await invokeDocker(
                ['--host', host, 'info', '--format', '{{.OSType}}'],
                10000,
              )
            ).trim() === 'linux';
        } catch {
          /* Stopped engine. */
        }
    }
    progress.checks = [
      { id: 'docker', label: 'Docker command-line tool', available: !!found },
      {
        id: 'compose',
        label: 'Docker Compose v2 or newer',
        available: compose,
      },
      { id: 'buildx', label: 'Docker image builder', available: build },
      {
        id: 'engine',
        label: 'Running local Linux container engine',
        available: engine,
      },
    ];
    return { found, host, compose, build, engine };
  }
  async function check(): Promise<RuntimeProgress> {
    if (checking || progress.state === 'installing') return status();
    checking = true;
    progress.state = 'checking';
    progress.canInstall = false;
    progress.steps = [];
    progress.actions = [];
    try {
      if (
        !['darwin', 'linux'].includes(platform) ||
        !['arm64', 'x64'].includes(arch) ||
        (options.uid ?? process.getuid?.()) === 0
      )
        fail(
          'Run local setup as an unprivileged account on macOS or Linux (Apple Silicon/ARM64 or x64).',
        );
      if (environment.DOCKER_HOST)
        fail(
          'Unset DOCKER_HOST and select a local Docker context before continuing.',
        );
      const current = await probe();
      if (current.engine && current.compose && current.build) {
        progress.state = 'ready';
        progress.message =
          'Your local Docker runtime is ready. Setup can continue.';
        return status();
      }
      desktop =
        options.desktop ??
        (platform === 'darwin' &&
          (await access('/Applications/Docker.app').then(
            () => true,
            () => false,
          )));
      colima =
        !current.engine && !desktop
          ? await find('colima', [
              '/opt/homebrew/bin/colima',
              '/usr/local/bin/colima',
              '/home/linuxbrew/.linuxbrew/bin/colima',
              join(home, '.linuxbrew/bin/colima'),
            ])
          : undefined;
      needsQemu =
        platform === 'linux' &&
        !current.engine &&
        !desktop &&
        !(await find(
          arch === 'arm64' ? 'qemu-system-aarch64' : 'qemu-system-x86_64',
          [],
        ));
      needsPlugins = !current.compose || !current.build;
      needsPackages =
        !current.found ||
        needsPlugins ||
        (!current.engine && !desktop && !colima) ||
        needsQemu;
      brew = needsPackages
        ? await find('brew', [
            '/opt/homebrew/bin/brew',
            '/usr/local/bin/brew',
            '/home/linuxbrew/.linuxbrew/bin/brew',
            join(home, '.linuxbrew/bin/brew'),
          ])
        : undefined;
      if (needsPackages && !brew)
        progress.actions.push(
          'Install Homebrew. A terminal opens for its license and administrator prompts; enter passwords only there.',
        );
      if (!current.found)
        progress.actions.push('Install the Docker command-line tool.');
      if (!current.compose) progress.actions.push('Install Docker Compose.');
      if (!current.build)
        progress.actions.push('Install the Docker image builder.');
      if (!current.engine && desktop)
        progress.actions.push(
          'Start the installed Docker Desktop application.',
        );
      else if (!current.engine) {
        progress.actions.push(
          `${colima ? 'Start' : 'Install and start'} a dedicated Colima virtual machine. New profiles use 2 CPUs, 4 GiB memory, a 6 GiB data disk and a 4 GiB system disk; existing profile settings are retained.`,
        );
        if (needsQemu)
          progress.actions.push('Install QEMU for the Linux virtual machine.');
        progress.actions.push(
          'New profiles mount the source checkout read-only and the private deployment directory writable. Existing profile mounts are retained.',
        );
      }
      if (needsPlugins)
        progress.actions.push(
          'Add Homebrew Docker plugins to your Docker CLI settings, preserving other settings.',
        );
      progress.state = 'missing';
      progress.canInstall = true;
      progress.message =
        'Some runtime components are missing or stopped. Review these changes, then install and continue. Downloads need network access and several GiB of free disk space. Existing deployments are retained.';
    } catch (error) {
      progress.state = 'blocked';
      progress.message =
        error instanceof ConfigurationError
          ? error.issues.join(' ')
          : 'Runtime detection failed. Check your account permissions and local Docker installation, then check again.';
    } finally {
      checking = false;
    }
    return status();
  }
  async function configurePlugins(prefix: string) {
    const directory = environment.DOCKER_CONFIG ?? join(home, '.docker');
    await mkdir(directory, { mode: 0o700 }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error;
      },
    );
    const stat = await lstat(directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== (options.uid ?? process.getuid?.()) ||
      stat.mode & 0o022
    )
      throw new Error('Unsafe Docker settings directory');
    const path = join(directory, 'config.json');
    const before = await readFile(path, 'utf8').catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      },
    );
    if (before !== undefined) {
      const file = await lstat(path);
      if (
        file.isSymbolicLink() ||
        !file.isFile() ||
        file.nlink !== 1 ||
        file.uid !== stat.uid ||
        file.mode & 0o022
      )
        throw new Error('Unsafe Docker settings file');
    }
    const config = before === undefined ? {} : JSON.parse(before);
    if (
      !config ||
      typeof config !== 'object' ||
      Array.isArray(config) ||
      (config.cliPluginsExtraDirs !== undefined &&
        (!Array.isArray(config.cliPluginsExtraDirs) ||
          config.cliPluginsExtraDirs.some(
            (item: unknown) => typeof item !== 'string',
          )))
    )
      throw new Error('Invalid Docker settings');
    config.cliPluginsExtraDirs = [
      ...new Set([
        ...(config.cliPluginsExtraDirs ?? []),
        join(prefix, 'lib/docker/cli-plugins'),
      ]),
    ];
    const temporary = join(
      directory,
      `.wallet-plugins-${randomBytes(8).toString('hex')}`,
    );
    try {
      await writeFile(temporary, JSON.stringify(config, null, 2) + '\n', {
        mode: 0o600,
        flag: 'wx',
      });
      if ((await readFile(path, 'utf8').catch(() => undefined)) !== before)
        throw new Error('Docker settings changed concurrently');
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  function start(): RuntimeProgress {
    if (checking || progress.state === 'installing' || !progress.canInstall)
      fail(
        'Check local runtime prerequisites and review the installation plan before installing.',
      );
    progress.state = 'installing';
    progress.canInstall = false;
    progress.steps = [
      {
        id: 'packages',
        label: 'Install missing runtime packages',
        state: 'pending',
      },
      { id: 'plugins', label: 'Configure Docker plugins', state: 'pending' },
      {
        id: 'engine',
        label: 'Start the local container engine',
        state: 'pending',
      },
      {
        id: 'verify',
        label: 'Verify the runtime and continue setup',
        state: 'pending',
      },
    ];
    task = install();
    return status();
  }
  async function install() {
    let active = progress.steps[0];
    const lock = join(home, '.wallet-provider-kit-runtime.lock');
    let ownsLock = false;
    try {
      await mkdir(lock, { mode: 0o700 }).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code !== 'EEXIST') throw error;
          fail(
            'Another runtime installation may be running. Check other setup sessions before removing ~/.wallet-provider-kit-runtime.lock and trying again.',
          );
        },
      );
      ownsLock = true;
      for (const step of progress.steps) {
        active = step;
        step.state = 'running';
        if (step.id === 'packages' && needsPackages) {
          if (!brew) {
            progress.message =
              'Installing Homebrew. Complete any prompts in the opened terminal; setup resumes automatically afterward.';
            await (
              options.bootstrap ??
              (() => installHomebrew(options.interactive ?? false, platform))
            )();
            brew = await find('brew', [
              '/opt/homebrew/bin/brew',
              '/usr/local/bin/brew',
              '/home/linuxbrew/.linuxbrew/bin/brew',
              join(home, '.linuxbrew/bin/brew'),
            ]);
            if (!brew)
              throw new Error('Homebrew unavailable after installation');
          }
          const missing = progress.checks
            .filter((item) => !item.available)
            .map((item) => item.id);
          const packages = [
            ...(missing.includes('docker') ? ['docker'] : []),
            ...(missing.includes('compose') ? ['docker-compose'] : []),
            ...(missing.includes('buildx') ? ['docker-buildx'] : []),
            ...(!desktop && missing.includes('engine') && !colima
              ? ['colima']
              : []),
          ];
          if (needsQemu) packages.push('qemu');
          progress.message =
            'Downloading and installing missing runtime packages. This may take several minutes.';
          if (packages.length)
            await command(brew, ['install', ...packages], 20 * 60 * 1000);
          const prefix = (await command(brew, ['--prefix'], 10000)).trim();
          if (!prefix.startsWith('/') || /[\r\n]/.test(prefix))
            throw new Error('Invalid package prefix');
          if (missing.includes('docker')) docker = join(prefix, 'bin/docker');
          colima ??= join(prefix, 'bin/colima');
        } else if (step.id === 'plugins' && brew && needsPlugins) {
          await configurePlugins(
            (await command(brew, ['--prefix'], 10000)).trim(),
          );
        } else if (step.id === 'engine') {
          const current = await probe();
          if (!current.engine && desktop) {
            await command('/usr/bin/open', ['-g', '-a', 'Docker'], 10000);
            progress.message =
              'Waiting for Docker Desktop to start. Complete any first-run prompts in Docker Desktop.';
            const deadline = Date.now() + 3 * 60 * 1000;
            while (true) {
              try {
                endpoint = (
                  await invokeDocker(
                    [
                      'context',
                      'inspect',
                      'desktop-linux',
                      '--format',
                      '{{.Endpoints.docker.Host}}',
                    ],
                    10000,
                  )
                ).trim();
              } catch {
                /* Docker Desktop may still be creating its first context. */
              }
              if ((await probe()).engine) break;
              if (Date.now() > deadline)
                throw new Error('Engine startup timed out');
              await new Promise((resolve) => setTimeout(resolve, 1500));
            }
          } else if (!current.engine) {
            await mkdir(root, { mode: 0o700 }).catch(
              (error: NodeJS.ErrnoException) => {
                if (error.code !== 'EEXIST') throw error;
              },
            );
            const stat = await lstat(root);
            if (
              !stat.isDirectory() ||
              stat.isSymbolicLink() ||
              stat.uid !== (options.uid ?? process.getuid?.()) ||
              stat.mode & 0o077
            )
              throw new Error('Unsafe deployment directory');
            // An existing profile may contain another workload. Never change its resources or mounts.
            const profiles = await command(colima!, ['list', '--json'], 10000);
            const exists = profiles
              .trim()
              .split('\n')
              .filter(Boolean)
              .some((line) => JSON.parse(line).name === profile);
            if (/[\r\n:,]/.test(source + root))
              fail(
                'The checkout and deployment paths cannot contain line breaks, colons or commas for automated Colima mounts.',
              );
            progress.message =
              'Starting the dedicated Colima virtual machine and downloading its Linux image.';
            await command(
              colima!,
              exists
                ? ['start', profile, '--activate=false']
                : [
                    'start',
                    profile,
                    '--activate=false',
                    '--runtime',
                    'docker',
                    '--vm-type',
                    platform === 'darwin' ? 'vz' : 'qemu',
                    '--mount-type',
                    platform === 'darwin' ? 'virtiofs' : '9p',
                    '--cpus',
                    '2',
                    '--memory',
                    '4',
                    '--disk',
                    '6',
                    '--root-disk',
                    '4',
                    '--mount',
                    source,
                    '--mount',
                    `${root}:w`,
                  ],
              15 * 60 * 1000,
            );
            endpoint = (
              await invokeDocker(
                [
                  'context',
                  'inspect',
                  `colima-${profile}`,
                  '--format',
                  '{{.Endpoints.docker.Host}}',
                ],
                10000,
              )
            ).trim();
          }
        } else if (step.id === 'verify') {
          const current = await probe();
          if (!current.engine || !current.compose || !current.build)
            throw new Error('Runtime is not ready');
        }
        step.state = 'complete';
      }
      progress.state = 'ready';
      progress.message =
        'Local runtime ready. Continuing to your deployment plan.';
    } catch (error) {
      active.state = 'failed';
      progress.state = 'failed';
      const interrupted =
        error instanceof RuntimeInstallationInterrupted ||
        !!(error as { killed?: boolean; signal?: string })?.killed ||
        !!(error as { signal?: string })?.signal;
      if (interrupted) ownsLock = false;
      progress.message = interrupted
        ? 'Runtime installation was interrupted and its outcome is uncertain. Check the installer terminal and running runtime processes before removing ~/.wallet-provider-kit-runtime.lock and checking prerequisites again. Installed packages and deployments are retained.'
        : error instanceof ConfigurationError
          ? error.issues.join(' ')
          : `Runtime setup stopped at ${active.label.toLowerCase()}. Check network access, free disk space and any terminal or system prompts, then check prerequisites again. Installed packages and existing deployments were retained.`;
    } finally {
      if (ownsLock) await rmdir(lock).catch(() => {});
    }
  }
  return {
    check,
    start,
    status,
    settled: () => task ?? Promise.resolve(),
    executable: () => docker,
    docker: async (args: string[], timeout: number) => {
      if (args[0] === 'context' && endpoint) return endpoint;
      return invokeDocker(args, timeout);
    },
  };
}
