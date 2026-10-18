import type { SecretReference } from './config.js';
/** Private Compose peer; external Relayer connections retain their HTTPS contract. */
export const localExecutionOrigin = 'https://bundled-execution.invalid';
export const localExecutionImages = {
  relayer:
    'openzeppelin/openzeppelin-relayer:1.8.0@sha256:a0d8751b065bb269977a91292df8759bc48ffaaecd0a162bda1f96c32c899e77',
  store:
    'valkey/valkey:9.1.2-alpine@sha256:48332870af354a799964c0012ae1194a0bf2bf894eb508f945810596dc2d8d11',
} as const;
export interface LocalExecutionConfiguration {
  kind: 'openzeppelin-relayer';
  apiKey: SecretReference;
  keystorePassphrase: SecretReference;
  storageKey: SecretReference;
}
export function defaultLocalExecution(): LocalExecutionConfiguration {
  return {
    kind: 'openzeppelin-relayer',
    apiKey: { env: 'LOCAL_EXECUTION_API_KEY' },
    keystorePassphrase: { env: 'LOCAL_EXECUTION_KEYSTORE_PASSPHRASE' },
    storageKey: { env: 'LOCAL_EXECUTION_STORAGE_KEY' },
  };
}
export function localSponsorIds(accountId: string) {
  return {
    relayerId: 'p-' + accountId.replaceAll('-', ''),
    signerId: 's-' + accountId.replaceAll('-', ''),
  };
}
