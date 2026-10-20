import type { ProviderNetwork } from '../networks.js';
import {
  bundledOAuth,
  type BundledAuthorizationConfiguration,
} from './authorization-contract.js';
import {
  validateRuntimeConfiguration,
  type RuntimeConfigurationOptions,
} from '../runtime-configuration/service.js';
import { validateApprovedCallPolicy } from '../execution/approved-calls.js';
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

export interface SecretReference {
  env: string;
}
export interface ProviderConfiguration {
  safeWallet?: import('../sponsorship/safe-wallet.js').SafeWalletConfiguration;
  network?: ProviderNetwork;
  safeProvisioning?: import('../provisioning/safe.js').SafeProvisioningConfiguration;
  runtimeConfiguration?: RuntimeConfigurationOptions;
  configVersion: 1;
  profile: 'provider-service-v1';
  policy: OnboardingPolicy;
  oauth: OAuthConfiguration;
  authorizationServer?: BundledAuthorizationConfiguration;
  apiExplorer?: ExplorerTokensConfiguration;
  ownerLogin?: {
    issuer: string;
    clientId: string;
    clientSecret: SecretReference;
    idTokenAlgorithm?: 'RS256' | 'ES256';
  };
  reviewers?: string[];
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
  backend: {
    kind: 'ows';
    binding: string;
    vaultDirectory: string;
    passphrase: SecretReference;
  };
  storage: { kind: 'sqlite'; directory: string };
  activation: {
    enabled: boolean;
    backendAcceptance?: string;
    recoveryAcceptance?: string;
  };
  approvedCalls?: import('../execution/approved-calls.js').ApprovedCallsConfiguration;
  http?: {
    requestsPerMinute?: number;
    host?: '127.0.0.1' | '0.0.0.0' | '::1' | '::';
    port?: number;
    documentation?: boolean;
    ingress?: 'caddy' | 'existing';
  };
}
export class ConfigurationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super('Invalid provider configuration');
  }
}
const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
/** Require the Safe account and its application-owned ERC-4337 infrastructure. */
export function assertSafeWalletConfiguration(
  config: ProviderConfiguration,
): asserts config is ProviderConfiguration & {
  safeWallet: import('../sponsorship/safe-wallet.js').SafeWalletConfiguration;
  safeProvisioning: import('../provisioning/safe.js').SafeProvisioningConfiguration;
  approvedCalls: import('../execution/approved-calls.js').ApprovedCallsConfiguration;
  runtimeConfiguration: RuntimeConfigurationOptions;
} {
  if (
    !config.safeWallet ||
    !config.safeProvisioning ||
    !config.approvedCalls ||
    config.backend.kind !== 'ows' ||
    !config.runtimeConfiguration?.authorizeContracts ||
    !config.runtimeConfiguration.credentialKey ||
    config.runtimeConfiguration.rpcVerification !== 'single'
  ) {
    throw new ConfigurationError([
      '/safeWallet: per-user Safe accounts, application contracts, encrypted credentials and bundled ERC-4337 infrastructure are required',
    ]);
  }
}

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
    assertSafeWalletConfiguration(config);
    const resolvedPolicy = defineOnboardingPolicy(config.policy);
    if (config.policy.access?.mode !== 'application')
      throw new ConfigurationError([
        '/policy/access: application-led identity and consent are required',
      ]);
    if (config.runtimeConfiguration) {
      validateRuntimeConfiguration(config.runtimeConfiguration, resolvedPolicy);
      if (
        config.runtimeConfiguration.operators.some(
          (operator) => operator.issuer !== config.oauth.issuer,
        )
      )
        throw new Error();
    }
    const applicationLed = config.policy.access?.mode === 'application';
    if ((!applicationLed || config.apiExplorer) && !config.ownerLogin)
      throw new ConfigurationError([
        '/ownerLogin: login configuration is required for hosted access or staff token controls',
      ]);
    if (!applicationLed && !config.reviewers?.length)
      throw new ConfigurationError([
        '/reviewers: hosted access requires reviewers',
      ]);
    if (applicationLed) {
      if (
        config.identity.didit ||
        config.identity.sumsub ||
        config.policy.identity?.records
      )
        throw new ConfigurationError([
          '/identity: application-led access uses trusted application attestations, not hosted verification',
        ]);
    } else if (config.policy.identity?.records) {
      if (
        config.identity.didit ||
        config.identity.sumsub ||
        config.approvedCalls
      )
        throw new ConfigurationError([
          '/policy/identity/records: application records are an unfunded evaluation source; vendor verification and financial signing require a separate profile',
        ]);
    } else if (!config.identity.didit && !config.identity.sumsub)
      throw new ConfigurationError([
        '/identity: select application records or an identity vendor',
      ]);
    if (
      config.http?.ingress === 'caddy' &&
      new URL(config.policy.provider.origin).port
    )
      throw new ConfigurationError([
        '/http/ingress: bundled HTTPS requires the standard HTTPS port 443',
      ]);
    createAuthenticator(config.oauth);
    if (config.authorizationServer) {
      const expected = bundledOAuth(config.policy.provider.origin);
      const clients = config.authorizationServer.clients;
      const enabled = config.policy.applications.filter(
        (app) => app.enabled !== false,
      );
      const operatorClients = config.authorizationServer.operatorClients ?? [];
      const operators = config.runtimeConfiguration?.operators ?? [];
      const allClients = [...clients, ...operatorClients];
      const refs = [
        config.authorizationServer.signingKey.env,
        ...allClients.map((entry) => entry.clientSecret.env),
      ];
      if (
        Object.entries(expected).some(
          ([key, value]) =>
            config.oauth[key as keyof OAuthConfiguration] !== value,
        ) ||
        new Set(refs).size !== refs.length ||
        refs.some((name) =>
          secretReferences({
            ...config,
            authorizationServer: undefined,
            apiExplorer: undefined,
          }).some((ref) => ref.env === name),
        ) ||
        new Set(allClients.map((entry) => entry.clientId)).size !==
          allClients.length ||
        operatorClients.length !== operators.length ||
        operatorClients.some(
          (entry) =>
            !operators.some(
              (operator) =>
                operator.clientId === entry.clientId &&
                operator.subject === entry.clientId &&
                operator.issuer === config.oauth.issuer,
            ),
        ) ||
        clients.length !== enabled.length ||
        clients.some(
          (entry) => !enabled.some((app) => app.clientId === entry.clientId),
        )
      )
        throw new ConfigurationError([
          '/authorizationServer: use the provider OAuth endpoints, unique secret variables, one registration per enabled application and separate configured service operators with subject equal to client ID',
        ]);
    }
    if (config.ownerLogin) trustedHttpsUrl(config.ownerLogin.issuer);
    if (
      config.policy.applications.some(
        (app) => app.issuer !== config.oauth.issuer,
      )
    )
      throw new ConfigurationError([
        '/policy/applications: issuers must match /oauth/issuer',
      ]);
    if (
      config.apiExplorer &&
      config.authorizationServer &&
      config.apiExplorer.clients.some(
        (entry) =>
          !config.authorizationServer!.clients.some(
            (client) =>
              client.clientId === entry.clientId &&
              client.clientSecret.env === entry.clientSecret.env &&
              entry.scopes.every((scope) => client.scopes.includes(scope)),
          ),
      )
    )
      throw new ConfigurationError([
        '/apiExplorer: bundled token controls must match the registered client secret and allowed scopes',
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
      config.activation.enabled &&
      (!config.activation.backendAcceptance ||
        !config.activation.recoveryAcceptance)
    )
      throw new ConfigurationError([
        '/activation: backendAcceptance and recoveryAcceptance are required',
      ]);
    if (config.safeProvisioning) {
      const p = config.safeProvisioning;
      for (const pin of [p.factory, p.singleton]) {
        if (
          pin.implementation ||
          getAddress(pin.address) ===
            '0x0000000000000000000000000000000000000000' ||
          /^0x0{64}$/.test(pin.codeHash)
        )
          throw new Error();
      }
      if (
        p.factory.address.toLowerCase() === p.singleton.address.toLowerCase() ||
        /^0x0{64}$/.test(p.proxyCodeHash)
      )
        throw new Error();
    }
    if (config.approvedCalls) {
      validateApprovedCallPolicy(
        config.approvedCalls.policy,
        !!config.safeProvisioning,
      );
    }
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw new ConfigurationError([
      '/: invalid policy, integration or activation settings',
    ]);
  }
  return config;
}
export async function loadProviderConfiguration(path: string): Promise<{
  config: ProviderConfiguration;
  directory: string;
}> {
  try {
    const bytes = await readFile(path);
    if (bytes.length > 65536) throw new Error();
    const config = validateProviderConfiguration(
      JSON.parse(bytes.toString('utf8')),
    );
    assertSafeWalletConfiguration(config);
    return { config, directory: dirname(resolve(path)) };
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
    ...(config.runtimeConfiguration?.credentialKey
      ? [config.runtimeConfiguration.credentialKey]
      : []),
    ...(config.authorizationServer
      ? [
          config.authorizationServer.signingKey,
          ...(config.authorizationServer.operatorClients ?? []).map(
            (c) => c.clientSecret,
          ),
          ...config.authorizationServer.clients.map((c) => c.clientSecret),
        ]
      : []),
    ...(config.safeWallet ? [config.safeWallet.bundlerAuthorization] : []),
    ...(config.apiExplorer
      ? config.apiExplorer.clients.map((c) => c.clientSecret)
      : []),
    ...(config.ownerLogin ? [config.ownerLogin.clientSecret] : []),
    config.backend.passphrase,
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
