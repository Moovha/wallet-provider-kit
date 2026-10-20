# Integrate the service

## HTTP and authentication

Applications use the [HTTP API](http-api.md). Bind every request to the authenticated application and current owner grant. Use a stable idempotency key per mutation and retain it on retries.

## Core wallet service

The core interfaces separate identity, provisioned signer storage, spending authorization and durable signing attempts. The configured service composes these with Safe authority and the UserOperation driver. Applications must use wallet calls, not invoke signing ports directly.

Read the generated [TypeScript reference](api-reference.md) for exact exports. Internal signing interfaces are provider implementation ports and do not constitute an alternate transaction API.
