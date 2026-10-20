import { WalletProviderError } from '../domain/signing.js';

/** The sole credential-bearing query URL accepted by the explorer adapter. */
export function etherscanEndpoint(value: string): URL | undefined {
  try {
    const u = new URL(value);
    if (
      u.protocol !== 'https:' ||
      u.hostname !== 'api.etherscan.io' ||
      u.port ||
      u.pathname !== '/v2/api' ||
      u.username ||
      u.password ||
      u.hash
    )
      return;
    if (
      [...u.searchParams.keys()].sort().join(',') !== 'apikey,chainid' ||
      !['8453', '84532'].includes(u.searchParams.get('chainid')!) ||
      !/^[A-Za-z0-9_-]{8,256}$/.test(u.searchParams.get('apikey')!)
    )
      return;
    return u;
  } catch {
    return;
  }
}
export function etherscanSupports(method: string, params: unknown[]) {
  return (
    (method === 'eth_getBlockByNumber' &&
      params[1] === false &&
      typeof params[0] === 'string' &&
      /^(latest|earliest|0x[0-9a-f]+)$/.test(params[0])) ||
    [
      'eth_getTransactionReceipt',
      'eth_getTransactionByHash',
      'eth_getCode',
    ].includes(method) ||
    (method === 'eth_call' && params.length === 2)
  );
}
const quotas = new Map<
  string,
  { tail: Promise<void>; next: number; waiting: number }
>();
export async function etherscanRead(
  endpoint: string,
  method: string,
  params: unknown[],
  request: typeof fetch,
) {
  const url = etherscanEndpoint(endpoint);
  if (!url || !etherscanSupports(method, params))
    throw new WalletProviderError('wallet_provider_configuration');
  const key = url.searchParams.get('apikey')!;
  let quota = quotas.get(key);
  if (!quota) {
    quota = { tail: Promise.resolve(), next: 0, waiting: 0 };
    quotas.set(key, quota);
  }
  if (quota.waiting >= 8)
    throw new WalletProviderError(
      'wallet_provider_unavailable',
      'not_dispatched',
    );
  quota.waiting++;
  const previous = quota.tail;
  let release!: () => void;
  quota.tail = new Promise<void>((r) => {
    release = r;
  });
  await previous;
  try {
    const wait = quota.next - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    quota.next = Date.now() + 350;
  } finally {
    quota.waiting--;
    release();
  }
  url.searchParams.set('module', 'proxy');
  url.searchParams.set('action', method);
  if (method === 'eth_getBlockByNumber') {
    url.searchParams.set('tag', String(params[0]));
    url.searchParams.set('boolean', 'false');
  } else if (
    ['eth_getTransactionReceipt', 'eth_getTransactionByHash'].includes(method)
  )
    url.searchParams.set('txhash', String(params[0]));
  else if (method === 'eth_getCode') {
    url.searchParams.set('address', String(params[0]));
    url.searchParams.set('tag', String(params[1]));
  } else {
    const call = params[0] as { to: string; data: string };
    url.searchParams.set('to', call.to);
    url.searchParams.set('data', call.data);
    url.searchParams.set('tag', String(params[1]));
  }
  try {
    const response = await request(url, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok || !response.body) throw Error();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 262144) throw Error();
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (
      body.error ||
      !Object.hasOwn(body, 'result') ||
      (typeof body.result === 'string' && !body.result.startsWith('0x'))
    )
      throw Error();
    return body.result as unknown;
  } catch {
    throw new WalletProviderError(
      'wallet_provider_unavailable',
      'not_dispatched',
    );
  }
}
