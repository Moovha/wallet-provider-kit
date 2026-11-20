import { afterEach, describe, expect, it, vi } from 'vitest';
import { estimateInfrastructureGas } from '../src/sponsorship/infrastructure-estimate.js';
import { SafeWalletRuntime } from '../src/sponsorship/safe-wallet.js';

const endpoint = 'https://rpc.example.test';
const params = [{ from: '0x' + '1'.repeat(40), value: '0x0' }];
const success = () =>
  Response.json({ jsonrpc: '2.0', id: 'estimate', result: '0x5208' });

afterEach(() => vi.useRealTimers());

describe('infrastructure gas-estimate throttling', () => {
  it('waits after a rate limit and retains the exact read-only request', async () => {
    vi.useFakeTimers();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { 'retry-after': '1' } }),
      )
      .mockResolvedValueOnce(success());
    const pending = estimateInfrastructureGas(
      request,
      endpoint,
      'estimate',
      params,
    );
    await vi.advanceTimersByTimeAsync(999);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).status).toBe(200);
    expect(request).toHaveBeenCalledTimes(2);
    expect(
      request.mock.calls.map((call) => JSON.parse(String(call[1]?.body))),
    ).toEqual(
      Array(2).fill({
        jsonrpc: '2.0',
        id: 'estimate',
        method: 'eth_estimateGas',
        params,
      }),
    );
    expect(
      request.mock.calls.every((call) => call[1]?.redirect === 'error'),
    ).toBe(true);
  });

  it('caps a sustained rate limit at three requests', async () => {
    vi.useFakeTimers();
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(null, { status: 429 }));
    const pending = estimateInfrastructureGas(
      request,
      endpoint,
      'estimate',
      params,
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect((await pending).status).toBe(429);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('honours an HTTP-date retry time and releases the throttled response', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const throttled = new Response('rate limited', {
      status: 429,
      headers: { 'retry-after': 'Thu, 01 Jan 2026 00:00:02 GMT' },
    });
    const cancel = vi.spyOn(throttled.body!, 'cancel');
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(throttled)
      .mockResolvedValueOnce(success());
    const pending = estimateInfrastructureGas(
      request,
      endpoint,
      'estimate',
      params,
    );
    await vi.advanceTimersByTimeAsync(1999);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(cancel).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('returns long backoffs without retrying early', async () => {
    const throttled = new Response(null, {
      status: 429,
      headers: { 'retry-after': '60' },
    });
    const request = vi.fn<typeof fetch>().mockResolvedValue(throttled);
    expect(
      await estimateInfrastructureGas(request, endpoint, 'estimate', params),
    ).toBe(throttled);
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([400, 401, 402, 403, 500, 503])(
    'does not retry HTTP %i',
    async (status) => {
      const response = new Response(null, { status });
      const request = vi.fn<typeof fetch>().mockResolvedValue(response);
      expect(
        await estimateInfrastructureGas(request, endpoint, 'estimate', params),
      ).toBe(response);
      expect(request).toHaveBeenCalledOnce();
    },
  );

  it('does not retry a transport failure', async () => {
    const failure = new Error('test transport failure');
    const request = vi.fn<typeof fetch>().mockRejectedValue(failure);
    await expect(
      estimateInfrastructureGas(request, endpoint, 'estimate', params),
    ).rejects.toBe(failure);
    expect(request).toHaveBeenCalledOnce();
  });

  it('keeps a throttled infrastructure broadcast to one dispatch', async () => {
    const chainId = '0x14a34';
    const genesisHash = '0x' + '2'.repeat(64);
    let broadcasts = 0;
    const request = vi.fn<typeof fetch>(async (_url, init) => {
      const input = JSON.parse(String(init?.body));
      if (input.method === 'eth_sendRawTransaction') {
        broadcasts++;
        return new Response(null, { status: 429 });
      }
      return Response.json({
        jsonrpc: '2.0',
        id: input.id,
        result:
          input.method === 'eth_chainId' ? chainId : { hash: genesisHash },
      });
    });
    const runtime = Object.assign(Object.create(SafeWalletRuntime.prototype), {
      resources: { rpcEndpoints: async () => [endpoint] },
      config: { safeWallet: { genesisHash } },
      domain: { chainId },
      current: vi.fn().mockResolvedValue({}),
      request,
    }) as {
      infrastructureRpc(
        applicationId: string,
        method: string,
        params: unknown[],
      ): Promise<unknown>;
      current: ReturnType<typeof vi.fn>;
    };
    await expect(
      runtime.infrastructureRpc('application', 'eth_sendRawTransaction', [
        '0x00',
      ]),
    ).rejects.toMatchObject({
      code: 'wallet_provider_unavailable',
      outcome: 'unknown',
    });
    expect(broadcasts).toBe(1);
    expect(runtime.current).toHaveBeenCalledOnce();
  });
});
