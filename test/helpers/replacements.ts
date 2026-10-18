import { keccak256, toUtf8Bytes, toQuantity } from 'ethers';
import { executionFixture } from './execution.js';
import { replacementProviderContract } from '../../src/execution/replacement.js';
/** In-memory provider and independent RPC fixtures; no actual signing or network effects. */
export function replacementWire(
  f = executionFixture(),
  included = () => f.state.included,
) {
  const original = f.request;
  const versions = new Map<string, { fee: string; priority: string }>();
  const state = {
    puts: 0,
    target: f.domain.verifyingContract,
    data: '',
    hash: f.transactionHash,
    fee: '0',
    priority: '0',
    loseAfter: false,
    loseBefore: false,
    contract: true,
    disagree: false,
    beforePut: undefined as (() => Promise<void>) | undefined,
  };
  function replaceHashes(value: unknown): unknown {
    if (value === f.transactionHash) return state.hash;
    if (Array.isArray(value)) return value.map(replaceHashes);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          replaceHashes(entry),
        ]),
      );
    return value;
  }
  const request = (async (input, options) => {
    const url = new URL(String(input));
    if (url.origin === f.configuration.relayer.url) {
      if (options?.method === 'PUT') {
        state.puts++;
        await state.beforePut?.();
        if (state.loseBefore)
          throw new Error('Offline loss before replacement acceptance');
        const body = JSON.parse(String(options.body));
        if (
          body.to.toLowerCase() !== state.target.toLowerCase() ||
          body.data !== state.data ||
          body.gas_limit !== Number(f.configuration.sponsors[0].gasLimit) ||
          BigInt(body.value) !== 0n
        )
          throw new Error('Replacement changed immutable call');
        state.fee = String(body.max_fee_per_gas);
        state.priority = String(body.max_priority_fee_per_gas);
        state.hash = keccak256(toUtf8Bytes(JSON.stringify(body)));
        versions.set(state.hash, { fee: state.fee, priority: state.priority });
        if (state.loseAfter)
          throw new Error('Offline loss after replacement acceptance');
        const current = await original(input, {
          ...options,
          method: 'GET',
          body: undefined,
        });
        const value = (await current.json()) as {
          data: Record<string, unknown>;
        };
        Object.assign(value.data, {
          hash: state.hash,
          nonce: 0,
          max_fee_per_gas: state.fee,
          max_priority_fee_per_gas: state.priority,
        });
        return new Response(JSON.stringify(value));
      }
      if (
        options?.method === 'POST' &&
        url.pathname.endsWith('/transactions')
      ) {
        const body = JSON.parse(String(options.body));
        state.target = body.to;
        state.data = body.data;
        state.fee = String(body.max_fee_per_gas);
        state.priority = String(body.max_priority_fee_per_gas);
        versions.set(state.hash, { fee: state.fee, priority: state.priority });
      }
      const response = await original(input, options);
      const value = (await response.json()) as {
        data: Record<string, unknown>;
      };
      if (
        url.pathname.includes('/transactions/') ||
        (options?.method === 'POST' && url.pathname.endsWith('/transactions'))
      )
        Object.assign(value.data, {
          hash: state.hash,
          nonce: 0,
          max_fee_per_gas: state.fee,
          max_priority_fee_per_gas: state.priority,
        });
      if (url.pathname.endsWith('/relayers/sponsor-relayer'))
        (value.data.policies as Record<string, unknown>).eip1559_pricing = true;
      return new Response(JSON.stringify(value), {
        status: response.status,
        headers: state.contract
          ? { 'x-wpk-relayer-contract': replacementProviderContract }
          : {},
      });
    }
    const body = JSON.parse(String(options?.body));
    if (body.method === 'eth_getTransactionByHash') {
      const hash = String(body.params[0]),
        fees = versions.get(hash);
      const mined = included() && hash === state.hash;
      const result = fees
        ? {
            hash,
            nonce: '0x0',
            from: f.configuration.sponsors[0].binding.address,
            to: state.target,
            value: '0x0',
            input: state.data,
            chainId: '0x14a34',
            type: '0x2',
            gas: toQuantity(BigInt(f.configuration.sponsors[0].gasLimit)),
            maxFeePerGas: toQuantity(
              BigInt(fees.fee) +
                (state.disagree && url.hostname === 'secondary.example.test'
                  ? 1n
                  : 0n),
            ),
            maxPriorityFeePerGas: toQuantity(BigInt(fees.priority)),
            blockHash: mined ? f.blockHash : null,
            blockNumber: mined ? '0x65' : null,
            accessList: [],
          }
        : null;
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', id: body.id, result }),
      );
    }
    if (
      body.method === 'eth_getTransactionReceipt' &&
      body.params[0] !== state.hash
    )
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', id: body.id, result: null }),
      );
    const forwarded =
      body.method === 'eth_getTransactionReceipt'
        ? {
            ...options,
            body: JSON.stringify({ ...body, params: [f.transactionHash] }),
          }
        : options;
    const response = await original(input, forwarded);
    const value: unknown = await response.json();
    return new Response(
      JSON.stringify(included() ? replaceHashes(value) : value),
    );
  }) as typeof fetch;
  return { f, state, request };
}
