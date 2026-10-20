import { randomUUID } from 'node:crypto';
import { WalletProviderError } from '../domain/signing.js';
import { text, uuid } from '../onboarding/policy.js';
import { record } from '../domain/json.js';
import {
  maximumUserOperationCostV07,
  normalizeUserOperationV07,
  normalizeUserOperationDomainV07,
  operationAddress,
  operationBytes,
  operationQuantity,
  type UserOperationV07,
  type UserOperationDomainV07,
} from './user-operation.js';

export interface PaymasterContext {
  applicationId: string;
  policyRevision: string;
  policyHash: string;
  actionId: string;
  policyId?: string;
}
export interface PaymasterDataV07 {
  paymaster: string;
  paymasterData: string;
  paymasterVerificationGasLimit: string;
  paymasterPostOpGasLimit: string;
}
export interface PaymasterStubV07 extends PaymasterDataV07 {
  isFinal: boolean;
  sponsor?: { name: string };
}
export interface PaymasterClientOptionsV07 {
  url: string;
  domain: UserOperationDomainV07;
  paymaster: string;
  maximumVerificationGas: string;
  maximumPostOpGas: string;
  maximumCostWei: string;
  l1FeeReserveWei: string;
  /** Server-owned credential supplier; never use an application-provided URL or secret. */
  authorization(): Promise<string>;
  /** Trusted host gate. Both methods can issue usable sponsorship. Require a durable worst-case reservation and fresh owner/grant/consent/claim authority. */
  authorizeRequest(request: {
    method: 'pm_getPaymasterStubData' | 'pm_getPaymasterData';
    operation: UserOperationV07;
    domain: UserOperationDomainV07;
    context: PaymasterContext;
    maximumCostWei: string;
  }): Promise<boolean>;
}
function contextValue(value: PaymasterContext): PaymasterContext {
  if (
    !record(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          'applicationId',
          'policyRevision',
          'policyHash',
          'actionId',
          'policyId',
        ].includes(key),
    ) ||
    !/^[0-9a-f]{64}$/.test(value.applicationId) ||
    !/^[1-9][0-9]{0,19}$/.test(value.policyRevision) ||
    !/^[0-9a-f]{64}$/.test(value.policyHash) ||
    !uuid.test(value.actionId) ||
    (value.policyId !== undefined && !text(value.policyId, 128))
  )
    throw new WalletProviderError('wallet_provider_input');
  return structuredClone(value);
}
/** ERC-7677 transport for trusted embedded hosts. No public sponsorship endpoint or automatic retry. */
export function createPaymasterClientV07(
  options: PaymasterClientOptionsV07,
  request: typeof fetch = fetch,
) {
  if (!options || typeof options !== 'object')
    throw new WalletProviderError('wallet_provider_configuration');
  const authorization = options.authorization,
    authorizeRequest = options.authorizeRequest;
  let url: string, domain: UserOperationDomainV07, paymaster: string;
  let maximumVerificationGas: string, maximumPostOpGas: string;
  const maximumCostWei = options.maximumCostWei,
    l1FeeReserveWei = options.l1FeeReserveWei;
  try {
    const parsed = new URL(options.url);
    if (
      !text(options.url, 2048) ||
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      typeof authorization !== 'function' ||
      typeof authorizeRequest !== 'function' ||
      process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
    )
      throw new Error();
    url = parsed.href;
    domain = normalizeUserOperationDomainV07(options.domain);
    paymaster = operationAddress(options.paymaster);
    maximumVerificationGas = operationQuantity(options.maximumVerificationGas);
    maximumPostOpGas = operationQuantity(options.maximumPostOpGas);
    if (
      BigInt(maximumVerificationGas) === 0n ||
      BigInt(maximumPostOpGas) === 0n ||
      typeof maximumCostWei !== 'string' ||
      !/^[1-9][0-9]{0,77}$/.test(maximumCostWei) ||
      BigInt(maximumCostWei) >= 2n ** 256n ||
      typeof l1FeeReserveWei !== 'string' ||
      !/^(0|[1-9][0-9]{0,77})$/.test(l1FeeReserveWei) ||
      BigInt(l1FeeReserveWei) >= 2n ** 256n
    )
      throw new Error();
  } catch {
    throw new WalletProviderError('wallet_provider_configuration');
  }
  async function call(
    method: 'pm_getPaymasterStubData' | 'pm_getPaymasterData',
    input: UserOperationV07,
    inputContext: PaymasterContext,
  ): Promise<PaymasterStubV07> {
    const operation = normalizeUserOperationV07(input),
      context = contextValue(inputContext);
    if (
      operation.paymaster &&
      (operation.paymaster !== paymaster ||
        BigInt(operation.paymasterVerificationGasLimit!) >
          BigInt(maximumVerificationGas) ||
        BigInt(operation.paymasterPostOpGasLimit!) > BigInt(maximumPostOpGas))
    )
      throw new WalletProviderError('wallet_authorization_denied');
    if (
      method === 'pm_getPaymasterData' &&
      [
        operation.callGasLimit,
        operation.verificationGasLimit,
        operation.preVerificationGas,
        operation.maxFeePerGas,
      ].some((value) => BigInt(value) === 0n)
    )
      throw new WalletProviderError('wallet_provider_input');
    const liability = maximumUserOperationCostV07(
      {
        ...operation,
        paymaster,
        paymasterData: operation.paymasterData ?? '0x',
        paymasterVerificationGasLimit: maximumVerificationGas,
        paymasterPostOpGasLimit: maximumPostOpGas,
      },
      l1FeeReserveWei,
    );
    if (BigInt(liability) > BigInt(maximumCostWei))
      throw new WalletProviderError('wallet_authorization_denied');
    let credential: string;
    try {
      credential = await authorization();
    } catch {
      throw new WalletProviderError('wallet_provider_configuration');
    }
    if (!/^Bearer [\x21-\x7e]{1,4096}$/.test(credential))
      throw new WalletProviderError('wallet_provider_configuration');
    let allowed: boolean;
    try {
      allowed = await authorizeRequest({
        method,
        operation: structuredClone(operation),
        domain: structuredClone(domain),
        context: structuredClone(context),
        maximumCostWei: liability,
      });
    } catch (error) {
      if (error instanceof WalletProviderError) throw error;
      throw new WalletProviderError('wallet_attempt_unavailable');
    }
    if (allowed !== true)
      throw new WalletProviderError('wallet_authorization_denied');
    const id = randomUUID();
    const outcome = 'unknown' as const;
    try {
      const response = await request(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        headers: {
          authorization: credential,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          params: [operation, domain.entryPoint, domain.chainId, context],
        }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new WalletProviderError('wallet_provider_unavailable', outcome);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 32768) throw new Error();
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      const envelope: unknown = JSON.parse(
        Buffer.concat(chunks).toString('utf8'),
      );
      if (
        !record(envelope) ||
        envelope.jsonrpc !== '2.0' ||
        envelope.id !== id ||
        Object.keys(envelope).some(
          (key) => !['jsonrpc', 'id', 'result', 'error'].includes(key),
        ) ||
        !record(envelope.result) ||
        envelope.error !== undefined
      )
        throw new WalletProviderError('wallet_provider_response', outcome);
      const result = envelope.result;
      if (
        Object.keys(result).some(
          (key) =>
            ![
              'paymaster',
              'paymasterData',
              'paymasterVerificationGasLimit',
              'paymasterPostOpGasLimit',
              'isFinal',
              'sponsor',
            ].includes(key),
        ) ||
        (result.isFinal !== undefined && typeof result.isFinal !== 'boolean')
      )
        throw new Error();
      const selected: PaymasterStubV07 = {
        paymaster: operationAddress(result.paymaster),
        paymasterData: operationBytes(result.paymasterData, 4096),
        paymasterVerificationGasLimit: operationQuantity(
          result.paymasterVerificationGasLimit ??
            (method === 'pm_getPaymasterData'
              ? operation.paymasterVerificationGasLimit
              : undefined),
        ),
        paymasterPostOpGasLimit: operationQuantity(
          result.paymasterPostOpGasLimit ??
            (method === 'pm_getPaymasterData'
              ? operation.paymasterPostOpGasLimit
              : undefined),
        ),
        isFinal: method === 'pm_getPaymasterData' || result.isFinal === true,
      };
      if (
        selected.paymaster !== paymaster ||
        BigInt(selected.paymasterVerificationGasLimit) >
          BigInt(maximumVerificationGas) ||
        BigInt(selected.paymasterPostOpGasLimit) > BigInt(maximumPostOpGas) ||
        BigInt(selected.paymasterVerificationGasLimit) === 0n ||
        BigInt(selected.paymasterPostOpGasLimit) === 0n
      )
        throw new Error();
      if (result.sponsor !== undefined) {
        if (
          !record(result.sponsor) ||
          !text(result.sponsor.name, 128) ||
          Object.keys(result.sponsor).some(
            (key) => !['name', 'icon'].includes(key),
          ) ||
          (result.sponsor.icon !== undefined &&
            (typeof result.sponsor.icon !== 'string' ||
              result.sponsor.icon.length > 8192 ||
              !/^data:image\/(?:png|webp|svg\+xml);base64,[a-zA-Z0-9+/]+=*$/.test(
                result.sponsor.icon,
              )))
        )
          throw new Error();
        // Icons are deliberately discarded; the transport never fetches or renders provider media.
        selected.sponsor = { name: result.sponsor.name };
      }
      return selected;
    } catch (error) {
      if (
        error instanceof WalletProviderError &&
        ['wallet_provider_unavailable', 'wallet_provider_response'].includes(
          error.code,
        )
      )
        throw error;
      throw new WalletProviderError('wallet_provider_response', outcome);
    }
  }
  return {
    stub: (operation: UserOperationV07, context: PaymasterContext) =>
      call('pm_getPaymasterStubData', operation, context),
    data: (operation: UserOperationV07, context: PaymasterContext) =>
      call('pm_getPaymasterData', operation, context),
  };
}
