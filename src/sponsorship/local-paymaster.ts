import {
  AbiCoder,
  concat,
  getBytes,
  keccak256,
  recoverAddress,
  hashMessage,
  Signature,
  solidityPacked,
  toBeHex,
  zeroPadValue,
} from 'ethers';
import { WalletProviderError } from '../domain/signing.js';
import {
  normalizeUserOperationV07,
  normalizeUserOperationDomainV07,
  maximumUserOperationCostV07,
  operationAddress,
  operationQuantity,
  type UserOperationV07,
} from './user-operation.js';
import { packedUserOperation } from './bundler.js';
import type {
  PaymasterContext,
  PaymasterClientOptionsV07,
} from './paymaster.js';
import {
  localPaymasterCreationCode,
  localPaymasterRuntimeTemplate,
  localPaymasterImmutableReferences,
} from './local-paymaster-contract.generated.js';

/** Internal transport identity; this address is never resolved over the network. */
export const localPaymasterUrl =
  'https://local-paymaster.wallet-provider-kit.invalid/v07';
export const singletonPaymasterSource =
  '1e2305d1102242379b582142f62bd17add12b8c2';

/** Exact constructor payload and runtime pin for a new application-owned upstream paymaster. */
export function localPaymasterDeployment(
  entryPoint: string,
  owner: string,
  manager: string,
  signer: string,
) {
  const addresses = [entryPoint, owner, manager, signer].map(operationAddress);
  const constants: Record<string, string> = {
    entryPoint: zeroPadValue(addresses[0], 32),
    PAYMASTER_DATA_OFFSET: toBeHex(52, 32),
    VERIFYING_MODE: toBeHex(0, 32),
    ERC20_MODE: toBeHex(1, 32),
    MODE_AND_ALLOW_ALL_BUNDLERS_LENGTH: toBeHex(1, 32),
    ERC20_PAYMASTER_DATA_LENGTH: toBeHex(117, 32),
    VERIFYING_PAYMASTER_DATA_LENGTH: toBeHex(12, 32),
  };
  const runtime = getBytes(localPaymasterRuntimeTemplate);
  for (const reference of localPaymasterImmutableReferences) {
    const value = constants[reference.name];
    if (!value) throw new WalletProviderError('wallet_provider_configuration');
    for (const location of reference.locations) {
      if (location.length !== 32)
        throw new WalletProviderError('wallet_provider_configuration');
      runtime.set(getBytes(value), location.start);
    }
  }
  return {
    data: concat([
      localPaymasterCreationCode,
      AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'address', 'address[]'],
        [...addresses.slice(0, 3), [addresses[3]]],
      ),
    ]),
    runtimeCodeHash: keccak256(runtime),
  };
}

export interface LocalPaymasterAuthorization {
  method: 'pm_getPaymasterStubData' | 'pm_getPaymasterData';
  operation: UserOperationV07;
  context: PaymasterContext;
  maximumCostWei: string;
}
export interface LocalVerifyingPaymasterOptions {
  domain: PaymasterClientOptionsV07['domain'];
  paymaster: string;
  signer: string;
  maximumVerificationGas: string;
  maximumPostOpGas: string;
  maximumCostWei: string;
  l1FeeReserveWei: string;
  maximumValiditySeconds?: number;
  /** Resolve current persisted authority and the already claimed sponsorship phase. */
  authorize(
    request: LocalPaymasterAuthorization,
  ): Promise<{ validAfter: string; validUntil: string } | null>;
  /** Protected infrastructure signer. Sign the EIP-191 digest of these exact hash bytes. */
  sign(hash: string, request: LocalPaymasterAuthorization): Promise<string>;
}

/** Hash used by the pinned upstream SingletonPaymasterV7 verifying mode. */
export function localPaymasterHashV07(
  operation: UserOperationV07,
  chainId: string,
): string {
  const normalized = normalizeUserOperationV07(operation);
  if (
    !normalized.paymaster ||
    !normalized.paymasterData ||
    getBytes(normalized.paymasterData).length !== 78 ||
    getBytes(normalized.paymasterData)[0] !== 1
  )
    throw new WalletProviderError('wallet_provider_input');
  const packed = packedUserOperation({
    ...normalized,
    signature: '0x' + '00'.repeat(77),
  });
  const encoded = AbiCoder.defaultAbiCoder().encode(
    [
      'address',
      'uint256',
      'bytes32',
      'uint256',
      'bytes32',
      'bytes32',
      'bytes32',
      'bytes32',
    ],
    [
      packed.sender,
      packed.nonce,
      packed.accountGasLimits,
      packed.preVerificationGas,
      packed.gasFees,
      keccak256(packed.initCode),
      keccak256(packed.callData),
      keccak256(getBytes(packed.paymasterAndData).slice(0, 65)),
    ],
  );
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'uint256'],
      [keccak256(encoded), BigInt(chainId)],
    ),
  );
}

