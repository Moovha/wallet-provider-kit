import { randomUUID } from 'node:crypto';
import {
  Interface,
  Signature,
  TypedDataEncoder,
  Wallet,
  keccak256,
  toQuantity,
} from 'ethers';
import type {
  ExecutionConfiguration,
  TransferExecutionPlan,
} from '../../src/execution/types.js';
import type { TypedDataAction } from '../../src/domain/signing.js';

const abi = new Interface([
  'function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function authorizationState(address authorizer,bytes32 nonce) view returns (bool)',
  'event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
]);
export const offlineCode = '0x6001600055';

/** Offline JSON-RPC and Relayer wire fixture; no sockets, vendor accounts or chain effects. */
export function executionFixture(
  clientId = 'fixture-application',
  token = Wallet.createRandom().address,
  name = 'Test Token',
  version = '1',
) {
  const sponsor = Wallet.createRandom();
  const configuration: ExecutionConfiguration = {
    profile: 'erc3009-relayer-v1',
    relayer: {
      url: 'https://execution.example.test',
      apiKey: { env: 'EXECUTION_RELAYER_API_KEY' },
    },
    rpc: {
      endpoints: [
        { env: 'EXECUTION_RPC_PRIMARY_URL' },
        { env: 'EXECUTION_RPC_SECONDARY_URL' },
      ],
      genesisHash: '0x' + '1'.repeat(64),
      tokenCodeHash: keccak256(offlineCode),
    },
    sponsors: [
      {
        clientId,
        accountId: randomUUID(),
        binding: {
          relayerId: 'sponsor-relayer',
          signerId: 'sponsor-signer',
          address: sponsor.address,
          bindingRevision: '1',
        },
        fundingAgreement: 'offline-gas-agreement',
        gasLimit: '150000',
        maxFeePerGas: '3000000000',
        maxPriorityFeePerGas: '1000000000',
        l1FeeReserveWei: '1000000000000',
        lifetimeBudgetWei: '10000000000000000',
      },
    ],
    pollIntervalSeconds: 300,
    maxLogRange: 10000,
  };
  const transactionId = randomUUID();
  const transactionHash = '0x' + '2'.repeat(64);
  const blockHash = '0x' + '3'.repeat(64);
  const domain = { name, version, chainId: '84532', verifyingContract: token };
  const state = {
    included: false,
    finality: 'included' as 'included' | 'safe' | 'finalized',
    lostResponse: false,
    transactionStatus: '0x1',
    data: '',
    posts: 0,
    requests: 0,
    mutate: undefined as
      | ((
          method: string,
          result: unknown,
          origin: string,
          params: unknown[],
        ) => unknown)
      | undefined,
    before: undefined as
      ((method: string, origin: string) => Promise<void>) | undefined,
  };
  function events() {
    const parsed = abi.parseTransaction({ data: state.data })!;
    const common = {
      removed: false,
      blockHash,
      blockNumber: '0x65',
      transactionHash,
      transactionIndex: '0x0',
      address: token,
    };
    const authorization = abi.encodeEventLog(
      abi.getEvent('AuthorizationUsed')!,
      [parsed.args.from, parsed.args.nonce],
    );
    const transfer = abi.encodeEventLog(abi.getEvent('Transfer')!, [
      parsed.args.from,
      parsed.args.to,
      parsed.args.value,
    ]);
    return [
      { ...common, ...authorization, logIndex: '0x0' },
      { ...common, ...transfer, logIndex: '0x1' },
    ];
  }
  function transactionRecord() {
    return {
      id: transactionId,
      relayer_id: 'sponsor-relayer',
      from: sponsor.address,
      to: token,
      value: '0x0',
      data: state.data,
      gas_limit: 150000,
      max_fee_per_gas: 3000000000,
      status: state.included ? 'confirmed' : 'submitted',
      hash: transactionHash,
    };
  }
  const request = (async (
    input: string | URL | Request,
    options?: RequestInit,
  ) => {
    state.requests++;
    const url = new URL(String(input));
    if (url.origin === configuration.relayer.url) {
      let result: unknown;
      if (
        url.pathname === '/api/v1/relayers/sponsor-relayer' &&
        options?.method === 'GET'
      )
        result = {
          id: 'sponsor-relayer',
          signer_id: 'sponsor-signer',
          address: sponsor.address,
          network: 'base-sepolia',
          network_type: 'evm',
          paused: false,
          system_disabled: false,
          policies: { gas_limit_estimation: false, gas_price_cap: 3000000000 },
        };
      else if (url.pathname === '/api/v1/networks/evm%3Abase-sepolia')
        result = {
          id: 'evm:base-sepolia',
          name: 'base-sepolia',
          network_type: 'evm',
          chain_id: 84532,
          is_testnet: true,
        };
      else if (
        url.pathname === '/api/v1/relayers/sponsor-relayer/transactions' &&
        options?.method === 'POST'
      ) {
        const body = JSON.parse(String(options.body));
        if (
          body.to.toLowerCase() !== token.toLowerCase() ||
          body.value !== '0x0' ||
          body.gas_limit !== 150000
        )
          throw new Error('Invalid offline execution request');
        state.posts++;
        state.data = body.data;
        if (state.lostResponse) throw new Error('Offline response loss');
        result = transactionRecord();
      } else if (
        url.pathname ===
        '/api/v1/relayers/sponsor-relayer/transactions/' + transactionId
      )
        result = transactionRecord();
      else throw new Error('Unrecognized offline Relayer request');
      return new Response(JSON.stringify({ success: true, data: result }));
    }
    if (
      ![
        'https://primary.example.test',
        'https://secondary.example.test',
      ].includes(url.origin)
    )
      throw new Error('Unrecognized offline RPC origin');
    const body = JSON.parse(String(options?.body));
    await state.before?.(body.method, url.origin);
    let result: unknown;
    const latest = state.included ? 110 : 100;
    switch (body.method) {
      case 'eth_chainId':
        result = toQuantity(84532);
        break;
      case 'eth_getBlockByNumber': {
        const tag = body.params[0];
        const height =
          tag === 'latest'
            ? latest
            : tag === 'safe'
              ? state.finality === 'included'
                ? 100
                : latest
              : tag === 'finalized'
                ? state.finality === 'finalized'
                  ? latest
                  : 90
                : Number(BigInt(tag));
        result = {
          number: toQuantity(height),
          hash: height === 0 ? configuration.rpc.genesisHash : blockHash,
        };
        break;
      }
      case 'eth_getCode':
        result = offlineCode;
        break;
      case 'eth_getBalance':
        result = '0x10000000000000000';
        break;
      case 'eth_call': {
        const data = body.params[0].data;
        if (data.startsWith(abi.getFunction('DOMAIN_SEPARATOR')!.selector))
          result = TypedDataEncoder.hashDomain(domain);
        else if (
          data.startsWith(abi.getFunction('authorizationState')!.selector)
        )
          result = '0x' + '0'.repeat(64);
        else {
          abi.decodeFunctionData('transferWithAuthorization', data);
          result = '0x';
        }
        break;
      }
      case 'eth_getLogs':
        result =
          state.included &&
          state.data &&
          BigInt(body.params[0].fromBlock) <= 101n &&
          BigInt(body.params[0].toBlock) >= 101n
            ? events().slice(0, 1)
            : [];
        break;
      case 'eth_getTransactionByHash':
        result =
          state.included && body.params[0] === transactionHash
            ? {
                hash: transactionHash,
                chainId: toQuantity(84532),
                type: '0x2',
                from: sponsor.address,
                to: token,
                value: '0x0',
                input: state.data,
                blockHash,
                blockNumber: '0x65',
                gas: toQuantity(150000),
                maxFeePerGas: toQuantity(3000000000),
                maxPriorityFeePerGas: toQuantity(1000000000),
              }
            : null;
        break;
      case 'eth_getTransactionReceipt':
        result =
          state.included && body.params[0] === transactionHash
            ? {
                transactionHash,
                from: sponsor.address,
                to: token,
                blockHash,
                blockNumber: '0x65',
                status: state.transactionStatus,
                logs: state.transactionStatus === '0x1' ? events() : [],
              }
            : null;
        break;
      default:
        throw new Error('Unrecognized offline RPC method');
    }
    result = state.mutate
      ? state.mutate(body.method, result, url.origin, body.params)
      : result;
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', id: body.id, result }),
    );
  }) as typeof fetch;
  async function plan(): Promise<TransferExecutionPlan> {
    const owner = Wallet.createRandom();
    const recipient = Wallet.createRandom().address;
    const payload = {
      domain,
      primaryType: 'TransferWithAuthorization',
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
      message: {
        from: owner.address,
        to: recipient,
        value: '100',
        validAfter: '0',
        validBefore: String(Math.floor(Date.now() / 1000) + 300),
        nonce: '0x' + '4'.repeat(64),
      },
    };
    const digest = TypedDataEncoder.hash(
      payload.domain,
      payload.types,
      payload.message,
    );
    const id = randomUUID();
    const action: TypedDataAction = {
      action_id: id,
      operation_id: id,
      kind: 'sign_typed_data',
      profile: 'evm_eoa_v1',
      profile_revision: '1',
      status: 'ready',
      chain_id: 'eip155:84532',
      chain_account_id: `eip155:84532:${owner.address}`,
      binding_revision: '1',
      capability_revision: '1',
      plan_revision: '1',
      plan_hash: digest,
      payload_hash: digest,
      expires_at: new Date(
        Number(payload.message.validBefore) * 1000,
      ).toISOString(),
      dependencies: [],
      payload,
    };
    const signature = Signature.from(
      await owner.signTypedData(payload.domain, payload.types, payload.message),
    );
    const data = abi.encodeFunctionData('transferWithAuthorization', [
      owner.address,
      recipient,
      '100',
      '0',
      payload.message.validBefore,
      payload.message.nonce,
      signature.v,
      signature.r,
      signature.s,
    ]);
    state.data = data.toLowerCase();
    return {
      profile: 'erc3009-relayer-v1',
      revision: '1',
      action,
      sponsor: configuration.sponsors[0],
      configurationHash: 'a'.repeat(64),
      genesisHash: configuration.rpc.genesisHash,
      tokenCodeHash: configuration.rpc.tokenCodeHash,
      data: state.data,
      scanFromBlock: '100',
    };
  }
  return {
    configuration,
    request,
    state,
    plan,
    transactionHash,
    blockHash,
    transactionId,
    sponsor,
  };
}
