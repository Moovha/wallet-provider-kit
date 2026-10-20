---
prev: { 'text': 'Paying network fees', 'link': '/docs/assets-and-gas' }
next: { 'text': 'Before welcoming users', 'link': '/docs/conformance' }
---

# Test your application connection

Use an isolated Base Sepolia environment before inviting users. This walkthrough
is for the provider operator and application developer together. It includes
network effects and funding, so agree the test accounts, limits and authorisation
before running it. Routine repository tests use offline fixtures instead.

## Have the connection ready

Start with wallet operations disabled and persistent storage retained. Add a test
application, agree [user checks and consent](application-access.md), publish its
[transaction rules](runtime-configuration.md), and accept services and sponsorship.
Complete the relevant [launch checks](conformance.md), including recovery, before
enabling a controlled test.

Provision its bundler/paymaster through the provider operator API. Read and verify
the application’s returned gas-funding address, then fund only the agreed testnet
amount. Keep administrator and application credentials separate.

## Walk through one person’s experience

1. Obtain an application token and read the current access policy.
2. Sign in as an approved test user in the application. Record the agreed identity
   evidence and consent, then submit the access request.
3. Save its request, account and grant IDs. Provision the person’s Safe with an
   idempotency key and retain the returned address.
4. Submit an approved zero-value atomic call using the [wallet API](wallet-calls.md).
   Keep its batch ID. Check status until independently verified inclusion is
   reported; check finality separately.
5. Withdraw permission in the application. Confirm that access and new signing
   are denied. Obtain fresh consent before testing reconnection.

A granted access request, a saved batch and an executed transaction are different
results. Record which one each step establishes.

## Check the difficult cases too

Test a second application’s inability to access the first user’s account, an
expired approval, changed calldata, a repeated identical request and a lost
response. Preserve original IDs and keys; restart using the same data. An
uncertain response requires status inspection and [reconciliation](durable-attempts.md),
not cleared records or a fresh mutation identity.

## Review the result

Retain outcomes, denials and unresolved work privately. For latency comparisons,
reuse the same ten test users, Safes and workload. Count every offered request,
including failures, and independently verify every operation. Testnet results do
not establish production capacity, custody acceptance or a service objective.

Continue with the [launch checklist](conformance.md) and agree who owns
[monitoring](operations.md) and [recovery](provider-maintenance.md).
