import { basename, join } from 'node:path';
import type { LocalRuntimeOptions } from '../../src/deployment/local-runtime.js';

/** Offline command responses only: no package installation, VM, Docker or network effects. */
export function runtimeFixture(
  home: string,
  initial: Partial<{
    docker: boolean;
    compose: boolean;
    buildx: boolean;
    engine: boolean;
    brew: boolean;
    colima: boolean;
    qemu: boolean;
  }> = {},
) {
  const available = {
    docker: false,
    compose: false,
    buildx: false,
    engine: false,
    brew: true,
    colima: false,
    qemu: false,
    ...initial,
  };
  const calls: { file: string; args: string[] }[] = [];
  let remote = false;
  let existingProfile = false;
  let beforeInstall: () => Promise<void> = async () => {};
  const command: NonNullable<LocalRuntimeOptions['command']> = async (
    file,
    args,
  ) => {
    calls.push({ file, args });
    const name = basename(file);
    if (args[0] === '--version') {
      if (available[name as keyof typeof available]) return 'offline version';
      if (name.startsWith('qemu-system') && available.qemu)
        return 'offline qemu';
      throw new Error('not installed');
    }
    if (name === 'brew') {
      if (args[0] === '--prefix') return join(home, 'brew');
      if (args[0] === 'install') {
        await beforeInstall();
        for (const item of args.slice(1))
          available[
            item === 'docker-compose'
              ? 'compose'
              : item === 'docker-buildx'
                ? 'buildx'
                : (item as keyof typeof available)
          ] = true;
      }
      return '';
    }
    if (name === 'colima') {
      if (args[0] === 'list')
        return existingProfile
          ? JSON.stringify({ name: 'wallet-provider-kit', status: 'Stopped' })
          : '';
      if (args[0] === 'start') available.engine = true;
      return '';
    }
    if (name === 'docker') {
      if (args[0] === 'context')
        return remote
          ? 'tcp://remote.example:2376'
          : 'unix:///offline/docker.sock';
      if (args[0] === 'compose' && available.compose) return '2.40.0';
      if (args[0] === 'buildx' && available.buildx) return 'offline buildx';
      if (args.includes('info') && available.engine) return 'linux';
      throw new Error('offline-unavailable-sensitive-detail');
    }
    throw new Error('Unexpected command');
  };
  return {
    available,
    calls,
    remote: () => {
      remote = true;
    },
    existingProfile: () => {
      existingProfile = true;
    },
    beforeInstall: (callback: () => Promise<void>) => {
      beforeInstall = callback;
    },
    options: {
      home,
      root: join(home, 'deployments'),
      source: '/offline/checkout',
      uid: process.getuid?.(),
      platform: 'darwin',
      arch: 'arm64',
      desktop: false,
      environment: {},
      command,
    } satisfies LocalRuntimeOptions,
  };
}
