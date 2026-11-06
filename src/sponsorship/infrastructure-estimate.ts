const maximumBackoffMs = 2000;

function retryDelay(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  let delay = 1000;
  if (header !== null) {
    if (/^\d+$/.test(header)) delay = Number(header) * 1000;
    else {
      const date = Date.parse(header);
      if (Number.isFinite(date)) delay = date - Date.now();
    }
  }
  if (!Number.isFinite(delay) || delay > maximumBackoffMs) return;
  return Math.max(250, delay);
}

/** Retry only read-only gas estimation, with bounded upstream rate-limit backoff. */
export async function estimateInfrastructureGas(
  request: typeof fetch,
  endpoint: string,
  id: string,
  params: unknown[],
): Promise<Response> {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'eth_estimateGas',
    params,
  });
  for (let attempt = 0; ; attempt++) {
    const response = await request(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (response.status !== 429 || attempt === 2) return response;
    const delay = retryDelay(response);
    if (delay === undefined) return response;
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
