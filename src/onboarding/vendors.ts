import { createHmac } from 'node:crypto';
import { WalletProviderError } from '../domain/signing.js';
import { fingerprint, text, uuid } from './policy.js';
import type {
  IdentityAdapter,
  IdentityEvidence,
  VendorPrice,
} from './types.js';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error();
  return value as Record<string, unknown>;
}
function price(value: VendorPrice | undefined): VendorPrice | undefined {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0')
    throw new WalletProviderError('wallet_provider_configuration');
  if (
    value &&
    (!Number.isSafeInteger(value.maximumMinor) ||
      value.maximumMinor < 0 ||
      !text(value.termsReference))
  )
    throw new WalletProviderError('wallet_provider_configuration');
  return value && { ...value };
}
async function call(
  request: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  try {
    const response = await request(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    // Even an error response may follow a committed import. Never authorize a mutation retry here.
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
        if (size > 1024 * 1024) throw new Error();
        chunks.push(chunk.value);
      }
      return object(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  } catch {
    throw new WalletProviderError('wallet_identity_unavailable', 'unknown');
  }
}
export interface DiditConfiguration {
  apiKey: string;
  workflowId: string;
  importPrice?: VendorPrice;
  verificationPrice?: VendorPrice;
}
/** Recipient-only B2B import. An upstream approval never becomes provider acceptance. */
export function createDiditIdentityAdapter(
  input: DiditConfiguration,
  request: typeof fetch = fetch,
): IdentityAdapter {
  const config = structuredClone(input);
  if (!text(config.apiKey, 4096) || !uuid.test(config.workflowId))
    throw new WalletProviderError('wallet_provider_configuration');
  const importPrice = price(config.importPrice);
  const verificationPrice = price(config.verificationPrice);
  function evidence(
    value: Record<string, unknown>,
    correlation: string,
  ): IdentityEvidence {
    if (
      !uuid.test(String(value.session_id)) ||
      value.session_kind !== 'user' ||
      value.workflow_id !== config.workflowId ||
      value.vendor_data !== correlation ||
      !text(value.status)
    )
      throw new WalletProviderError('wallet_identity_unavailable', 'unknown');
    return {
      vendor: 'didit',
      reference: value.session_id as string,
      correlation,
      status:
        value.status === 'Approved'
          ? 'approved'
          : value.status === 'Declined'
            ? 'rejected'
            : 'review',
      // Didit's common session fields do not establish the original verification time.
      // A provider reviewer must establish freshness from the underlying evidence.
      fetchedAt: new Date().toISOString(),
    };
  }
  return {
    vendor: 'didit',
    policyFingerprint: fingerprint([
      'didit',
      config.workflowId,
      'independent-review-v1',
    ]),
    price: importPrice,
    verificationPrice,
    async startVerification(correlation) {
      if (!uuid.test(correlation))
        throw new WalletProviderError('wallet_provider_input');
      const value = await call(
        request,
        'https://verification.didit.me/v3/session/',
        {
          method: 'POST',
          headers: {
            'x-api-key': config.apiKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            workflow_id: config.workflowId,
            vendor_data: correlation,
          }),
        },
      );
      if (!uuid.test(String(value.session_id)) || typeof value.url !== 'string')
        throw new WalletProviderError('wallet_identity_unavailable', 'unknown');
      const url = new URL(value.url);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'verify.didit.me' ||
        url.username ||
        url.password
      )
        throw new WalletProviderError('wallet_identity_unavailable', 'unknown');
      return { url: url.href, reference: value.session_id as string };
    },
    async importShared(token, correlation) {
      if (!text(token, 16384) || !uuid.test(correlation))
        throw new WalletProviderError('wallet_provider_input');
      const value = await call(
        request,
        'https://verification.didit.me/v3/session/import-shared/',
        {
          method: 'POST',
          headers: {
            'x-api-key': config.apiKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            share_token: token,
            trust_review: false,
            workflow_id: config.workflowId,
            vendor_data: correlation,
          }),
        },
      );
      if (!uuid.test(String(value.shared_from_session)))
        throw new WalletProviderError('wallet_identity_unavailable', 'unknown');
      return evidence(value, correlation);
    },
    async read(reference, correlation) {
      if (!uuid.test(reference) || !uuid.test(correlation))
        throw new WalletProviderError('wallet_provider_input');
      const value = await call(
        request,
        `https://verification.didit.me/v3/session/${reference}/decision/`,
        {
          method: 'GET',
          headers: { 'x-api-key': config.apiKey, accept: 'application/json' },
        },
      );
      if (value.session_id !== reference)
        throw new WalletProviderError('wallet_identity_unavailable', 'unknown');
      return evidence(value, correlation);
    },
  };
}
export interface SumsubConfiguration {
  appToken: string;
  secretKey: string;
  levelName: string;
  /** Confirm the newer Reusable KYC Share feature is enabled; legacy ignores body controls. */
  reusableKycShareEnabled: true;
  importPrice?: VendorPrice;
  verificationPrice?: VendorPrice;
}
export function createSumsubIdentityAdapter(
  input: SumsubConfiguration,
  request: typeof fetch = fetch,
): IdentityAdapter {
  const config = structuredClone(input);
  if (
    !text(config.appToken, 4096) ||
    !text(config.secretKey, 4096) ||
    !text(config.levelName) ||
    config.reusableKycShareEnabled !== true
  )
    throw new WalletProviderError('wallet_provider_configuration');
  const importPrice = price(config.importPrice);
  const verificationPrice = price(config.verificationPrice);
  async function send(method: 'GET' | 'POST', path: string, body?: object) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const encoded = body ? JSON.stringify(body) : '';
    const signature = createHmac('sha256', config.secretKey)
      .update(timestamp + method + path + encoded)
      .digest('hex');
    return call(request, 'https://api.sumsub.com' + path, {
      method,
      headers: {
        'X-App-Token': config.appToken,
        'X-App-Access-Ts': timestamp,
        'X-App-Access-Sig': signature,
        'content-type': 'application/json',
      },
      ...(body ? { body: encoded } : {}),
    });
  }
  function evidence(
    value: Record<string, unknown>,
    correlation: string,
  ): IdentityEvidence {
    const review = object(value.review);
    const result = review.reviewResult ? object(review.reviewResult) : {};
    if (
      !/^[a-z0-9]{24}$/.test(String(value.id)) ||
      value.type !== 'individual' ||
      value.externalUserId !== correlation ||
      review.levelName !== config.levelName
    )
      throw new WalletProviderError('wallet_identity_unavailable', 'unknown');
    let verifiedAt: string | undefined;
    if (typeof review.reviewDate === 'string') {
      // Sumsub documents UTC dates both with +0000 and without an explicit zone.
      const date = review.reviewDate.replace(' ', 'T').replace(/\+0000$/, 'Z');
      const normalized = date.endsWith('Z') ? date : date + 'Z';
      if (
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(normalized) &&
        Number.isFinite(Date.parse(normalized))
      )
        verifiedAt = new Date(normalized).toISOString();
    }
    return {
      vendor: 'sumsub',
      reference: value.id as string,
      correlation,
      status:
        review.reviewStatus === 'completed' && result.reviewAnswer === 'GREEN'
          ? 'approved'
          : review.reviewStatus === 'completed' && result.reviewAnswer === 'RED'
            ? 'rejected'
            : 'review',
      verifiedAt,
      fetchedAt: new Date().toISOString(),
    };
  }
  return {
    vendor: 'sumsub',
    policyFingerprint: fingerprint([
      'sumsub',
      config.levelName,
      'reusable-kyc-share-independent-review-v1',
    ]),
    price: importPrice,
    verificationPrice,
    async startVerification(correlation) {
      if (!uuid.test(correlation))
        throw new WalletProviderError('wallet_provider_input');
      const value = await send(
        'POST',
        '/resources/sdkIntegrations/levels/-/websdkLink',
        { levelName: config.levelName, userId: correlation, ttlInSecs: 1800 },
      );
      if (typeof value.url !== 'string')
        throw new WalletProviderError('wallet_identity_unavailable', 'unknown');
      const url = new URL(value.url);
      if (
        url.protocol !== 'https:' ||
        !['api.sumsub.com', 'in.sumsub.com'].includes(url.hostname) ||
        url.username ||
        url.password
      )
        throw new WalletProviderError('wallet_identity_unavailable', 'unknown');
      return { url: url.href };
    },
    async readByCorrelation(correlation) {
      if (!uuid.test(correlation))
        throw new WalletProviderError('wallet_provider_input');
      return evidence(
        await send(
          'GET',
          `/resources/applicants/-;externalUserId=${correlation}/one`,
        ),
        correlation,
      );
    },
    async importShared(token, correlation) {
      // Share tokens are opaque. Never decode them as JWTs or use them as login proof.
      if (!text(token, 1024) || !uuid.test(correlation))
        throw new WalletProviderError('wallet_provider_input');
      const query = new URLSearchParams({
        shareToken: token,
        levelName: config.levelName,
        userId: correlation,
      });
      const value = await send(
        'POST',
        '/resources/api/reusableIdentity/reuse?' + query,
        { preservedVerificationStatus: false, requireFreshSelfie: false },
      );
      return evidence(value, correlation);
    },
    async read(reference, correlation) {
      if (!/^[a-z0-9]{24}$/.test(reference) || !uuid.test(correlation))
        throw new WalletProviderError('wallet_provider_input');
      const value = await send('GET', `/resources/applicants/${reference}/one`);
      if (value.id !== reference)
        throw new WalletProviderError('wallet_identity_unavailable', 'unknown');
      return evidence(value, correlation);
    },
  };
}
