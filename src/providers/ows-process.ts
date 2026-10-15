import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Fixed worker, bounded pipes, no shell/credential arguments, native diagnostics discarded. */
export async function owsCommand(
  input: Record<string, unknown>,
): Promise<unknown> {
  const serialized = JSON.stringify(input);
  if (Buffer.byteLength(serialized) > 65536) throw new Error();
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
  const path = fileURLToPath(
    new URL(`./ows-worker.${extension}`, import.meta.url),
  );
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path], {
      shell: false,
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { NODE_ENV: 'production' },
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;
    const timer = setTimeout(() => {
      failed = true;
      child.kill('SIGKILL');
    }, 10000);
    child.on('error', () => {
      failed = true;
    });
    child.stdin.on('error', () => {
      failed = true;
    });
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 65536) {
        failed = true;
        child.kill('SIGKILL');
      } else chunks.push(chunk);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (failed || code !== 0) {
        reject(new Error('ows_operation_failed'));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('ows_operation_failed'));
      }
    });
    child.stdin.end(serialized);
  });
}
