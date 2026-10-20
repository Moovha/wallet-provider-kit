import { rpcCapacity } from '../execution/rpc-capacity.js';
import { randomUUID } from 'node:crypto';
import { concat, toBeHex } from 'ethers';
import { WalletProviderError } from '../domain/signing.js';
import { record } from '../providers/relayer-client.js';
import {
  normalizeUserOperationV07,
  normalizeUserOperationDomainV07,
  userOperationHashV07,
  type UserOperationV07,
  type UserOperationDomainV07,
} from './user-operation.js';

export type SignedUserOperationV07 = UserOperationV07 & { signature: string };
export function checkedSignedUserOperation(
  input: SignedUserOperationV07,
): SignedUserOperationV07 {
  const { signature, ...unsigned } = input;
  if (typeof signature !== 'string' || !/^0x[0-9a-f]{154}$/.test(signature))
    throw new WalletProviderError('wallet_provider_input');
  return { ...normalizeUserOperationV07(unsigned), signature };
}
export function signedUserOperationHash(
  input: SignedUserOperationV07,
  domain: UserOperationDomainV07,
) {
  const { signature: _, ...unsigned } = checkedSignedUserOperation(input);
  return userOperationHashV07(unsigned, domain);
}
/** Packed EntryPoint v0.7 tuple; signatures are compared as well as the operation hash. */
export function packedUserOperation(input: SignedUserOperationV07) {
  const op = checkedSignedUserOperation(input);
  const pair = (a: string, b: string) =>
    concat([toBeHex(BigInt(a), 16), toBeHex(BigInt(b), 16)]);
  return {
    sender: op.sender,
    nonce: op.nonce,
    initCode: '0x',
    callData: op.callData,
    accountGasLimits: pair(op.verificationGasLimit, op.callGasLimit),
    preVerificationGas: op.preVerificationGas,
    gasFees: pair(op.maxPriorityFeePerGas, op.maxFeePerGas),
    paymasterAndData: op.paymaster
      ? concat([
          op.paymaster,
          pair(op.paymasterVerificationGasLimit!, op.paymasterPostOpGasLimit!),
          op.paymasterData!,
        ])
      : '0x',
    signature: op.signature,
  };
}
export interface BundlerConfigurationV07 {
  profile: 'safe4337-bundler-v07';
  url: string;
  maxLogRange: number;
}
export function validateBundlerConfiguration(config: BundlerConfigurationV07) {
  try {
    if (
      !config ||
      Object.keys(config).sort().join(',') !== 'maxLogRange,profile,url'
    )
      throw new Error();
    const url = new URL(config.url);
    if (
      config.profile !== 'safe4337-bundler-v07' ||
      config.url.length > 2048 ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' ||
      !Number.isInteger(config.maxLogRange) ||
      config.maxLogRange < 100 ||
      config.maxLogRange > 10000
    )
      throw new Error();
  } catch {
    throw new WalletProviderError('wallet_provider_configuration');
  }
}
/** Fixed trusted bundler. No retries or URL selection from wallet calls. */
export function createBundlerClientV07(
  config: BundlerConfigurationV07,
  domain: UserOperationDomainV07,
  authorization: () => Promise<string>,
  request: typeof fetch = fetch,
) {
  config = structuredClone(config);
  domain = normalizeUserOperationDomainV07(domain);
  validateBundlerConfiguration(config);
  if (typeof authorization !== 'function')
    throw new WalletProviderError('wallet_provider_configuration');
  async function call(
    method:
      | 'eth_chainId'
      | 'eth_supportedEntryPoints'
      | 'eth_sendUserOperation'
      | 'eth_getUserOperationReceipt',
    params: unknown[],
    authorizeEffect?: () => Promise<void>,
  ) {
    const mutation = method === 'eth_sendUserOperation';
    let credential: string;
    try {
      credential = await authorization();
    } catch {
      throw new WalletProviderError('wallet_provider_configuration');
    }
    if (
      typeof credential !== 'string' ||
      !/^Bearer [\x21-\x7e]{1,4096}$/.test(credential)
    )
      throw new WalletProviderError('wallet_provider_configuration');
    if (mutation) {
      if (!authorizeEffect)
        throw new WalletProviderError('wallet_authorization_denied');
      await authorizeEffect();
    }
    const id = randomUUID();
    try {
      const response = await request(config.url, {
        method: 'POST',
        headers: {
          authorization: credential,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error();
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 262144) throw new Error();
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (
        !record(value) ||
        value.jsonrpc !== '2.0' ||
        value.id !== id ||
        Object.keys(value).some(
          (k) => !['jsonrpc', 'id', 'result', 'error'].includes(k),
        ) ||
        !Object.hasOwn(value, 'result') ||
        Object.hasOwn(value, 'error')
      )
        throw new Error();
      return value.result;
    } catch {
      rpcCapacity(request, config.url).invalidateGenesis();
      throw new WalletProviderError(
        'wallet_provider_unavailable',
        mutation ? 'unknown' : 'not_dispatched',
      );
    }
  }
  async function checkReady() {
    const [chain, entries] = await Promise.all([
      call('eth_chainId', []),
      call('eth_supportedEntryPoints', []),
    ]);
    if (
      chain !== domain.chainId ||
      !Array.isArray(entries) ||
      entries.length > 16 ||
      !entries.every(
        (e) => typeof e === 'string' && /^0x[0-9a-fA-F]{40}$/.test(e),
      ) ||
      !entries.some((e) => e.toLowerCase() === domain.entryPoint.toLowerCase())
    )
      throw new WalletProviderError('wallet_provider_configuration');
  }
  async function ready() {
    return rpcCapacity(request, config.url).verifyGenesis(
      JSON.stringify(['bundler-v07', domain]),
      checkReady,
    );
  }
  return {
    ready,
    async send(
      input: SignedUserOperationV07,
      authorizeEffect: () => Promise<void>,
    ) {
      const operation = checkedSignedUserOperation(input),
        hash = signedUserOperationHash(operation, domain);
      await ready();
      const result = await call(
        'eth_sendUserOperation',
        [operation, domain.entryPoint],
        authorizeEffect,
      );
      if (result !== hash)
        throw new WalletProviderError('wallet_provider_response', 'unknown');
      return hash;
    },
    async transactionHint(hash: string): Promise<string | undefined> {
      if (!/^0x[0-9a-f]{64}$/.test(hash))
        throw new WalletProviderError('wallet_provider_input');
      const result = await call('eth_getUserOperationReceipt', [hash]);
      if (result === null) return undefined;
      if (
        !record(result) ||
        result.userOpHash !== hash ||
        !record(result.receipt) ||
        typeof result.receipt.transactionHash !== 'string' ||
        !/^0x[0-9a-f]{64}$/.test(result.receipt.transactionHash)
      )
        throw new WalletProviderError('wallet_provider_response');
      return result.receipt.transactionHash;
    },
  };
}
