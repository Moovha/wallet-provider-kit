import type { ExplorerTokensConfiguration } from './explorer-tokens.js';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Ajv } from 'ajv';
import { getAddress } from 'ethers';
import schema from '../../spec/provider-config.schema.json' with { type: 'json' };
import type { OnboardingPolicy, VendorPrice } from '../onboarding/types.js';
import { defineOnboardingPolicy } from '../onboarding/policy.js';
import {
  createAuthenticator,
  trustedHttpsUrl,
  type OAuthConfiguration,
} from '../service/auth.js';
import type { RelayerBinding } from '../providers/openzeppelin-relayer.js';
import type { TransferPolicy } from './actions.js';
import { amount } from './actions.js';

export interface SecretReference {
  env: string;
}
export interface ProviderConfiguration {
  configVersion: 1;
  profile: 'provider-service-v1';
  policy: OnboardingPolicy;
  oauth: OAuthConfiguration;
  apiExplorer?: ExplorerTokensConfiguration;
  ownerLogin: {
    issuer: string;
    clientId: string;
    clientSecret: SecretReference;
    idTokenAlgorithm?: 'RS256' | 'ES256';
  };
  reviewers: string[];
  identity: {
    didit?: {
      apiKey: SecretReference;
      workflowId: string;
      importPrice?: VendorPrice;
      verificationPrice?: VendorPrice;
    };
    sumsub?: {
      appToken: SecretReference;
      secretKey: SecretReference;
      levelName: string;
      reusableKycShareEnabled: true;
      importPrice?: VendorPrice;
      verificationPrice?: VendorPrice;
    };
  };
  backend:
    | {
        kind: 'cdp';
        binding: string;
        apiKeyId: SecretReference;
        apiKeySecret: SecretReference;
        walletSecret: SecretReference;
      }
    | {
        kind: 'ows';
        binding: string;
        vaultDirectory: string;
        passphrase: SecretReference;
      }
    | {
        kind: 'openzeppelin-relayer';
        binding: string;
        url: string;
        apiKey: SecretReference;
        signers: RelayerBinding[];
      }
    | {
        kind: 'custom';
        binding: string;
        module: string;
        options?: Record<string, unknown>;
      };
  storage: { kind: 'sqlite'; directory: string };
  activation: {
    enabled: boolean;
    backendAcceptance?: string;
    recoveryAcceptance?: string;
    tokenAcceptance?: string;
  };
  financial?: TransferPolicy;
  http?: {
    host?: '127.0.0.1' | '0.0.0.0' | '::1' | '::';
    port?: number;
    documentation?: boolean;
  };
}
export class ConfigurationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super('Invalid provider configuration');
  }
}
const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
/** Offline and side-effect free. Diagnostics never include configuration values or credentials. */
export function validateProviderConfiguration(
  input: unknown,
): ProviderConfiguration {
  if (!validate(input))
    throw new ConfigurationError(
      (validate.errors ?? []).map((error) => {
        const path =
          error.keyword === 'required'
            ? `${error.instancePath}/${String(error.params.missingProperty)}`
            : error.instancePath || '/';
        return `${path}: ${error.keyword}`;
      }),
    );
  const config = structuredClone(input) as unknown as ProviderConfiguration;
  try {
    defineOnboardingPolicy(config.policy);
    if (config.policy.identity?.records) {
      if (config.identity.didit || config.identity.sumsub || config.financial)
        throw new ConfigurationError([
          '/policy/identity/records: application records are an unfunded evaluation source; vendor verification and financial signing require a separate profile',
        ]);
    } else if (!config.identity.didit && !config.identity.sumsub)
      throw new ConfigurationError([
        '/identity: select application records or an identity vendor',
      ]);
    createAuthenticator(config.oauth);
    trustedHttpsUrl(config.ownerLogin.issuer);
    if (
      config.policy.applications.some(
        (app) => app.issuer !== config.oauth.issuer,
      )
    )
      throw new ConfigurationError([
        '/policy/applications: issuers must match /oauth/issuer',
      ]);
    if (config.apiExplorer) {
      if (
        !config.http?.documentation ||
        new Set(config.apiExplorer.clients.map((entry) => entry.clientId))
          .size !== config.apiExplorer.clients.length ||
        config.apiExplorer.clients.some(
          (entry) =>
            !config.policy.applications.some(
              (app) =>
                app.enabled !== false &&
                app.clientId === entry.clientId &&
                app.issuer === config.oauth.issuer,
            ),
        )
      )
        throw new ConfigurationError([
          '/apiExplorer: documentation and enabled registered clients are required; duplicate clients are not allowed',
        ]);
    }
    if (
      config.backend.kind === 'custom' &&
      !(
        config.backend.module.startsWith('./') ||
        config.backend.module.startsWith('/')
      )
    )
      throw new ConfigurationError([
        '/backend/module: use an absolute local path or ./ relative path',
      ]);
    if (
      config.activation.enabled &&
      (!config.activation.backendAcceptance ||
        !config.activation.recoveryAcceptance ||
        (config.financial && !config.activation.tokenAcceptance))
    )
      throw new ConfigurationError([
        '/activation: backendAcceptance and recoveryAcceptance are required when enabled; financial setup also requires tokenAcceptance',
      ]);
    if (config.backend.kind === 'openzeppelin-relayer') {
      const url = trustedHttpsUrl(config.backend.url);
      if (url.pathname !== '/')
        throw new ConfigurationError(['/backend/url: must be an HTTPS origin']);
      const signers = config.backend.signers;
      if (
        new Set(signers.map((s) => s.address.toLowerCase())).size !==
          signers.length ||
        new Set(signers.map((s) => s.relayerId)).size !== signers.length ||
        new Set(signers.map((s) => s.signerId)).size !== signers.length
      )
        throw new ConfigurationError([
          '/backend/signers: duplicate addresses, relayers or signers are not allowed',
        ]);
      for (const signer of signers)
        if (/^0x0{40}$/i.test(getAddress(signer.address))) throw new Error();
    }
    if (config.financial) {
      const p = config.financial;
      if (amount(p.maximumAmount) > amount(p.lifetimeAmount))
        throw new ConfigurationError([
          '/financial/maximumAmount: must not exceed lifetimeAmount',
        ]);
      for (const a of [p.token.address, ...p.recipients])
        if (/^0x0{40}$/i.test(getAddress(a))) throw new Error();
      if (
        new Set(p.recipients.map((a) => a.toLowerCase())).size !==
        p.recipients.length
      )
        throw new Error();
    }
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw new ConfigurationError([
      '/: invalid policy, integration or activation settings',
    ]);
  }
  return config;
}
export async function loadProviderConfiguration(path: string) {
  try {
    const bytes = await readFile(path);
    if (bytes.length > 65536) throw new Error();
    return {
      config: validateProviderConfiguration(JSON.parse(bytes.toString('utf8'))),
      directory: dirname(resolve(path)),
    };
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw new ConfigurationError([
      '/: configuration file unavailable or invalid JSON',
    ]);
  }
}
export function secretReferences(
  config: ProviderConfiguration,
): SecretReference[] {
  return [
    config.ownerLogin.clientSecret,
    ...(config.apiExplorer?.clients.map((entry) => entry.clientSecret) ?? []),
    ...(config.identity.didit ? [config.identity.didit.apiKey] : []),
    ...(config.identity.sumsub
      ? [config.identity.sumsub.appToken, config.identity.sumsub.secretKey]
      : []),
    ...(config.backend.kind === 'ows' ? [config.backend.passphrase] : []),
    ...(config.backend.kind === 'openzeppelin-relayer'
      ? [config.backend.apiKey]
      : []),
    ...(config.backend.kind === 'cdp'
      ? [
          config.backend.apiKeyId,
          config.backend.apiKeySecret,
          config.backend.walletSecret,
        ]
      : []),
  ];
}
export function resolveSecret(
  reference: SecretReference,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const value = environment[reference.env];
  if (!value || value.length > 16384)
    throw new ConfigurationError([`secret ${reference.env}: unavailable`]);
  return value;
}
