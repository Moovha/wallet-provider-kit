import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

const telemetryUrl = new URL('https://example.test');
telemetryUrl.username = 'offline-fixture';
telemetryUrl.password = crypto.randomUUID();

it.each([
  { GAE_SERVICE: 'exchange' },
  { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
  { OAUTH_ISSUER: 'https://identity.example.test' },
  { PORT: '-1' },
  {
    OTEL_EXPORTER_OTLP_ENDPOINT: telemetryUrl.toString(),
  },
])(
  'fails unsafe or incomplete startup configuration without disclosure',
  (configuration) => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'src/main.ts'],
      {
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          ...configuration,
        },
        encoding: 'utf8',
        timeout: 5000,
      },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      'Wallet provider startup failed; check configuration\n',
    );
  },
);
