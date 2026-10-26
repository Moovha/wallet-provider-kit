# On-chain owners and additional signatures

Use these APIs when a wallet needs additional signer addresses or a higher
approval threshold. Your application delivers signing payloads to its signers
and returns signatures; the provider toolkit verifies the exact operation,
collects the quorum and submits through its existing Safe/bundler/paymaster path.
The application chooses automatic or interactive signing and keeps private keys
with each signer. The toolkit does not supply device storage, notifications,
wallet-connection screens or device recovery.

## Separate access, ownership and authorization

Application members and their grants describe access to the provider API.
On-chain Safe owners and their threshold describe who can authorize a transaction.
Each operation needs signatures from the required number of distinct current owners.
Adding an address does not create a provider account or grant API access. An
application member does not become a Safe owner automatically.

Each wallet starts with the existing provider signer and threshold 1. Add owners
after provisioning; the original initializer, deterministic address and deployment
evidence stay unchanged. Address-only additions require no connection, onboarding
or proof of possession by the added signer. The owner-change transaction itself
requires the **current** on-chain quorum.

A 1-of-N policy allows the provider to transact independently. To require a device
signature alongside the provider, select 2-of-2. Plan recovery before enabling a
policy that requires a device key: losing a required signer can block the wallet.
The provider cannot lower the threshold without its current quorum.

## Configure administration permission

Enable `owners:manage` in the application's access settings, then obtain fresh
owner consent including that permission and `contracts:request`. The provider
requires an owner-only grant; membership and cross-application sharing grants
cannot administer ownership. Existing contract-call or member-management consent
does not authorize changing Safe owners.

Use application bearer scopes `wallet:access` for reads, `wallet:execute` for owner
changes, `wallet:sign` for signature delivery and `wallet:actions` for cancellation.
Executing a queued change also requires the normal `wallet:actions`, `wallet:sign`
and `wallet:execute` scopes. Use the selected wallet's `Wallet-Grant-Id`, especially
for shared wallets. `Wallet-Network` selects a configured network; a conflicting
wallet/network selection is rejected.

## Read and change the policy

`GET /v1/accounts/{accountId}/owners` reports:

- `confirmed`: accepted owner addresses, threshold, provider signer and revision.
- `observed`: owner addresses and threshold at a common canonical block, with its
  number and hash. Configured independent readers must agree.
- `pending`: a requested change and its batch ID, when present.
- `status`: `confirmed` or `suspended`.
- `capabilities`: address management, signature collection and the supported
  `eip712-ecdsa` scheme, with an owner-policy bound of 32 addresses.

Submit `POST /v1/accounts/{accountId}/owner-changes` with a UUIDv4
`Idempotency-Key` and the last confirmed revision:

```json
{
  "expected_policy_revision": "0",
  "change": {
    "type": "add",
    "owner": "0x2222222222222222222222222222222222222222",
    "threshold": 2
  }
}
```

Use `type: "remove"` with `owner` and the resulting `threshold`, or
`type: "threshold"` with just `threshold`. Invalid/duplicate/zero/sentinel/Safe-self
addresses and invalid thresholds are rejected. Toolkit changes retain the provider
signer. Removing owners uses the observed Safe linked-list predecessor.

The result contains `account_id`, `batch_id`, `requested` and `status: "pending"`.
Retry the same request with its original idempotency key. Another outstanding
owner change conflicts. Read batch status with `wallet_getCallsStatus` using the
returned batch ID. After independently verified finality, read `/owners` again:
the toolkit checks current chain state before confirming the new policy and
advancing its revision. Requested state never authorizes execution as confirmed state.

If external Safe tooling changes ownership unexpectedly, chain verification
rejects incompatible execution. Reading `/owners` records the observation and
suspends the wallet when it differs from the accepted policy. Do not overwrite
this record or bypass the threshold. Reconciliation of externally adopted policies
requires a separately reviewed administrative procedure; there is no automatic
adoption or provider-signer replacement API.

## Deliver a signing payload and return its signature

Submit ordinary transactions through the [wallet-call API](wallet-calls.md).
Owner changes use that same durable execution lane with narrowly generated Safe
administration calls. Ordinary contract-call permissions still cannot target the
Safe to administer it.

Once admission, fees and final sponsorship preparation succeed, discover requests
with `GET /v1/accounts/{accountId}/signing-requests`. The result contains up to
100 most recent requests belonging to this caller and wallet. Poll until the
operation appears. List access is not a public signing queue.

`GET /v1/accounts/{accountId}/signing-requests/{operationId}` returns:

| Field                               | Meaning                                                                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `batch_id`                          | Original wallet-call batch ID for matching the request to the locally initiated action; null for an advanced host admission outside the batch driver |
| `operation_id`, `account_id`        | Durable admitted operation and selected wallet                                                                                                       |
| `payload_revision`, `signing_hash`  | Exact EIP-712 digest; signatures must reference this revision                                                                                        |
| `chain_id`, `safe_address`, `nonce` | Network and immutable execution identity                                                                                                             |
| `expires_at`                        | Signed validity deadline                                                                                                                             |
| `owner_policy`                      | Owner set, threshold, provider signer and confirmed policy revision used for this operation                                                          |
| `signing_payload`                   | EIP-712 `domain`, `types`, `primaryType: "SafeOp"` and `message`                                                                                     |
| `calls`, `requested_action`         | Exact ordered calls and the source application request                                                                                               |
| `collected_owners`                  | Addresses whose signatures have been retained; no signature bytes are exported                                                                       |
| `signatures_required`               | Complete on-chain threshold                                                                                                                          |
| `additional_signatures_required`    | Remaining external signatures needed when the provider supplies one signature                                                                        |
| `state`                             | `collecting`, `quorum-ready`, `cancelled` or `expired`                                                                                               |

