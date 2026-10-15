import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { startTelemetry, observeRequest } from '../src/service/telemetry.js';

it('exports real OTLP traces and metrics with only allowlisted dimensions', async () => {
  const requests: { path: string; body: string }[] = [];
  const receiver = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      requests.push({
        path: request.url!,
        body: Buffer.concat(chunks).toString(),
      });
      response.setHeader('content-type', 'application/json');
      response.end('{}');
    });
  });
  await new Promise<void>((resolve) =>
    receiver.listen(0, '127.0.0.1', resolve),
  );
  const address = receiver.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing receiver address');
  const telemetry = startTelemetry(`http://127.0.0.1:${address.port}`, true);
  try {
    observeRequest('POST', '/v1/actions/:actionId/sign', 403, 0.01);
    await telemetry.shutdown();
    expect(requests.map((request) => request.path)).toEqual(
      expect.arrayContaining(['/v1/traces', '/v1/metrics']),
    );
    const output = requests.map((request) => request.body).join('');
    expect(output).toContain('wallet-provider-kit');
    expect(output).toContain('http.route');
    expect(output).toContain('/v1/actions/:actionId/sign');
    expect(output).not.toMatch(
      /authorization|private_key|wallet_secret|process.command|host.name|url.full/i,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      receiver.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it('disables exporters by default and rejects insecure production endpoints', async () => {
  await expect(startTelemetry().shutdown()).resolves.toBeUndefined();
  expect(() => startTelemetry('http://external.example.test')).toThrow();
  expect(() => startTelemetry('https://user:password@example.test')).toThrow();
});
