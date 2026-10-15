import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { recoverAddress } from 'ethers';
import {
  EmbeddedWalletService,
  createJournaledWalletProvider,
} from '@moovha/wallet-provider-kit/core';
import {
  createAuthenticator,
  createServer,
} from '@moovha/wallet-provider-kit/http';
import { FixtureJournal } from './attempt-journal.mjs';
import { createFixtureHost, oauth } from './host.mjs';

// This runner uses in-process HTTP injection, ephemeral signing/issuer keys and
// fixture-only authority/storage. It never listens or reads deployment credentials.
const host = createFixtureHost();
const keys = await generateKeyPair('ES256');
const publicKey = {
  ...(await exportJWK(keys.publicKey)),
  kid: 'fixture-issuer',
  alg: 'ES256',
  use: 'sig',
};
const authenticate = createAuthenticator(
  oauth,
  createLocalJWKSet({ keys: [publicKey] }),
);
const backend = createJournaledWalletProvider(host.backend, {
  namespace: 'offline-provider-example',
  journal: new FixtureJournal(),
  authorizeAttempt: host.authorizeAttempt,
});
const app = await createServer({
  authenticate,
  service: new EmbeddedWalletService(host.authority, backend),
  // ONLY an offline fixture readiness check. Production requires durable recovery evidence.
  ready: async () => true,
});
const token = await new SignJWT({
  client_id: 'fixture-client',
  scope: 'wallet:provision wallet:sign',
})
  .setProtectedHeader({ alg: 'ES256', typ: 'at+jwt', kid: 'fixture-issuer' })
  .setIssuer(oauth.issuer)
  .setAudience(oauth.audience)
  .setSubject('fixture-application-service')
  .setIssuedAt()
  .setExpirationTime('5m')
  .setJti(randomUUID())
  .sign(keys.privateKey);

/** @param {string} path @param {string} key @param {boolean} authenticated */
function post(path, key, authenticated = true) {
  return app.inject({
    method: 'POST',
    url: path,
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
      ...(authenticated ? { authorization: `Bearer ${token}` } : {}),
    },
    payload: {},
  });
}

try {
  const provisionPath = `/v1/accounts/${host.accountId}/provision`;
  const signPath = `/v1/actions/${host.action.action_id}/sign`;
  const provisionKey = randomUUID();
  const signKey = randomUUID();
  assert.equal(
    (await post(provisionPath, provisionKey, false)).statusCode,
    401,
  );
  assert.equal(host.calls.provision, 0);
  console.log('PASS 1: unauthenticated request denied before backend effects');

  const created = await post(provisionPath, provisionKey);
  assert.equal(created.statusCode, 200);
  const replayedAccount = await post(provisionPath, provisionKey);
  assert.equal(replayedAccount.statusCode, 200);
  assert.deepEqual(created.json(), replayedAccount.json());
  assert.equal(host.calls.provision, 1);
  console.log(
    'PASS 2: approved account provisioned once; retry replays the result',
  );

  assert.equal((await post(signPath, provisionKey)).statusCode, 409);
  assert.equal(host.calls.sign, 0);
  console.log('PASS 3: idempotency key reused for another action rejected');

  const signed = await post(signPath, signKey);
  assert.equal(signed.statusCode, 200);
  assert.equal(
    recoverAddress(host.action.payload_hash, signed.json().signature),
    created.json().address,
  );
  const replayedSignature = await post(signPath, signKey);
  assert.equal(replayedSignature.statusCode, 200);
  assert.deepEqual(replayedSignature.json(), signed.json());
  assert.equal(host.calls.sign, 1);
  console.log(
    'PASS 4: approved stored action signed once; exact signature replayed',
  );

  host.state.grantActive = false;
  const revoked = await post(signPath, signKey);
  assert.equal(revoked.statusCode, 403);
  assert.equal(revoked.json().code, 'wallet_authorization_denied');
  assert.equal(host.calls.sign, 1);
  console.log(
    'PASS 5: revoked grant blocks even a previously successful result',
  );

  host.state.grantActive = true;
  host.state.kyc = 'REJECTED';
  assert.equal((await post(signPath, signKey)).statusCode, 403);
  assert.equal(host.calls.sign, 1);
  console.log('PASS 6: current KYC denial blocks backend effects');
  host.state.kyc = 'ID VERIFIED';

  const uncertainPath = `/v1/actions/${host.uncertainAction.action_id}/sign`;
  const uncertainKey = randomUUID();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const lost = await post(uncertainPath, uncertainKey);
    assert.equal(lost.statusCode, 503);
    assert.equal(lost.json().outcome, 'unknown');
  }
  assert.equal(host.calls.sign, 2); // One ordinary sign, one lost-response sign; no redispatch.
  console.log(
    'PASS 7: unknown signing outcome retained; retry does not redispatch',
  );
} catch {
  // Assertion diagnostics may contain signatures or addresses. Keep failures safe too.
  throw new Error(
    'Offline provider walkthrough failed; inspect the first unfinished PASS check in run.mjs',
  );
} finally {
  await app.close();
}
