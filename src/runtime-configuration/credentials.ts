import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';
import { WalletProviderError } from '../domain/signing.js';
import { trustedHttpsUrl } from '../service/auth.js';
import { invalid } from '../onboarding/policy.js';

export interface ApplicationCredential {
  application_id: string;
  reference: string;
  revision: string;
  origin: string;
  status: 'active' | 'revoked';
  sealed: string;
}
export type CredentialMetadata = Omit<ApplicationCredential, 'sealed'>;
export function credentialMetadata(
  value: ApplicationCredential,
): CredentialMetadata {
  const { sealed: _sealed, ...metadata } = value;
  return metadata;
}
/** Application and revision authenticated encryption prevents cross-application substitution. */
export class ApplicationCredentialCipher {
  private readonly key: Buffer;
  constructor(key: string) {
    this.key = Buffer.from(key, 'base64');
    if (this.key.length !== 32 || this.key.toString('base64') !== key)
      throw new WalletProviderError('wallet_provider_configuration');
  }
  digest(value: unknown) {
    return createHmac('sha256', this.key)
      .update(JSON.stringify(value))
      .digest('hex');
  }
  seal(metadata: CredentialMetadata, endpoint: string): ApplicationCredential {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(JSON.stringify(metadata)));
    const data = Buffer.concat([
      cipher.update(endpoint, 'utf8'),
      cipher.final(),
    ]);
    return {
      ...metadata,
      sealed: Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64'),
    };
  }
  open(record: ApplicationCredential): string {
    try {
      if (record.status !== 'active') throw new Error();
      const data = Buffer.from(record.sealed, 'base64');
      const cipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        data.subarray(0, 12),
      );
      cipher.setAAD(Buffer.from(JSON.stringify(credentialMetadata(record))));
      cipher.setAuthTag(data.subarray(12, 28));
      return Buffer.concat([
        cipher.update(data.subarray(28)),
        cipher.final(),
      ]).toString('utf8');
    } catch {
      throw new WalletProviderError('wallet_authorization_denied');
    }
  }
}
export function credentialOrigin(endpoint: string): string {
  try {
    if (typeof endpoint !== 'string' || endpoint.length > 4096) invalid();
    const url = trustedHttpsUrl(endpoint);
    if (
      !url.hostname.includes('.') ||
      url.hostname.endsWith('.localhost') ||
      /^[\d.]+$/.test(url.hostname) ||
      url.hostname.includes(':')
    )
      invalid();
    return url.origin;
  } catch {
    return invalid();
  }
}
