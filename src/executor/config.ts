import { validateOperations } from '../execution/operations.js';
import {
  validateApprovedCallPolicy,
  type ApprovedCallPolicy,
} from '../execution/approved-calls.js';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Ajv } from 'ajv';
import { getAddress } from 'ethers';
import schema from '../../spec/execution-service.config.schema.json' with { type: 'json' };
import {
  ConfigurationError,
  type ProviderConfiguration,
  type SecretReference,
} from '../deployment/config.js';
import type {
  ExecutionConfiguration,
  ExecutionSponsor,
} from '../execution/types.js';
import type { TransferPolicy } from '../deployment/actions.js';
import {
  serviceOrigin,
  type ServicePeer,
  type ServiceSigningKey,
} from './auth.js';

export interface ExecutorProviderConfiguration {
  id: string;
  revision: string;
  kind: 'openzeppelin-relayer' | 'custom';
  relayer?: { url: string; apiKey: SecretReference };
  module?: string;
  options?: Record<string, unknown>;
  rpc: ExecutionConfiguration['rpc'];
  token?: TransferPolicy['token'];
  contractCalls?: ApprovedCallPolicy;
  sponsors: ExecutionSponsor[];
  sponsorPool?: ExecutionConfiguration['sponsorPool'];
  recovery?: ExecutionConfiguration['recovery'];
}
export interface ExecutionServiceConfiguration {
  configVersion: 1;
  profile: 'execution-service-v1';
  origin: string;
  binding: string;
  storage: { kind: 'sqlite'; directory: string };
  signing: ServiceSigningKey;
  callers: (ServicePeer & { providers: string[] })[];
  providers: ExecutorProviderConfiguration[];
  operations?: import('../execution/operations.js').OperationsConfiguration;
  activation: {
    enabled: boolean;
    providerAcceptance?: string;
    recoveryAcceptance?: string;
    authenticationAcceptance?: string;
  };
  http?: ProviderConfiguration['http'];
}
const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
export function validateExecutionServiceConfiguration(
  input: unknown,
): ExecutionServiceConfiguration {
  if (!validate(input))
    throw new ConfigurationError(
      (validate.errors ?? []).map(
        (error) => `${error.instancePath || '/'}: ${error.keyword}`,
      ),
    );
  const config = structuredClone(
    input,
  ) as unknown as ExecutionServiceConfiguration;
  try {
    if (config.operations) validateOperations(config.operations);
    serviceOrigin(config.origin);
    if (
      config.activation.enabled &&
      (!config.activation.providerAcceptance?.trim() ||
        !config.activation.recoveryAcceptance?.trim() ||
        !config.activation.authenticationAcceptance?.trim())
    )
      throw new Error();
    if (
      new Set(
        config.providers.map(
          (provider) => provider.id + ':' + provider.revision,
        ),
      ).size !== config.providers.length ||
      new Set(config.callers.map((caller) => caller.origin)).size !==
        config.callers.length
    )
      throw new Error();
    for (const caller of config.callers) {
      serviceOrigin(caller.origin);
      if (
        caller.origin === config.origin ||
        new Set(caller.keys.map((key) => key.id)).size !== caller.keys.length ||
        caller.providers.some(
          (id) => !config.providers.some((provider) => provider.id === id),
        )
      )
        throw new Error();
    }
    const sponsorAddresses = new Map<string, string>();
    for (const provider of config.providers) {
      if (provider.relayer) serviceOrigin(provider.relayer.url);
      if (provider.contractCalls)
        validateApprovedCallPolicy(provider.contractCalls);
      if (
        /^0x0{64}$/.test(provider.rpc.genesisHash) ||
        (provider.token &&
          (!provider.rpc.tokenCodeHash ||
            /^0x0{64}$/.test(provider.rpc.tokenCodeHash))) ||
        new Set(provider.rpc.endpoints.map((endpoint) => endpoint.env)).size !==
          provider.rpc.endpoints.length
      )
        throw new Error();
      if (!provider.token && !provider.contractCalls) throw new Error();
      if (provider.token) {
        provider.token.address = getAddress(provider.token.address);
        if (/^0x0{40}$/i.test(provider.token.address)) throw new Error();
      }
      if (
        (!provider.sponsorPool &&
          new Set(provider.sponsors.map((sponsor) => sponsor.clientId)).size !==
            provider.sponsors.length) ||
        new Set(provider.sponsors.map((sponsor) => sponsor.accountId)).size !==
          provider.sponsors.length ||
        new Set(
          provider.sponsors.map((sponsor) =>
            sponsor.binding.address.toLowerCase(),
          ),
        ).size !== provider.sponsors.length
      )
        throw new Error();
      if (provider.kind === 'openzeppelin-relayer')
        for (const field of ['relayerId', 'signerId'] as const)
          if (
            new Set(provider.sponsors.map((sponsor) => sponsor.binding[field]))
              .size !== provider.sponsors.length
          )
            throw new Error();
      for (const sponsor of provider.sponsors) {
        const binding = sponsor.binding;
        sponsor.binding =
          provider.kind === 'openzeppelin-relayer'
            ? {
                relayerId: binding.relayerId,
                signerId: binding.signerId,
                address: getAddress(binding.address),
                bindingRevision: binding.bindingRevision,
              }
            : {
                address: getAddress(binding.address),
                bindingRevision: binding.bindingRevision,
              };
        if (
          /^0x0{40}$/i.test(sponsor.binding.address) ||
          (sponsorAddresses.has(sponsor.binding.address.toLowerCase()) &&
            sponsorAddresses.get(sponsor.binding.address.toLowerCase()) !==
              JSON.stringify([provider.id, sponsor.clientId])) ||
          !sponsor.fundingAgreement.trim() ||
          BigInt(sponsor.gasLimit) < 21000n ||
          BigInt(sponsor.gasLimit) > 1000000n ||
          BigInt(sponsor.maxFeePerGas) === 0n ||
          BigInt(sponsor.maxPriorityFeePerGas) > BigInt(sponsor.maxFeePerGas) ||
          [sponsor.maxFeePerGas, sponsor.maxPriorityFeePerGas].some(
            (value) => BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER),
          ) ||
          BigInt(sponsor.l1FeeReserveWei) === 0n ||
          BigInt(sponsor.lifetimeBudgetWei) <
            BigInt(sponsor.gasLimit) * BigInt(sponsor.maxFeePerGas) +
              BigInt(sponsor.l1FeeReserveWei)
        )
          throw new Error();
        sponsorAddresses.set(
          sponsor.binding.address.toLowerCase(),
          JSON.stringify([provider.id, sponsor.clientId]),
        );
      }
    }
  } catch {
    throw new ConfigurationError([
      '/: invalid execution service policy or activation',
    ]);
  }
  return config;
}
export async function loadExecutionServiceConfiguration(path: string) {
  try {
    const bytes = await readFile(path);
    if (bytes.length > 65536) throw new Error();
    return {
      config: validateExecutionServiceConfiguration(
        JSON.parse(bytes.toString('utf8')),
      ),
      directory: dirname(resolve(path)),
    };
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw new ConfigurationError([
      '/: execution service configuration unavailable',
    ]);
  }
}
