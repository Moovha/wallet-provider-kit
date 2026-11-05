import { expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function freePort() {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
async function eventually(check: () => Promise<void>) {
  const deadline = Date.now() + 5000;
  for (;;) {
    try {
      await check();
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}
it.each(['demand', 'queue'] as const)(
  'parks failed startup and recovers on %s without untrusted wakeups or repeated dispatch',
  async (mode) => {
    const directory = await mkdtemp(join(tmpdir(), 'wpk-launcher-'));
    let child: ChildProcess | undefined;
    try {
      const port = await freePort();
      const childPort = await freePort();
      const config = {
        applicationId: 'a'.repeat(64),
        executorKey: '0x' + '11'.repeat(32),
        authorization: 'offline-authorization-'.repeat(3),
        chainId: '0x2105',
        genesisHash: '0x' + '22'.repeat(32),
        rpcUrls: ['https://rpc.example.test'],
        entryPoint: '0x' + '33'.repeat(20),
        paymaster: '0x' + '44'.repeat(20),
        accounts: ['0x' + '55'.repeat(20)],
      };
      const configurationDirectory = join(directory, 'config');
      await mkdir(configurationDirectory);
      await writeFile(
        join(configurationDirectory, config.applicationId + '.json'),
        JSON.stringify(config),
      );
      const launcher = (
        await readFile('scripts/bundled-bundler-launcher.mjs', 'utf8')
      )
        .replace(
          "'/app/src/esm/cli/alto.js'",
          JSON.stringify(join(directory, 'alto.mjs')),
        )
        .replace(
          "join('/tmp', 'alto-'",
          'join(' + JSON.stringify(directory) + ", 'alto-'",
        )
        .replace(
          "server.listen(3000, '0.0.0.0')",
          `server.listen(${port}, '127.0.0.1')`,
        )
        .replace('let nextPort = 3100;', `let nextPort = ${childPort};`);
      await writeFile(join(directory, 'launcher.mjs'), launcher);
      await writeFile(
        join(directory, 'wpk-bundler-startup.mjs'),
        await readFile('scripts/bundler-startup.mjs'),
      );
      await writeFile(
        join(directory, 'wpk-bundler-rpc.mjs'),
        `
      import {appendFile, access} from 'node:fs/promises';
      export function bundlerNetworkProfile(){return {'gas-price-refresh-interval':0}}
      export function createBundlerRpc(){return async()=>{
        await appendFile(${JSON.stringify(join(directory, 'probes'))}, 'probe\\n');
        await access(${JSON.stringify(join(directory, 'healthy'))});
        return {jsonrpc:'2.0',id:1,result:'0x1'};
      }}
    `,
      );
      await writeFile(
        join(directory, 'wpk-bundler-simulations.mjs'),
        `
      export const maximumBundlerUserOperationGas=1000000n;
      export const estimateNativeUserOperationGas=()=>{};
      export async function createBundlerSimulations(){return {
        configuration:{}, codeAt:()=>undefined, request:b=>b,
        probe:()=>({jsonrpc:'2.0',id:1,method:'eth_call',params:[]}),
        verifyProbe:r=>{if(r!=='0x1')throw Error('invalid')}
      }}
    `,
      );
      await mkdir(join(directory, 'node_modules/ioredis'), { recursive: true });
      await symlink(
        join(process.cwd(), 'node_modules/viem'),
        join(directory, 'node_modules/viem'),
      );
      await writeFile(
        join(directory, 'node_modules/ioredis/package.json'),
        JSON.stringify({ type: 'module', exports: './index.js' }),
      );
      await writeFile(
        join(directory, 'node_modules/ioredis/index.js'),
        `import {existsSync} from 'node:fs'; export class Redis {on(){} async exists(){return existsSync(${JSON.stringify(join(directory, 'pending'))})?1:0} disconnect(){}}`,
      );
      await writeFile(
        join(directory, 'alto.mjs'),
        `
      import {readFileSync,appendFileSync} from 'node:fs';
      import {createServer} from 'node:http';
      const c=JSON.parse(readFileSync(process.argv.at(-1)));
      const server=createServer(async(req,res)=>{
        let raw='';for await(const chunk of req)raw+=chunk;
        const b=JSON.parse(raw);
        if(b.method==='eth_sendUserOperation')appendFileSync(${JSON.stringify(join(directory, 'sends'))},'send\\n');
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({jsonrpc:'2.0',id:b.id,result:b.method==='eth_supportedEntryPoints'?[c.entrypoints]:'0x1'}));
      }).listen(c.port,'127.0.0.1');
      process.on('SIGTERM',()=>server.close());
    `,
      );
      child = spawn(process.execPath, [join(directory, 'launcher.mjs')], {
        env: {
          ...process.env,
          SAFE_WALLET_RUNTIME_DIRECTORY: configurationDirectory,
          BUNDLER_REDIS_URL: 'redis://offline.invalid',
        },
        stdio: 'ignore',
      });
      const request = (
        method: string,
        params: unknown[] = [],
        token = config.authorization,
      ) =>
        fetch(`http://127.0.0.1:${port}/rpc/${config.applicationId}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer ' + token,
          },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          signal: AbortSignal.timeout(10000),
        });
      await eventually(async () =>
        expect(
          (await request('eth_supportedEntryPoints', [], 'wrong')).status,
        ).toBe(403),
      );
      expect((await request('unsupported')).status).toBe(503);
      expect(
        (
          await request('eth_sendUserOperation', [
            { sender: '0x' + '66'.repeat(20), paymaster: config.paymaster },
            config.entryPoint,
          ])
        ).status,
      ).toBe(503);
      // The previous unconditional retry would issue another probe after ten seconds.
      await new Promise((resolve) => setTimeout(resolve, 11000));
      expect(await readFile(join(directory, 'probes'), 'utf8')).toBe('probe\n');
      await writeFile(join(directory, 'healthy'), 'yes');
      if (mode === 'queue') {
        await writeFile(join(directory, 'pending'), 'yes');
        await eventually(async () =>
          expect(await readFile(join(directory, 'probes'), 'utf8')).toBe(
            'probe\nprobe\n',
          ),
        );
      }
      const responses = await Promise.all([
        request('eth_supportedEntryPoints'),
        request('eth_supportedEntryPoints'),
      ]);
      for (const response of responses) {
        expect(response.status).toBe(200);
        expect(
          ((await response.json()) as { result: string[] }).result,
        ).toEqual([config.entryPoint]);
      }
      expect(await readFile(join(directory, 'probes'), 'utf8')).toBe(
        'probe\nprobe\n',
      );
      const result = await request('eth_sendUserOperation', [
        { sender: config.accounts[0], paymaster: config.paymaster },
        config.entryPoint,
      ]);
      expect(result.status).toBe(200);
      expect(await readFile(join(directory, 'sends'), 'utf8')).toBe('send\n');
    } finally {
      if (child && child.exitCode === null) {
        child.kill('SIGTERM');
        await once(child, 'exit');
      }
      await rm(directory, { recursive: true, force: true });
    }
  },
  30000,
);
