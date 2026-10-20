/** Optional RPC hints only wake canonical verification; they never prove execution. */
export class RpcSignals {
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setTimeout>;
  private readonly listeners = new Set<() => void>();
  private readonly flashes = new Map<
    string,
    { observed_at: string; rpc_source_origin: string }
  >();
  private cursor = 0;
  private readonly tracked = new Map<string, number>();
  track(hashes: string[]) {
    for (const hash of hashes)
      if (/^0x[0-9a-fA-F]{64}$/.test(hash))
        this.tracked.set(hash.toLowerCase(), Date.now());
    for (const [hash, at] of this.tracked)
      if (Date.now() - at > 60000) this.tracked.delete(hash);
    while (this.tracked.size > 256)
      this.tracked.delete(this.tracked.keys().next().value!);
  }

  constructor(
    private readonly endpoints: string[],
    private readonly chainId: string,
    private readonly connect: (url: string) => WebSocket = (url) =>
      new WebSocket(url),
  ) {}
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    if (!this.socket && !this.timer) this.open();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        clearTimeout(this.timer);
        this.timer = undefined;
        this.socket?.close();
        this.socket = undefined;
      }
    };
  }
  preconfirmation(hashes: string[]) {
    for (const hash of hashes) {
      const entry = this.flashes.get(hash.toLowerCase());
      if (entry && Date.now() - Date.parse(entry.observed_at) <= 60000)
        return {
          stage: 'preconfirmed' as const,
          transaction_hash: hash.toLowerCase(),
          ...entry,
        };
    }
    return undefined;
  }
  private open() {
    if (!this.listeners.size) return;
    const endpoint = this.endpoints[this.cursor++ % this.endpoints.length];
    const url = new URL(endpoint);
    url.protocol = 'wss:';
    let socket: WebSocket;
    try {
      socket = this.connect(url.href);
    } catch {
      this.retry();
      return;
    }
    this.socket = socket;
    let identity = false;
    const subscriptions = new Map<string, string>();
    const timeout = setTimeout(() => {
      if (!identity) socket.close();
    }, 5000);
    timeout.unref();
    socket.addEventListener('open', () =>
      socket.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 0,
          method: 'eth_chainId',
          params: [],
        }),
      ),
    );
    socket.addEventListener('message', (event) => {
      if (
        this.socket !== socket ||
        typeof event.data !== 'string' ||
        event.data.length > 65536
      )
        return;
      try {
        const message = JSON.parse(event.data);
        if (message.id === 0) {
          if (
            message.error ||
            typeof message.result !== 'string' ||
            BigInt(message.result) !== BigInt(this.chainId)
          ) {
            socket.close();
            return;
          }
          identity = true;
          clearTimeout(timeout);
          for (const [id, params] of [
            [1, ['newHeads']],
            [2, ['newFlashblockTransactions']],
          ] as const)
            socket.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id,
                method: 'eth_subscribe',
                params,
              }),
            );
          return;
        }
        if (!identity) return;
        if (
          (message.id === 1 || message.id === 2) &&
          typeof message.result === 'string'
        ) {
          subscriptions.set(
            message.result,
            message.id === 1 ? 'head' : 'flash',
          );
          return;
        }
        if (message.method !== 'eth_subscription') return;
        const kind = subscriptions.get(message.params?.subscription);
        if (!kind) return;
        if (kind === 'flash') {
          const hash = message.params.result;
          if (
            typeof hash !== 'string' ||
            !/^0x[0-9a-fA-F]{64}$/.test(hash) ||
            !this.tracked.has(hash.toLowerCase())
          )
            return;
          if (this.flashes.size >= 256)
            this.flashes.delete(this.flashes.keys().next().value!);
          this.flashes.set(hash.toLowerCase(), {
            observed_at: new Date().toISOString(),
            rpc_source_origin: new URL(endpoint).origin,
          });
        }
        for (const listener of this.listeners) {
          try {
            listener();
          } catch {
            /* Hints do not control execution. */
          }
        }
      } catch {
        /* Malformed hints do not alter transaction status. */
      }
    });
    socket.addEventListener('error', () => socket.close());
    socket.addEventListener('close', () => {
      clearTimeout(timeout);
      if (this.socket === socket) {
        this.socket = undefined;
        this.retry();
      }
    });
  }
  private retry() {
    if (!this.listeners.size || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.open();
    }, 30000);
    this.timer.unref();
  }
}
