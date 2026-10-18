import { Wallet, keccak256, toQuantity } from 'ethers';
import {
  safeInterface,
  tokenInterface,
  vaultInterface,
  type ApprovedCallIntent,
  type ApprovedCallPolicy,
} from '../../src/execution/approved-calls.js';
import { offlineCode, type executionFixture } from './execution.js';

/** Ephemeral wire fixture; no sockets or financial effects. */
export function approvedCallsFixture(
  accountId: string,
  owner: string,
  original: ReturnType<typeof executionFixture>,
) {
  const pin = () => ({
    address: Wallet.createRandom().address,
    codeHash: keccak256(offlineCode),
  });
  const policy: ApprovedCallPolicy = {
    mechanism: 'safe-1.4.1',
    accounts: [{ ...pin(), accountId, singleton: pin() }],
    multiSend: pin(),
    maximumNativeValueWei: '10',
    lifetimeOperations: '3',
    contracts: [{ ...pin(), selectors: ['0x12345678'], maximumValueWei: '10' }],
    swaps: [
      {
        id: 'swap',
        router: pin(),
        tokenIn: pin(),
        tokenOut: pin(),
        fee: 3000,
        maximumInput: '100',
      },
    ],
    vaults: [
      {
        id: 'vault',
        router: pin(),
        vault: pin(),
        asset: pin(),
        maximumAssets: '100',
      },
    ],
  };
  const originalRequest = original.request;
  const state = {
    included: false,
    target: policy.accounts[0].address,
    lostResponse: false,
    digest: '',
    data: '',
    intent: undefined as ApprovedCallIntent | undefined,
    posts: 0,
    nonce: '0',
    owner,
    minimumEffects: true,
    safeSuccess: true,
    mutate: undefined as
      | ((method: string, result: unknown, origin: string) => unknown)
      | undefined,
  };
  function logs() {
    const common = {
      removed: false,
      blockHash: original.blockHash,
      blockNumber: '0x65',
      transactionHash: original.transactionHash,
      transactionIndex: '0x0',
    };
    const output = [
      {
        ...common,
        address: state.target,
        ...safeInterface.encodeEventLog(
          safeInterface.getEvent(
            state.safeSuccess ? 'ExecutionSuccess' : 'ExecutionFailure',
          )!,
          [state.digest, 0],
        ),
      },
    ];
    if (state.minimumEffects && state.intent)
      for (const effect of state.intent.effects)
        output.push({
          ...common,
          address: effect.token,
          ...tokenInterface.encodeEventLog(
            tokenInterface.getEvent('Transfer')!,
            [
              effect.from === '*' ? policy.contracts[0].address : effect.from,
              effect.to === '*' ? policy.contracts[0].address : effect.to,
              effect.minimum,
            ],
          ),
        });
    if (state.minimumEffects && state.intent?.input.kind === 'vault-deposit')
      output.push({
        ...common,
        address: state.intent.effects[1].token,
        ...vaultInterface.encodeEventLog(vaultInterface.getEvent('Deposit')!, [
          policy.vaults[0].router.address,
          policy.accounts[0].address,
          state.intent.input.assets,
          state.intent.input.minimum_shares,
        ]),
      });
    return output.map((log, index) => ({
      ...log,
      logIndex: toQuantity(index),
    }));
  }
  const accepted = () => ({
    id: original.transactionId,
    nonce: 0,
    relayer_id: 'sponsor-relayer',
    from: original.configuration.sponsors[0].binding.address,
    to: state.target,
    value: '0x0',
    data: state.data,
    gas_limit: 150000,
    max_fee_per_gas: 3000000000,
    status: state.included ? 'confirmed' : 'submitted',
    hash: original.transactionHash,
  });
  const request = (async (input, options) => {
    const url = new URL(String(input));
    if (
      url.origin === original.configuration.relayer.url &&
      url.pathname.includes('/transactions')
    ) {
      if (options?.method === 'POST') {
        const body = JSON.parse(String(options.body));
        if (
          !policy.accounts.some(
            (account) =>
              account.address.toLowerCase() === body.to.toLowerCase(),
          ) ||
          body.value !== '0x0'
        )
          throw new Error('Invalid fixture dispatch');
        state.posts++;
        state.target = body.to;
        state.data = body.data;
        if (state.lostResponse) throw new Error('Offline response loss');
      }
      return new Response(JSON.stringify({ success: true, data: accepted() }));
    }
    if (
      ![
        'https://primary.example.test',
        'https://secondary.example.test',
      ].includes(url.origin)
    )
      return originalRequest(input, options);
    const { method, params } = JSON.parse(String(options?.body));
    let result: unknown;
    if (method === 'eth_chainId') result = '0x14a34';
    else if (method === 'eth_getCode') result = offlineCode;
    else if (method === 'eth_getBalance') result = '0x10000000000000000';
    else if (method === 'eth_getTransactionCount')
      result = toQuantity(
        params[1] === 'pending'
          ? state.posts
            ? 1
            : 0
          : state.included && BigInt(params[1]) >= 101n
            ? 1
            : 0,
      );
    else if (method === 'eth_getBlockByNumber')
      result =
        params[0] === '0x0'
          ? {
              number: '0x0',
              baseFeePerGas: '0x3b9aca00',
              hash: original.configuration.rpc.genesisHash,
            }
          : {
              baseFeePerGas: '0x3b9aca00',
              number:
                params[0] === 'latest'
                  ? '0x66'
                  : params[0] === '0x65' || state.included
                    ? '0x65'
                    : '0x64',
              hash: original.blockHash,
            };
    else if (method === 'eth_getLogs') result = state.included ? logs() : [];
    else if (method === 'eth_getTransactionByHash')
      result = state.included
        ? {
            hash: original.transactionHash,
            type: '0x2',
            nonce: '0x0',
            gas: '0x249f0',
            maxFeePerGas: '0xb2d05e00',
            maxPriorityFeePerGas: '0x3b9aca00',
            blockHash: original.blockHash,
            blockNumber: '0x65',
            from: original.configuration.sponsors[0].binding.address,
            to: state.target,
            value: '0x0',
            chainId: '0x14a34',
            input: state.data,
          }
        : null;
    else if (method === 'eth_getTransactionReceipt')
      result = state.included
        ? {
            transactionHash: original.transactionHash,
            blockHash: original.blockHash,
            blockNumber: '0x65',
            from: original.configuration.sponsors[0].binding.address,
            to: state.target,
            status: '0x1',
            logs: logs(),
          }
        : null;
    else if (method === 'eth_call') {
      const data = params[0].data;
      if (data === safeInterface.encodeFunctionData('nonce'))
        result = safeInterface.encodeFunctionResult('nonce', [
          state.included ? String(BigInt(state.nonce) + 1n) : state.nonce,
        ]);
      else if (
        data.startsWith(
          safeInterface.getFunction('getModulesPaginated')!.selector,
        )
      )
        result = safeInterface.encodeFunctionResult('getModulesPaginated', [
          [],
          '0x0000000000000000000000000000000000000001',
        ]);
      else if (data === safeInterface.encodeFunctionData('getOwners'))
        result = safeInterface.encodeFunctionResult('getOwners', [
          [state.owner],
        ]);
      else if (data === safeInterface.encodeFunctionData('getThreshold'))
        result = safeInterface.encodeFunctionResult('getThreshold', [1]);
      else if (data === safeInterface.encodeFunctionData('VERSION'))
        result = safeInterface.encodeFunctionResult('VERSION', ['1.4.1']);
      else if (data === safeInterface.encodeFunctionData('masterCopy'))
        result = safeInterface.encodeFunctionResult('masterCopy', [
          policy.accounts[0].singleton.address,
        ]);
      else if (data === vaultInterface.encodeFunctionData('asset'))
        result = vaultInterface.encodeFunctionResult('asset', [
          policy.vaults[0].asset.address,
        ]);
      else if (
        data.startsWith(tokenInterface.getFunction('allowance')!.selector)
      )
        result = tokenInterface.encodeFunctionResult('allowance', [0]);
      else
        result = safeInterface.encodeFunctionResult('execTransaction', [true]);
    } else throw new Error('Unrecognized offline RPC method');
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: state.mutate
          ? state.mutate(method, result, url.origin)
          : result,
      }),
    );
  }) as typeof fetch;
  return { policy, state, request };
}
