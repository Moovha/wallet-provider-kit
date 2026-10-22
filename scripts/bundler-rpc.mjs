/** Select fee accounting from the server-bound chain, never from an application request. */
export function bundlerNetworkProfile(chainId) {
  if (chainId === '0xaa36a7' || chainId === '0x1')
    return { 'chain-type': 'default', 'block-time': 12000 };
  if (chainId === '0x14a34' || chainId === '0x2105')
    return { 'chain-type': 'op-stack', 'block-time': 2000 };
  throw Error('Unsupported private bundler chain');
}

/** Application-scoped read distribution. Broadcasts are sent once, without transport failover. */
export function createBundlerRpc(configuration, request = fetch) {
  const states = new Map(),
    pending = new Map(),
    feed = new Map();
  let cursor = 0,
    queued = 0;
  const reads = new Set([
    'eth_chainId',
    'eth_blockNumber',
    'eth_getBlockByNumber',
    'eth_call',
    'debug_traceCall',
    'eth_getBalance',
    'eth_getCode',
    'eth_getLogs',
    'eth_getTransactionByHash',
    'eth_getTransactionReceipt',
    'eth_getTransactionCount',
    'eth_estimateGas',
    'eth_feeHistory',
    'eth_gasPrice',
    'eth_maxPriorityFeePerGas',
  ]);
  const backgroundProbes = new Set([
    'eth_blockNumber',
    'eth_maxPriorityFeePerGas',
    'eth_gasPrice',
  ]);
  const transient = new Set([-32603, -32005, -32016, 4444]);
  function state(endpoint) {
    if (!states.has(endpoint))
      states.set(endpoint, {
        active: 0,
        assigned: 0,
        lastAssigned: 0,
        latency: undefined,
        failures: 0,
        lastFailure: 0,
        waiters: [],
        cooldown: 0,
        unsupportedUntil: 0,
        capabilities: new Map(),
        probing: new Map(),
        verifiedUntil: 0,
        verifying: undefined,
      });
    return states.get(endpoint);
  }
  async function exchange(endpoint, body) {
    const response = await request(endpoint, {
      method: 'POST',
      redirect: 'error',
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.body || response.status === 429 || response.status >= 500) {
      await response.body?.cancel();
      throw Error('RPC unavailable');
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 4194304) throw Error('RPC response too large');
      chunks.push(chunk);
    }
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (
      !result ||
      result.jsonrpc !== '2.0' ||
      result.id !== body.id ||
      Object.hasOwn(result, 'result') === Object.hasOwn(result, 'error')
    )
      throw Error('Invalid RPC response');
    if (!response.ok && !result.error) throw Error('RPC unavailable');
    return result;
  }
  function unavailable(s) {
    const now = Date.now();
    s.failures = now - s.lastFailure >= 30000 ? 1 : Math.min(5, s.failures + 1);
    s.lastFailure = now;
    s.cooldown = now + Math.min(15000, 1000 * 2 ** (s.failures - 1));
  }
  async function identity(endpoint, config) {
    const s = state(endpoint);
    const identityKey = JSON.stringify([config.chainId, config.genesisHash]);
    if (s.identityKey === identityKey && s.verifiedUntil > Date.now()) return;
    if (s.verifying?.key === identityKey) return s.verifying.promise;
    const promise = (async () => {
      const [chain, genesis] = await Promise.all([
        exchange(endpoint, {
          jsonrpc: '2.0',
          id: 'identity-chain',
          method: 'eth_chainId',
          params: [],
        }),
        exchange(endpoint, {
          jsonrpc: '2.0',
          id: 'identity-genesis',
          method: 'eth_getBlockByNumber',
          params: ['0x0', false],
        }),
      ]);
      if (chain.error || genesis.error) throw Error('RPC unavailable');
      if (
        chain.result !== config.chainId ||
        genesis.result?.hash !== config.genesisHash
      ) {
        const error = Error('RPC chain identity mismatch');
        error.identityMismatch = true;
        throw error;
      }
      s.identityKey = identityKey;
      s.verifiedUntil = Date.now() + 60000;
    })().finally(() => {
      if (s.verifying?.promise === promise) s.verifying = undefined;
    });
    s.verifying = { key: identityKey, promise };
    return promise;
  }
  async function slot(s, work) {
    if (s.active >= 8) {
      if (queued >= 64) throw Error('RPC capacity unavailable');
      queued++;
      await new Promise((resolve, reject) => {
        const entry = {
          resolve,
          timer: setTimeout(() => {
            const i = s.waiters.indexOf(entry);
            if (i >= 0) s.waiters.splice(i, 1);
            queued--;
            reject(Error('RPC capacity unavailable'));
          }, 3000),
        };
        s.waiters.push(entry);
      });
    } else s.active++;
    try {
      return await work();
    } finally {
      const next = s.waiters.shift();
      if (next) {
        queued--;
        clearTimeout(next.timer);
        next.resolve();
      } else s.active--;
    }
  }
  async function execute(body, config) {
    const attempted = new Set();
    const override =
      (body.method === 'eth_call' && body.params?.length >= 3) ||
      (body.method === 'debug_traceCall' && !!body.params?.[2]?.stateOverrides);
    const feature = override ? 'state-overrides' : body.method;
    for (;;) {
      const urls = config.rpcUrls;
      const candidates = urls
        .map((_, i) => (cursor + i) % urls.length)
        .filter((i) => {
          const s = state(urls[i]);
          return (
            !attempted.has(i) &&
            s.cooldown <= Date.now() &&
            (!override || s.unsupportedUntil <= Date.now()) &&
            (s.capabilities.get(feature)?.supported !== false ||
              s.capabilities.get(feature).until <= Date.now())
          );
        })
        .sort((a, b) => {
          const probe = (i) =>
            backgroundProbes.has(body.method) &&
            state(urls[i]).assigned === 0 &&
            Date.now() - state(urls[i]).lastAssigned >= 10000;
          if (probe(a) !== probe(b)) return probe(a) ? -1 : 1;
          const cost = (i) =>
            (state(urls[i]).assigned + 1) * (state(urls[i]).latency ?? 1000);
          return cost(a) - cost(b);
        });
      const i = candidates[0];
      if (i === undefined) throw Error('RPC unavailable');
      attempted.add(i);
      cursor = (i + 1) % urls.length;
      const endpoint = urls[i],
        s = state(endpoint);
      s.assigned++;
      s.lastAssigned = Date.now();
      try {
        try {
          await identity(endpoint, config);
        } catch (error) {
          if (error.identityMismatch) throw error;
          unavailable(s);
          continue;
        }
        // After identity verification, a mutation has exactly one upstream dispatch.
        if (body.method === 'eth_sendRawTransaction')
          return await exchange(endpoint, body);
        const probe = s.probing.get(feature);
        if (probe) {
          await probe;
          if (
            s.cooldown > Date.now() ||
            (override && s.unsupportedUntil > Date.now()) ||
            (s.capabilities.get(feature)?.supported === false &&
              s.capabilities.get(feature).until > Date.now())
          )
            continue;
        }
        let releaseProbe;
        if ((s.capabilities.get(feature)?.until ?? 0) <= Date.now()) {
          s.probing.set(
            feature,
            new Promise((resolve) => {
              releaseProbe = resolve;
            }),
          );
        }
        try {
          const result = await slot(s, async () => {
            const started = performance.now();
            const reply = await exchange(endpoint, body);
            const elapsed = Math.max(
              1,
              Math.min(5000, performance.now() - started),
            );
            s.latency =
              s.latency === undefined
                ? elapsed
                : 0.8 * s.latency + 0.2 * elapsed;
            return reply;
          });
          if (
            override &&
            ([-32601, -32602, -32004].includes(result.error?.code) ||
              (result.error?.code === 12 &&
                /can't route .*suitable provider/i.test(
                  result.error?.message ?? '',
                )))
          ) {
            s.unsupportedUntil = Date.now() + 300000;
            continue;
          }
          if (result.error?.code === -32601) {
            s.capabilities.set(feature, {
              supported: false,
              until: Date.now() + 300000,
            });
            continue;
          }
          // Geth's execution-revert code is positive; preserve its structured EVM result.
          const executionRevert =
            ['eth_call', 'eth_estimateGas', 'debug_traceCall'].includes(
              body.method,
            ) &&
            result.error?.code === 3 &&
            typeof result.error.data === 'string' &&
            /^0x(?:[0-9a-f]{2})*$/i.test(result.error.data);
          if (
            transient.has(result.error?.code) ||
            (result.error?.code >= 0 && !executionRevert)
          )
            throw Error('RPC unavailable');
          s.capabilities.set(feature, {
            supported: true,
            until: Date.now() + 300000,
          });
          return result;
        } catch {
          unavailable(s);
        } finally {
          if (releaseProbe) {
            s.probing.delete(feature);
            releaseProbe();
          }
        }
      } finally {
        s.assigned--;
      }
    }
  }
  return async (body) => {
    const config = configuration();
    if (
      !config ||
      !Array.isArray(config.rpcUrls) ||
      !config.rpcUrls.length ||
      config.rpcUrls.length > 3 ||
      !/^0x[0-9a-f]+$/.test(config.chainId) ||
      !/^0x[0-9a-f]{64}$/.test(config.genesisHash) ||
      !body ||
      Array.isArray(body) ||
      body.jsonrpc !== '2.0' ||
      (body.params !== undefined && !Array.isArray(body.params)) ||
      (!reads.has(body.method) && body.method !== 'eth_sendRawTransaction')
    )
      throw Error('Invalid bundler RPC request');
    if (body.method === 'eth_sendRawTransaction') return execute(body, config);
    const key = JSON.stringify([
      config.rpcUrls,
      config.chainId,
      config.genesisHash,
      body.method,
      body.params ?? [],
    ]);
    const cached = feed.get(key);
    if (cached && cached.until > Date.now())
      return { ...structuredClone(cached.value), id: body.id };
    let promise = pending.get(key);
    if (!promise) {
      if (pending.size >= 128) throw Error('RPC capacity unavailable');
      promise = execute(body, config)
        .then((value) => {
          const ttl =
            body.method === 'eth_chainId'
              ? 30000
              : [
                    'eth_blockNumber',
                    'eth_maxPriorityFeePerGas',
                    'eth_gasPrice',
                  ].includes(body.method)
                ? 250
                : body.method === 'eth_getBlockByNumber' &&
                    body.params?.[0] === 'latest'
                  ? 250
                  : 0;
          if (ttl && !value.error) {
            if (feed.size >= 128) feed.delete(feed.keys().next().value);
            feed.set(key, {
              value: structuredClone(value),
              until: Date.now() + ttl,
            });
          }
          return value;
        })
        .finally(() => {
          if (pending.get(key) === promise) pending.delete(key);
        });
      pending.set(key, promise);
    }
    return { ...structuredClone(await promise), id: body.id };
  };
}
