import { createHash, randomUUID } from 'node:crypto';
import { SignJWT, importPKCS8, importSPKI, jwtVerify } from 'jose';
import type { SecretReference } from '../deployment/config.js';
import { resolveSecret } from '../deployment/config.js';
import { AuthenticationError, trustedHttpsUrl } from '../service/auth.js';
import { WalletProviderError } from '../domain/signing.js';

export interface ServiceSigningKey {
  id: string;
  privateKey: SecretReference;
}
export interface ServiceVerificationKey {
  id: string;
  publicKey: SecretReference;
}
export interface ServicePeer {
  origin: string;
  keys: ServiceVerificationKey[];
}
export type ServicePurpose =
  'dispatch' | 'status' | 'capabilities' | 'authority';

/** RFC 8785 serialization restricted to well-formed strings and finite JSON numbers. */
export function canonicalServiceJson(value: unknown): string {
  function serialize(input: unknown, depth: number): string {
    if (depth > 20) throw new Error();
    if (input === null || typeof input === 'boolean')
      return JSON.stringify(input);
    if (
      typeof input === 'string' &&
      !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
        input,
      )
    )
      return JSON.stringify(input);
    if (typeof input === 'number' && Number.isFinite(input))
      return JSON.stringify(input);
    if (Array.isArray(input))
      return '[' + input.map((v) => serialize(v, depth + 1)).join(',') + ']';
    if (
      input &&
      typeof input === 'object' &&
      Object.getPrototypeOf(input) === Object.prototype
    )
      return (
        '{' +
        Object.keys(input)
          .sort()
          .map(
            (key) =>
              serialize(key, depth + 1) +
              ':' +
              serialize((input as Record<string, unknown>)[key], depth + 1),
          )
          .join(',') +
        '}'
      );
    throw new Error();
  }
  try {
    return serialize(value, 0);
  } catch {
    throw new WalletProviderError('wallet_provider_input');
  }
}
export function serviceHash(value: unknown) {
  return createHash('sha256')
    .update(canonicalServiceJson(value), 'utf8')
    .digest('hex');
}
export function serviceOrigin(value: string): string {
  try {
    const url = trustedHttpsUrl(value);
    if (
      url.pathname !== '/' ||
      url.origin !== value ||
      process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new WalletProviderError('wallet_provider_configuration');
  }
}

/** Pinned ES256 service requests and responses. Application OAuth tokens are a different JWT type. */
export async function createServiceIdentity(
  origin: string,
  signing: ServiceSigningKey,
  peers: ServicePeer[],
) {
  serviceOrigin(origin);
  try {
    const key = await importPKCS8(resolveSecret(signing.privateKey), 'ES256');
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(signing.id)) throw new Error();
    const trusted = await Promise.all(
      peers.map(async (peer) => ({
        origin: serviceOrigin(peer.origin),
        keys: await Promise.all(
          peer.keys.map(async (entry) => ({
            id: entry.id,
            key: await importSPKI(resolveSecret(entry.publicKey), 'ES256'),
          })),
        ),
      })),
    );
    async function sign(
      peer: string,
      purpose: ServicePurpose,
      method: string,
      path: string,
      body: unknown,
      response?: { requestId: string; status: number },
    ) {
      if (
        !trusted.some((entry) => entry.origin === peer) ||
        !path.startsWith('/') ||
        path.includes('?') ||
        path.includes('#')
      )
        throw new WalletProviderError('wallet_provider_configuration');
      const id = randomUUID();
      const now = Math.floor(Date.now() / 1000);
      const proof = await new SignJWT({
        purpose,
        method,
        path,
        content_hash: serviceHash(body),
        ...(response
          ? { request_jti: response.requestId, status: response.status }
          : {}),
      })
        .setProtectedHeader({
          alg: 'ES256',
          kid: signing.id,
          typ: response
            ? 'wpk-service-response+jwt'
            : 'wpk-service-request+jwt',
        })
        .setIssuer(origin)
        .setAudience(peer)
        .setJti(id)
        .setIssuedAt(now)
        .setExpirationTime(now + 30)
        .sign(key);
      return { proof, id };
    }
    async function verify(
      authorization: string | undefined,
      purpose: ServicePurpose,
      method: string,
      path: string,
      body: unknown,
      response?: { peer: string; requestId: string; status: number },
    ) {
      try {
        const match = /^Bearer ([A-Za-z0-9_.-]+)$/i.exec(authorization ?? '');
        if (!match || match[1].length > 8192) throw new Error();
        for (const peer of trusted) {
          if (response && peer.origin !== response.peer) continue;
          for (const entry of peer.keys) {
            let result;
            try {
              result = await jwtVerify(match[1], entry.key, {
                issuer: peer.origin,
                audience: origin,
                algorithms: ['ES256'],
                typ: response
                  ? 'wpk-service-response+jwt'
                  : 'wpk-service-request+jwt',
                requiredClaims: [
                  'iss',
                  'aud',
                  'exp',
                  'iat',
                  'jti',
                  'purpose',
                  'method',
                  'path',
                  'content_hash',
                ],
                maxTokenAge: '30s',
                currentDate: new Date(Date.now()),
                clockTolerance: 2,
              });
            } catch {
              continue;
            }
            const { payload, protectedHeader } = result;
            if (
              protectedHeader.kid !== entry.id ||
              Object.keys(protectedHeader).some(
                (field) => !['alg', 'kid', 'typ'].includes(field),
              ) ||
              payload.aud !== origin ||
              typeof payload.iat !== 'number' ||
              typeof payload.exp !== 'number' ||
              !Number.isSafeInteger(payload.iat) ||
              !Number.isSafeInteger(payload.exp) ||
              payload.exp <= payload.iat ||
              payload.exp - payload.iat > 30 ||
              payload.iat > Math.floor(Date.now() / 1000) + 2 ||
              typeof payload.jti !== 'string' ||
              !/^[0-9a-f-]{36}$/.test(payload.jti) ||
              payload.purpose !== purpose ||
              payload.method !== method ||
              payload.path !== path ||
              payload.content_hash !== serviceHash(body) ||
              (response
                ? payload.request_jti !== response.requestId ||
                  payload.status !== response.status
                : payload.request_jti !== undefined ||
                  payload.status !== undefined)
            )
              throw new Error();
            return { origin: peer.origin, requestId: payload.jti };
          }
        }
        throw new Error();
      } catch {
        throw new AuthenticationError(401);
      }
    }
    return { origin, sign, verify };
  } catch {
    throw new WalletProviderError('wallet_provider_configuration');
  }
}
export type ServiceIdentity = Awaited<ReturnType<typeof createServiceIdentity>>;

