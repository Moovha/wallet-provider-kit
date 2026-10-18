import { describe, it, expect } from 'vitest';
import {
  createBundlerClientV07,
  type SignedUserOperationV07,
} from '../src/sponsorship/index.js';
const configuration = {
  profile: 'safe4337-bundler-v07' as const,
  url: 'https://bundler.example.test/rpc',
  maxLogRange: 100,
};
const domain = {
  chainId: '0x14a34' as const,
  entryPointVersion: '0.7' as const,
  entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
};
const operation: SignedUserOperationV07 = {
  sender: '0x1111111111111111111111111111111111111111',
  nonce: '0x0',
  callData: '0x',
  callGasLimit: '0x1',
  verificationGasLimit: '0x1',
  preVerificationGas: '0x1',
  maxFeePerGas: '0x2',
  maxPriorityFeePerGas: '0x1',
  signature: '0x' + '11'.repeat(77),
};
describe('fixed bundler transport', () => {
  it.each(['wrong-id', 'rpc-error', 'large', 'lost', 'wrong-hash'])(
    'retains an uncertain single dispatch for %s',
    async (mode) => {
      let sends = 0,
        guards = 0;
      const request = (async (url, options) => {
        expect(String(url)).toBe(configuration.url);
        expect(options?.redirect).toBe('error');
        expect(options?.credentials).toBe('omit');
        const body = JSON.parse(String(options?.body));
        if (body.method === 'eth_chainId')
          return Response.json({
            jsonrpc: '2.0',
            id: body.id,
            result: domain.chainId,
          });
        if (body.method === 'eth_supportedEntryPoints')
          return Response.json({
            jsonrpc: '2.0',
            id: body.id,
            result: [domain.entryPoint],
          });
        expect(body.method).toBe('eth_sendUserOperation');
        sends++;
        if (mode === 'lost') throw new Error('private upstream detail');
        if (mode === 'large') return new Response(' '.repeat(262145));
        return Response.json({
          jsonrpc: '2.0',
          id: mode === 'wrong-id' ? 'unrelated' : body.id,
          ...(mode === 'rpc-error'
            ? { error: { code: -32500, message: 'private upstream detail' } }
            : { result: '0x' + '00'.repeat(32) }),
        });
      }) as typeof fetch;
      const client = createBundlerClientV07(
        configuration,
        domain,
        async () => 'Bearer offline',
        request,
      );
      await expect(
        client.send(operation, async () => {
          guards++;
        }),
      ).rejects.toMatchObject({ outcome: 'unknown' });
      expect(sends).toBe(1);
      expect(guards).toBe(1);
    },
  );
  it('checks fresh authority after readiness and before dispatch', async () => {
    let sends = 0;
    const request = (async (_url, options) => {
      const b = JSON.parse(String(options?.body));
      if (b.method === 'eth_sendUserOperation') sends++;
      return Response.json({
        jsonrpc: '2.0',
        id: b.id,
        result:
          b.method === 'eth_chainId' ? domain.chainId : [domain.entryPoint],
      });
    }) as typeof fetch;
    const client = createBundlerClientV07(
      configuration,
      domain,
      async () => 'Bearer offline',
      request,
    );
    await expect(
      client.send(operation, async () => {
        throw new Error('Denied');
      }),
    ).rejects.toThrow('Denied');
    expect(sends).toBe(0);
  });
  it.each([
    'http://bundler.example.test',
    'https://user:password@bundler.example.test',
    'https://bundler.example.test?credential=x',
  ])('rejects unsafe fixed URL %s', (url) => {
    expect(() =>
      createBundlerClientV07(
        { ...configuration, url },
        domain,
        async () => 'Bearer offline',
      ),
    ).toThrow();
  });
});