/** In-process ERC-7677 transport for an application-owned paymaster; all other requests use the supplied transport. */
export function createLocalPaymasterTransport(
  options: LocalVerifyingPaymasterOptions,
  fallback: typeof fetch = fetch,
): typeof fetch {
  const { authorize, sign, ...input } = options;
  const config = structuredClone(input);
  try {
    config.paymaster = operationAddress(config.paymaster);
    config.signer = operationAddress(config.signer);
    config.domain = normalizeUserOperationDomainV07(config.domain);
    config.maximumVerificationGas = operationQuantity(
      config.maximumVerificationGas,
    );
    config.maximumPostOpGas = operationQuantity(config.maximumPostOpGas);
    if (
      typeof authorize !== 'function' ||
      typeof sign !== 'function' ||
      !/^[1-9][0-9]{0,77}$/.test(config.maximumCostWei) ||
      BigInt(config.maximumCostWei) >= 2n ** 256n ||
      !/^(0|[1-9][0-9]{0,77})$/.test(config.l1FeeReserveWei) ||
      !Number.isInteger(config.maximumValiditySeconds ?? 300) ||
      (config.maximumValiditySeconds ?? 300) < 1 ||
      (config.maximumValiditySeconds ?? 300) > 3600
    )
      throw new Error();
  } catch {
    throw new WalletProviderError('wallet_provider_configuration');
  }
  return (async (url, init) => {
    if (String(url) !== localPaymasterUrl) return fallback(url, init);
    try {
      if (
        init?.method !== 'POST' ||
        typeof init.body !== 'string' ||
        Buffer.byteLength(init.body) > 32768
      )
        throw new Error();
      const body = JSON.parse(init.body) as {
        jsonrpc: string;
        id: string;
        method: LocalPaymasterAuthorization['method'];
        params: unknown[];
      };
      if (
        body.jsonrpc !== '2.0' ||
        typeof body.id !== 'string' ||
        !['pm_getPaymasterStubData', 'pm_getPaymasterData'].includes(
          body.method,
        ) ||
        !Array.isArray(body.params) ||
        body.params.length !== 4 ||
        body.params[1] !== config.domain.entryPoint ||
        body.params[2] !== config.domain.chainId
      )
        throw new Error();
      const operation = normalizeUserOperationV07(
        body.params[0] as UserOperationV07,
      );
      if (
        operation.paymaster &&
        operation.paymaster.toLowerCase() !== config.paymaster.toLowerCase()
      )
        throw new Error();
      const fields = {
        paymaster: config.paymaster,
        paymasterVerificationGasLimit: operationQuantity(
          config.maximumVerificationGas,
        ),
        paymasterPostOpGasLimit: operationQuantity(config.maximumPostOpGas),
      };
      const maximumCostWei = maximumUserOperationCostV07(
        { ...operation, ...fields, paymasterData: '0x' },
        config.l1FeeReserveWei,
      );
      if (BigInt(maximumCostWei) > BigInt(config.maximumCostWei))
        throw new Error();
      const request: LocalPaymasterAuthorization = {
        method: body.method,
        operation,
        context: body.params[3] as PaymasterContext,
        maximumCostWei,
      };
      const validity = await authorize(structuredClone(request));
      if (
        !validity ||
        ![validity.validAfter, validity.validUntil].every(
          (v) => /^(0|[1-9][0-9]{0,14})$/.test(v) && BigInt(v) < 2n ** 48n,
        ) ||
        BigInt(validity.validUntil) <= BigInt(Math.floor(Date.now() / 1000)) ||
        BigInt(validity.validAfter) > BigInt(Math.floor(Date.now() / 1000)) ||
        BigInt(validity.validUntil) <= BigInt(validity.validAfter) ||
        BigInt(validity.validUntil) >
          BigInt(
            Math.floor(Date.now() / 1000) +
              (config.maximumValiditySeconds ?? 300),
          )
      )
        throw new Error();
      // Mode zero, unrestricted bundlers: the low bit is allowAllBundlers.
      const prefix = solidityPacked(
        ['uint8', 'uint48', 'uint48'],
        [1, validity.validUntil, validity.validAfter],
      );
      const placeholder = concat(['0x' + '00'.repeat(64), '0x1b']);
      let paymasterData = concat([prefix, placeholder]);
      const hash = localPaymasterHashV07(
        { ...operation, ...fields, paymasterData },
        config.domain.chainId,
      );
      const signature = Signature.from(
        await sign(hash, structuredClone(request)),
      ).serialized;
      if (
        recoverAddress(hashMessage(getBytes(hash)), signature).toLowerCase() !==
        config.signer.toLowerCase()
      )
        throw new Error();
      paymasterData = concat([prefix, signature]);
      return Response.json({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          ...fields,
          paymasterData,
          ...(body.method === 'pm_getPaymasterStubData'
            ? { isFinal: true }
            : {}),
        },
      });
    } catch {
      throw new WalletProviderError('wallet_provider_unavailable', 'unknown');
    }
  }) as typeof fetch;
}
