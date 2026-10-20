import { generatedSecretNames } from './deployment-secrets.js';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  ConfigurationError,
  secretReferences,
  type ProviderConfiguration,
} from './config.js';
import {
  createLocalRuntime,
  type LocalRuntimeOptions,
} from './local-runtime.js';
import {
  createSetupExecutor,
  type SetupExecutorOptions,
} from './setup-executor.js';

const fail = (message: string): never => {
  throw new ConfigurationError([message]);
};
async function follow<T>(
  status: () => T,
  settled: () => Promise<void>,
  report: (message: string) => void,
) {
  let previous = '';
  const print = () => {
    const value = status() as {
      steps: { label: string; state: string }[];
      message?: string;
    };
    const message = [
      ...value.steps.map((step) => `${step.state}: ${step.label}`),
      ...(value.message ? [value.message] : []),
    ].join('\n');
    if (message !== previous) {
      previous = message;
      report(message);
    }
  };
  print();
  const timer = setInterval(print, 1000);
  try {
    await settled();
    print();
  } finally {
    clearInterval(timer);
  }
}

/** Shared terminal orchestration uses the same runtime and deployment executors as the wizard. */
export async function runLocalSetup(options: {
  config?: ProviderConfiguration;
  installRuntime: boolean;
  runtime?: LocalRuntimeOptions;
  executor?: SetupExecutorOptions;
  report?: (message: string) => void;
}) {
  const report =
    options.report ?? ((message) => process.stdout.write(message + '\n'));
  const environment = options.executor?.environment ?? process.env;
  if (options.config) {
    const config = options.config;
    if (config.activation.enabled || config.backend.kind !== 'ows')
      fail(
        'Local setup requires the Safe wallet service with wallet operations disabled.',
      );
    const source =
      options.executor?.source ??
      fileURLToPath(new URL('../../', import.meta.url));
    try {
      await access(join(source, 'Dockerfile'));
      await access(join(source, '.dockerignore'));
    } catch {
      fail(
        'Run local container setup from a built source checkout containing Dockerfile and .dockerignore.',
      );
    }
    const missing = secretReferences(config).filter(
      (reference) =>
        !environment[reference.env] &&
        !generatedSecretNames(config).includes(reference.env),
    );
    if (missing.length)
      fail(
        `Supply these secrets through the process environment or Node --env-file before starting: ${[...new Set(missing.map((reference) => reference.env))].join(', ')}. Do not put values in command arguments.`,
      );
  }
  const runtime = createLocalRuntime({
    interactive: !!process.stdin.isTTY,
    ...options.runtime,
  });
  const check = await runtime.check();
  report(check.message);
  for (const item of check.checks)
    report(
      `${item.available ? 'Available' : 'Missing or stopped'}: ${item.label}`,
    );
  if (check.state !== 'ready') {
    if (!check.canInstall) fail(check.message);
    for (const action of check.actions) report(action);
    if (!options.installRuntime)
      fail(
        'Run again with --install-runtime to install the missing runtime and continue, or run wallet-provider-kit runtime install first.',
      );
    runtime.start();
    await follow(runtime.status, runtime.settled, report);
    if (runtime.status().state !== 'ready') fail(runtime.status().message);
  }
  if (!options.config) return;
  const executor = createSetupExecutor({
    ...options.executor,
    command: options.executor?.command ?? runtime.docker,
    dockerExecutable: runtime.executable,
  });
  const plan = await executor.prepare(options.config);
  report(`Private deployment directory: ${plan.directory}`);
  for (const change of plan.changes) report(change);
  executor.start(plan.id, {});
  await follow(executor.status, executor.settled, report);
  if (executor.status().state !== 'complete')
    fail(executor.status().message ?? 'Local setup needs attention.');
  report(
    `Saved status, stop and restart commands: ${join(plan.directory, 'provider-setup.md')}`,
  );
}
