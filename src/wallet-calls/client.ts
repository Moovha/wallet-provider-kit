import { providerNetwork, type ProviderNetwork } from '../networks.js';
import type { WalletCallsStatus } from './types.js';
export type { WalletCallsStatus, WalletCallsReceipt } from './types.js';

/** Host-authorized transport. Never place an OAuth client secret in a browser. */
export interface WalletCallsClientOptions {
  network?: ProviderNetwork;
  url: string;
  /** Select the person’s current wallet-specific approval, required for shared wallets. */
  accessGrantId?: string;
  authorization: () => Promise<string>;
  fetch?: typeof fetch;
  /** Present status in the application's wallet UI; called only after an authenticated status read. */
  showCallsStatus?: (status: WalletCallsStatus) => Promise<void>;
}
export class WalletCallsRpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}
/** EIP-1193-shaped request interface for EIP-5792, bound to one provider account endpoint. */
export function createWalletCallsProvider(options: WalletCallsClientOptions) {
  const network = providerNetwork(options.network);
  const url = new URL(options.url);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('An HTTPS account wallet endpoint is required');
  if (
    options.accessGrantId !== undefined &&
    !/^[a-f0-9-]{36}$/.test(options.accessGrantId)
  )
    throw new Error('A valid wallet grant ID is required');
  const send = options.fetch ?? fetch;
  let sequence = 0;
  async function request(input: {
    method: string;
    params?: readonly unknown[] | object;
  }): Promise<unknown> {
    if (
      !input ||
      ![
        'wallet_sendCalls',
        'wallet_getCallsStatus',
        'wallet_getCapabilities',
        'wallet_showCallsStatus',
      ].includes(input.method)
    )
      throw new WalletCallsRpcError(-32601, 'Method not found');
    if (input.method === 'wallet_showCallsStatus') {
      if (!options.showCallsStatus)
        throw new WalletCallsRpcError(4200, 'Unsupported method');
      const status = await request({
        method: 'wallet_getCallsStatus',
        params: input.params,
      });
      await options.showCallsStatus(status as WalletCallsStatus);
      return null;
    }
    const id = ++sequence;
    let response: Response;
    try {
      response = await send(url.href, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: await options.authorization(),
          ...(options.network ? { 'Wallet-Network': options.network } : {}),
          ...(options.accessGrantId
            ? { 'Wallet-Grant-Id': options.accessGrantId }
            : {}),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method: input.method,
          params: input.params ?? [],
        }),
        redirect: 'error',
        credentials: 'omit',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new WalletCallsRpcError(4900, 'Disconnected');
    }
    if (!response.ok)
      throw new WalletCallsRpcError(
        response.status === 401 || response.status === 403 ? 4100 : 4900,
        response.status === 401 || response.status === 403
          ? 'Unauthorized'
          : 'Disconnected',
      );
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new WalletCallsRpcError(-32603, 'Invalid wallet response');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new WalletCallsRpcError(-32603, 'Invalid wallet response');
    const body = value as {
      jsonrpc?: unknown;
      id?: unknown;
      result?: unknown;
      error?: { code?: unknown; message?: unknown };
    };
    if (
      body.jsonrpc !== '2.0' ||
      body.id !== id ||
      Object.hasOwn(body, 'result') === Object.hasOwn(body, 'error')
    )
      throw new WalletCallsRpcError(-32603, 'Invalid wallet response');
    if (Object.hasOwn(body, 'error')) {
      if (
        !body.error ||
        typeof body.error !== 'object' ||
        typeof body.error.code !== 'number' ||
        typeof body.error.message !== 'string'
      )
        throw new WalletCallsRpcError(-32603, 'Invalid wallet response');
      throw new WalletCallsRpcError(body.error.code, body.error.message);
    }
    const result = body.result;
    if (!result || typeof result !== 'object' || Array.isArray(result))
      throw new WalletCallsRpcError(-32603, 'Invalid wallet response');
    if (
      input.method === 'wallet_sendCalls' &&
      typeof (result as { id?: unknown }).id !== 'string'
    )
      throw new WalletCallsRpcError(-32603, 'Invalid wallet response');
    if (input.method === 'wallet_getCallsStatus') {
      const status = result as Partial<WalletCallsStatus>;
      if (
        status.version !== '2.0.0' ||
        typeof status.id !== 'string' ||
        status.id !== (input.params as unknown[])?.[0] ||
        status.chainId !== network.hex ||
        status.atomic !== true ||
        ![100, 200, 400, 500].includes(status.status ?? 0) ||
        (status.status === 200 &&
          (!Array.isArray(status.receipts) || status.receipts.length !== 1))
      )
        throw new WalletCallsRpcError(-32603, 'Invalid wallet response');
    }
    return result;
  }
  async function* watchCallsStatus(
    batchId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<WalletCallsStatus> {
    if (typeof batchId !== 'string' || !batchId || batchId.length > 8194)
      throw new WalletCallsRpcError(-32602, 'Invalid batch');
    const response = await send(
      url.href + '/calls/' + encodeURIComponent(batchId) + '/events',
      {
        headers: {
          authorization: await options.authorization(),
          ...(options.network ? { 'Wallet-Network': options.network } : {}),
          accept: 'text/event-stream',
          ...(options.accessGrantId
            ? { 'Wallet-Grant-Id': options.accessGrantId }
            : {}),
        },
        redirect: 'error',
        credentials: 'omit',
        signal: signal ?? AbortSignal.timeout(60000),
      },
    );
    if (
      !response.ok ||
      !response.body ||
      !response.headers.get('content-type')?.startsWith('text/event-stream')
    )
      throw new WalletCallsRpcError(
        response.status === 401 || response.status === 403 ? 4100 : 4900,
        'Status stream unavailable',
      );
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 262144)
          throw new WalletCallsRpcError(-32603, 'Invalid wallet response');
        let index: number;
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          if (!frame.startsWith('event: status\n')) continue;
          const data = frame
            .split('\n')
            .find((line) => line.startsWith('data: '));
          if (!data) continue;
          const status = JSON.parse(data.slice(6)) as WalletCallsStatus;
          if (
            status.id !== batchId ||
            status.version !== '2.0.0' ||
            status.chainId !== network.hex ||
            status.atomic !== true ||
            ![100, 200, 400, 500].includes(status.status) ||
            (status.status === 200 &&
              (!Array.isArray(status.receipts) || status.receipts.length !== 1))
          )
            throw new WalletCallsRpcError(-32603, 'Invalid wallet response');
          yield status;
          if (status.status !== 100) return;
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  return { request, watchCallsStatus };
}
