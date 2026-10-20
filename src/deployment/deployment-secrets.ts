import { createBundledAuthorizationServer } from './authorization-server.js';
import { ConfigurationError } from './config.js';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import type { ProviderConfiguration } from './config.js';

/** Names eligible for generation during explicit new-deployment setup, never service startup. */
export function generatedSecretNames(config: ProviderConfiguration): string[] {
  return [
    ...(config.management ? [config.management.claim.env] : []),
    ...(config.safeWallet ? [config.safeWallet.bundlerAuthorization.env] : []),
    ...(config.runtimeConfiguration?.credentialKey
      ? [config.runtimeConfiguration.credentialKey.env]
      : []),
    ...(config.authorizationServer
      ? [
          config.authorizationServer.signingKey.env,
          ...(config.authorizationServer.operatorClients ?? []).map(
            (entry) => entry.clientSecret.env,
          ),
          ...config.authorizationServer.clients.map(
            (entry) => entry.clientSecret.env,
          ),
        ]
      : []),
    ...(config.backend.kind === 'ows' ? [config.backend.passphrase.env] : []),
  ];
}

export function generateDeploymentSecrets(
  config: ProviderConfiguration,
  existing: Record<string, string>,
): Record<string, string> {
  const values = { ...existing };
  for (const name of generatedSecretNames(config)) {
    if (values[name]) continue;
    if (name === config.authorizationServer?.signingKey.env) {
      const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 3072,
      });
      values[name] = JSON.stringify({
        ...privateKey.export({ format: 'jwk' }),
        kid: randomBytes(16).toString('hex'),
        use: 'sig',
        alg: 'RS256',
      });
    } else if (name === config.runtimeConfiguration?.credentialKey?.env)
      values[name] = randomBytes(32).toString('base64');
    else values[name] = randomBytes(48).toString('base64url');
  }
  if (config.authorizationServer)
    createBundledAuthorizationServer(config, values);
  if (config.backend.kind === 'ows') {
    const passphrase = values[config.backend.passphrase.env];
    if (
      !passphrase ||
      passphrase.length < 16 ||
      passphrase.length > 4096 ||
      passphrase.startsWith('ows_key_')
    )
      throw new ConfigurationError([
        '/backend/passphrase: supply a retained owner passphrase of 16–4096 characters',
      ]);
  }
  return values;
}
