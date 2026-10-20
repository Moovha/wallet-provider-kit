import { createBundlerRpc } from './wpk-bundler-rpc.mjs';
import { createBundlerSimulations } from './wpk-bundler-simulations.mjs';
import { createServer } from 'node:http';
import { readFile, readdir, writeFile, rename } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';

const root = process.env.SAFE_WALLET_RUNTIME_DIRECTORY;
if (!root || !process.env.BUNDLER_REDIS_URL)
  throw Error('Missing private bundler configuration');
const applications = new Map();
const failures = new Map();
const allocatedPorts = new Map();
let refreshing = false;
let nextPort = 3100;
const equal = (a, b) => {
  const x = Buffer.from(a ?? ''),
    y = Buffer.from(b ?? '');
  return x.length === y.length && timingSafeEqual(x, y);
};
const allowed = new Set([
  'eth_chainId',
  'eth_supportedEntryPoints',
  'eth_sendUserOperation',
  'eth_estimateUserOperationGas',
  'eth_getUserOperationReceipt',
]);
const server = createServer(async (request, response) => {
  response.setHeader('content-type', 'application/json');
  response.setHeader('cache-control', 'no-store');
  try {
    const match = /^\/rpc\/([a-f0-9]{64})$/.exec(request.url ?? '');
    const app = match && applications.get(match[1]);
    if (
      !app ||
      request.method !== 'POST' ||
      !equal(
        request.headers.authorization,
        'Bearer ' + app.config.authorization,
      )
    ) {
      response.writeHead(403).end('{}');
      return;
    }
    if (app.inFlight >= 32) {
      response.writeHead(429).end('{}');
      return;
    }
    app.inFlight++;
    try {
      let data = '';
      for await (const chunk of request) {
        data += chunk;
        if (Buffer.byteLength(data) > 65536) throw Error();
      }
      const body = JSON.parse(data);
      if (
        body.jsonrpc !== '2.0' ||
        !allowed.has(body.method) ||
        !Array.isArray(body.params)
      )
        throw Error();
      if (
        ['eth_sendUserOperation', 'eth_estimateUserOperationGas'].includes(
          body.method,
        )
      ) {
        const [op, entry] = body.params;
        if (
          body.params.length !== 2 ||
          entry?.toLowerCase() !== app.config.entryPoint.toLowerCase() ||
          !app.config.accounts.some(
            (a) => a.toLowerCase() === op?.sender?.toLowerCase(),
          ) ||
          op?.paymaster?.toLowerCase() !== app.config.paymaster.toLowerCase()
        )
          throw Error();
      }
      const reply = await fetch('http://127.0.0.1:' + app.port, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: data,
        signal: AbortSignal.timeout(15000),
      });
      const payload = await reply.text();
      if (payload.length > 262144) throw Error();
      response.writeHead(reply.status).end(payload);
    } finally {
      app.inFlight--;
    }
  } catch {
    response.writeHead(503).end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32000, message: 'Bundler unavailable' },
      }),
    );
  }
});
async function refreshApplications() {
  let names;
  try {
    names = await readdir(root);
  } catch {
    return;
  }
  for (const name of names.filter((n) => /^[a-f0-9]{64}\.json$/.test(n))) {
    try {
      const config = JSON.parse(await readFile(join(root, name), 'utf8'));
      if (
        config.applicationId + '.json' !== name ||
        !/^[a-f0-9]{64}$/.test(config.applicationId) ||
        !/^0x[a-f0-9]{64}$/.test(config.executorKey) ||
        typeof config.authorization !== 'string' ||
        config.authorization.length < 32 ||
        !/^0x[0-9a-f]+$/.test(config.chainId) ||
        !/^0x[0-9a-f]{64}$/.test(config.genesisHash) ||
        !Array.isArray(config.rpcUrls) ||
        config.rpcUrls.length > 3 ||
        !config.rpcUrls.length ||
        config.rpcUrls.some((u) => !u.startsWith('https://')) ||
        !Array.isArray(config.accounts) ||
        config.accounts.length > 10000
      )
        throw Error();
      const previous = applications.get(config.applicationId);
      if (previous) {
        // Account activation changes only admission, never an executor's nonce owner.
        if (
          previous.config.executorKey !== config.executorKey ||
          previous.config.entryPoint !== config.entryPoint ||
          previous.config.paymaster !== config.paymaster ||
          previous.config.chainId !== config.chainId ||
          previous.config.genesisHash !== config.genesisHash
        )
          throw Error();
        previous.config = config;
        continue;
      }
      const failure = failures.get(config.applicationId);
      if (failure && failure.retryAt > Date.now()) continue;
      if (applications.size >= 32) continue;
      const port = allocatedPorts.get(config.applicationId) ?? nextPort++;
      allocatedPorts.set(config.applicationId, port);
      const simulations = await createBundlerSimulations(config.entryPoint);
      const rpc = createBundlerRpc(
        () => applications.get(config.applicationId)?.config ?? config,
      );
      const proxy = createServer(async (request, response) => {
        try {
          let body = '';
          for await (const chunk of request) {
            body += chunk;
            if (body.length > 1048576) throw Error();
          }
          const parsed = JSON.parse(body);
          const temporary =
            parsed.method === 'eth_getCode' &&
            simulations.codeAt(parsed.params?.[0]);
          if (temporary) {
            response.setHeader('content-type', 'application/json');
            response.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id: parsed.id,
                result: temporary,
              }),
            );
            return;
          }
          const result = await rpc(simulations.request(parsed));
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify(result));
        } catch {
          response.writeHead(503).end('{}');
        }
      });
      await new Promise((resolve) =>
        proxy.listen(port + 1000, '127.0.0.1', resolve),
      );
      try {
        const probe = await fetch('http://127.0.0.1:' + (port + 1000), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(simulations.probe()),
          signal: AbortSignal.timeout(10000),
        });
        const result = await probe.json();
        if (!probe.ok || result.error) throw Error('Simulation unavailable');
        simulations.verifyProbe(result.result);
      } catch {
        proxy.close();
        failures.set(config.applicationId, {
          count: 1,
          retryAt: Date.now() + 10000,
        });
        continue;
      }
      const path = join('/tmp', 'alto-' + config.applicationId + '.json');
      const alto = {
        entrypoints: config.entryPoint,
        ...simulations.configuration,
        'executor-private-keys': config.executorKey,
        'rpc-url': 'http://127.0.0.1:' + (port + 1000),
        port,
        'safe-mode': false,
        'refilling-wallets': false,
        'chain-type': 'op-stack',
        'block-time': 2000,
        'min-bundle-interval': 25,
        'max-bundle-interval': 100,
        'block-polling-interval': 250,
        'gas-price-refresh-interval': 2,
        'enable-horizontal-scaling': true,
        'enable-redis-receipt-cache': true,
        'redis-endpoint': process.env.BUNDLER_REDIS_URL,
        'redis-key-prefix': 'safe-wallet-' + config.applicationId,
        'mempool-pop-batch-size': 10,
        'max-bundle-count': 1,
        'max-gas-per-bundle': '6000000',
        'max-gas-per-user-op': '1000000',
        'mempool-max-queued-ops': 10,
        'rpc-methods': [...allowed].join(','),
        'log-level': 'fatal',
        'flush-stuck-transactions-during-startup': false,
      };
      await writeFile(path + '.tmp', JSON.stringify(alto), { mode: 0o600 });
      await rename(path + '.tmp', path);
      const child = spawn(
        process.execPath,
        ['/app/src/esm/cli/alto.js', 'run', '--config', path],
        { stdio: 'ignore' },
      );
      const application = { config, port, proxy, child, inFlight: 0 };
      applications.set(config.applicationId, application);
      const failed = () => {
        applications.delete(config.applicationId);
        const count = (failures.get(config.applicationId)?.count ?? 0) + 1;
        failures.set(config.applicationId, {
          count,
          retryAt:
            Date.now() + Math.min(60000, 5000 * 2 ** Math.min(count - 1, 4)),
        });
        proxy.close();
      };
      child.once('exit', failed);
      child.once('error', failed);
    } catch {
      /* Readiness stays unavailable; never log private configuration or upstream exceptions. */
    }
  }
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    await refreshApplications();
  } finally {
    refreshing = false;
  }
}
await refresh();
const timer = setInterval(() => {
  void refresh();
}, 1000);
server.listen(3000, '0.0.0.0');
function close() {
  clearInterval(timer);
  for (const app of applications.values()) {
    app.child.kill('SIGTERM');
    app.proxy.close();
  }
  server.close();
}
process.on('SIGTERM', close);
process.on('SIGINT', close);
