# Embed the toolkit in your own server

Most teams can deploy the service and use its [HTTP API](http-api.md). Use this
page when your developer needs to embed TypeScript modules in an existing host.
That integration must preserve the same wallet permissions and recovery guarantees.

## HTTP and authentication

Bind every request to its authenticated application and current owner grant.
Keep a stable idempotency key per mutation and retain it on retries. The
[HTTP guide](http-api.md) covers the application-facing sequence.

## Core wallet service

Core interfaces separate identity, signer storage, spending authorisation and
saved signing attempts. The configured service composes them with Safe authority
and the UserOperation driver. Applications submit [wallet calls](wallet-calls.md);
internal signing ports do not supply an alternate transaction API.

Read [provider responsibilities](provider-guide.md) before changing this boundary.
Then use the [TypeScript reference](api-reference.md) for exact imports and
interfaces, and [durable attempts](durable-attempts.md) for retry behaviour.
