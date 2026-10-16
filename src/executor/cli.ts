import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openProviderDatabase } from '../storage/index.js';
import { ConfigurationError } from '../deployment/config.js';
import { loadExecutionServiceConfiguration } from './config.js';
import { createExecutionService } from './service.js';

export async function executionServiceCommand(args: string[]): Promise<void> {
  if (args[0] === 'init' && args.length <= 2) {
    await writeFile(
      resolve(args[1] ?? 'executor.config.json'),
      await readFile(
        new URL('../../docs/executor.config.example.json', import.meta.url),
      ),
      { flag: 'wx', mode: 0o600 },
    );
    process.stdout.write(
      'Execution service configuration created; replace example settings, then validate\n',
    );
    return;
  }
  if (
    args.length !== 3 ||
    args[1] !== '--config' ||
    !['validate', 'init-storage', 'run'].includes(args[0])
  )
    throw new ConfigurationError([
      'Use wallet-provider-kit executor init [file], or executor validate|init-storage|run --config file.',
    ]);
  const { config, directory } = await loadExecutionServiceConfiguration(
    args[2],
  );
  if (args[0] === 'validate') {
    process.stdout.write(
      'Execution service configuration valid; no integrations activated\n',
    );
    return;
  }
  if (args[0] === 'init-storage') {
    const db = openProviderDatabase({
      directory: resolve(directory, config.storage.directory),
      initialize: true,
    });
    db.close();
    process.stdout.write(
      'Execution service storage initialized; no integrations activated\n',
    );
    return;
  }
  const app = await createExecutionService({
    configuration: config,
    directory,
  });
  const port = config.http?.port ?? 8081;
  await app.listen({ host: config.http?.host ?? '127.0.0.1', port });
  process.stdout.write(
    `Execution service listening on port ${port}; ${config.activation.enabled ? 'configured profile' : 'dispatch disabled'}\n`,
  );
  let closing = false;
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      if (closing) return;
      closing = true;
      const timeout = setTimeout(() => process.exit(1), 10000).unref();
      void app
        .close()
        .then(() => clearTimeout(timeout))
        .catch(() => process.exit(1));
    });
}