/** Fixed-origin HTTPS transport; responses are bound to the request proof and status. No mutation retries. */
export function signedServiceClient(
  identity: ServiceIdentity,
  peer: string,
  request: typeof fetch = fetch,
) {
  serviceOrigin(peer);
  return async (
    purpose: ServicePurpose,
    method: 'GET' | 'POST',
    path: string,
    body: unknown = null,
  ) => {
    try {
      const signed = await identity.sign(peer, purpose, method, path, body);
      const response = await request(peer + path, {
        method,
        headers: {
          authorization: 'Bearer ' + signed.proof,
          accept: 'application/json',
          ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
        },
        ...(method === 'POST' ? { body: canonicalServiceJson(body) } : {}),
        redirect: 'error',
        credentials: 'omit',
        signal: AbortSignal.timeout(12000),
      });
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 65536) throw new Error();
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      const wire = new TextDecoder('utf-8', { fatal: true }).decode(
        Buffer.concat(chunks),
      );
      const result: unknown = JSON.parse(wire);
      if (canonicalServiceJson(result) !== wire) throw new Error();
      await identity.verify(
        'Bearer ' + (response.headers.get('execution-service-proof') ?? ''),
        purpose,
        method,
        path,
        result,
        { peer, requestId: signed.id, status: response.status },
      );
      if (!response.ok) throw new Error();
      return result;
    } catch {
      throw new WalletProviderError(
        'wallet_provider_unavailable',
        method === 'POST' && purpose === 'dispatch'
          ? 'unknown'
          : 'not_dispatched',
      );
    }
  };
}

/** Canonical wire JSON rejects duplicate names, ambiguous encodings and excess nesting before authentication. */
export async function canonicalServiceBody(
  _request: unknown,
  _reply: unknown,
  payload: import('node:stream').Readable,
) {
  try {
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of payload) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += bytes.length;
      if (length > 32768)
        throw new WalletProviderError('wallet_provider_input');
      chunks.push(bytes);
    }
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks),
    );
    if (canonicalServiceJson(JSON.parse(raw)) !== raw)
      throw new AuthenticationError(401);
    const { Readable } = await import('node:stream');
    return Readable.from([Buffer.from(raw, 'utf8')]);
  } catch {
    throw new AuthenticationError(401);
  }
}