The payload uses the pinned Safe4337Module 0.3.0 EIP-712 domain for EntryPoint v0.7.
It is not a native SafeTx or a personal-message signing request. It binds calls,
nonce, gas limits, fee bounds, paymaster fields and validity. Your signer must
independently validate the actual transaction against its intended action and
policy. Authentication or a human-readable description alone cannot authorize it.

The application passes this exact payload to the selected signer, then submits:

```http
POST /v1/accounts/{accountId}/signing-requests/{operationId}/signatures
Authorization: Bearer APPLICATION_ACCESS_TOKEN
Idempotency-Key: UUID_V4
Content-Type: application/json
```

```json
{
  "payload_revision": "0x...exact signing_hash...",
  "owner": "0x2222222222222222222222222222222222222222",
  "signature": "0x...65-byte EIP-712 ECDSA signature..."
}
```

The example placeholders must be replaced with the returned digest and real
signature. The provider verifies current caller authority, ownership, nonce,
payload and expiry, then stores the signature atomically. An identical signature
for the same owner/operation is idempotent; a different retained signature conflicts.
Duplicates never increase the quorum. Wrong signer, chain, payload or stale policy
fails closed. The provider's own signature comes from its protected journaled
backend, rather than this intake API.

With threshold greater than 1, the worker waits without repeatedly signing or
submitting. Signature intake wakes it. The provider signs when the collected
external signatures plus its own can satisfy quorum; a complete external quorum
can execute without another provider signature. Signatures are ordered by owner
address and encoded with one module validity prefix before bundler submission.
All normal grant, consent, policy, fee, sponsorship and chain checks still apply.

Collection state describes signatures, not transaction finality. Track submission,
inclusion and finality through the original wallet-call batch status.

## TypeScript client

Use `createWalletsClient` from `@moovha/wallet-provider-kit/wallets` in a trusted
application backend. Its methods include `ownerPolicy`, `changeOwners`,
`signingRequests`, `signingRequest`, `submitOwnerSignature` and
`cancelSigningRequest`. Each accepts the selected wallet ID and optional grant
selector; mutations also accept a retained idempotency key.

```ts
const { requests } = await client.signingRequests(accountId, grantId);
for (const request of requests) {
  if (request.state !== 'collecting' || !request.batch_id) continue;
  await deviceSigner.validatePendingIntent(
    request.batch_id,
    request.calls,
    request.signing_payload,
  );
  const signature = await deviceSigner.signTypedData(request.signing_payload);
  await client.submitOwnerSignature(
    accountId,
    request.operation_id,
    {
      payload_revision: request.payload_revision,
      owner: deviceSigner.address,
      signature,
    },
    retainedDeliveryKey,
    grantId,
  );
}
```

`deviceSigner` and `retainedDeliveryKey` are application responsibilities. Never
embed an application client secret or backend bearer token in a mobile app.

## Expiry, cancellation and recovery

`POST /v1/accounts/{accountId}/signing-requests/{operationId}/cancel` with `{}`
stops further toolkit signing and submission before dispatch. Cancellation after
dispatch conflicts and requires receipt reconciliation. Previously issued
signatures cannot be recalled: their on-chain validity and nonce still apply.
The toolkit retains nonce and budget reservations rather than assuming a cancelled,
expired or uncertain request had no effects. Exposed unresolved operations may
block their wallet lane until independently reconciled. The worker releases an
exposed nonce only after finalized chain time exceeds the signed deadline and an
exhaustive log scan proves absence of execution. Failed or expired owner changes
can then be cleared by reading owners. There is no administrative reset that
bypasses this evidence. Pending funding capacity becomes available only when the
funding snapshot includes that finalized expiry block; cumulative budget counters
and audit records remain retained.

Requests retain their exact payload and signatures across restart. Changing fees,
network, policy or paymaster fields cannot reprice an issued signing request.
Unknown backend-signing or bundler outcomes keep the original durable claim.
Never recover by generating another operation identity and hoping the first failed.

The original deployment initializer remains the address derivation source.
The recovery-manifest API rejects co-owned wallets because reproducing the
original single-owner deployment on another network does not reproduce a later
owner policy. Device-key recovery and cross-network co-owner recovery need their
own acceptance; this API does not claim them.

Only strict 65-byte EIP-712 ECDSA owner signatures are accepted. Contract-owner
ERC-1271 signatures, personal-message signatures and passkey contract signatures
are not accepted by this collector. Adding an arbitrary address does not establish
that it can use this scheme. Large quorums must also fit the application's accepted
gas ceilings; estimation includes signature length and additional signer work.

The persistent records use the existing network-specific structured service
records and schema version 2. No new SQL tables or automatic DDL migration is
required. Older schema versions remain unsupported. Back up private provider
storage and protect signing payloads/signatures from application logs. See
[storage](storage.md), [signing](durable-safe-op-signing.md) and the
[HTTP reference](http-reference.md).
