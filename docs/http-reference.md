# HTTP schema reference

Use this reference to look up an exact request or response while integrating an
application or management tool. Start with the [application API guide](http-api.md)
for the request sequence, or [provider administration](provider-installation.md#automate-provider-administration)
for management access.

These schemas come from the [implemented contract](../spec/provider-api.json).
Route availability depends on current configuration and permission. A schema
describes an input; it does not grant authority to use it. The
[contributor guide](../CONTRIBUTING.md#development) covers regeneration.

## GET `/v1/networks`

Operation: `listNetworks`.

**Why this exists:** Discover the networks offered by this instance and its default for existing integrations.

**Who uses it:** Application developer.

**When you need it:** Read before presenting a network choice or configuring an application’s network services.

**Before you start:** No token is needed. Select a network with Wallet-Network on access-policy, access-request and application-configuration calls. Stored account, request and grant IDs route automatically.

**Result and next step:** 200: network names, chain IDs and execution status. Each network needs its own wallet consent, transaction rules and fee funding.

**Request details:** Discover enabled network configurations. Identity and application registrations are shared; each network has separate wallets, approvals and fee funding. Configured means execution is enabled and current, not that an application has funded it.

| Status | Content type     | Description      |
| ------ | ---------------- | ---------------- |
| 200    | application/json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "required": ["default_network", "networks"],
  "properties": {
    "default_network": {
      "type": "string"
    },
    "networks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["network", "name", "chain_id", "configured"],
        "properties": {
          "network": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "chain_id": {
            "type": "string"
          },
          "configured": {
            "type": "boolean"
          }
        }
      }
    }
  }
}
```

## GET `/v1/execution-capabilities`

Operation: `getExecutionCapabilities`.

**Why this exists:** Learn which transaction methods, network and execution features the service supports.

**Who uses it:** Application developer.

**When you need it:** Use when implementing wallet transactions or checking integration compatibility. GET /v1/capabilities is the simpler first connectivity check.

**Before you start:** No authentication required.

**Result and next step:** 200: the Safe ERC-4337 contract and configuration availability.

| Parameter        | Location | Required | Schema                                                                           |
| ---------------- | -------- | -------- | -------------------------------------------------------------------------------- |
| `wallet-network` | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}` |

| Status | Content type     | Description      |
| ------ | ---------------- | ---------------- |
| 200    | application/json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["profile", "revision", "configured"],
  "properties": {
    "profile": {
      "enum": ["safe-only-4337-v1"]
    },
    "revision": {
      "enum": ["1"]
    },
    "configured": {
      "type": "boolean"
    }
  }
}
```

## GET `/v1/capabilities`

Operation: `getCapabilities`.

**Why this exists:** Confirm that the provider responds and see whether it is configured for wallet operations.

**Who uses it:** Anyone connecting an application.

**When you need it:** Start here when connecting or troubleshooting. This public request needs no token.

**Before you start:** No token is needed. The configured field says whether the service is ready for wallet operations.

**Result and next step:** 200: the service profile and configured status. A 200 response confirms that discovery works; check configured before trying wallet operations.

| Parameter        | Location | Required | Schema                                                                           |
| ---------------- | -------- | -------- | -------------------------------------------------------------------------------- |
| `wallet-network` | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}` |

| Status | Content type     | Description      |
| ------ | ---------------- | ---------------- |
| 200    | application/json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "required": ["profile", "status", "configured"],
  "additionalProperties": false,
  "properties": {
    "profile": {
      "type": "string",
      "enum": ["safe-wallet-service"]
    },
    "status": {
      "type": "string",
      "enum": ["experimental"]
    },
    "configured": {
      "type": "boolean"
    },
    "configuration_profile": {
      "type": "string",
      "enum": ["provider-service-v1"]
    },
    "action_profiles": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": ["provider-approved-contracts-v1"]
      }
    }
  }
}
```

## POST `/v1/enrollments`

Operation: `beginEnrollment`.

**Why this exists:** Reserve an identity-enrollment request and a login challenge for a custom host-owned identity integration.

**Who uses it:** Host integration developer.

**When you need it:** Use only when embedding the separate EnrollmentService with your own identity and authority integration. It is not available in the standard configured service.

**Before you start:** Compose the separate EnrollmentService with host-owned durable authority and OIDC identity verification. This profile is unavailable in the configured setup service and cannot be combined with application access onboarding.

**Result and next step:** 201: reserved enrollment/account IDs and a nonce-bound identity challenge. No wallet or spending grant is created.

**Request details:** Reserve an owner-enrollment challenge through current host policy and durable storage. No wallet is created.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["identity_subject"],
  "properties": {
    "identity_subject": {
      "type": "string",
      "minLength": 1,
      "maxLength": 255
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 201    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "enrollment_id",
    "account_id",
    "status",
    "nonce",
    "expires_at",
    "identity_issuer",
    "identity_client_id",
    "required_claims"
  ],
  "properties": {
    "enrollment_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "account_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "status": {
      "type": "string",
      "enum": [
        "awaiting_identity",
        "accepted",
        "needs_verification",
        "rejected"
      ]
    },
    "nonce": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_-]{43}$"
    },
    "expires_at": {
      "type": "string",
      "format": "date-time"
    },
    "identity_issuer": {
      "type": "string"
    },
    "identity_client_id": {
      "type": "string"
    },
    "required_claims": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  }
}
```

## POST `/v1/enrollments/{enrollmentId}/identity`

Operation: `submitEnrollmentIdentity`.

**Why this exists:** Submit the completed provider-login identity proof for a reserved enrollment request.

**Who uses it:** Host integration developer.

**When you need it:** Use only in the custom EnrollmentService flow, after its nonce-bound login. This does not grant application wallet access or spending authority.

**Before you start:** Complete the provider-owned OIDC flow using the reserved nonce. Submit a provider-audience OIDC Identity Assurance ID token only to this identity endpoint; the HTTP Authorization header still requires an application access token.

**Result and next step:** 200: the provider enrollment decision. A verified identity token does not grant wallet access or spending authority.

**Request details:** Submit a provider-nonce-bound OIDC Identity Assurance ID token. Provider policy decides acceptance; this never creates a wallet or spend grant.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `enrollmentId`    | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["id_token"],
  "properties": {
    "id_token": {
      "type": "string",
      "maxLength": 32768,
      "pattern": "^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$"
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["enrollment_id", "account_id", "status"],
  "properties": {
    "enrollment_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "account_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "status": {
      "type": "string",
      "enum": [
        "awaiting_identity",
        "accepted",
        "needs_verification",
        "rejected"
      ]
    }
  }
}
```

## GET `/v1/enrollments/{enrollmentId}`

Operation: `getEnrollment`.

**Why this exists:** Read the decision for a previously reserved custom identity enrollment without returning private identity attributes.

**Who uses it:** Host integration developer.

**When you need it:** Use only in the separate EnrollmentService integration. Standard applications check their wallet-access request instead.

**Before you start:** Use the reserved enrollment ID with the original authorized caller and current host permission.

**Result and next step:** 200: the current enrollment receipt without identity attributes or proof tokens.

**Request details:** Read the current authorized enrollment receipt without identity attributes or the proof token.

| Parameter      | Location | Required | Schema                                                                                                |
| -------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `enrollmentId` | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["enrollment_id", "account_id", "status"],
  "properties": {
    "enrollment_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "account_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "status": {
      "type": "string",
      "enum": [
        "awaiting_identity",
        "accepted",
        "needs_verification",
        "rejected"
      ]
    }
  }
}
```

## POST `/v1/accounts/{accountId}/provision`

Operation: `provisionAccount`.

**Why this exists:** Create or locate the Safe wallet for an account that already has current approved access.

**Who uses it:** Application developer.

**When you need it:** Use after POST /v1/access-requests returns a granted account. Keep the original retry key if creation is pending or its outcome is uncertain.

**Before you start:** Use the accepted account_id with current owner-granted access and an empty JSON body: {}. Keep the original idempotency key when retrying. Investigate an unknown outcome before trying again.

**Result and next step:** 200: the user Safe account address and provisioning status. Deployment uses accepted application infrastructure. Pending deployment retains its original attempt; retry with the same identity. Wallet creation does not grant spending permission.

**Request details:** Provision a host-authorized account by stored ID with an empty body and durable attempt. When enrollment is configured, current provider acceptance for the same caller/account/owner is also required. Acceptance does not grant signing rights.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `accountId`       | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |
| `wallet-grant-id` | header   | no       | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "maxProperties": 0
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["account_id", "address"],
  "properties": {
    "account_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "smart_account": {
      "type": "object",
      "additionalProperties": false,
      "required": ["profile", "chain_id", "address", "status"],
      "properties": {
        "profile": {
          "type": "string",
          "enum": ["safe-1.4.1"]
        },
        "chain_id": {
          "type": "string",
          "enum": ["eip155:8453", "eip155:84532", "eip155:1", "eip155:11155111"]
        },
        "address": {
          "type": "string",
          "pattern": "^0x[0-9a-fA-F]{40}$"
        },
        "status": {
          "type": "string",
          "enum": ["prepared", "pending", "ready", "unknown"]
        }
      }
    },
    "address": {
      "type": "string",
      "pattern": "^0x[0-9a-fA-F]{40}$"
    }
  }
}
```

## GET `/v1/configuration/applications/{applicationId}/safe-wallet`

Operation: `readSafeWalletInfrastructure`.

**Why this exists:** See whether the application’s fee-paying infrastructure is prepared and whether it needs funding.

**Who uses it:** Service operator.

**When you need it:** Use before preparing or troubleshooting wallet creation. This concerns application fee funding, not a person’s wallet balance.

**Before you start:** Use a configured provider operator and an accepted application ID.

**Result and next step:** 200: the retained funding address, paymaster and setup status. Private signer credentials are never returned.

| Parameter        | Location | Required | Schema                                                                           |
| ---------------- | -------- | -------- | -------------------------------------------------------------------------------- |
| `applicationId`  | path     | yes      | `{"type":"string","pattern":"^[a-f0-9]{64}$"}`                                   |
| `wallet-network` | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}` |

| Status | Content type     | Description      |
| ------ | ---------------- | ---------------- |
| 200    | application/json | Default Response |
| 403    | application/json | Default Response |
| 503    | application/json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["application_id", "chain_id", "profile", "status"],
  "properties": {
    "application_id": {
      "type": "string"
    },
    "chain_id": {
      "type": "string"
    },
    "profile": {
      "enum": ["safe-only-4337-v1"]
    },
    "status": {
      "type": "string",
      "enum": ["unprovisioned", "needs-funding", "provisioned"]
    },
    "funding_address": {
      "type": "string"
    },
    "paymaster": {
      "type": "string"
    }
  }
}
```

## POST `/v1/configuration/applications/{applicationId}/safe-wallet`

Operation: `provisionSafeWalletInfrastructure`.

**Why this exists:** Prepare the private transaction submission service and fee-paying contract needed for the application’s wallets.

**Who uses it:** Service operator.

**When you need it:** Use after accepting its network services and fee agreement. This setup may deploy contracts and consume application funding; it does not create a user wallet.

**Before you start:** Accept the application RPC and sponsorship terms. Fund the returned application address and retry with the original application identity.

**Result and next step:** 200: journaled paymaster deployment and gas funding. Uncertain transactions retain their original signed payload and hash.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `applicationId`   | path     | yes      | `{"type":"string","pattern":"^[a-f0-9]{64}$"}`                                                        |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false
}
```

| Status | Content type     | Description      |
| ------ | ---------------- | ---------------- |
| 200    | application/json | Default Response |
| 403    | application/json | Default Response |
| 503    | application/json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["application_id", "chain_id", "profile", "status"],
  "properties": {
    "application_id": {
      "type": "string"
    },
    "chain_id": {
      "type": "string"
    },
    "profile": {
      "enum": ["safe-only-4337-v1"]
    },
    "status": {
      "type": "string",
      "enum": ["unprovisioned", "needs-funding", "provisioned"]
    },
    "funding_address": {
      "type": "string"
    },
    "paymaster": {
      "type": "string"
    }
  }
}
```

## POST `/v1/configuration/applications/{applicationId}/safe-wallet/funding-address`

Operation: `prepareApplicationFundingAddress`.

**Why this exists:** Create or retrieve the retained address used to fund an application’s accepted network-fee infrastructure.

**Who uses it:** Service operator.

**When you need it:** Use after offering provider fee terms or approving application-submitted terms, including while wallet execution is disabled.

**Before you start:** Authenticate as a current provider operator. The application must be active with pending provider-offered terms or accepted fee terms on the selected network.

**Result and next step:** 200: the stable application funding address and infrastructure status. No chain access, contract deployment, transfer or wallet activation occurs. Complete infrastructure acceptance separately before funding or wallet use.

**Request details:** Retain a stable application funding address after the provider offers fee terms or accepts application-submitted terms. Application acceptance is required before provider-offered terms permit sponsorship. Operator-only; does not contact the chain, deploy contracts, transfer funds or enable execution.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `applicationId`   | path     | yes      | `{"type":"string","pattern":"^[a-f0-9]{64}$"}`                                                        |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false
}
```

| Status | Content type     | Description      |
| ------ | ---------------- | ---------------- |
| 200    | application/json | Default Response |
| 403    | application/json | Default Response |
| 503    | application/json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["application_id", "chain_id", "profile", "status"],
  "properties": {
    "application_id": {
      "type": "string"
    },
    "chain_id": {
      "type": "string"
    },
    "profile": {
      "enum": ["safe-only-4337-v1"]
    },
    "status": {
      "type": "string",
      "enum": ["unprovisioned", "needs-funding", "provisioned"]
    },
    "funding_address": {
      "type": "string"
    },
    "paymaster": {
      "type": "string"
    }
  }
}
```

## POST `/v1/access-requests`

Operation: `requestAccountAccess`.

**Why this exists:** Ask the provider to accept completed identity checks and the person’s recorded permission, then obtain account access IDs.

**Who uses it:** Application developer.

**When you need it:** Use after reading the access requirements and obtaining consent inside the application. Creating or reconnecting access is separate from creating the blockchain wallet.

**Before you start:** After the person completes the agreed identity checks and approves wallet access in your application, submit those records here. First read GET /v1/access-policy for the required fields and current terms. Use mode=create without wallet to preserve the default Personal account. To add a wallet, supply wallet.reference, name and kind (personal or shared), and consent.wallet_reference. A verified user can omit identity while their saved checks remain current. Each wallet needs its own consent. Use mode=connect with account_id and consent.account_id to renew a selected wallet; invited members also supply consent.membership_revision. To request a wallet from a selected source application, read GET /v1/access-policy?source_application_id=SOURCE_CONNECTION_ID, then use mode=connect_from_application and source_application_id without account_id. Omit source_account_id to connect the source Personal wallet, or select another source_account_id and include consent.account_id. Include the returned sharing revision and source application in fresh consent for the requesting application. All configured identity fields must match exactly; ambiguous matches are denied. The provider must trust your application’s checks. Hosted compatibility mode uses a separate provider login and review.

**Result and next step:** 200: the access decision. A granted response includes account_id, grant_id, allowed actions and expiry. Save those IDs, then let the creating application provision the blockchain wallet. Shared-wallet account requests require Wallet-Grant-Id; use the selected person’s grant_id. List consented wallets with POST /v1/accounts/query. Reconnecting preserves the existing account. This request does not create an on-chain wallet or send money. Missing, stale or unauthorized evidence is rejected; consent_url is only for hosted compatibility mode.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["mode", "authorization_details"],
  "properties": {
    "mode": {
      "type": "string",
      "enum": ["create", "connect", "connect_from_application"]
    },
    "wallet": {
      "type": "object",
      "additionalProperties": false,
      "required": ["reference", "name", "kind"],
      "properties": {
        "reference": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9_-]{0,63}$"
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 80
        },
        "kind": {
          "enum": ["personal", "shared"]
        }
      }
    },
    "source_account_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "account_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "source_application_id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 256,
      "description": "Source application connection ID for connect_from_application, using the same provider issuer. Omit account_id; the provider requires one unique verified identity match."
    },
    "identity_record": {
      "type": "object",
      "additionalProperties": false,
      "required": ["reference", "fields"],
      "properties": {
        "reference": {
          "type": "string",
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$"
        },
        "fields": {
          "type": "object",
          "minProperties": 1,
          "maxProperties": 64,
          "additionalProperties": {
            "type": "string",
            "minLength": 1,
            "maxLength": 512
          }
        }
      }
    },
    "user": {
      "description": "Required in application-led mode. The explicitly trusted application attests its stable user identity and recorded consent; OAuth scopes alone do not establish these facts.",
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "consent"],
      "properties": {
        "id": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "identity": {
          "type": "object",
          "additionalProperties": false,
          "required": ["reference", "level", "verified_at", "fields"],
          "properties": {
            "reference": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "level": {
              "type": "string",
              "minLength": 1,
              "maxLength": 100
            },
            "verified_at": {
              "type": "string",
              "format": "date-time"
            },
            "fields": {
              "type": "object",
              "maxProperties": 16,
              "additionalProperties": {
                "type": "string",
                "minLength": 1,
                "maxLength": 512
              }
            }
          }
        },
        "consent": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "reference",
            "granted_at",
            "expires_at",
            "policy_revision"
          ],
          "properties": {
            "reference": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "granted_at": {
              "type": "string",
              "format": "date-time"
            },
            "expires_at": {
              "type": "string",
              "format": "date-time"
            },
            "policy_revision": {
              "type": "string",
              "pattern": "^[a-f0-9]{64}$"
            },
            "source_application_id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "account_id": {
              "type": "string",
              "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
            },
            "wallet_reference": {
              "type": "string",
              "pattern": "^[a-z][a-z0-9_-]{0,63}$"
            },
            "membership_revision": {
              "type": "integer",
              "minimum": 1
            },
            "sharing_revision": {
              "type": "string",
              "pattern": "^[a-f0-9]{64}$"
            },
            "action_policy_revision": {
              "type": "string",
              "pattern": "^[a-f0-9]{64}$"
            }
          }
        }
      }
    },
    "authorization_details": {
      "type": "array",
      "minItems": 1,
      "maxItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["type", "actions"],
        "properties": {
          "type": {
            "type": "string",
            "enum": ["https://moovha.com/wallet/account-access"]
          },
          "actions": {
            "type": "array",
            "minItems": 1,
            "maxItems": 4,
            "uniqueItems": true,
            "items": {
              "type": "string",
              "enum": [
                "account:read",
                "operations:request",
                "contracts:request",
                "members:manage"
              ]
            }
          }
        }
      }
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Default Response |
| 401    | application/problem+json | Default Response |
| 403    | application/problem+json | Default Response |
| 409    | application/problem+json | Default Response |
| 413    | application/problem+json | Default Response |
| 415    | application/problem+json | Default Response |
| 422    | application/problem+json | Default Response |
| 429    | application/problem+json | Default Response |
| 500    | application/problem+json | Default Response |
| 503    | application/problem+json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["request_id", "status"],
  "properties": {
    "wallet": {
      "type": "object",
      "additionalProperties": false,
      "required": ["reference", "name", "kind"],
      "properties": {
        "reference": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9_-]{0,63}$"
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 80
        },
        "kind": {
          "enum": ["personal", "shared"]
        }
      }
    },
    "membership_revision": {
      "type": "integer",
      "minimum": 1
    },
    "request_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "status": {
      "type": "string",
      "enum": [
        "consent_required",
        "verification_required",
        "funding_approval_required",
        "identity_pending",
        "reconciliation_required",
        "provider_review_required",
        "granted",
        "denied",
        "expired",
        "suspended",
        "revoked",
        "policy_changed"
      ]
    },
    "consent_url": {
      "type": "string",
      "format": "uri",
      "description": "Hosted compatibility only. Application-led grants have no provider user redirect."
    },
    "grant_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "account_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "permissions": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "account:read",
          "operations:request",
          "contracts:request",
          "members:manage"
        ]
      }
    },
    "expires_at": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

## GET `/v1/access-policy`

Operation: `getAccountAccessPolicy`.

**Why this exists:** Learn which identity information, check age and consent terms your application must meet before requesting wallet access.

**Who uses it:** Application developer.

**When you need it:** Use before asking someone for permission, and after shared requirements or transaction policies change.

**Before you start:** Call this before asking a person for wallet permission. Use your application token to learn which identity information to send, how recent the checks must be and how long permission can last. The provider operator sets these shared requirements under User checks in administration; this endpoint reads them and does not change settings or return customer records.

**Result and next step:** 200: required_fields lists the identity field names; verification_level is the agreed check label. max_identity_age_days limits check age and max_access_days limits permission duration. Show the requested actions and terms, record the person’s consent to policy_revision (and action_policy_revision for transactions), then submit POST /v1/access-requests. For cross-application access, supply source_application_id as a query parameter to receive wallet_sharing.matching_fields and wallet_sharing.revision. Record consent to that revision and source application. Reading these requirements does not grant wallet access.

| Parameter               | Location | Required | Schema                                                                           |
| ----------------------- | -------- | -------- | -------------------------------------------------------------------------------- |
| `source_application_id` | query    | no       | `{"type":"string","minLength":1,"maxLength":256}`                                |
| `wallet-network`        | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}` |

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Default Response |
| 401    | application/problem+json | Default Response |
| 403    | application/problem+json | Default Response |
| 409    | application/problem+json | Default Response |
| 413    | application/problem+json | Default Response |
| 415    | application/problem+json | Default Response |
| 422    | application/problem+json | Default Response |
| 429    | application/problem+json | Default Response |
| 500    | application/problem+json | Default Response |
| 503    | application/problem+json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "source",
    "evaluation_only",
    "required_fields",
    "maximum_field_characters",
    "owner_consent_required",
    "provider_review_required"
  ],
  "properties": {
    "chain_id": {
      "type": "string",
      "enum": ["eip155:8453", "eip155:84532", "eip155:1", "eip155:11155111"]
    },
    "source": {
      "type": "string",
      "enum": [
        "application_record",
        "vendor_verification",
        "application_attestation"
      ]
    },
    "evaluation_only": {
      "type": "boolean"
    },
    "required_fields": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "maximum_field_characters": {
      "type": "integer"
    },
    "owner_consent_required": {
      "type": "boolean",
      "enum": [true]
    },
    "provider_review_required": {
      "type": "boolean"
    },
    "provider_login_required": {
      "type": "boolean"
    },
    "flow": {
      "type": "string",
      "enum": ["application", "hosted"]
    },
    "policy_revision": {
      "type": "string"
    },
    "action_policy_revision": {
      "type": "string"
    },
    "contract_call_terms": {
      "type": "object",
      "additionalProperties": false,
      "required": ["policy", "maxValiditySeconds"],
      "properties": {
        "policy": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "mechanism",
            "multiSend",
            "maximumNativeValueWei",
            "lifetimeOperations",
            "contracts"
          ],
          "properties": {
            "mechanism": {
              "enum": ["safe-1.4.1"]
            },
            "multiSend": {
              "type": "object",
              "additionalProperties": false,
              "required": ["address", "codeHash"],
              "properties": {
                "address": {
                  "type": "string",
                  "pattern": "^0x[0-9a-fA-F]{40}$"
                },
                "codeHash": {
                  "type": "string",
                  "pattern": "^0x[0-9a-f]{64}$"
                },
                "implementation": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["address", "codeHash"],
                  "properties": {
                    "address": {
                      "type": "string",
                      "pattern": "^0x[0-9a-fA-F]{40}$"
                    },
                    "codeHash": {
                      "type": "string",
                      "pattern": "^0x[0-9a-f]{64}$"
                    }
                  }
                }
              }
            },
            "maximumNativeValueWei": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            },
            "lifetimeOperations": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            },
            "contracts": {
              "type": "array",
              "maxItems": 128,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "address",
                  "codeHash",
                  "selectors",
                  "maximumValueWei"
                ],
                "properties": {
                  "address": {
                    "type": "string",
                    "pattern": "^0x[0-9a-fA-F]{40}$"
                  },
                  "codeHash": {
                    "type": "string",
                    "pattern": "^0x[0-9a-f]{64}$"
                  },
                  "selectors": {
                    "type": "array",
                    "maxItems": 128,
                    "items": {
                      "type": "string",
                      "pattern": "^0x[0-9a-f]{8}$"
                    }
                  },
                  "maximumValueWei": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  },
                  "implementation": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      }
                    }
                  }
                }
              }
            },
            "swaps": {
              "type": "array",
              "maxItems": 128,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "id",
                  "router",
                  "tokenIn",
                  "tokenOut",
                  "fee",
                  "maximumInput"
                ],
                "properties": {
                  "id": {
                    "type": "string",
                    "pattern": "^[A-Za-z0-9._-]{1,64}$"
                  },
                  "router": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "tokenIn": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "tokenOut": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "fee": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 999999
                  },
                  "maximumInput": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            },
            "vaults": {
              "type": "array",
              "maxItems": 128,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["id", "router", "vault", "asset", "maximumAssets"],
                "properties": {
                  "id": {
                    "type": "string",
                    "pattern": "^[A-Za-z0-9._-]{1,64}$"
                  },
                  "router": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "vault": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "asset": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "maximumAssets": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            },
            "adapters": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "tokenTransfers": {
                  "type": "array",
                  "maxItems": 128,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["token", "recipients", "maximumAmount"],
                    "properties": {
                      "token": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "recipients": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 128,
                        "uniqueItems": true,
                        "items": {
                          "type": "string",
                          "pattern": "^0x[0-9a-fA-F]{40}$"
                        }
                      },
                      "maximumAmount": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      },
                      "lifetimeAmount": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      }
                    }
                  }
                },
                "swaps": {
                  "type": "array",
                  "maxItems": 128,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "id",
                      "router",
                      "tokenIn",
                      "tokenOut",
                      "fee",
                      "maximumInput"
                    ],
                    "properties": {
                      "id": {
                        "type": "string",
                        "pattern": "^[A-Za-z0-9._-]{1,64}$"
                      },
                      "router": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "tokenIn": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "tokenOut": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "fee": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 999999
                      },
                      "maximumInput": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      }
                    }
                  }
                },
                "vaults": {
                  "type": "array",
                  "maxItems": 128,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "id",
                      "router",
                      "vault",
                      "asset",
                      "maximumAssets"
                    ],
                    "properties": {
                      "id": {
                        "type": "string",
                        "pattern": "^[A-Za-z0-9._-]{1,64}$"
                      },
                      "router": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "vault": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "asset": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "maximumAssets": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      }
                    }
                  }
                }
              }
            },
            "nativeTransfers": {
              "type": "object",
              "additionalProperties": false,
              "required": ["recipients"],
              "properties": {
                "recipients": {
                  "type": "array",
                  "maxItems": 128,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash", "maximumValueWei"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "maximumValueWei": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "maxValiditySeconds": {
          "type": "integer",
          "minimum": 60,
          "maximum": 3600
        }
      }
    },
    "runtime_contract_terms": {
      "type": "object",
      "additionalProperties": false,
      "required": ["application_id", "revision", "policy_hash", "policy"],
      "properties": {
        "application_id": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        },
        "revision": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,19})$"
        },
        "policy_hash": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        },
        "policy": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "version",
            "enabled",
            "chain_id",
            "contracts",
            "maximum_calls",
            "maximum_native_value_wei",
            "max_validity_seconds",
            "claim_requirements"
          ],
          "properties": {
            "action_requirements": {
              "type": "array",
              "maxItems": 64,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["name", "description", "fields"],
                "properties": {
                  "name": {
                    "type": "string",
                    "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                  },
                  "description": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                  },
                  "fields": {
                    "type": "array",
                    "maxItems": 32,
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["name", "required", "allowed_values"],
                      "properties": {
                        "name": {
                          "type": "string",
                          "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                        },
                        "required": {
                          "type": "boolean"
                        },
                        "allowed_values": {
                          "type": "array",
                          "minItems": 1,
                          "maxItems": 64,
                          "uniqueItems": true,
                          "items": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 128
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            "application_resources_hash": {
              "type": "string",
              "pattern": "^[0-9a-f]{64}$"
            },
            "version": {
              "type": "string",
              "enum": ["1"]
            },
            "enabled": {
              "type": "boolean"
            },
            "chain_id": {
              "type": "string",
              "enum": [
                "eip155:84532",
                "eip155:8453",
                "eip155:1",
                "eip155:11155111"
              ]
            },
            "contracts": {
              "type": "array",
              "maxItems": 32,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["address", "code_hash", "methods"],
                "properties": {
                  "address": {
                    "type": "string",
                    "pattern": "^0x[0-9a-fA-F]{40}$"
                  },
                  "code_hash": {
                    "type": "string",
                    "pattern": "^0x[0-9a-f]{64}$"
                  },
                  "implementation": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "code_hash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "code_hash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      }
                    }
                  },
                  "methods": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 32,
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["signature", "maximum_value_wei"],
                      "properties": {
                        "signature": {
                          "type": "string",
                          "minLength": 3,
                          "maxLength": 256
                        },
                        "maximum_value_wei": {
                          "type": "string",
                          "pattern": "^(0|[1-9][0-9]{0,77})$"
                        },
                        "user_address_parameters": {
                          "type": "array",
                          "minItems": 1,
                          "maxItems": 16,
                          "uniqueItems": true,
                          "items": {
                            "type": "integer",
                            "minimum": 0,
                            "maximum": 31
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            "call_adapters": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "tokenTransfers": {
                  "type": "array",
                  "maxItems": 128,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["token", "recipients", "maximumAmount"],
                    "properties": {
                      "token": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "recipients": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 128,
                        "uniqueItems": true,
                        "items": {
                          "type": "string",
                          "pattern": "^0x[0-9a-fA-F]{40}$"
                        }
                      },
                      "maximumAmount": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      },
                      "lifetimeAmount": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      }
                    }
                  }
                },
                "swaps": {
                  "type": "array",
                  "maxItems": 128,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "id",
                      "router",
                      "tokenIn",
                      "tokenOut",
                      "fee",
                      "maximumInput"
                    ],
                    "properties": {
                      "id": {
                        "type": "string",
                        "pattern": "^[A-Za-z0-9._-]{1,64}$"
                      },
                      "router": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "tokenIn": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "tokenOut": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "fee": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 999999
                      },
                      "maximumInput": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      }
                    }
                  }
                },
                "vaults": {
                  "type": "array",
                  "maxItems": 128,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "id",
                      "router",
                      "vault",
                      "asset",
                      "maximumAssets"
                    ],
                    "properties": {
                      "id": {
                        "type": "string",
                        "pattern": "^[A-Za-z0-9._-]{1,64}$"
                      },
                      "router": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "vault": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "asset": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "maximumAssets": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      }
                    }
                  }
                }
              }
            },
            "native_transfers": {
              "type": "array",
              "maxItems": 32,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["address", "code_hash", "maximum_value_wei"],
                "properties": {
                  "address": {
                    "type": "string",
                    "pattern": "^0x[0-9a-fA-F]{40}$"
                  },
                  "code_hash": {
                    "type": "string",
                    "pattern": "^0x[0-9a-f]{64}$"
                  },
                  "maximum_value_wei": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            },
            "maximum_calls": {
              "type": "integer",
              "minimum": 1,
              "maximum": 16
            },
            "maximum_native_value_wei": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            },
            "max_validity_seconds": {
              "type": "integer",
              "minimum": 1,
              "maximum": 3600
            },
            "claim_requirements": {
              "type": "array",
              "maxItems": 16,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["name", "allowed_values", "max_age_seconds"],
                "properties": {
                  "name": {
                    "type": "string",
                    "pattern": "^[a-z][a-z0-9_]{0,63}$"
                  },
                  "allowed_values": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 32,
                    "uniqueItems": true,
                    "items": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 128
                    }
                  },
                  "max_age_seconds": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 31536000
                  }
                }
              }
            }
          }
        }
      }
    },
    "max_identity_age_days": {
      "type": "integer"
    },
    "max_access_days": {
      "type": "integer"
    },
    "wallet_sharing": {
      "type": "object",
      "additionalProperties": false,
      "required": ["source_application_id", "matching_fields", "revision"],
      "properties": {
        "source_application_id": {
          "type": "string"
        },
        "matching_fields": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "revision": {
          "type": "string"
        }
      }
    },
    "verification_level": {
      "type": "string"
    }
  }
}
```

## POST `/v1/accounts/query`

Operation: `listUserWallets`.

**Why this exists:** Build a wallet switcher from the wallets this person has currently approved for your application.

**Who uses it:** Application developer.

**When you need it:** Use after access is granted and when switching wallets. The existing Personal wallet is listed first.

**Before you start:** Send your private user_id in the JSON body and an application token. Only current grants for that exact application user are returned; keep stored account references for later renewal.

**Result and next step:** 200: accounts with wallet names, kind, roles, grant IDs, permissions and expiry. Send Wallet-Grant-Id with the selected grant on shared-wallet requests. No KYC records or other users’ wallets are returned.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |
| `wallet-grant-id` | header   | no       | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["user_id"],
  "properties": {
    "user_id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 256
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Default Response |
| 401    | application/problem+json | Default Response |
| 403    | application/problem+json | Default Response |
| 409    | application/problem+json | Default Response |
| 413    | application/problem+json | Default Response |
| 415    | application/problem+json | Default Response |
| 422    | application/problem+json | Default Response |
| 429    | application/problem+json | Default Response |
| 500    | application/problem+json | Default Response |
| 503    | application/problem+json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "required": ["accounts"],
  "additionalProperties": false,
  "properties": {
    "accounts": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "account_id",
          "is_default",
          "wallet",
          "grant_id",
          "permissions",
          "expires_at",
          "role"
        ],
        "additionalProperties": false,
        "properties": {
          "account_id": {
            "type": "string",
            "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
          },
          "network": {
            "type": "string",
            "enum": ["base", "base-sepolia", "ethereum", "ethereum-sepolia"]
          },
          "chain_id": {
            "type": "string"
          },
          "is_default": {
            "type": "boolean"
          },
          "wallet": {
            "type": "object",
            "additionalProperties": false,
            "required": ["reference", "name", "kind"],
            "properties": {
              "reference": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "name": {
                "type": "string",
                "minLength": 1,
                "maxLength": 80
              },
              "kind": {
                "enum": ["personal", "shared"]
              }
            }
          },
          "grant_id": {
            "type": "string",
            "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
          },
          "permissions": {
            "type": "array",
            "items": {
              "enum": [
                "account:read",
                "operations:request",
                "contracts:request",
                "members:manage"
              ]
            }
          },
          "expires_at": {
            "type": "string"
          },
          "role": {
            "enum": ["owner", "member"]
          }
        }
      }
    }
  }
}
```

## GET `/v1/accounts/{accountId}/members`

Operation: `readWalletMembers`.

**Why this exists:** Show the owner who has been invited and the permissions available to each member.

**Who uses it:** Application developer acting for the wallet owner.

**When you need it:** Use before inviting someone, changing their permissions or removing them.

**Before you start:** Use the owner’s current Wallet-Grant-Id for this shared wallet. The application and the owner must explicitly allow members:manage. Being a member or knowing a wallet ID cannot grant administration.

**Result and next step:** 200: current settings revision and invited, active or removed members. Use the revision when saving. Another application’s private user reference is omitted.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `accountId`       | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |
| `wallet-grant-id` | header   | no       | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Default Response |
| 401    | application/problem+json | Default Response |
| 403    | application/problem+json | Default Response |
| 409    | application/problem+json | Default Response |
| 413    | application/problem+json | Default Response |
| 415    | application/problem+json | Default Response |
| 422    | application/problem+json | Default Response |
| 429    | application/problem+json | Default Response |
| 500    | application/problem+json | Default Response |
| 503    | application/problem+json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["account_id", "wallet", "revision", "members"],
  "properties": {
    "account_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "wallet": {
      "type": "object",
      "additionalProperties": false,
      "required": ["reference", "name", "kind"],
      "properties": {
        "reference": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9_-]{0,63}$"
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 80
        },
        "kind": {
          "enum": ["personal", "shared"]
        }
      }
    },
    "revision": {
      "type": "integer"
    },
    "members": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "member_id",
          "application_id",
          "name",
          "permissions",
          "membership_revision",
          "status"
        ],
        "properties": {
          "member_id": {
            "type": "string"
          },
          "application_id": {
            "type": "string"
          },
          "user_id": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "permissions": {
            "type": "array",
            "items": {
              "enum": ["account:read", "contracts:request"]
            }
          },
          "membership_revision": {
            "type": "integer"
          },
          "status": {
            "enum": ["invited", "active", "removed"]
          }
        }
      }
    }
  }
}
```

## POST `/v1/accounts/{accountId}/members`

Operation: `saveWalletMember`.

**Why this exists:** Invite a verified application user to a shared wallet, limit their permissions or remove their future access.

**Who uses it:** Application developer acting for the wallet owner.

**When you need it:** Use after the owner chooses View wallet or View and request approved transactions for a member.

**Before you start:** Send Wallet-Grant-Id for the owner, a UUIDv4 Idempotency-Key, expected_revision, enabled and permissions. Use user_id to invite someone from your application or member_id to update a saved member. New or changed permissions need the member’s fresh consent to account_id and membership_revision through mode=connect.

**Result and next step:** 200: member settings and their revisions. Invitations do not grant account or spending access. Removing or changing a member invalidates their previous grants. The provider signer and on-chain owner threshold are unchanged; issued signatures remain subject to their on-chain validity.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `accountId`       | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |
| `wallet-grant-id` | header   | no       | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["expected_revision", "enabled", "permissions"],
  "properties": {
    "expected_revision": {
      "type": "integer",
      "minimum": 0
    },
    "user_id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 256
    },
    "member_id": {
      "type": "string",
      "pattern": "^[a-f0-9]{64}$"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    },
    "enabled": {
      "type": "boolean"
    },
    "permissions": {
      "type": "array",
      "minItems": 1,
      "maxItems": 2,
      "uniqueItems": true,
      "items": {
        "enum": ["account:read", "contracts:request"]
      }
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Default Response |
| 401    | application/problem+json | Default Response |
| 403    | application/problem+json | Default Response |
| 409    | application/problem+json | Default Response |
| 413    | application/problem+json | Default Response |
| 415    | application/problem+json | Default Response |
| 422    | application/problem+json | Default Response |
| 429    | application/problem+json | Default Response |
| 500    | application/problem+json | Default Response |
| 503    | application/problem+json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["account_id", "wallet", "revision", "members"],
  "properties": {
    "account_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "wallet": {
      "type": "object",
      "additionalProperties": false,
      "required": ["reference", "name", "kind"],
      "properties": {
        "reference": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9_-]{0,63}$"
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 80
        },
        "kind": {
          "enum": ["personal", "shared"]
        }
      }
    },
    "revision": {
      "type": "integer"
    },
    "members": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "member_id",
          "application_id",
          "name",
          "permissions",
          "membership_revision",
          "status"
        ],
        "properties": {
          "member_id": {
            "type": "string"
          },
          "application_id": {
            "type": "string"
          },
          "user_id": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "permissions": {
            "type": "array",
            "items": {
              "enum": ["account:read", "contracts:request"]
            }
          },
          "membership_revision": {
            "type": "integer"
          },
          "status": {
            "enum": ["invited", "active", "removed"]
          }
        }
      }
    }
  }
}
```

## POST `/v1/access-grants/{grantId}/revoke`

Operation: `revokeAccountAccess`.

**Why this exists:** End the application’s saved wallet permission when the person withdraws consent.

**Who uses it:** Application developer.

**When you need it:** Use when the person chooses Disconnect or withdraws wallet access in your application. Reconnecting requires new consent; existing signatures cannot be recalled.

**Before you start:** Use the grant_id returned to this application and the same caller. Send an empty JSON body. Your application must provide the user’s access-revocation control and call this endpoint when consent is withdrawn.

**Result and next step:** 200: revoked. Current wallet access and subsequent signing are denied. Already issued signatures are not cancelled. A renewed grant requires fresh consent evidence and a new request.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `grantId`         | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false
}
```

| Status | Content type     | Description      |
| ------ | ---------------- | ---------------- |
| 200    | application/json | Default Response |
| 400    | application/json | Default Response |
| 401    | application/json | Default Response |
| 403    | application/json | Default Response |
| 409    | application/json | Default Response |
| 422    | application/json | Default Response |
| 429    | application/json | Default Response |
| 503    | application/json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "required": ["grant_id", "status"],
  "properties": {
    "grant_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "status": {
      "type": "string",
      "enum": ["revoked"]
    }
  }
}
```

## POST `/v1/access-records`

Operation: `submitAccountAccessRecords`.

**Why this exists:** Submit a batch of application records into the optional hosted, unfunded evaluation flow.

**Who uses it:** Host integration developer.

**When you need it:** Use only when application-record evaluation is explicitly configured. The standard application-led flow submits each person’s evidence with POST /v1/access-requests instead.

**Before you start:** Select application-record evaluation in provider policy. Read GET /v1/access-policy, then submit up to 50 records in a body no larger than 512 KiB. Each reference must be unique within the batch and fields must contain every required policy field. Only required fields are retained. Keep the batch idempotency key; a changed batch requires a new key.

**Result and next step:** 200: an indexed result for each record. Complete records receive their own access request and consent URL; incomplete or duplicate records are marked invalid. Replaying the original batch resumes its requests without duplicate creation. Submission makes no wallet or vendor call. Owner consent and explicit provider review are still required.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["records"],
  "properties": {
    "records": {
      "type": "array",
      "minItems": 1,
      "maxItems": 50,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["reference", "fields"],
        "properties": {
          "reference": {
            "type": "string",
            "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$"
          },
          "fields": {
            "type": "object",
            "minProperties": 1,
            "maxProperties": 64,
            "additionalProperties": {
              "type": "string",
              "minLength": 1,
              "maxLength": 512
            }
          }
        }
      }
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Default Response |
| 401    | application/problem+json | Default Response |
| 403    | application/problem+json | Default Response |
| 409    | application/problem+json | Default Response |
| 413    | application/problem+json | Default Response |
| 415    | application/problem+json | Default Response |
| 422    | application/problem+json | Default Response |
| 429    | application/problem+json | Default Response |
| 500    | application/problem+json | Default Response |
| 503    | application/problem+json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["results"],
  "properties": {
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["index", "status"],
        "properties": {
          "index": {
            "type": "integer",
            "minimum": 0
          },
          "status": {
            "type": "string",
            "enum": ["submitted", "invalid"]
          },
          "required_fields": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "receipt": {
            "type": "object",
            "additionalProperties": false,
            "required": ["request_id", "status"],
            "properties": {
              "wallet": {
                "type": "object",
                "additionalProperties": false,
                "required": ["reference", "name", "kind"],
                "properties": {
                  "reference": {
                    "type": "string",
                    "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                  },
                  "name": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 80
                  },
                  "kind": {
                    "enum": ["personal", "shared"]
                  }
                }
              },
              "membership_revision": {
                "type": "integer",
                "minimum": 1
              },
              "request_id": {
                "type": "string",
                "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
              },
              "status": {
                "type": "string",
                "enum": [
                  "consent_required",
                  "verification_required",
                  "funding_approval_required",
                  "identity_pending",
                  "reconciliation_required",
                  "provider_review_required",
                  "granted",
                  "denied",
                  "expired",
                  "suspended",
                  "revoked",
                  "policy_changed"
                ]
              },
              "consent_url": {
                "type": "string",
                "format": "uri",
                "description": "Hosted compatibility only. Application-led grants have no provider user redirect."
              },
              "grant_id": {
                "type": "string",
                "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
              },
              "account_id": {
                "type": "string",
                "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
              },
              "permissions": {
                "type": "array",
                "items": {
                  "type": "string",
                  "enum": [
                    "account:read",
                    "operations:request",
                    "contracts:request",
                    "members:manage"
                  ]
                }
              },
              "expires_at": {
                "type": "string",
                "format": "date-time"
              }
            }
          }
        }
      }
    }
  }
}
```

## GET `/v1/access-requests/{requestId}`

Operation: `getAccountAccessRequest`.

**Why this exists:** Look up the decision for a saved access request and recover its returned account and permission details.

**Who uses it:** Application developer.

**When you need it:** Use after requesting access, after a lost response, or while a hosted review is pending. This does not submit new evidence or create a wallet.

**Before you start:** Use the returned request_id and a token for the same application and caller. Application-led access is decided from the trusted application’s submitted identity and consent evidence. Hosted compatibility mode requires its separate browser steps.

**Result and next step:** 200: the current request status. granted includes account and access-grant details. For funding_approval_required, arrange identity funding; for provider_review_required, wait for staff review; for reconciliation_required, ask the operator to investigate the original attempt.

| Parameter        | Location | Required | Schema                                                                                                |
| ---------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `requestId`      | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network` | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Default Response |
| 401    | application/problem+json | Default Response |
| 403    | application/problem+json | Default Response |
| 409    | application/problem+json | Default Response |
| 413    | application/problem+json | Default Response |
| 415    | application/problem+json | Default Response |
| 422    | application/problem+json | Default Response |
| 429    | application/problem+json | Default Response |
| 500    | application/problem+json | Default Response |
| 503    | application/problem+json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["request_id", "status"],
  "properties": {
    "wallet": {
      "type": "object",
      "additionalProperties": false,
      "required": ["reference", "name", "kind"],
      "properties": {
        "reference": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9_-]{0,63}$"
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 80
        },
        "kind": {
          "enum": ["personal", "shared"]
        }
      }
    },
    "membership_revision": {
      "type": "integer",
      "minimum": 1
    },
    "request_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "status": {
      "type": "string",
      "enum": [
        "consent_required",
        "verification_required",
        "funding_approval_required",
        "identity_pending",
        "reconciliation_required",
        "provider_review_required",
        "granted",
        "denied",
        "expired",
        "suspended",
        "revoked",
        "policy_changed"
      ]
    },
    "consent_url": {
      "type": "string",
      "format": "uri",
      "description": "Hosted compatibility only. Application-led grants have no provider user redirect."
    },
    "grant_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "account_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "permissions": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "account:read",
          "operations:request",
          "contracts:request",
          "members:manage"
        ]
      }
    },
    "expires_at": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

## POST `/v1/access-requests/{requestId}/identity`

Operation: `importAccessIdentity`.

**Why this exists:** Import shared verification evidence for a pending hosted identity request using a vendor sharing token.

**Who uses it:** Host integration developer.

**When you need it:** Use only for a separately configured hosted identity integration, with owner consent and agreed vendor funding. It is not used by the standard application-led flow.

**Before you start:** Obtain owner consent and a valid share token from the selected identity vendor. Configure the recipient workflow, agreed import price and application funding first. Provider staff still review the imported evidence.

**Result and next step:** 200: the updated access request status. Vendor approval does not grant wallet access. If the import outcome is unknown, investigate that attempt before requesting another import.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `requestId`       | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["vendor", "share_token"],
  "properties": {
    "vendor": {
      "type": "string",
      "enum": ["didit", "sumsub"]
    },
    "share_token": {
      "type": "string",
      "minLength": 1,
      "maxLength": 16384
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Default Response |
| 401    | application/problem+json | Default Response |
| 403    | application/problem+json | Default Response |
| 409    | application/problem+json | Default Response |
| 413    | application/problem+json | Default Response |
| 415    | application/problem+json | Default Response |
| 422    | application/problem+json | Default Response |
| 429    | application/problem+json | Default Response |
| 500    | application/problem+json | Default Response |
| 503    | application/problem+json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["request_id", "status"],
  "properties": {
    "wallet": {
      "type": "object",
      "additionalProperties": false,
      "required": ["reference", "name", "kind"],
      "properties": {
        "reference": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9_-]{0,63}$"
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 80
        },
        "kind": {
          "enum": ["personal", "shared"]
        }
      }
    },
    "membership_revision": {
      "type": "integer",
      "minimum": 1
    },
    "request_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "status": {
      "type": "string",
      "enum": [
        "consent_required",
        "verification_required",
        "funding_approval_required",
        "identity_pending",
        "reconciliation_required",
        "provider_review_required",
        "granted",
        "denied",
        "expired",
        "suspended",
        "revoked",
        "policy_changed"
      ]
    },
    "consent_url": {
      "type": "string",
      "format": "uri",
      "description": "Hosted compatibility only. Application-led grants have no provider user redirect."
    },
    "grant_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "account_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "permissions": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "account:read",
          "operations:request",
          "contracts:request",
          "members:manage"
        ]
      }
    },
    "expires_at": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

## GET `/v1/accounts/{accountId}`

Operation: `readGrantedAccount`.

**Why this exists:** Read an approved account’s status and, once provisioned, its receiving address.

**Who uses it:** Application developer.

**When you need it:** Use for the wallet overview or to check whether wallet creation completed. The transaction-wallet read provides the execution address and chain once transaction access is ready.

**Before you start:** The same application and caller need current account:read permission for this owner’s account, with accepted identity evidence.

**Result and next step:** 200: accepted or provisioned account status. An address is present after provisioning.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `accountId`       | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |
| `wallet-grant-id` | header   | no       | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Default Response |
| 401    | application/problem+json | Default Response |
| 403    | application/problem+json | Default Response |
| 422    | application/problem+json | Default Response |
| 429    | application/problem+json | Default Response |
| 500    | application/problem+json | Default Response |
| 503    | application/problem+json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["account_id", "status"],
  "properties": {
    "wallet": {
      "type": "object",
      "additionalProperties": false,
      "required": ["reference", "name", "kind"],
      "properties": {
        "reference": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9_-]{0,63}$"
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 80
        },
        "kind": {
          "enum": ["personal", "shared"]
        }
      }
    },
    "account_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "identity_source": {
      "type": "string",
      "enum": ["application_record", "application_attestation"]
    },
    "evaluation_only": {
      "type": "boolean"
    },
    "status": {
      "type": "string",
      "enum": ["accepted", "provisioned"]
    },
    "address": {
      "type": "string",
      "pattern": "^0x[0-9a-fA-F]{40}$"
    }
  }
}
```

## GET `/v1/accounts/{accountId}/wallet/calls/{batchId}/events`

Operation: `streamWalletCallsStatus`.

**Why this exists:** Receive status updates for an admitted transaction request without repeatedly polling.

**Who uses it:** Application developer.

**When you need it:** Optional: use for live progress in your interface. Poll wallet_getCallsStatus through the wallet endpoint if you do not need a stream.

**Before you start:** Retain the admitted batch ID and use an authenticated fetch stream. Account ownership and batch access are checked before opening; authorization is checked before each update. Reconnect after 55 seconds or use wallet_getCallsStatus.

**Result and next step:** 200: text/event-stream status events after durable observations. Preconfirmation remains pending; verified inner execution determines success. Connections are bounded to two per account, 16 per application and 64 per service.

**Request details:** Authenticated bounded SSE status stream. Sends current account-authorized EIP-5792 status after durable observation changes. Reconnect after 55 seconds; ordinary status reads remain available.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `accountId`       | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `batchId`         | path     | yes      | `{"type":"string","maxLength":8194}`                                                                  |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |
| `wallet-grant-id` | header   | no       | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

| Status | Content type      | Description                                    |
| ------ | ----------------- | ---------------------------------------------- |
| 200    | text/event-stream | Bounded SSE stream of authorized wallet status |
| 401    | application/json  | Default Response                               |
| 403    | application/json  | Default Response                               |
| 429    | application/json  | Default Response                               |
| 503    | application/json  | Default Response                               |

## GET `/v1/accounts/{accountId}/wallet`

Operation: `readWalletExecutionAccount`.

**Why this exists:** Get the user’s assigned Safe address and chain for wallet transactions. This is also their receiving address.

**Who uses it:** Application developer.

**When you need it:** Use when preparing transaction calls. GET /v1/accounts/{accountId} is the general account-details read and can be used before the wallet is provisioned.

**Before you start:** Use current account access and contract delegation after the application bundler and paymaster are ready.

**Result and next step:** 200: the Safe address and chain ID. This is the user’s deposit, balance and execution address.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `accountId`       | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |
| `wallet-grant-id` | header   | no       | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

| Status | Content type     | Description      |
| ------ | ---------------- | ---------------- |
| 200    | application/json | Default Response |
| 401    | application/json | Default Response |
| 403    | application/json | Default Response |
| 503    | application/json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["address", "chainId"],
  "properties": {
    "address": {
      "type": "string"
    },
    "chainId": {
      "type": "string"
    }
  }
}
```

## POST `/v1/accounts/{accountId}/wallet`

Operation: `walletCallsRpc`.

**Why this exists:** Request approved contract calls, discover wallet call capabilities, or check a retained transaction result through one wallet endpoint.

**Who uses it:** Application developer.

**When you need it:** Use after wallet access, transaction rules and fee funding are ready. Choose wallet_sendCalls to submit or wallet_getCallsStatus to inspect; these methods have different effects and permissions.

**Before you start:** Enable Safe wallet calls. The account endpoint binds the authenticated application and current owner. Send requires wallet:actions, wallet:sign and wallet:execute plus contracts:request consent; status/discovery require wallet:execute:read.

**Result and next step:** 200: a JSON-RPC result or sanitized RPC error. Use EIP-5792 version 2.0.0, retain the batch ID and poll wallet_getCallsStatus. Inclusion is distinct from finality. HTTP authentication/readiness failures use the normal problem envelope.

**Request details:** Optional account-scoped EIP-5792 2.0.0 JSON-RPC transport. Runtime financial authority, the Safe ERC-4337 driver, current owner consent and method-specific scopes remain required. wallet_sendCalls admits a durable atomic batch without waiting for chain inclusion. Headless wallet_showCallsStatus returns unsupported method; the client adapter can present status through an explicit host callback.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `accountId`       | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |
| `wallet-grant-id` | header   | no       | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

Request body (application/json):

```json
{
  "oneOf": [
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["jsonrpc", "id", "method", "params"],
      "properties": {
        "jsonrpc": {
          "type": "string",
          "enum": ["2.0"]
        },
        "id": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 256
            },
            {
              "type": "integer"
            },
            {
              "type": "object",
              "nullable": true,
              "enum": [null]
            }
          ]
        },
        "method": {
          "type": "string",
          "enum": ["wallet_sendCalls"]
        },
        "params": {
          "type": "array",
          "minItems": 1,
          "maxItems": 1,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["version", "chainId", "atomicRequired", "calls"],
            "properties": {
              "version": {
                "type": "string",
                "enum": ["2.0.0"]
              },
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 8194
              },
              "from": {
                "type": "string",
                "pattern": "^0x[0-9a-fA-F]{40}$"
              },
              "chainId": {
                "type": "string",
                "pattern": "^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$"
              },
              "atomicRequired": {
                "type": "boolean"
              },
              "capabilities": {
                "type": "object",
                "maxProperties": 16,
                "additionalProperties": {
                  "type": "object",
                  "properties": {
                    "optional": {
                      "type": "boolean"
                    }
                  },
                  "additionalProperties": true
                }
              },
              "calls": {
                "type": "array",
                "minItems": 1,
                "maxItems": 16,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "properties": {
                    "to": {
                      "type": "string",
                      "pattern": "^0x[0-9a-fA-F]{40}$"
                    },
                    "value": {
                      "type": "string",
                      "pattern": "^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$"
                    },
                    "data": {
                      "type": "string",
                      "pattern": "^0x(?:[0-9a-fA-F]{2})*$"
                    },
                    "capabilities": {
                      "type": "object",
                      "maxProperties": 16,
                      "additionalProperties": {
                        "type": "object",
                        "properties": {
                          "optional": {
                            "type": "boolean"
                          }
                        },
                        "additionalProperties": true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["jsonrpc", "id", "method", "params"],
      "properties": {
        "jsonrpc": {
          "type": "string",
          "enum": ["2.0"]
        },
        "id": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 256
            },
            {
              "type": "integer"
            },
            {
              "type": "object",
              "nullable": true,
              "enum": [null]
            }
          ]
        },
        "method": {
          "type": "string",
          "enum": ["wallet_getCapabilities"]
        },
        "params": {
          "type": "array",
          "minItems": 1,
          "maxItems": 2,
          "items": {
            "anyOf": [
              {
                "type": "string",
                "pattern": "^0x[0-9a-fA-F]{40}$"
              },
              {
                "type": "array",
                "maxItems": 64,
                "items": {
                  "type": "string",
                  "pattern": "^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$"
                }
              }
            ]
          }
        }
      }
    },
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["jsonrpc", "id", "method", "params"],
      "properties": {
        "jsonrpc": {
          "type": "string",
          "enum": ["2.0"]
        },
        "id": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 256
            },
            {
              "type": "integer"
            },
            {
              "type": "object",
              "nullable": true,
              "enum": [null]
            }
          ]
        },
        "method": {
          "type": "string",
          "enum": ["wallet_getCallsStatus"]
        },
        "params": {
          "type": "array",
          "minItems": 1,
          "maxItems": 1,
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 8194
          }
        }
      }
    },
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["jsonrpc", "id", "method", "params"],
      "properties": {
        "jsonrpc": {
          "type": "string",
          "enum": ["2.0"]
        },
        "id": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 256
            },
            {
              "type": "integer"
            },
            {
              "type": "object",
              "nullable": true,
              "enum": [null]
            }
          ]
        },
        "method": {
          "type": "string",
          "enum": ["wallet_showCallsStatus"]
        },
        "params": {
          "type": "array",
          "minItems": 1,
          "maxItems": 1,
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 8194
          }
        }
      }
    }
  ],
  "description": "Single account-scoped JSON-RPC request. SendCallsParams uses EIP-5792 version 2.0.0. JSON-RPC batch envelopes and notifications are not accepted."
}
```

| Status | Content type     | Description      |
| ------ | ---------------- | ---------------- |
| 200    | application/json | Default Response |
| 401    | application/json | Default Response |
| 403    | application/json | Default Response |
| 503    | application/json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["jsonrpc", "id"],
  "properties": {
    "jsonrpc": {
      "type": "string",
      "enum": ["2.0"]
    },
    "id": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 256
        },
        {
          "type": "integer"
        },
        {
          "type": "object",
          "nullable": true,
          "enum": [null]
        }
      ]
    },
    "result": {
      "anyOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["id"],
          "properties": {
            "id": {
              "type": "string"
            }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["version", "id", "chainId", "status", "atomic"],
          "properties": {
            "version": {
              "type": "string",
              "enum": ["2.0.0"]
            },
            "id": {
              "type": "string"
            },
            "chainId": {
              "type": "string",
              "pattern": "^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$"
            },
            "status": {
              "type": "integer",
              "enum": [100, 200, 400, 500]
            },
            "atomic": {
              "type": "boolean",
              "enum": [true]
            },
            "capabilities": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "preconfirmation": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["stage", "transactionHash", "observedAt"],
                  "properties": {
                    "stage": {
                      "type": "string",
                      "enum": ["preconfirmed"]
                    },
                    "transactionHash": {
                      "type": "string",
                      "pattern": "^0x[0-9a-f]{64}$"
                    },
                    "observedAt": {
                      "type": "string",
                      "format": "date-time"
                    }
                  }
                }
              }
            },
            "receipts": {
              "type": "array",
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "logs",
                  "status",
                  "blockHash",
                  "blockNumber",
                  "gasUsed",
                  "transactionHash"
                ],
                "properties": {
                  "logs": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["address", "data", "topics"],
                      "properties": {
                        "address": {
                          "type": "string",
                          "pattern": "^0x[0-9a-fA-F]{40}$"
                        },
                        "data": {
                          "type": "string"
                        },
                        "topics": {
                          "type": "array",
                          "items": {
                            "type": "string"
                          }
                        }
                      }
                    }
                  },
                  "status": {
                    "type": "string",
                    "enum": ["0x0", "0x1"]
                  },
                  "blockHash": {
                    "type": "string"
                  },
                  "blockNumber": {
                    "type": "string",
                    "pattern": "^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$"
                  },
                  "gasUsed": {
                    "type": "string",
                    "pattern": "^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$"
                  },
                  "transactionHash": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "0x14a34": {
              "type": "object",
              "additionalProperties": false,
              "required": ["atomic"],
              "properties": {
                "applicationAction": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["supported"],
                  "properties": {
                    "supported": {
                      "type": "boolean",
                      "enum": [true]
                    }
                  }
                },
                "paymasterService": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["supported"],
                  "properties": {
                    "supported": {
                      "type": "boolean",
                      "enum": [true]
                    }
                  }
                },
                "atomic": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["status"],
                  "properties": {
                    "status": {
                      "type": "string",
                      "enum": ["supported"]
                    }
                  }
                }
              }
            },
            "0x2105": {
              "type": "object",
              "additionalProperties": false,
              "required": ["atomic"],
              "properties": {
                "applicationAction": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["supported"],
                  "properties": {
                    "supported": {
                      "type": "boolean",
                      "enum": [true]
                    }
                  }
                },
                "paymasterService": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["supported"],
                  "properties": {
                    "supported": {
                      "type": "boolean",
                      "enum": [true]
                    }
                  }
                },
                "atomic": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["status"],
                  "properties": {
                    "status": {
                      "type": "string",
                      "enum": ["supported"]
                    }
                  }
                }
              }
            },
            "0x1": {
              "type": "object",
              "additionalProperties": false,
              "required": ["atomic"],
              "properties": {
                "applicationAction": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["supported"],
                  "properties": {
                    "supported": {
                      "type": "boolean",
                      "enum": [true]
                    }
                  }
                },
                "paymasterService": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["supported"],
                  "properties": {
                    "supported": {
                      "type": "boolean",
                      "enum": [true]
                    }
                  }
                },
                "atomic": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["status"],
                  "properties": {
                    "status": {
                      "type": "string",
                      "enum": ["supported"]
                    }
                  }
                }
              }
            },
            "0xaa36a7": {
              "type": "object",
              "additionalProperties": false,
              "required": ["atomic"],
              "properties": {
                "applicationAction": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["supported"],
                  "properties": {
                    "supported": {
                      "type": "boolean",
                      "enum": [true]
                    }
                  }
                },
                "paymasterService": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["supported"],
                  "properties": {
                    "supported": {
                      "type": "boolean",
                      "enum": [true]
                    }
                  }
                },
                "atomic": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["status"],
                  "properties": {
                    "status": {
                      "type": "string",
                      "enum": ["supported"]
                    }
                  }
                }
              }
            }
          }
        }
      ]
    },
    "error": {
      "type": "object",
      "additionalProperties": false,
      "required": ["code", "message"],
      "properties": {
        "code": {
          "type": "integer"
        },
        "message": {
          "type": "string"
        }
      }
    }
  }
}
```

## GET `/v1/application/gas-funding`

Operation: `readApplicationGasFunding`.

**Why this exists:** Get the application’s stable funding address and setup status so its operator knows where eligible network fees are funded.

**Who uses it:** Application developer.

**When you need it:** Use after the provider accepts fee sponsorship and prepares the application infrastructure. This address is separate from users’ receiving addresses.

**Before you start:** Have the provider accept sponsorship and prepare the application infrastructure.

**Result and next step:** 200: one stable application gas-funding address and infrastructure status for the application.

**Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter        | Location | Required | Schema                                                                           |
| ---------------- | -------- | -------- | -------------------------------------------------------------------------------- |
| `wallet-network` | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}` |

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["application_id", "chain_id", "profile", "status"],
  "properties": {
    "application_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "chain_id": {
      "type": "string"
    },
    "profile": {
      "enum": ["safe-only-4337-v1"]
    },
    "status": {
      "type": "string",
      "enum": ["unprovisioned", "needs-funding", "provisioned"]
    },
    "execution_funding": {
      "type": "object",
      "description": "Most recent background check of network fee balances and refill constraints. This observation does not authorize spending and expires after 30 seconds.",
      "additionalProperties": false,
      "required": ["status", "message"],
      "properties": {
        "status": {
          "type": "string",
          "enum": [
            "checking",
            "ready",
            "replenishing",
            "needs-funding",
            "limit-reached",
            "unavailable"
          ]
        },
        "message": {
          "type": "string"
        },
        "checked_at": {
          "type": "string",
          "format": "date-time"
        }
      }
    },
    "funding_address": {
      "type": "string"
    },
    "paymaster": {
      "type": "string"
    }
  }
}
```

## GET `/v1/application/credentials`

Operation: `readApplicationCredentials`.

**Why this exists:** List your saved service connection references and their status without returning secret values.

**Who uses it:** Application developer.

**When you need it:** Use before adding, replacing or removing an application-owned network connection.

**Before you start:** Use the registered application identity. Credential values are never returned.

**Result and next step:** 200: application-local references, revisions, origins and active or revoked status.

**Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter        | Location | Required | Schema                                                                           |
| ---------------- | -------- | -------- | -------------------------------------------------------------------------------- |
| `wallet-network` | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}` |

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "array",
  "maxItems": 32,
  "items": {
    "type": "object",
    "additionalProperties": false,
    "required": ["application_id", "reference", "revision", "origin", "status"],
    "properties": {
      "application_id": {
        "type": "string",
        "pattern": "^[0-9a-f]{64}$"
      },
      "reference": {
        "type": "string",
        "pattern": "^[A-Za-z0-9_-]{1,128}$"
      },
      "revision": {
        "type": "string",
        "pattern": "^(0|[1-9][0-9]{0,19})$"
      },
      "origin": {
        "type": "string"
      },
      "status": {
        "type": "string",
        "enum": ["active", "revoked"]
      }
    }
  }
}
```

## GET `/v1/provider/applications/{applicationId}/credentials`

Operation: `readProviderApplicationCredentials`.

**Why this exists:** Inspect the service origins and saved connection references an application wants the provider to use.

**Who uses it:** Service operator.

**When you need it:** Use while reviewing its network-service agreement. The separate operator route lets you inspect the chosen application without sharing its secret values.

**Before you start:** Use an exact configured provider identity and the application ID. Review each origin before accepting the service declaration.

**Result and next step:** 200: credential metadata without secret paths. Reject service declarations to prevent their use.

**Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter        | Location | Required | Schema                                                                           |
| ---------------- | -------- | -------- | -------------------------------------------------------------------------------- |
| `applicationId`  | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{64}$"}`                                   |
| `wallet-network` | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}` |

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "array",
  "maxItems": 32,
  "items": {
    "type": "object",
    "additionalProperties": false,
    "required": ["application_id", "reference", "revision", "origin", "status"],
    "properties": {
      "application_id": {
        "type": "string",
        "pattern": "^[0-9a-f]{64}$"
      },
      "reference": {
        "type": "string",
        "pattern": "^[A-Za-z0-9_-]{1,128}$"
      },
      "revision": {
        "type": "string",
        "pattern": "^(0|[1-9][0-9]{0,19})$"
      },
      "origin": {
        "type": "string"
      },
      "status": {
        "type": "string",
        "enum": ["active", "revoked"]
      }
    }
  }
}
```

## PUT `/v1/application/credentials/{reference}`

Operation: `writeApplicationCredential`.

**Why this exists:** Securely retain an application-owned service endpoint, or revoke it, for use by approved network services.

**Who uses it:** Application developer.

**When you need it:** Use when a service connection is added, changed or removed. The provider must review affected service declarations again; metadata reads never reveal the saved value.

**Before you start:** Configure a retained runtimeConfiguration.credentialKey. Use the application identity, an original idempotency key and the current credential revision. Supply a vendor HTTPS endpoint or null to revoke it.

**Result and next step:** 200: encrypted credential retained and metadata returned. Referencing service declarations return to pending review. No provider secrets can be selected.

**Request details:** Store or rotate an application-owned HTTPS service endpoint in encrypted storage. Send null to revoke it. Secret paths are never returned. Associated service declarations require provider review after every change.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `reference`       | path     | yes      | `{"type":"string","pattern":"^[A-Za-z0-9_-]{1,128}$"}`                                                |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["expected_revision", "endpoint"],
  "properties": {
    "expected_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "endpoint": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096,
      "nullable": true
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["application_id", "reference", "revision", "origin", "status"],
  "properties": {
    "application_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "reference": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_-]{1,128}$"
    },
    "revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "origin": {
      "type": "string"
    },
    "status": {
      "type": "string",
      "enum": ["active", "revoked"]
    }
  }
}
```

## GET `/v1/application/obligations`

Operation: `readApplicationObligations`.

**Why this exists:** See the transactions, network services and fee terms your application submitted, and whether the provider accepted each one.

**Who uses it:** Application developer.

**When you need it:** Use before changing an agreement or investigating why wallet setup or transactions are blocked.

**Before you start:** Use your application token. Read the saved revisions before preparing an agreement update.

**Result and next step:** 200: your action, service and fee declarations with their review decisions. Submit changed terms through the matching agreement endpoint, then wait for provider acceptance.

**Request details:** Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.

| Parameter        | Location | Required | Schema                                                                           |
| ---------------- | -------- | -------- | -------------------------------------------------------------------------------- |
| `wallet-network` | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}` |

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "application_id",
    "resources",
    "authorizes_spending",
    "activates_execution"
  ],
  "properties": {
    "application_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "resources": {
      "type": "array",
      "maxItems": 3,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "application_id",
          "kind",
          "revision",
          "value",
          "submitted_at",
          "decision",
          "decision_revision"
        ],
        "properties": {
          "application_id": {
            "type": "string",
            "pattern": "^[0-9a-f]{64}$"
          },
          "kind": {
            "type": "string",
            "enum": ["actions", "services", "sponsorship"]
          },
          "revision": {
            "type": "string",
            "pattern": "^(0|[1-9][0-9]{0,19})$"
          },
          "value": {
            "anyOf": [
              {
                "type": "array",
                "maxItems": 64,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["name", "description", "fields"],
                  "properties": {
                    "name": {
                      "type": "string",
                      "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                    },
                    "description": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 256
                    },
                    "fields": {
                      "type": "array",
                      "maxItems": 32,
                      "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["name", "required", "allowed_values"],
                        "properties": {
                          "name": {
                            "type": "string",
                            "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                          },
                          "required": {
                            "type": "boolean"
                          },
                          "allowed_values": {
                            "type": "array",
                            "minItems": 1,
                            "maxItems": 64,
                            "uniqueItems": true,
                            "items": {
                              "type": "string",
                              "minLength": 1,
                              "maxLength": 128
                            }
                          }
                        }
                      }
                    }
                  }
                }
              },
              {
                "type": "array",
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "id",
                    "kind",
                    "vendor",
                    "credential_reference",
                    "billing_owner"
                  ],
                  "properties": {
                    "id": {
                      "type": "string",
                      "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                    },
                    "kind": {
                      "type": "string",
                      "enum": [
                        "rpc-verification",
                        "rpc-submission",
                        "rpc-observation",
                        "other"
                      ]
                    },
                    "vendor": {
                      "type": "string",
                      "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                    },
                    "credential_reference": {
                      "type": "string",
                      "pattern": "^[a-zA-Z0-9_-]{1,128}$",
                      "description": "Opaque application-local secret-store reference. Never a credential, URL, environment-variable lookup or authority to read another application’s secret. Runtime resolution is not enabled by registration."
                    },
                    "billing_owner": {
                      "type": "string",
                      "enum": ["application"]
                    }
                  }
                }
              },
              {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "chain_id",
                  "funding_agreement",
                  "account_model",
                  "asset_model"
                ],
                "properties": {
                  "chain_id": {
                    "type": "string",
                    "enum": [
                      "eip155:8453",
                      "eip155:84532",
                      "eip155:1",
                      "eip155:11155111"
                    ]
                  },
                  "funding_agreement": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                  },
                  "maximum_gas_budget_wei": {
                    "description": "Optional cumulative sponsorship allowance in balance mode; required for legacy agreements. Additional ETH does not raise a configured allowance.",
                    "type": "string",
                    "pattern": "^[1-9][0-9]{0,77}$"
                  },
                  "account_model": {
                    "type": "string",
                    "enum": ["provider-controlled-user-safe"]
                  },
                  "asset_model": {
                    "type": "string",
                    "enum": ["individual-user-wallets"]
                  },
                  "funding_mode": {
                    "type": "string",
                    "enum": ["balance"],
                    "description": "Use current application funding with durable pending-cost reservations. A total budget remains optional; transaction and pending-fee ceilings are required."
                  },
                  "maximum_transaction_fee_wei": {
                    "description": "Maximum authorized network fee for one wallet operation, including its verification and fee reserve.",
                    "type": "string",
                    "pattern": "^[1-9][0-9]{0,77}$"
                  },
                  "maximum_pending_fees_wei": {
                    "description": "Maximum aggregate fee reservation for wallet operations without a verified final outcome. Unknown and unfinalized outcomes retain their reservations.",
                    "type": "string",
                    "pattern": "^[1-9][0-9]{0,77}$"
                  },
                  "maximum_execution_accounts": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 100000
                  },
                  "maximum_in_flight_per_sponsor": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 16
                  },
                  "gas_limits": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "gas_limit",
                      "max_fee_per_gas",
                      "max_priority_fee_per_gas",
                      "l1_fee_reserve_wei"
                    ],
                    "properties": {
                      "gas_limit": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      },
                      "max_fee_per_gas": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      },
                      "max_priority_fee_per_gas": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      },
                      "l1_fee_reserve_wei": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      }
                    }
                  }
                },
                "anyOf": [
                  {
                    "required": [
                      "funding_mode",
                      "maximum_transaction_fee_wei",
                      "maximum_pending_fees_wei"
                    ],
                    "properties": {
                      "funding_mode": {
                        "enum": ["balance"]
                      },
                      "maximum_transaction_fee_wei": {},
                      "maximum_pending_fees_wei": {}
                    }
                  },
                  {
                    "required": ["maximum_gas_budget_wei"],
                    "properties": {
                      "maximum_gas_budget_wei": {}
                    },
                    "not": {
                      "required": ["funding_mode"],
                      "properties": {
                        "funding_mode": {}
                      }
                    }
                  }
                ]
              }
            ]
          },
          "submitted_at": {
            "type": "string",
            "format": "date-time"
          },
          "proposed_by": {
            "enum": ["provider"]
          },
          "decision_by": {
            "type": "string",
            "enum": ["provider", "application"]
          },
          "decision": {
            "type": "string",
            "enum": ["pending", "accepted", "rejected"]
          },
          "decision_revision": {
            "type": "string",
            "pattern": "^(0|[1-9][0-9]{0,19})$"
          },
          "decided_at": {
            "type": "string",
            "format": "date-time"
          }
        }
      }
    },
    "authorizes_spending": {
      "type": "boolean",
      "enum": [false]
    },
    "activates_execution": {
      "type": "boolean",
      "enum": [false]
    }
  }
}
```

## GET `/v1/provider/applications/{applicationId}/obligations`

Operation: `readProviderApplicationObligations`.

**Why this exists:** See one application’s proposed transactions, network services and fee terms before deciding whether to accept them.

**Who uses it:** Service operator.

**When you need it:** Use during application onboarding and after agreement changes. Applications read their own agreements through the separate application route.

**Before you start:** Use a provider operator token and the selected application ID.

**Result and next step:** 200: the selected application’s declarations, revisions and decisions. Review the matching connection metadata and policy before accepting each declaration.

**Request details:** Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.

| Parameter        | Location | Required | Schema                                                                           |
| ---------------- | -------- | -------- | -------------------------------------------------------------------------------- |
| `applicationId`  | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{64}$"}`                                   |
| `wallet-network` | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}` |

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "application_id",
    "resources",
    "authorizes_spending",
    "activates_execution"
  ],
  "properties": {
    "application_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "resources": {
      "type": "array",
      "maxItems": 3,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "application_id",
          "kind",
          "revision",
          "value",
          "submitted_at",
          "decision",
          "decision_revision"
        ],
        "properties": {
          "application_id": {
            "type": "string",
            "pattern": "^[0-9a-f]{64}$"
          },
          "kind": {
            "type": "string",
            "enum": ["actions", "services", "sponsorship"]
          },
          "revision": {
            "type": "string",
            "pattern": "^(0|[1-9][0-9]{0,19})$"
          },
          "value": {
            "anyOf": [
              {
                "type": "array",
                "maxItems": 64,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["name", "description", "fields"],
                  "properties": {
                    "name": {
                      "type": "string",
                      "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                    },
                    "description": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 256
                    },
                    "fields": {
                      "type": "array",
                      "maxItems": 32,
                      "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["name", "required", "allowed_values"],
                        "properties": {
                          "name": {
                            "type": "string",
                            "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                          },
                          "required": {
                            "type": "boolean"
                          },
                          "allowed_values": {
                            "type": "array",
                            "minItems": 1,
                            "maxItems": 64,
                            "uniqueItems": true,
                            "items": {
                              "type": "string",
                              "minLength": 1,
                              "maxLength": 128
                            }
                          }
                        }
                      }
                    }
                  }
                }
              },
              {
                "type": "array",
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "id",
                    "kind",
                    "vendor",
                    "credential_reference",
                    "billing_owner"
                  ],
                  "properties": {
                    "id": {
                      "type": "string",
                      "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                    },
                    "kind": {
                      "type": "string",
                      "enum": [
                        "rpc-verification",
                        "rpc-submission",
                        "rpc-observation",
                        "other"
                      ]
                    },
                    "vendor": {
                      "type": "string",
                      "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                    },
                    "credential_reference": {
                      "type": "string",
                      "pattern": "^[a-zA-Z0-9_-]{1,128}$",
                      "description": "Opaque application-local secret-store reference. Never a credential, URL, environment-variable lookup or authority to read another application’s secret. Runtime resolution is not enabled by registration."
                    },
                    "billing_owner": {
                      "type": "string",
                      "enum": ["application"]
                    }
                  }
                }
              },
              {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "chain_id",
                  "funding_agreement",
                  "account_model",
                  "asset_model"
                ],
                "properties": {
                  "chain_id": {
                    "type": "string",
                    "enum": [
                      "eip155:8453",
                      "eip155:84532",
                      "eip155:1",
                      "eip155:11155111"
                    ]
                  },
                  "funding_agreement": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                  },
                  "maximum_gas_budget_wei": {
                    "description": "Optional cumulative sponsorship allowance in balance mode; required for legacy agreements. Additional ETH does not raise a configured allowance.",
                    "type": "string",
                    "pattern": "^[1-9][0-9]{0,77}$"
                  },
                  "account_model": {
                    "type": "string",
                    "enum": ["provider-controlled-user-safe"]
                  },
                  "asset_model": {
                    "type": "string",
                    "enum": ["individual-user-wallets"]
                  },
                  "funding_mode": {
                    "type": "string",
                    "enum": ["balance"],
                    "description": "Use current application funding with durable pending-cost reservations. A total budget remains optional; transaction and pending-fee ceilings are required."
                  },
                  "maximum_transaction_fee_wei": {
                    "description": "Maximum authorized network fee for one wallet operation, including its verification and fee reserve.",
                    "type": "string",
                    "pattern": "^[1-9][0-9]{0,77}$"
                  },
                  "maximum_pending_fees_wei": {
                    "description": "Maximum aggregate fee reservation for wallet operations without a verified final outcome. Unknown and unfinalized outcomes retain their reservations.",
                    "type": "string",
                    "pattern": "^[1-9][0-9]{0,77}$"
                  },
                  "maximum_execution_accounts": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 100000
                  },
                  "maximum_in_flight_per_sponsor": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 16
                  },
                  "gas_limits": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "gas_limit",
                      "max_fee_per_gas",
                      "max_priority_fee_per_gas",
                      "l1_fee_reserve_wei"
                    ],
                    "properties": {
                      "gas_limit": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      },
                      "max_fee_per_gas": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      },
                      "max_priority_fee_per_gas": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      },
                      "l1_fee_reserve_wei": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      }
                    }
                  }
                },
                "anyOf": [
                  {
                    "required": [
                      "funding_mode",
                      "maximum_transaction_fee_wei",
                      "maximum_pending_fees_wei"
                    ],
                    "properties": {
                      "funding_mode": {
                        "enum": ["balance"]
                      },
                      "maximum_transaction_fee_wei": {},
                      "maximum_pending_fees_wei": {}
                    }
                  },
                  {
                    "required": ["maximum_gas_budget_wei"],
                    "properties": {
                      "maximum_gas_budget_wei": {}
                    },
                    "not": {
                      "required": ["funding_mode"],
                      "properties": {
                        "funding_mode": {}
                      }
                    }
                  }
                ]
              }
            ]
          },
          "submitted_at": {
            "type": "string",
            "format": "date-time"
          },
          "proposed_by": {
            "enum": ["provider"]
          },
          "decision_by": {
            "type": "string",
            "enum": ["provider", "application"]
          },
          "decision": {
            "type": "string",
            "enum": ["pending", "accepted", "rejected"]
          },
          "decision_revision": {
            "type": "string",
            "pattern": "^(0|[1-9][0-9]{0,19})$"
          },
          "decided_at": {
            "type": "string",
            "format": "date-time"
          }
        }
      }
    },
    "authorizes_spending": {
      "type": "boolean",
      "enum": [false]
    },
    "activates_execution": {
      "type": "boolean",
      "enum": [false]
    }
  }
}
```

## PUT `/v1/provider/applications/{applicationId}/obligations/sponsorship`

Operation: `proposeProviderSponsorship`.

**Why this exists:** Set the network, fee limits and wallet limits the provider offers to a connected application.

**Who uses it:** Service operator.

**When you need it:** Use to create or replace fee terms before the application accepts and funds its dedicated address.

**Before you start:** Use a current operator token, application ID, expected fee-agreement revision and UUIDv4 idempotency key.

**Result and next step:** 200: pending provider-offered terms. The application must accept the exact revision before infrastructure spending or sponsorship; saving does not activate execution.

**Request details:** Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `applicationId`   | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{64}$"}`                                                        |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["expected_revision", "value"],
  "properties": {
    "expected_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "value": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "chain_id",
        "funding_agreement",
        "account_model",
        "asset_model"
      ],
      "properties": {
        "chain_id": {
          "type": "string",
          "enum": ["eip155:8453", "eip155:84532", "eip155:1", "eip155:11155111"]
        },
        "funding_agreement": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "maximum_gas_budget_wei": {
          "description": "Optional cumulative sponsorship allowance in balance mode; required for legacy agreements. Additional ETH does not raise a configured allowance.",
          "type": "string",
          "pattern": "^[1-9][0-9]{0,77}$"
        },
        "account_model": {
          "type": "string",
          "enum": ["provider-controlled-user-safe"]
        },
        "asset_model": {
          "type": "string",
          "enum": ["individual-user-wallets"]
        },
        "funding_mode": {
          "type": "string",
          "enum": ["balance"],
          "description": "Use current application funding with durable pending-cost reservations. A total budget remains optional; transaction and pending-fee ceilings are required."
        },
        "maximum_transaction_fee_wei": {
          "description": "Maximum authorized network fee for one wallet operation, including its verification and fee reserve.",
          "type": "string",
          "pattern": "^[1-9][0-9]{0,77}$"
        },
        "maximum_pending_fees_wei": {
          "description": "Maximum aggregate fee reservation for wallet operations without a verified final outcome. Unknown and unfinalized outcomes retain their reservations.",
          "type": "string",
          "pattern": "^[1-9][0-9]{0,77}$"
        },
        "maximum_execution_accounts": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100000
        },
        "maximum_in_flight_per_sponsor": {
          "type": "integer",
          "minimum": 1,
          "maximum": 16
        },
        "gas_limits": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "gas_limit",
            "max_fee_per_gas",
            "max_priority_fee_per_gas",
            "l1_fee_reserve_wei"
          ],
          "properties": {
            "gas_limit": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            },
            "max_fee_per_gas": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            },
            "max_priority_fee_per_gas": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            },
            "l1_fee_reserve_wei": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            }
          }
        }
      },
      "anyOf": [
        {
          "required": [
            "funding_mode",
            "maximum_transaction_fee_wei",
            "maximum_pending_fees_wei"
          ],
          "properties": {
            "funding_mode": {
              "enum": ["balance"]
            },
            "maximum_transaction_fee_wei": {},
            "maximum_pending_fees_wei": {}
          }
        },
        {
          "required": ["maximum_gas_budget_wei"],
          "properties": {
            "maximum_gas_budget_wei": {}
          },
          "not": {
            "required": ["funding_mode"],
            "properties": {
              "funding_mode": {}
            }
          }
        }
      ]
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "application_id",
    "kind",
    "revision",
    "value",
    "submitted_at",
    "decision",
    "decision_revision"
  ],
  "properties": {
    "application_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "kind": {
      "type": "string",
      "enum": ["actions", "services", "sponsorship"]
    },
    "revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "value": {
      "anyOf": [
        {
          "type": "array",
          "maxItems": 64,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "description", "fields"],
            "properties": {
              "name": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "description": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "fields": {
                "type": "array",
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["name", "required", "allowed_values"],
                  "properties": {
                    "name": {
                      "type": "string",
                      "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                    },
                    "required": {
                      "type": "boolean"
                    },
                    "allowed_values": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 64,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128
                      }
                    }
                  }
                }
              }
            }
          }
        },
        {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id",
              "kind",
              "vendor",
              "credential_reference",
              "billing_owner"
            ],
            "properties": {
              "id": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "kind": {
                "type": "string",
                "enum": [
                  "rpc-verification",
                  "rpc-submission",
                  "rpc-observation",
                  "other"
                ]
              },
              "vendor": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "credential_reference": {
                "type": "string",
                "pattern": "^[a-zA-Z0-9_-]{1,128}$",
                "description": "Opaque application-local secret-store reference. Never a credential, URL, environment-variable lookup or authority to read another application’s secret. Runtime resolution is not enabled by registration."
              },
              "billing_owner": {
                "type": "string",
                "enum": ["application"]
              }
            }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "chain_id",
            "funding_agreement",
            "account_model",
            "asset_model"
          ],
          "properties": {
            "chain_id": {
              "type": "string",
              "enum": [
                "eip155:8453",
                "eip155:84532",
                "eip155:1",
                "eip155:11155111"
              ]
            },
            "funding_agreement": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maximum_gas_budget_wei": {
              "description": "Optional cumulative sponsorship allowance in balance mode; required for legacy agreements. Additional ETH does not raise a configured allowance.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "account_model": {
              "type": "string",
              "enum": ["provider-controlled-user-safe"]
            },
            "asset_model": {
              "type": "string",
              "enum": ["individual-user-wallets"]
            },
            "funding_mode": {
              "type": "string",
              "enum": ["balance"],
              "description": "Use current application funding with durable pending-cost reservations. A total budget remains optional; transaction and pending-fee ceilings are required."
            },
            "maximum_transaction_fee_wei": {
              "description": "Maximum authorized network fee for one wallet operation, including its verification and fee reserve.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "maximum_pending_fees_wei": {
              "description": "Maximum aggregate fee reservation for wallet operations without a verified final outcome. Unknown and unfinalized outcomes retain their reservations.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "maximum_execution_accounts": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100000
            },
            "maximum_in_flight_per_sponsor": {
              "type": "integer",
              "minimum": 1,
              "maximum": 16
            },
            "gas_limits": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "gas_limit",
                "max_fee_per_gas",
                "max_priority_fee_per_gas",
                "l1_fee_reserve_wei"
              ],
              "properties": {
                "gas_limit": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "max_fee_per_gas": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "max_priority_fee_per_gas": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "l1_fee_reserve_wei": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                }
              }
            }
          },
          "anyOf": [
            {
              "required": [
                "funding_mode",
                "maximum_transaction_fee_wei",
                "maximum_pending_fees_wei"
              ],
              "properties": {
                "funding_mode": {
                  "enum": ["balance"]
                },
                "maximum_transaction_fee_wei": {},
                "maximum_pending_fees_wei": {}
              }
            },
            {
              "required": ["maximum_gas_budget_wei"],
              "properties": {
                "maximum_gas_budget_wei": {}
              },
              "not": {
                "required": ["funding_mode"],
                "properties": {
                  "funding_mode": {}
                }
              }
            }
          ]
        }
      ]
    },
    "submitted_at": {
      "type": "string",
      "format": "date-time"
    },
    "proposed_by": {
      "enum": ["provider"]
    },
    "decision_by": {
      "type": "string",
      "enum": ["provider", "application"]
    },
    "decision": {
      "type": "string",
      "enum": ["pending", "accepted", "rejected"]
    },
    "decision_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "decided_at": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

## POST `/v1/application/obligations/sponsorship/decision`

Operation: `acceptProviderSponsorship`.

**Why this exists:** Record whether this application agrees to the provider’s current network-fee limits and funding terms.

**Who uses it:** Application developer.

**When you need it:** Read the offered terms first, then accept the exact revision before funding or requesting infrastructure preparation.

**Before you start:** Use the target application token, current agreement and decision revisions, and UUIDv4 idempotency key. Only provider-offered sponsorship can be accepted here.

**Result and next step:** 200: the application’s decision on the exact provider-offered revision. Funding, readiness and current transaction authority remain separate requirements.

**Request details:** Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["expected_revision", "expected_decision_revision", "decision"],
  "properties": {
    "expected_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "expected_decision_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "decision": {
      "type": "string",
      "enum": ["accepted", "rejected"]
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "application_id",
    "kind",
    "revision",
    "value",
    "submitted_at",
    "decision",
    "decision_revision"
  ],
  "properties": {
    "application_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "kind": {
      "type": "string",
      "enum": ["actions", "services", "sponsorship"]
    },
    "revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "value": {
      "anyOf": [
        {
          "type": "array",
          "maxItems": 64,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "description", "fields"],
            "properties": {
              "name": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "description": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "fields": {
                "type": "array",
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["name", "required", "allowed_values"],
                  "properties": {
                    "name": {
                      "type": "string",
                      "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                    },
                    "required": {
                      "type": "boolean"
                    },
                    "allowed_values": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 64,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128
                      }
                    }
                  }
                }
              }
            }
          }
        },
        {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id",
              "kind",
              "vendor",
              "credential_reference",
              "billing_owner"
            ],
            "properties": {
              "id": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "kind": {
                "type": "string",
                "enum": [
                  "rpc-verification",
                  "rpc-submission",
                  "rpc-observation",
                  "other"
                ]
              },
              "vendor": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "credential_reference": {
                "type": "string",
                "pattern": "^[a-zA-Z0-9_-]{1,128}$",
                "description": "Opaque application-local secret-store reference. Never a credential, URL, environment-variable lookup or authority to read another application’s secret. Runtime resolution is not enabled by registration."
              },
              "billing_owner": {
                "type": "string",
                "enum": ["application"]
              }
            }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "chain_id",
            "funding_agreement",
            "account_model",
            "asset_model"
          ],
          "properties": {
            "chain_id": {
              "type": "string",
              "enum": [
                "eip155:8453",
                "eip155:84532",
                "eip155:1",
                "eip155:11155111"
              ]
            },
            "funding_agreement": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maximum_gas_budget_wei": {
              "description": "Optional cumulative sponsorship allowance in balance mode; required for legacy agreements. Additional ETH does not raise a configured allowance.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "account_model": {
              "type": "string",
              "enum": ["provider-controlled-user-safe"]
            },
            "asset_model": {
              "type": "string",
              "enum": ["individual-user-wallets"]
            },
            "funding_mode": {
              "type": "string",
              "enum": ["balance"],
              "description": "Use current application funding with durable pending-cost reservations. A total budget remains optional; transaction and pending-fee ceilings are required."
            },
            "maximum_transaction_fee_wei": {
              "description": "Maximum authorized network fee for one wallet operation, including its verification and fee reserve.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "maximum_pending_fees_wei": {
              "description": "Maximum aggregate fee reservation for wallet operations without a verified final outcome. Unknown and unfinalized outcomes retain their reservations.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "maximum_execution_accounts": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100000
            },
            "maximum_in_flight_per_sponsor": {
              "type": "integer",
              "minimum": 1,
              "maximum": 16
            },
            "gas_limits": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "gas_limit",
                "max_fee_per_gas",
                "max_priority_fee_per_gas",
                "l1_fee_reserve_wei"
              ],
              "properties": {
                "gas_limit": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "max_fee_per_gas": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "max_priority_fee_per_gas": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "l1_fee_reserve_wei": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                }
              }
            }
          },
          "anyOf": [
            {
              "required": [
                "funding_mode",
                "maximum_transaction_fee_wei",
                "maximum_pending_fees_wei"
              ],
              "properties": {
                "funding_mode": {
                  "enum": ["balance"]
                },
                "maximum_transaction_fee_wei": {},
                "maximum_pending_fees_wei": {}
              }
            },
            {
              "required": ["maximum_gas_budget_wei"],
              "properties": {
                "maximum_gas_budget_wei": {}
              },
              "not": {
                "required": ["funding_mode"],
                "properties": {
                  "funding_mode": {}
                }
              }
            }
          ]
        }
      ]
    },
    "submitted_at": {
      "type": "string",
      "format": "date-time"
    },
    "proposed_by": {
      "enum": ["provider"]
    },
    "decision_by": {
      "type": "string",
      "enum": ["provider", "application"]
    },
    "decision": {
      "type": "string",
      "enum": ["pending", "accepted", "rejected"]
    },
    "decision_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "decided_at": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

## PUT `/v1/application/obligations/actions`

Operation: `submitApplicationActions`.

**Why this exists:** Describe the business actions and supporting information your application expects to submit for provider review.

**Who uses it:** Application developer.

**When you need it:** Use during application setup or when supported business actions change. Send field definitions, not an actual person’s transaction data.

**Before you start:** Use your application token, the current action-declaration revision and a UUIDv4 idempotency key. Submit action definitions and required fields, never actual user payloads.

**Result and next step:** 200: a saved action declaration awaiting provider review. Send its current revisions to the provider operator for a decision. This does not publish call policy or authorize a transaction.

**Request details:** Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["expected_revision", "value"],
  "properties": {
    "expected_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "value": {
      "type": "array",
      "maxItems": 64,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["name", "description", "fields"],
        "properties": {
          "name": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_-]{0,63}$"
          },
          "description": {
            "type": "string",
            "minLength": 1,
            "maxLength": 256
          },
          "fields": {
            "type": "array",
            "maxItems": 32,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["name", "required", "allowed_values"],
              "properties": {
                "name": {
                  "type": "string",
                  "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                },
                "required": {
                  "type": "boolean"
                },
                "allowed_values": {
                  "type": "array",
                  "minItems": 1,
                  "maxItems": 64,
                  "uniqueItems": true,
                  "items": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "application_id",
    "kind",
    "revision",
    "value",
    "submitted_at",
    "decision",
    "decision_revision"
  ],
  "properties": {
    "application_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "kind": {
      "type": "string",
      "enum": ["actions", "services", "sponsorship"]
    },
    "revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "value": {
      "anyOf": [
        {
          "type": "array",
          "maxItems": 64,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "description", "fields"],
            "properties": {
              "name": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "description": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "fields": {
                "type": "array",
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["name", "required", "allowed_values"],
                  "properties": {
                    "name": {
                      "type": "string",
                      "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                    },
                    "required": {
                      "type": "boolean"
                    },
                    "allowed_values": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 64,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128
                      }
                    }
                  }
                }
              }
            }
          }
        },
        {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id",
              "kind",
              "vendor",
              "credential_reference",
              "billing_owner"
            ],
            "properties": {
              "id": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "kind": {
                "type": "string",
                "enum": [
                  "rpc-verification",
                  "rpc-submission",
                  "rpc-observation",
                  "other"
                ]
              },
              "vendor": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "credential_reference": {
                "type": "string",
                "pattern": "^[a-zA-Z0-9_-]{1,128}$",
                "description": "Opaque application-local secret-store reference. Never a credential, URL, environment-variable lookup or authority to read another application’s secret. Runtime resolution is not enabled by registration."
              },
              "billing_owner": {
                "type": "string",
                "enum": ["application"]
              }
            }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "chain_id",
            "funding_agreement",
            "account_model",
            "asset_model"
          ],
          "properties": {
            "chain_id": {
              "type": "string",
              "enum": [
                "eip155:8453",
                "eip155:84532",
                "eip155:1",
                "eip155:11155111"
              ]
            },
            "funding_agreement": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maximum_gas_budget_wei": {
              "description": "Optional cumulative sponsorship allowance in balance mode; required for legacy agreements. Additional ETH does not raise a configured allowance.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "account_model": {
              "type": "string",
              "enum": ["provider-controlled-user-safe"]
            },
            "asset_model": {
              "type": "string",
              "enum": ["individual-user-wallets"]
            },
            "funding_mode": {
              "type": "string",
              "enum": ["balance"],
              "description": "Use current application funding with durable pending-cost reservations. A total budget remains optional; transaction and pending-fee ceilings are required."
            },
            "maximum_transaction_fee_wei": {
              "description": "Maximum authorized network fee for one wallet operation, including its verification and fee reserve.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "maximum_pending_fees_wei": {
              "description": "Maximum aggregate fee reservation for wallet operations without a verified final outcome. Unknown and unfinalized outcomes retain their reservations.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "maximum_execution_accounts": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100000
            },
            "maximum_in_flight_per_sponsor": {
              "type": "integer",
              "minimum": 1,
              "maximum": 16
            },
            "gas_limits": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "gas_limit",
                "max_fee_per_gas",
                "max_priority_fee_per_gas",
                "l1_fee_reserve_wei"
              ],
              "properties": {
                "gas_limit": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "max_fee_per_gas": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "max_priority_fee_per_gas": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "l1_fee_reserve_wei": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                }
              }
            }
          },
          "anyOf": [
            {
              "required": [
                "funding_mode",
                "maximum_transaction_fee_wei",
                "maximum_pending_fees_wei"
              ],
              "properties": {
                "funding_mode": {
                  "enum": ["balance"]
                },
                "maximum_transaction_fee_wei": {},
                "maximum_pending_fees_wei": {}
              }
            },
            {
              "required": ["maximum_gas_budget_wei"],
              "properties": {
                "maximum_gas_budget_wei": {}
              },
              "not": {
                "required": ["funding_mode"],
                "properties": {
                  "funding_mode": {}
                }
              }
            }
          ]
        }
      ]
    },
    "submitted_at": {
      "type": "string",
      "format": "date-time"
    },
    "proposed_by": {
      "enum": ["provider"]
    },
    "decision_by": {
      "type": "string",
      "enum": ["provider", "application"]
    },
    "decision": {
      "type": "string",
      "enum": ["pending", "accepted", "rejected"]
    },
    "decision_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "decided_at": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

## POST `/v1/provider/applications/{applicationId}/obligations/actions/decision`

Operation: `decideApplicationActions`.

**Why this exists:** Record your decision on the current submitted business actions and information requirements.

**Who uses it:** Service operator.

**When you need it:** Use after reviewing an application’s transaction declaration. Acceptance alone does not publish transaction rules or approve anyone’s spending.

**Before you start:** Use a provider operator token, the application ID, current declaration and decision revisions, and a UUIDv4 idempotency key.

**Result and next step:** 200: accepted or rejected action definitions. Acceptance constrains supporting transaction data; the active call policy, owner consent and every transaction check remain required.

**Request details:** Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `applicationId`   | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{64}$"}`                                                        |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["expected_revision", "expected_decision_revision", "decision"],
  "properties": {
    "expected_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "expected_decision_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "decision": {
      "type": "string",
      "enum": ["accepted", "rejected"]
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "application_id",
    "kind",
    "revision",
    "value",
    "submitted_at",
    "decision",
    "decision_revision"
  ],
  "properties": {
    "application_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "kind": {
      "type": "string",
      "enum": ["actions", "services", "sponsorship"]
    },
    "revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "value": {
      "anyOf": [
        {
          "type": "array",
          "maxItems": 64,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "description", "fields"],
            "properties": {
              "name": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "description": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "fields": {
                "type": "array",
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["name", "required", "allowed_values"],
                  "properties": {
                    "name": {
                      "type": "string",
                      "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                    },
                    "required": {
                      "type": "boolean"
                    },
                    "allowed_values": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 64,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128
                      }
                    }
                  }
                }
              }
            }
          }
        },
        {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id",
              "kind",
              "vendor",
              "credential_reference",
              "billing_owner"
            ],
            "properties": {
              "id": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "kind": {
                "type": "string",
                "enum": [
                  "rpc-verification",
                  "rpc-submission",
                  "rpc-observation",
                  "other"
                ]
              },
              "vendor": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "credential_reference": {
                "type": "string",
                "pattern": "^[a-zA-Z0-9_-]{1,128}$",
                "description": "Opaque application-local secret-store reference. Never a credential, URL, environment-variable lookup or authority to read another application’s secret. Runtime resolution is not enabled by registration."
              },
              "billing_owner": {
                "type": "string",
                "enum": ["application"]
              }
            }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "chain_id",
            "funding_agreement",
            "account_model",
            "asset_model"
          ],
          "properties": {
            "chain_id": {
              "type": "string",
              "enum": [
                "eip155:8453",
                "eip155:84532",
                "eip155:1",
                "eip155:11155111"
              ]
            },
            "funding_agreement": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maximum_gas_budget_wei": {
              "description": "Optional cumulative sponsorship allowance in balance mode; required for legacy agreements. Additional ETH does not raise a configured allowance.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "account_model": {
              "type": "string",
              "enum": ["provider-controlled-user-safe"]
            },
            "asset_model": {
              "type": "string",
              "enum": ["individual-user-wallets"]
            },
            "funding_mode": {
              "type": "string",
              "enum": ["balance"],
              "description": "Use current application funding with durable pending-cost reservations. A total budget remains optional; transaction and pending-fee ceilings are required."
            },
            "maximum_transaction_fee_wei": {
              "description": "Maximum authorized network fee for one wallet operation, including its verification and fee reserve.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "maximum_pending_fees_wei": {
              "description": "Maximum aggregate fee reservation for wallet operations without a verified final outcome. Unknown and unfinalized outcomes retain their reservations.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "maximum_execution_accounts": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100000
            },
            "maximum_in_flight_per_sponsor": {
              "type": "integer",
              "minimum": 1,
              "maximum": 16
            },
            "gas_limits": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "gas_limit",
                "max_fee_per_gas",
                "max_priority_fee_per_gas",
                "l1_fee_reserve_wei"
              ],
              "properties": {
                "gas_limit": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "max_fee_per_gas": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "max_priority_fee_per_gas": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "l1_fee_reserve_wei": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                }
              }
            }
          },
          "anyOf": [
            {
              "required": [
                "funding_mode",
                "maximum_transaction_fee_wei",
                "maximum_pending_fees_wei"
              ],
              "properties": {
                "funding_mode": {
                  "enum": ["balance"]
                },
                "maximum_transaction_fee_wei": {},
                "maximum_pending_fees_wei": {}
              }
            },
            {
              "required": ["maximum_gas_budget_wei"],
              "properties": {
                "maximum_gas_budget_wei": {}
              },
              "not": {
                "required": ["funding_mode"],
                "properties": {
                  "funding_mode": {}
                }
              }
            }
          ]
        }
      ]
    },
    "submitted_at": {
      "type": "string",
      "format": "date-time"
    },
    "proposed_by": {
      "enum": ["provider"]
    },
    "decision_by": {
      "type": "string",
      "enum": ["provider", "application"]
    },
    "decision": {
      "type": "string",
      "enum": ["pending", "accepted", "rejected"]
    },
    "decision_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "decided_at": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

## PUT `/v1/application/obligations/services`

Operation: `submitApplicationServices`.

**Why this exists:** Declare the network-reading and verification services the application will pay for and their saved connection references.

**Who uses it:** Application developer.

**When you need it:** Use after saving service connections, or when the selected services change. Submit references rather than secret values.

**Before you start:** Save application-owned service connections first. Use your application token, the current service-declaration revision and a UUIDv4 idempotency key. Submit opaque saved references rather than secrets.

**Result and next step:** 200: saved service declarations awaiting provider review. Changes require a new provider decision before eligible connections can be used.

**Request details:** Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["expected_revision", "value"],
  "properties": {
    "expected_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "value": {
      "type": "array",
      "maxItems": 32,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "kind",
          "vendor",
          "credential_reference",
          "billing_owner"
        ],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_-]{0,63}$"
          },
          "kind": {
            "type": "string",
            "enum": [
              "rpc-verification",
              "rpc-submission",
              "rpc-observation",
              "other"
            ]
          },
          "vendor": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_-]{0,63}$"
          },
          "credential_reference": {
            "type": "string",
            "pattern": "^[a-zA-Z0-9_-]{1,128}$",
            "description": "Opaque application-local secret-store reference. Never a credential, URL, environment-variable lookup or authority to read another application’s secret. Runtime resolution is not enabled by registration."
          },
          "billing_owner": {
            "type": "string",
            "enum": ["application"]
          }
        }
      }
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "application_id",
    "kind",
    "revision",
    "value",
    "submitted_at",
    "decision",
    "decision_revision"
  ],
  "properties": {
    "application_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "kind": {
      "type": "string",
      "enum": ["actions", "services", "sponsorship"]
    },
    "revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "value": {
      "anyOf": [
        {
          "type": "array",
          "maxItems": 64,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "description", "fields"],
            "properties": {
              "name": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "description": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "fields": {
                "type": "array",
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["name", "required", "allowed_values"],
                  "properties": {
                    "name": {
                      "type": "string",
                      "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                    },
                    "required": {
                      "type": "boolean"
                    },
                    "allowed_values": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 64,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128
                      }
                    }
                  }
                }
              }
            }
          }
        },
        {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id",
              "kind",
              "vendor",
              "credential_reference",
              "billing_owner"
            ],
            "properties": {
              "id": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "kind": {
                "type": "string",
                "enum": [
                  "rpc-verification",
                  "rpc-submission",
                  "rpc-observation",
                  "other"
                ]
              },
              "vendor": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "credential_reference": {
                "type": "string",
                "pattern": "^[a-zA-Z0-9_-]{1,128}$",
                "description": "Opaque application-local secret-store reference. Never a credential, URL, environment-variable lookup or authority to read another application’s secret. Runtime resolution is not enabled by registration."
              },
              "billing_owner": {
                "type": "string",
                "enum": ["application"]
              }
            }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "chain_id",
            "funding_agreement",
            "account_model",
            "asset_model"
          ],
          "properties": {
            "chain_id": {
              "type": "string",
              "enum": [
                "eip155:8453",
                "eip155:84532",
                "eip155:1",
                "eip155:11155111"
              ]
            },
            "funding_agreement": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maximum_gas_budget_wei": {
              "description": "Optional cumulative sponsorship allowance in balance mode; required for legacy agreements. Additional ETH does not raise a configured allowance.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "account_model": {
              "type": "string",
              "enum": ["provider-controlled-user-safe"]
            },
            "asset_model": {
              "type": "string",
              "enum": ["individual-user-wallets"]
            },
            "funding_mode": {
              "type": "string",
              "enum": ["balance"],
              "description": "Use current application funding with durable pending-cost reservations. A total budget remains optional; transaction and pending-fee ceilings are required."
            },
            "maximum_transaction_fee_wei": {
              "description": "Maximum authorized network fee for one wallet operation, including its verification and fee reserve.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "maximum_pending_fees_wei": {
              "description": "Maximum aggregate fee reservation for wallet operations without a verified final outcome. Unknown and unfinalized outcomes retain their reservations.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "maximum_execution_accounts": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100000
            },
            "maximum_in_flight_per_sponsor": {
              "type": "integer",
              "minimum": 1,
              "maximum": 16
            },
            "gas_limits": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "gas_limit",
                "max_fee_per_gas",
                "max_priority_fee_per_gas",
                "l1_fee_reserve_wei"
              ],
              "properties": {
                "gas_limit": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "max_fee_per_gas": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "max_priority_fee_per_gas": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "l1_fee_reserve_wei": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                }
              }
            }
          },
          "anyOf": [
            {
              "required": [
                "funding_mode",
                "maximum_transaction_fee_wei",
                "maximum_pending_fees_wei"
              ],
              "properties": {
                "funding_mode": {
                  "enum": ["balance"]
                },
                "maximum_transaction_fee_wei": {},
                "maximum_pending_fees_wei": {}
              }
            },
            {
              "required": ["maximum_gas_budget_wei"],
              "properties": {
                "maximum_gas_budget_wei": {}
              },
              "not": {
                "required": ["funding_mode"],
                "properties": {
                  "funding_mode": {}
                }
              }
            }
          ]
        }
      ]
    },
    "submitted_at": {
      "type": "string",
      "format": "date-time"
    },
    "proposed_by": {
      "enum": ["provider"]
    },
    "decision_by": {
      "type": "string",
      "enum": ["provider", "application"]
    },
    "decision": {
      "type": "string",
      "enum": ["pending", "accepted", "rejected"]
    },
    "decision_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "decided_at": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

## POST `/v1/provider/applications/{applicationId}/obligations/services/decision`

Operation: `decideApplicationServices`.

**Why this exists:** Record whether the declared network services and saved connection origins are acceptable.

**Who uses it:** Service operator.

**When you need it:** Use after reviewing the current service declaration and connection metadata. Acceptance permits eligible connections to be used; it does not fund them.

**Before you start:** Review the declared services and credential origins. Use a provider operator token, both current revisions and a UUIDv4 idempotency key.

**Result and next step:** 200: accepted or rejected service declarations. Accepted references can resolve only application-owned credentials when credential storage is configured.

**Request details:** Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `applicationId`   | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{64}$"}`                                                        |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["expected_revision", "expected_decision_revision", "decision"],
  "properties": {
    "expected_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "expected_decision_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "decision": {
      "type": "string",
      "enum": ["accepted", "rejected"]
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "application_id",
    "kind",
    "revision",
    "value",
    "submitted_at",
    "decision",
    "decision_revision"
  ],
  "properties": {
    "application_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "kind": {
      "type": "string",
      "enum": ["actions", "services", "sponsorship"]
    },
    "revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "value": {
      "anyOf": [
        {
          "type": "array",
          "maxItems": 64,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "description", "fields"],
            "properties": {
              "name": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "description": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "fields": {
                "type": "array",
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["name", "required", "allowed_values"],
                  "properties": {
                    "name": {
                      "type": "string",
                      "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                    },
                    "required": {
                      "type": "boolean"
                    },
                    "allowed_values": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 64,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128
                      }
                    }
                  }
                }
              }
            }
          }
        },
        {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id",
              "kind",
              "vendor",
              "credential_reference",
              "billing_owner"
            ],
            "properties": {
              "id": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "kind": {
                "type": "string",
                "enum": [
                  "rpc-verification",
                  "rpc-submission",
                  "rpc-observation",
                  "other"
                ]
              },
              "vendor": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "credential_reference": {
                "type": "string",
                "pattern": "^[a-zA-Z0-9_-]{1,128}$",
                "description": "Opaque application-local secret-store reference. Never a credential, URL, environment-variable lookup or authority to read another application’s secret. Runtime resolution is not enabled by registration."
              },
              "billing_owner": {
                "type": "string",
                "enum": ["application"]
              }
            }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "chain_id",
            "funding_agreement",
            "account_model",
            "asset_model"
          ],
          "properties": {
            "chain_id": {
              "type": "string",
              "enum": [
                "eip155:8453",
                "eip155:84532",
                "eip155:1",
                "eip155:11155111"
              ]
            },
            "funding_agreement": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maximum_gas_budget_wei": {
              "description": "Optional cumulative sponsorship allowance in balance mode; required for legacy agreements. Additional ETH does not raise a configured allowance.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "account_model": {
              "type": "string",
              "enum": ["provider-controlled-user-safe"]
            },
            "asset_model": {
              "type": "string",
              "enum": ["individual-user-wallets"]
            },
            "funding_mode": {
              "type": "string",
              "enum": ["balance"],
              "description": "Use current application funding with durable pending-cost reservations. A total budget remains optional; transaction and pending-fee ceilings are required."
            },
            "maximum_transaction_fee_wei": {
              "description": "Maximum authorized network fee for one wallet operation, including its verification and fee reserve.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "maximum_pending_fees_wei": {
              "description": "Maximum aggregate fee reservation for wallet operations without a verified final outcome. Unknown and unfinalized outcomes retain their reservations.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "maximum_execution_accounts": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100000
            },
            "maximum_in_flight_per_sponsor": {
              "type": "integer",
              "minimum": 1,
              "maximum": 16
            },
            "gas_limits": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "gas_limit",
                "max_fee_per_gas",
                "max_priority_fee_per_gas",
                "l1_fee_reserve_wei"
              ],
              "properties": {
                "gas_limit": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "max_fee_per_gas": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "max_priority_fee_per_gas": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "l1_fee_reserve_wei": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                }
              }
            }
          },
          "anyOf": [
            {
              "required": [
                "funding_mode",
                "maximum_transaction_fee_wei",
                "maximum_pending_fees_wei"
              ],
              "properties": {
                "funding_mode": {
                  "enum": ["balance"]
                },
                "maximum_transaction_fee_wei": {},
                "maximum_pending_fees_wei": {}
              }
            },
            {
              "required": ["maximum_gas_budget_wei"],
              "properties": {
                "maximum_gas_budget_wei": {}
              },
              "not": {
                "required": ["funding_mode"],
                "properties": {
                  "funding_mode": {}
                }
              }
            }
          ]
        }
      ]
    },
    "submitted_at": {
      "type": "string",
      "format": "date-time"
    },
    "proposed_by": {
      "enum": ["provider"]
    },
    "decision_by": {
      "type": "string",
      "enum": ["provider", "application"]
    },
    "decision": {
      "type": "string",
      "enum": ["pending", "accepted", "rejected"]
    },
    "decision_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "decided_at": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

## PUT `/v1/application/obligations/sponsorship`

Operation: `submitApplicationSponsorship`.

**Why this exists:** Declare the application’s agreement to pay eligible network fees, with bounded costs and account limits.

**Who uses it:** Application developer.

**When you need it:** Use before preparing fee-paying infrastructure or changing fee terms. Saving this agreement does not transfer money or fund the address.

**Before you start:** Use your application token, the current fee-agreement revision and a UUIDv4 idempotency key. Include bounded funding and account limits for the configured network.

**Result and next step:** 200: a saved fee agreement awaiting provider review. After acceptance, the provider can prepare the application’s fee infrastructure and the application can fund its returned address.

**Request details:** Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["expected_revision", "value"],
  "properties": {
    "expected_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "value": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "chain_id",
        "funding_agreement",
        "account_model",
        "asset_model"
      ],
      "properties": {
        "chain_id": {
          "type": "string",
          "enum": ["eip155:8453", "eip155:84532", "eip155:1", "eip155:11155111"]
        },
        "funding_agreement": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "maximum_gas_budget_wei": {
          "description": "Optional cumulative sponsorship allowance in balance mode; required for legacy agreements. Additional ETH does not raise a configured allowance.",
          "type": "string",
          "pattern": "^[1-9][0-9]{0,77}$"
        },
        "account_model": {
          "type": "string",
          "enum": ["provider-controlled-user-safe"]
        },
        "asset_model": {
          "type": "string",
          "enum": ["individual-user-wallets"]
        },
        "funding_mode": {
          "type": "string",
          "enum": ["balance"],
          "description": "Use current application funding with durable pending-cost reservations. A total budget remains optional; transaction and pending-fee ceilings are required."
        },
        "maximum_transaction_fee_wei": {
          "description": "Maximum authorized network fee for one wallet operation, including its verification and fee reserve.",
          "type": "string",
          "pattern": "^[1-9][0-9]{0,77}$"
        },
        "maximum_pending_fees_wei": {
          "description": "Maximum aggregate fee reservation for wallet operations without a verified final outcome. Unknown and unfinalized outcomes retain their reservations.",
          "type": "string",
          "pattern": "^[1-9][0-9]{0,77}$"
        },
        "maximum_execution_accounts": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100000
        },
        "maximum_in_flight_per_sponsor": {
          "type": "integer",
          "minimum": 1,
          "maximum": 16
        },
        "gas_limits": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "gas_limit",
            "max_fee_per_gas",
            "max_priority_fee_per_gas",
            "l1_fee_reserve_wei"
          ],
          "properties": {
            "gas_limit": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            },
            "max_fee_per_gas": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            },
            "max_priority_fee_per_gas": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            },
            "l1_fee_reserve_wei": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            }
          }
        }
      },
      "anyOf": [
        {
          "required": [
            "funding_mode",
            "maximum_transaction_fee_wei",
            "maximum_pending_fees_wei"
          ],
          "properties": {
            "funding_mode": {
              "enum": ["balance"]
            },
            "maximum_transaction_fee_wei": {},
            "maximum_pending_fees_wei": {}
          }
        },
        {
          "required": ["maximum_gas_budget_wei"],
          "properties": {
            "maximum_gas_budget_wei": {}
          },
          "not": {
            "required": ["funding_mode"],
            "properties": {
              "funding_mode": {}
            }
          }
        }
      ]
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "application_id",
    "kind",
    "revision",
    "value",
    "submitted_at",
    "decision",
    "decision_revision"
  ],
  "properties": {
    "application_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "kind": {
      "type": "string",
      "enum": ["actions", "services", "sponsorship"]
    },
    "revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "value": {
      "anyOf": [
        {
          "type": "array",
          "maxItems": 64,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "description", "fields"],
            "properties": {
              "name": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "description": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "fields": {
                "type": "array",
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["name", "required", "allowed_values"],
                  "properties": {
                    "name": {
                      "type": "string",
                      "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                    },
                    "required": {
                      "type": "boolean"
                    },
                    "allowed_values": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 64,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128
                      }
                    }
                  }
                }
              }
            }
          }
        },
        {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id",
              "kind",
              "vendor",
              "credential_reference",
              "billing_owner"
            ],
            "properties": {
              "id": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "kind": {
                "type": "string",
                "enum": [
                  "rpc-verification",
                  "rpc-submission",
                  "rpc-observation",
                  "other"
                ]
              },
              "vendor": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "credential_reference": {
                "type": "string",
                "pattern": "^[a-zA-Z0-9_-]{1,128}$",
                "description": "Opaque application-local secret-store reference. Never a credential, URL, environment-variable lookup or authority to read another application’s secret. Runtime resolution is not enabled by registration."
              },
              "billing_owner": {
                "type": "string",
                "enum": ["application"]
              }
            }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "chain_id",
            "funding_agreement",
            "account_model",
            "asset_model"
          ],
          "properties": {
            "chain_id": {
              "type": "string",
              "enum": [
                "eip155:8453",
                "eip155:84532",
                "eip155:1",
                "eip155:11155111"
              ]
            },
            "funding_agreement": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maximum_gas_budget_wei": {
              "description": "Optional cumulative sponsorship allowance in balance mode; required for legacy agreements. Additional ETH does not raise a configured allowance.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "account_model": {
              "type": "string",
              "enum": ["provider-controlled-user-safe"]
            },
            "asset_model": {
              "type": "string",
              "enum": ["individual-user-wallets"]
            },
            "funding_mode": {
              "type": "string",
              "enum": ["balance"],
              "description": "Use current application funding with durable pending-cost reservations. A total budget remains optional; transaction and pending-fee ceilings are required."
            },
            "maximum_transaction_fee_wei": {
              "description": "Maximum authorized network fee for one wallet operation, including its verification and fee reserve.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "maximum_pending_fees_wei": {
              "description": "Maximum aggregate fee reservation for wallet operations without a verified final outcome. Unknown and unfinalized outcomes retain their reservations.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "maximum_execution_accounts": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100000
            },
            "maximum_in_flight_per_sponsor": {
              "type": "integer",
              "minimum": 1,
              "maximum": 16
            },
            "gas_limits": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "gas_limit",
                "max_fee_per_gas",
                "max_priority_fee_per_gas",
                "l1_fee_reserve_wei"
              ],
              "properties": {
                "gas_limit": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "max_fee_per_gas": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "max_priority_fee_per_gas": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "l1_fee_reserve_wei": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                }
              }
            }
          },
          "anyOf": [
            {
              "required": [
                "funding_mode",
                "maximum_transaction_fee_wei",
                "maximum_pending_fees_wei"
              ],
              "properties": {
                "funding_mode": {
                  "enum": ["balance"]
                },
                "maximum_transaction_fee_wei": {},
                "maximum_pending_fees_wei": {}
              }
            },
            {
              "required": ["maximum_gas_budget_wei"],
              "properties": {
                "maximum_gas_budget_wei": {}
              },
              "not": {
                "required": ["funding_mode"],
                "properties": {
                  "funding_mode": {}
                }
              }
            }
          ]
        }
      ]
    },
    "submitted_at": {
      "type": "string",
      "format": "date-time"
    },
    "proposed_by": {
      "enum": ["provider"]
    },
    "decision_by": {
      "type": "string",
      "enum": ["provider", "application"]
    },
    "decision": {
      "type": "string",
      "enum": ["pending", "accepted", "rejected"]
    },
    "decision_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "decided_at": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

## POST `/v1/provider/applications/{applicationId}/obligations/sponsorship/decision`

Operation: `decideApplicationSponsorship`.

**Why this exists:** Record your decision on who pays network fees and the proposed cost limits.

**Who uses it:** Service operator.

**When you need it:** Use before preparing application fee infrastructure, and whenever fee terms change. Actual funding remains a separate step.

**Before you start:** Review the network, funding agreement and limits. Use a provider operator token, both current revisions and a UUIDv4 idempotency key.

**Result and next step:** 200: accepted or rejected fee terms. Acceptance permits eligible infrastructure setup; it does not fund gas or approve user transactions.

**Request details:** Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `applicationId`   | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{64}$"}`                                                        |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["expected_revision", "expected_decision_revision", "decision"],
  "properties": {
    "expected_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "expected_decision_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "decision": {
      "type": "string",
      "enum": ["accepted", "rejected"]
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "application_id",
    "kind",
    "revision",
    "value",
    "submitted_at",
    "decision",
    "decision_revision"
  ],
  "properties": {
    "application_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "kind": {
      "type": "string",
      "enum": ["actions", "services", "sponsorship"]
    },
    "revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "value": {
      "anyOf": [
        {
          "type": "array",
          "maxItems": 64,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "description", "fields"],
            "properties": {
              "name": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "description": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "fields": {
                "type": "array",
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["name", "required", "allowed_values"],
                  "properties": {
                    "name": {
                      "type": "string",
                      "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                    },
                    "required": {
                      "type": "boolean"
                    },
                    "allowed_values": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 64,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128
                      }
                    }
                  }
                }
              }
            }
          }
        },
        {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id",
              "kind",
              "vendor",
              "credential_reference",
              "billing_owner"
            ],
            "properties": {
              "id": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "kind": {
                "type": "string",
                "enum": [
                  "rpc-verification",
                  "rpc-submission",
                  "rpc-observation",
                  "other"
                ]
              },
              "vendor": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "credential_reference": {
                "type": "string",
                "pattern": "^[a-zA-Z0-9_-]{1,128}$",
                "description": "Opaque application-local secret-store reference. Never a credential, URL, environment-variable lookup or authority to read another application’s secret. Runtime resolution is not enabled by registration."
              },
              "billing_owner": {
                "type": "string",
                "enum": ["application"]
              }
            }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "chain_id",
            "funding_agreement",
            "account_model",
            "asset_model"
          ],
          "properties": {
            "chain_id": {
              "type": "string",
              "enum": [
                "eip155:8453",
                "eip155:84532",
                "eip155:1",
                "eip155:11155111"
              ]
            },
            "funding_agreement": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maximum_gas_budget_wei": {
              "description": "Optional cumulative sponsorship allowance in balance mode; required for legacy agreements. Additional ETH does not raise a configured allowance.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "account_model": {
              "type": "string",
              "enum": ["provider-controlled-user-safe"]
            },
            "asset_model": {
              "type": "string",
              "enum": ["individual-user-wallets"]
            },
            "funding_mode": {
              "type": "string",
              "enum": ["balance"],
              "description": "Use current application funding with durable pending-cost reservations. A total budget remains optional; transaction and pending-fee ceilings are required."
            },
            "maximum_transaction_fee_wei": {
              "description": "Maximum authorized network fee for one wallet operation, including its verification and fee reserve.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "maximum_pending_fees_wei": {
              "description": "Maximum aggregate fee reservation for wallet operations without a verified final outcome. Unknown and unfinalized outcomes retain their reservations.",
              "type": "string",
              "pattern": "^[1-9][0-9]{0,77}$"
            },
            "maximum_execution_accounts": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100000
            },
            "maximum_in_flight_per_sponsor": {
              "type": "integer",
              "minimum": 1,
              "maximum": 16
            },
            "gas_limits": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "gas_limit",
                "max_fee_per_gas",
                "max_priority_fee_per_gas",
                "l1_fee_reserve_wei"
              ],
              "properties": {
                "gas_limit": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "max_fee_per_gas": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "max_priority_fee_per_gas": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "l1_fee_reserve_wei": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                }
              }
            }
          },
          "anyOf": [
            {
              "required": [
                "funding_mode",
                "maximum_transaction_fee_wei",
                "maximum_pending_fees_wei"
              ],
              "properties": {
                "funding_mode": {
                  "enum": ["balance"]
                },
                "maximum_transaction_fee_wei": {},
                "maximum_pending_fees_wei": {}
              }
            },
            {
              "required": ["maximum_gas_budget_wei"],
              "properties": {
                "maximum_gas_budget_wei": {}
              },
              "not": {
                "required": ["funding_mode"],
                "properties": {
                  "funding_mode": {}
                }
              }
            }
          ]
        }
      ]
    },
    "submitted_at": {
      "type": "string",
      "format": "date-time"
    },
    "proposed_by": {
      "enum": ["provider"]
    },
    "decision_by": {
      "type": "string",
      "enum": ["provider", "application"]
    },
    "decision": {
      "type": "string",
      "enum": ["pending", "accepted", "rejected"]
    },
    "decision_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "decided_at": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

## GET `/v1/applications/configurations`

Operation: `listApplicationConfigurations`.

**Why this exists:** List visible application setups and optionally load one application’s current rules and recent proposals.

**Who uses it:** Application developer or service operator.

**When you need it:** Use for a setup dashboard. Operators can inspect their configured applications; applications can see only their own setup.

**Before you start:** Use application configuration read scope or an exact configured provider operator with configuration write scope. Supply application_id to load one application’s policy and latest 20 proposals. Application callers cannot select another namespace.

**Result and next step:** 200: enabled application summaries and selected policy/proposal details. The provider sees its configured applications; applications see only their own registration. No spending authority is granted.

**Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter        | Location | Required | Schema                                                                           |
| ---------------- | -------- | -------- | -------------------------------------------------------------------------------- |
| `application_id` | query    | no       | `{"type":"string","pattern":"^[0-9a-f]{64}$"}`                                   |
| `wallet-network` | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}` |

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["role", "applications"],
  "properties": {
    "network": {
      "type": "string",
      "enum": ["base", "base-sepolia", "ethereum", "ethereum-sepolia"]
    },
    "role": {
      "type": "string",
      "enum": ["provider", "application"]
    },
    "applications": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "application_id",
          "name",
          "active_revision",
          "proposals",
          "proposals_truncated",
          "publications"
        ],
        "properties": {
          "application_id": {
            "type": "string",
            "pattern": "^[0-9a-f]{64}$"
          },
          "name": {
            "type": "string"
          },
          "active_revision": {
            "type": "string",
            "pattern": "^(0|[1-9][0-9]{0,19})$"
          },
          "publication": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "application_id",
              "revision",
              "previous_revision",
              "policy_hash",
              "policy",
              "published_at",
              "published_by"
            ],
            "properties": {
              "application_id": {
                "type": "string",
                "pattern": "^[0-9a-f]{64}$"
              },
              "revision": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]{0,19})$"
              },
              "previous_revision": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]{0,19})$"
              },
              "policy_hash": {
                "type": "string",
                "pattern": "^[0-9a-f]{64}$"
              },
              "policy": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "version",
                  "enabled",
                  "chain_id",
                  "contracts",
                  "maximum_calls",
                  "maximum_native_value_wei",
                  "max_validity_seconds",
                  "claim_requirements"
                ],
                "properties": {
                  "action_requirements": {
                    "type": "array",
                    "maxItems": 64,
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["name", "description", "fields"],
                      "properties": {
                        "name": {
                          "type": "string",
                          "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                        },
                        "description": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 256
                        },
                        "fields": {
                          "type": "array",
                          "maxItems": 32,
                          "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["name", "required", "allowed_values"],
                            "properties": {
                              "name": {
                                "type": "string",
                                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                              },
                              "required": {
                                "type": "boolean"
                              },
                              "allowed_values": {
                                "type": "array",
                                "minItems": 1,
                                "maxItems": 64,
                                "uniqueItems": true,
                                "items": {
                                  "type": "string",
                                  "minLength": 1,
                                  "maxLength": 128
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "application_resources_hash": {
                    "type": "string",
                    "pattern": "^[0-9a-f]{64}$"
                  },
                  "version": {
                    "type": "string",
                    "enum": ["1"]
                  },
                  "enabled": {
                    "type": "boolean"
                  },
                  "chain_id": {
                    "type": "string",
                    "enum": [
                      "eip155:84532",
                      "eip155:8453",
                      "eip155:1",
                      "eip155:11155111"
                    ]
                  },
                  "contracts": {
                    "type": "array",
                    "maxItems": 32,
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["address", "code_hash", "methods"],
                      "properties": {
                        "address": {
                          "type": "string",
                          "pattern": "^0x[0-9a-fA-F]{40}$"
                        },
                        "code_hash": {
                          "type": "string",
                          "pattern": "^0x[0-9a-f]{64}$"
                        },
                        "implementation": {
                          "type": "object",
                          "additionalProperties": false,
                          "required": ["address", "code_hash"],
                          "properties": {
                            "address": {
                              "type": "string",
                              "pattern": "^0x[0-9a-fA-F]{40}$"
                            },
                            "code_hash": {
                              "type": "string",
                              "pattern": "^0x[0-9a-f]{64}$"
                            }
                          }
                        },
                        "methods": {
                          "type": "array",
                          "minItems": 1,
                          "maxItems": 32,
                          "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["signature", "maximum_value_wei"],
                            "properties": {
                              "signature": {
                                "type": "string",
                                "minLength": 3,
                                "maxLength": 256
                              },
                              "maximum_value_wei": {
                                "type": "string",
                                "pattern": "^(0|[1-9][0-9]{0,77})$"
                              },
                              "user_address_parameters": {
                                "type": "array",
                                "minItems": 1,
                                "maxItems": 16,
                                "uniqueItems": true,
                                "items": {
                                  "type": "integer",
                                  "minimum": 0,
                                  "maximum": 31
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "call_adapters": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                      "tokenTransfers": {
                        "type": "array",
                        "maxItems": 128,
                        "items": {
                          "type": "object",
                          "additionalProperties": false,
                          "required": ["token", "recipients", "maximumAmount"],
                          "properties": {
                            "token": {
                              "type": "object",
                              "additionalProperties": false,
                              "required": ["address", "codeHash"],
                              "properties": {
                                "address": {
                                  "type": "string",
                                  "pattern": "^0x[0-9a-fA-F]{40}$"
                                },
                                "codeHash": {
                                  "type": "string",
                                  "pattern": "^0x[0-9a-f]{64}$"
                                },
                                "implementation": {
                                  "type": "object",
                                  "additionalProperties": false,
                                  "required": ["address", "codeHash"],
                                  "properties": {
                                    "address": {
                                      "type": "string",
                                      "pattern": "^0x[0-9a-fA-F]{40}$"
                                    },
                                    "codeHash": {
                                      "type": "string",
                                      "pattern": "^0x[0-9a-f]{64}$"
                                    }
                                  }
                                }
                              }
                            },
                            "recipients": {
                              "type": "array",
                              "minItems": 1,
                              "maxItems": 128,
                              "uniqueItems": true,
                              "items": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              }
                            },
                            "maximumAmount": {
                              "type": "string",
                              "pattern": "^(0|[1-9][0-9]{0,77})$"
                            },
                            "lifetimeAmount": {
                              "type": "string",
                              "pattern": "^(0|[1-9][0-9]{0,77})$"
                            }
                          }
                        }
                      },
                      "swaps": {
                        "type": "array",
                        "maxItems": 128,
                        "items": {
                          "type": "object",
                          "additionalProperties": false,
                          "required": [
                            "id",
                            "router",
                            "tokenIn",
                            "tokenOut",
                            "fee",
                            "maximumInput"
                          ],
                          "properties": {
                            "id": {
                              "type": "string",
                              "pattern": "^[A-Za-z0-9._-]{1,64}$"
                            },
                            "router": {
                              "type": "object",
                              "additionalProperties": false,
                              "required": ["address", "codeHash"],
                              "properties": {
                                "address": {
                                  "type": "string",
                                  "pattern": "^0x[0-9a-fA-F]{40}$"
                                },
                                "codeHash": {
                                  "type": "string",
                                  "pattern": "^0x[0-9a-f]{64}$"
                                },
                                "implementation": {
                                  "type": "object",
                                  "additionalProperties": false,
                                  "required": ["address", "codeHash"],
                                  "properties": {
                                    "address": {
                                      "type": "string",
                                      "pattern": "^0x[0-9a-fA-F]{40}$"
                                    },
                                    "codeHash": {
                                      "type": "string",
                                      "pattern": "^0x[0-9a-f]{64}$"
                                    }
                                  }
                                }
                              }
                            },
                            "tokenIn": {
                              "type": "object",
                              "additionalProperties": false,
                              "required": ["address", "codeHash"],
                              "properties": {
                                "address": {
                                  "type": "string",
                                  "pattern": "^0x[0-9a-fA-F]{40}$"
                                },
                                "codeHash": {
                                  "type": "string",
                                  "pattern": "^0x[0-9a-f]{64}$"
                                },
                                "implementation": {
                                  "type": "object",
                                  "additionalProperties": false,
                                  "required": ["address", "codeHash"],
                                  "properties": {
                                    "address": {
                                      "type": "string",
                                      "pattern": "^0x[0-9a-fA-F]{40}$"
                                    },
                                    "codeHash": {
                                      "type": "string",
                                      "pattern": "^0x[0-9a-f]{64}$"
                                    }
                                  }
                                }
                              }
                            },
                            "tokenOut": {
                              "type": "object",
                              "additionalProperties": false,
                              "required": ["address", "codeHash"],
                              "properties": {
                                "address": {
                                  "type": "string",
                                  "pattern": "^0x[0-9a-fA-F]{40}$"
                                },
                                "codeHash": {
                                  "type": "string",
                                  "pattern": "^0x[0-9a-f]{64}$"
                                },
                                "implementation": {
                                  "type": "object",
                                  "additionalProperties": false,
                                  "required": ["address", "codeHash"],
                                  "properties": {
                                    "address": {
                                      "type": "string",
                                      "pattern": "^0x[0-9a-fA-F]{40}$"
                                    },
                                    "codeHash": {
                                      "type": "string",
                                      "pattern": "^0x[0-9a-f]{64}$"
                                    }
                                  }
                                }
                              }
                            },
                            "fee": {
                              "type": "integer",
                              "minimum": 1,
                              "maximum": 999999
                            },
                            "maximumInput": {
                              "type": "string",
                              "pattern": "^(0|[1-9][0-9]{0,77})$"
                            }
                          }
                        }
                      },
                      "vaults": {
                        "type": "array",
                        "maxItems": 128,
                        "items": {
                          "type": "object",
                          "additionalProperties": false,
                          "required": [
                            "id",
                            "router",
                            "vault",
                            "asset",
                            "maximumAssets"
                          ],
                          "properties": {
                            "id": {
                              "type": "string",
                              "pattern": "^[A-Za-z0-9._-]{1,64}$"
                            },
                            "router": {
                              "type": "object",
                              "additionalProperties": false,
                              "required": ["address", "codeHash"],
                              "properties": {
                                "address": {
                                  "type": "string",
                                  "pattern": "^0x[0-9a-fA-F]{40}$"
                                },
                                "codeHash": {
                                  "type": "string",
                                  "pattern": "^0x[0-9a-f]{64}$"
                                },
                                "implementation": {
                                  "type": "object",
                                  "additionalProperties": false,
                                  "required": ["address", "codeHash"],
                                  "properties": {
                                    "address": {
                                      "type": "string",
                                      "pattern": "^0x[0-9a-fA-F]{40}$"
                                    },
                                    "codeHash": {
                                      "type": "string",
                                      "pattern": "^0x[0-9a-f]{64}$"
                                    }
                                  }
                                }
                              }
                            },
                            "vault": {
                              "type": "object",
                              "additionalProperties": false,
                              "required": ["address", "codeHash"],
                              "properties": {
                                "address": {
                                  "type": "string",
                                  "pattern": "^0x[0-9a-fA-F]{40}$"
                                },
                                "codeHash": {
                                  "type": "string",
                                  "pattern": "^0x[0-9a-f]{64}$"
                                },
                                "implementation": {
                                  "type": "object",
                                  "additionalProperties": false,
                                  "required": ["address", "codeHash"],
                                  "properties": {
                                    "address": {
                                      "type": "string",
                                      "pattern": "^0x[0-9a-fA-F]{40}$"
                                    },
                                    "codeHash": {
                                      "type": "string",
                                      "pattern": "^0x[0-9a-f]{64}$"
                                    }
                                  }
                                }
                              }
                            },
                            "asset": {
                              "type": "object",
                              "additionalProperties": false,
                              "required": ["address", "codeHash"],
                              "properties": {
                                "address": {
                                  "type": "string",
                                  "pattern": "^0x[0-9a-fA-F]{40}$"
                                },
                                "codeHash": {
                                  "type": "string",
                                  "pattern": "^0x[0-9a-f]{64}$"
                                },
                                "implementation": {
                                  "type": "object",
                                  "additionalProperties": false,
                                  "required": ["address", "codeHash"],
                                  "properties": {
                                    "address": {
                                      "type": "string",
                                      "pattern": "^0x[0-9a-fA-F]{40}$"
                                    },
                                    "codeHash": {
                                      "type": "string",
                                      "pattern": "^0x[0-9a-f]{64}$"
                                    }
                                  }
                                }
                              }
                            },
                            "maximumAssets": {
                              "type": "string",
                              "pattern": "^(0|[1-9][0-9]{0,77})$"
                            }
                          }
                        }
                      }
                    }
                  },
                  "native_transfers": {
                    "type": "array",
                    "maxItems": 32,
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["address", "code_hash", "maximum_value_wei"],
                      "properties": {
                        "address": {
                          "type": "string",
                          "pattern": "^0x[0-9a-fA-F]{40}$"
                        },
                        "code_hash": {
                          "type": "string",
                          "pattern": "^0x[0-9a-f]{64}$"
                        },
                        "maximum_value_wei": {
                          "type": "string",
                          "pattern": "^(0|[1-9][0-9]{0,77})$"
                        }
                      }
                    }
                  },
                  "maximum_calls": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 16
                  },
                  "maximum_native_value_wei": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  },
                  "max_validity_seconds": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 3600
                  },
                  "claim_requirements": {
                    "type": "array",
                    "maxItems": 16,
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["name", "allowed_values", "max_age_seconds"],
                      "properties": {
                        "name": {
                          "type": "string",
                          "pattern": "^[a-z][a-z0-9_]{0,63}$"
                        },
                        "allowed_values": {
                          "type": "array",
                          "minItems": 1,
                          "maxItems": 32,
                          "uniqueItems": true,
                          "items": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 128
                          }
                        },
                        "max_age_seconds": {
                          "type": "integer",
                          "minimum": 1,
                          "maximum": 31536000
                        }
                      }
                    }
                  }
                }
              },
              "published_at": {
                "type": "string",
                "format": "date-time"
              },
              "proposal_id": {
                "type": "string",
                "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
              },
              "published_by": {
                "type": "string",
                "pattern": "^[0-9a-f]{64}$"
              }
            }
          },
          "publications": {
            "type": "array",
            "maxItems": 20,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "application_id",
                "revision",
                "previous_revision",
                "policy_hash",
                "policy",
                "published_at",
                "published_by"
              ],
              "properties": {
                "application_id": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{64}$"
                },
                "revision": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,19})$"
                },
                "previous_revision": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,19})$"
                },
                "policy_hash": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{64}$"
                },
                "policy": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "version",
                    "enabled",
                    "chain_id",
                    "contracts",
                    "maximum_calls",
                    "maximum_native_value_wei",
                    "max_validity_seconds",
                    "claim_requirements"
                  ],
                  "properties": {
                    "action_requirements": {
                      "type": "array",
                      "maxItems": 64,
                      "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["name", "description", "fields"],
                        "properties": {
                          "name": {
                            "type": "string",
                            "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                          },
                          "description": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 256
                          },
                          "fields": {
                            "type": "array",
                            "maxItems": 32,
                            "items": {
                              "type": "object",
                              "additionalProperties": false,
                              "required": [
                                "name",
                                "required",
                                "allowed_values"
                              ],
                              "properties": {
                                "name": {
                                  "type": "string",
                                  "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                                },
                                "required": {
                                  "type": "boolean"
                                },
                                "allowed_values": {
                                  "type": "array",
                                  "minItems": 1,
                                  "maxItems": 64,
                                  "uniqueItems": true,
                                  "items": {
                                    "type": "string",
                                    "minLength": 1,
                                    "maxLength": 128
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    },
                    "application_resources_hash": {
                      "type": "string",
                      "pattern": "^[0-9a-f]{64}$"
                    },
                    "version": {
                      "type": "string",
                      "enum": ["1"]
                    },
                    "enabled": {
                      "type": "boolean"
                    },
                    "chain_id": {
                      "type": "string",
                      "enum": [
                        "eip155:84532",
                        "eip155:8453",
                        "eip155:1",
                        "eip155:11155111"
                      ]
                    },
                    "contracts": {
                      "type": "array",
                      "maxItems": 32,
                      "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "code_hash", "methods"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "code_hash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "code_hash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "code_hash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          },
                          "methods": {
                            "type": "array",
                            "minItems": 1,
                            "maxItems": 32,
                            "items": {
                              "type": "object",
                              "additionalProperties": false,
                              "required": ["signature", "maximum_value_wei"],
                              "properties": {
                                "signature": {
                                  "type": "string",
                                  "minLength": 3,
                                  "maxLength": 256
                                },
                                "maximum_value_wei": {
                                  "type": "string",
                                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                                },
                                "user_address_parameters": {
                                  "type": "array",
                                  "minItems": 1,
                                  "maxItems": 16,
                                  "uniqueItems": true,
                                  "items": {
                                    "type": "integer",
                                    "minimum": 0,
                                    "maximum": 31
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    },
                    "call_adapters": {
                      "type": "object",
                      "additionalProperties": false,
                      "properties": {
                        "tokenTransfers": {
                          "type": "array",
                          "maxItems": 128,
                          "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": [
                              "token",
                              "recipients",
                              "maximumAmount"
                            ],
                            "properties": {
                              "token": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["address", "codeHash"],
                                "properties": {
                                  "address": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-fA-F]{40}$"
                                  },
                                  "codeHash": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-f]{64}$"
                                  },
                                  "implementation": {
                                    "type": "object",
                                    "additionalProperties": false,
                                    "required": ["address", "codeHash"],
                                    "properties": {
                                      "address": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-fA-F]{40}$"
                                      },
                                      "codeHash": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-f]{64}$"
                                      }
                                    }
                                  }
                                }
                              },
                              "recipients": {
                                "type": "array",
                                "minItems": 1,
                                "maxItems": 128,
                                "uniqueItems": true,
                                "items": {
                                  "type": "string",
                                  "pattern": "^0x[0-9a-fA-F]{40}$"
                                }
                              },
                              "maximumAmount": {
                                "type": "string",
                                "pattern": "^(0|[1-9][0-9]{0,77})$"
                              },
                              "lifetimeAmount": {
                                "type": "string",
                                "pattern": "^(0|[1-9][0-9]{0,77})$"
                              }
                            }
                          }
                        },
                        "swaps": {
                          "type": "array",
                          "maxItems": 128,
                          "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": [
                              "id",
                              "router",
                              "tokenIn",
                              "tokenOut",
                              "fee",
                              "maximumInput"
                            ],
                            "properties": {
                              "id": {
                                "type": "string",
                                "pattern": "^[A-Za-z0-9._-]{1,64}$"
                              },
                              "router": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["address", "codeHash"],
                                "properties": {
                                  "address": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-fA-F]{40}$"
                                  },
                                  "codeHash": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-f]{64}$"
                                  },
                                  "implementation": {
                                    "type": "object",
                                    "additionalProperties": false,
                                    "required": ["address", "codeHash"],
                                    "properties": {
                                      "address": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-fA-F]{40}$"
                                      },
                                      "codeHash": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-f]{64}$"
                                      }
                                    }
                                  }
                                }
                              },
                              "tokenIn": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["address", "codeHash"],
                                "properties": {
                                  "address": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-fA-F]{40}$"
                                  },
                                  "codeHash": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-f]{64}$"
                                  },
                                  "implementation": {
                                    "type": "object",
                                    "additionalProperties": false,
                                    "required": ["address", "codeHash"],
                                    "properties": {
                                      "address": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-fA-F]{40}$"
                                      },
                                      "codeHash": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-f]{64}$"
                                      }
                                    }
                                  }
                                }
                              },
                              "tokenOut": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["address", "codeHash"],
                                "properties": {
                                  "address": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-fA-F]{40}$"
                                  },
                                  "codeHash": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-f]{64}$"
                                  },
                                  "implementation": {
                                    "type": "object",
                                    "additionalProperties": false,
                                    "required": ["address", "codeHash"],
                                    "properties": {
                                      "address": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-fA-F]{40}$"
                                      },
                                      "codeHash": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-f]{64}$"
                                      }
                                    }
                                  }
                                }
                              },
                              "fee": {
                                "type": "integer",
                                "minimum": 1,
                                "maximum": 999999
                              },
                              "maximumInput": {
                                "type": "string",
                                "pattern": "^(0|[1-9][0-9]{0,77})$"
                              }
                            }
                          }
                        },
                        "vaults": {
                          "type": "array",
                          "maxItems": 128,
                          "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": [
                              "id",
                              "router",
                              "vault",
                              "asset",
                              "maximumAssets"
                            ],
                            "properties": {
                              "id": {
                                "type": "string",
                                "pattern": "^[A-Za-z0-9._-]{1,64}$"
                              },
                              "router": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["address", "codeHash"],
                                "properties": {
                                  "address": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-fA-F]{40}$"
                                  },
                                  "codeHash": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-f]{64}$"
                                  },
                                  "implementation": {
                                    "type": "object",
                                    "additionalProperties": false,
                                    "required": ["address", "codeHash"],
                                    "properties": {
                                      "address": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-fA-F]{40}$"
                                      },
                                      "codeHash": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-f]{64}$"
                                      }
                                    }
                                  }
                                }
                              },
                              "vault": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["address", "codeHash"],
                                "properties": {
                                  "address": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-fA-F]{40}$"
                                  },
                                  "codeHash": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-f]{64}$"
                                  },
                                  "implementation": {
                                    "type": "object",
                                    "additionalProperties": false,
                                    "required": ["address", "codeHash"],
                                    "properties": {
                                      "address": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-fA-F]{40}$"
                                      },
                                      "codeHash": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-f]{64}$"
                                      }
                                    }
                                  }
                                }
                              },
                              "asset": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["address", "codeHash"],
                                "properties": {
                                  "address": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-fA-F]{40}$"
                                  },
                                  "codeHash": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-f]{64}$"
                                  },
                                  "implementation": {
                                    "type": "object",
                                    "additionalProperties": false,
                                    "required": ["address", "codeHash"],
                                    "properties": {
                                      "address": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-fA-F]{40}$"
                                      },
                                      "codeHash": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-f]{64}$"
                                      }
                                    }
                                  }
                                }
                              },
                              "maximumAssets": {
                                "type": "string",
                                "pattern": "^(0|[1-9][0-9]{0,77})$"
                              }
                            }
                          }
                        }
                      }
                    },
                    "native_transfers": {
                      "type": "array",
                      "maxItems": 32,
                      "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": [
                          "address",
                          "code_hash",
                          "maximum_value_wei"
                        ],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "code_hash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "maximum_value_wei": {
                            "type": "string",
                            "pattern": "^(0|[1-9][0-9]{0,77})$"
                          }
                        }
                      }
                    },
                    "maximum_calls": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 16
                    },
                    "maximum_native_value_wei": {
                      "type": "string",
                      "pattern": "^(0|[1-9][0-9]{0,77})$"
                    },
                    "max_validity_seconds": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 3600
                    },
                    "claim_requirements": {
                      "type": "array",
                      "maxItems": 16,
                      "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": [
                          "name",
                          "allowed_values",
                          "max_age_seconds"
                        ],
                        "properties": {
                          "name": {
                            "type": "string",
                            "pattern": "^[a-z][a-z0-9_]{0,63}$"
                          },
                          "allowed_values": {
                            "type": "array",
                            "minItems": 1,
                            "maxItems": 32,
                            "uniqueItems": true,
                            "items": {
                              "type": "string",
                              "minLength": 1,
                              "maxLength": 128
                            }
                          },
                          "max_age_seconds": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 31536000
                          }
                        }
                      }
                    }
                  }
                },
                "published_at": {
                  "type": "string",
                  "format": "date-time"
                },
                "proposal_id": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
                },
                "published_by": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{64}$"
                }
              }
            }
          },
          "review": {
            "type": "object",
            "additionalProperties": false,
            "required": ["mode", "revision", "approved_by"],
            "properties": {
              "mode": {
                "type": "string",
                "enum": ["automatic", "manual"]
              },
              "revision": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]{0,19})$"
              },
              "approved_by": {
                "type": "string",
                "pattern": "^[0-9a-f]{64}$"
              }
            }
          },
          "proposals_truncated": {
            "type": "boolean"
          },
          "proposals": {
            "type": "array",
            "maxItems": 20,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "proposal_id",
                "application_id",
                "based_on_revision",
                "policy_hash",
                "policy",
                "created_at"
              ],
              "properties": {
                "proposal_id": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
                },
                "application_id": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{64}$"
                },
                "based_on_revision": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,19})$"
                },
                "policy_hash": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{64}$"
                },
                "policy": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "version",
                    "enabled",
                    "chain_id",
                    "contracts",
                    "maximum_calls",
                    "maximum_native_value_wei",
                    "max_validity_seconds",
                    "claim_requirements"
                  ],
                  "properties": {
                    "action_requirements": {
                      "type": "array",
                      "maxItems": 64,
                      "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["name", "description", "fields"],
                        "properties": {
                          "name": {
                            "type": "string",
                            "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                          },
                          "description": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 256
                          },
                          "fields": {
                            "type": "array",
                            "maxItems": 32,
                            "items": {
                              "type": "object",
                              "additionalProperties": false,
                              "required": [
                                "name",
                                "required",
                                "allowed_values"
                              ],
                              "properties": {
                                "name": {
                                  "type": "string",
                                  "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                                },
                                "required": {
                                  "type": "boolean"
                                },
                                "allowed_values": {
                                  "type": "array",
                                  "minItems": 1,
                                  "maxItems": 64,
                                  "uniqueItems": true,
                                  "items": {
                                    "type": "string",
                                    "minLength": 1,
                                    "maxLength": 128
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    },
                    "application_resources_hash": {
                      "type": "string",
                      "pattern": "^[0-9a-f]{64}$"
                    },
                    "version": {
                      "type": "string",
                      "enum": ["1"]
                    },
                    "enabled": {
                      "type": "boolean"
                    },
                    "chain_id": {
                      "type": "string",
                      "enum": [
                        "eip155:84532",
                        "eip155:8453",
                        "eip155:1",
                        "eip155:11155111"
                      ]
                    },
                    "contracts": {
                      "type": "array",
                      "maxItems": 32,
                      "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "code_hash", "methods"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "code_hash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "code_hash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "code_hash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          },
                          "methods": {
                            "type": "array",
                            "minItems": 1,
                            "maxItems": 32,
                            "items": {
                              "type": "object",
                              "additionalProperties": false,
                              "required": ["signature", "maximum_value_wei"],
                              "properties": {
                                "signature": {
                                  "type": "string",
                                  "minLength": 3,
                                  "maxLength": 256
                                },
                                "maximum_value_wei": {
                                  "type": "string",
                                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                                },
                                "user_address_parameters": {
                                  "type": "array",
                                  "minItems": 1,
                                  "maxItems": 16,
                                  "uniqueItems": true,
                                  "items": {
                                    "type": "integer",
                                    "minimum": 0,
                                    "maximum": 31
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    },
                    "call_adapters": {
                      "type": "object",
                      "additionalProperties": false,
                      "properties": {
                        "tokenTransfers": {
                          "type": "array",
                          "maxItems": 128,
                          "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": [
                              "token",
                              "recipients",
                              "maximumAmount"
                            ],
                            "properties": {
                              "token": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["address", "codeHash"],
                                "properties": {
                                  "address": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-fA-F]{40}$"
                                  },
                                  "codeHash": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-f]{64}$"
                                  },
                                  "implementation": {
                                    "type": "object",
                                    "additionalProperties": false,
                                    "required": ["address", "codeHash"],
                                    "properties": {
                                      "address": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-fA-F]{40}$"
                                      },
                                      "codeHash": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-f]{64}$"
                                      }
                                    }
                                  }
                                }
                              },
                              "recipients": {
                                "type": "array",
                                "minItems": 1,
                                "maxItems": 128,
                                "uniqueItems": true,
                                "items": {
                                  "type": "string",
                                  "pattern": "^0x[0-9a-fA-F]{40}$"
                                }
                              },
                              "maximumAmount": {
                                "type": "string",
                                "pattern": "^(0|[1-9][0-9]{0,77})$"
                              },
                              "lifetimeAmount": {
                                "type": "string",
                                "pattern": "^(0|[1-9][0-9]{0,77})$"
                              }
                            }
                          }
                        },
                        "swaps": {
                          "type": "array",
                          "maxItems": 128,
                          "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": [
                              "id",
                              "router",
                              "tokenIn",
                              "tokenOut",
                              "fee",
                              "maximumInput"
                            ],
                            "properties": {
                              "id": {
                                "type": "string",
                                "pattern": "^[A-Za-z0-9._-]{1,64}$"
                              },
                              "router": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["address", "codeHash"],
                                "properties": {
                                  "address": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-fA-F]{40}$"
                                  },
                                  "codeHash": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-f]{64}$"
                                  },
                                  "implementation": {
                                    "type": "object",
                                    "additionalProperties": false,
                                    "required": ["address", "codeHash"],
                                    "properties": {
                                      "address": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-fA-F]{40}$"
                                      },
                                      "codeHash": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-f]{64}$"
                                      }
                                    }
                                  }
                                }
                              },
                              "tokenIn": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["address", "codeHash"],
                                "properties": {
                                  "address": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-fA-F]{40}$"
                                  },
                                  "codeHash": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-f]{64}$"
                                  },
                                  "implementation": {
                                    "type": "object",
                                    "additionalProperties": false,
                                    "required": ["address", "codeHash"],
                                    "properties": {
                                      "address": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-fA-F]{40}$"
                                      },
                                      "codeHash": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-f]{64}$"
                                      }
                                    }
                                  }
                                }
                              },
                              "tokenOut": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["address", "codeHash"],
                                "properties": {
                                  "address": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-fA-F]{40}$"
                                  },
                                  "codeHash": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-f]{64}$"
                                  },
                                  "implementation": {
                                    "type": "object",
                                    "additionalProperties": false,
                                    "required": ["address", "codeHash"],
                                    "properties": {
                                      "address": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-fA-F]{40}$"
                                      },
                                      "codeHash": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-f]{64}$"
                                      }
                                    }
                                  }
                                }
                              },
                              "fee": {
                                "type": "integer",
                                "minimum": 1,
                                "maximum": 999999
                              },
                              "maximumInput": {
                                "type": "string",
                                "pattern": "^(0|[1-9][0-9]{0,77})$"
                              }
                            }
                          }
                        },
                        "vaults": {
                          "type": "array",
                          "maxItems": 128,
                          "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": [
                              "id",
                              "router",
                              "vault",
                              "asset",
                              "maximumAssets"
                            ],
                            "properties": {
                              "id": {
                                "type": "string",
                                "pattern": "^[A-Za-z0-9._-]{1,64}$"
                              },
                              "router": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["address", "codeHash"],
                                "properties": {
                                  "address": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-fA-F]{40}$"
                                  },
                                  "codeHash": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-f]{64}$"
                                  },
                                  "implementation": {
                                    "type": "object",
                                    "additionalProperties": false,
                                    "required": ["address", "codeHash"],
                                    "properties": {
                                      "address": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-fA-F]{40}$"
                                      },
                                      "codeHash": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-f]{64}$"
                                      }
                                    }
                                  }
                                }
                              },
                              "vault": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["address", "codeHash"],
                                "properties": {
                                  "address": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-fA-F]{40}$"
                                  },
                                  "codeHash": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-f]{64}$"
                                  },
                                  "implementation": {
                                    "type": "object",
                                    "additionalProperties": false,
                                    "required": ["address", "codeHash"],
                                    "properties": {
                                      "address": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-fA-F]{40}$"
                                      },
                                      "codeHash": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-f]{64}$"
                                      }
                                    }
                                  }
                                }
                              },
                              "asset": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["address", "codeHash"],
                                "properties": {
                                  "address": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-fA-F]{40}$"
                                  },
                                  "codeHash": {
                                    "type": "string",
                                    "pattern": "^0x[0-9a-f]{64}$"
                                  },
                                  "implementation": {
                                    "type": "object",
                                    "additionalProperties": false,
                                    "required": ["address", "codeHash"],
                                    "properties": {
                                      "address": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-fA-F]{40}$"
                                      },
                                      "codeHash": {
                                        "type": "string",
                                        "pattern": "^0x[0-9a-f]{64}$"
                                      }
                                    }
                                  }
                                }
                              },
                              "maximumAssets": {
                                "type": "string",
                                "pattern": "^(0|[1-9][0-9]{0,77})$"
                              }
                            }
                          }
                        }
                      }
                    },
                    "native_transfers": {
                      "type": "array",
                      "maxItems": 32,
                      "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": [
                          "address",
                          "code_hash",
                          "maximum_value_wei"
                        ],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "code_hash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "maximum_value_wei": {
                            "type": "string",
                            "pattern": "^(0|[1-9][0-9]{0,77})$"
                          }
                        }
                      }
                    },
                    "maximum_calls": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 16
                    },
                    "maximum_native_value_wei": {
                      "type": "string",
                      "pattern": "^(0|[1-9][0-9]{0,77})$"
                    },
                    "max_validity_seconds": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 3600
                    },
                    "claim_requirements": {
                      "type": "array",
                      "maxItems": 16,
                      "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": [
                          "name",
                          "allowed_values",
                          "max_age_seconds"
                        ],
                        "properties": {
                          "name": {
                            "type": "string",
                            "pattern": "^[a-z][a-z0-9_]{0,63}$"
                          },
                          "allowed_values": {
                            "type": "array",
                            "minItems": 1,
                            "maxItems": 32,
                            "uniqueItems": true,
                            "items": {
                              "type": "string",
                              "minLength": 1,
                              "maxLength": 128
                            }
                          },
                          "max_age_seconds": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 31536000
                          }
                        }
                      }
                    }
                  }
                },
                "created_at": {
                  "type": "string",
                  "format": "date-time"
                },
                "published_revision": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,19})$"
                }
              }
            }
          }
        }
      }
    }
  }
}
```

## GET `/v1/wallet/batches`

Operation: `listWalletBatches`.

**Why this exists:** List the transaction requests you may read, including their queue stages and retained verified outcomes.

**Who uses it:** Application developer or service operator.

**When you need it:** Use for history and monitoring. Read an individual transaction’s current status through the wallet endpoint when an observation is still pending.

**Before you start:** Applications need current owner account-read access and execute read scope. Exact configured provider operators can inspect the provider ledger using configuration write scope. No application token can become an operator through scopes alone.

**Result and next step:** 200: up to 100 readable batch summaries, queue stages and retained finalized RPC-quorum receipts. Unfinalized observations remain pending in this list; applications can refresh individual wallet_getCallsStatus results. Listing never signs, submits or retries.

**Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter        | Location | Required | Schema                                                                           |
| ---------------- | -------- | -------- | -------------------------------------------------------------------------------- |
| `wallet-network` | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}` |

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["truncated", "batches"],
  "properties": {
    "truncated": {
      "type": "boolean"
    },
    "batches": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "account_id",
          "sender",
          "queue_stage",
          "policy_revision",
          "expires_at",
          "application_id",
          "version",
          "chainId",
          "status",
          "atomic"
        ],
        "properties": {
          "id": {
            "type": "string",
            "maxLength": 8194
          },
          "account_id": {
            "type": "string",
            "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
          },
          "sender": {
            "type": "string"
          },
          "queue_stage": {
            "type": "string",
            "enum": [
              "queued",
              "executing",
              "included",
              "failed",
              "succeeded",
              "cancelled",
              "expired",
              "blocked"
            ]
          },
          "policy_revision": {
            "type": "string",
            "pattern": "^(0|[1-9][0-9]{0,19})$"
          },
          "expires_at": {
            "type": "string",
            "format": "date-time"
          },
          "application_id": {
            "type": "string",
            "pattern": "^[0-9a-f]{64}$"
          },
          "version": {
            "type": "string",
            "enum": ["2.0.0"]
          },
          "chainId": {
            "type": "string",
            "enum": ["0x14a34", "0x2105", "0x1", "0xaa36a7"]
          },
          "status": {
            "type": "integer",
            "enum": [100, 200, 400, 500]
          },
          "atomic": {
            "type": "boolean",
            "enum": [true]
          },
          "receipts": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "logs",
                "status",
                "blockHash",
                "blockNumber",
                "gasUsed",
                "transactionHash"
              ],
              "properties": {
                "logs": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "data", "topics"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "data": {
                        "type": "string"
                      },
                      "topics": {
                        "type": "array",
                        "items": {
                          "type": "string"
                        }
                      }
                    }
                  }
                },
                "status": {
                  "type": "string",
                  "enum": ["0x0", "0x1"]
                },
                "blockHash": {
                  "type": "string"
                },
                "blockNumber": {
                  "type": "string",
                  "pattern": "^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$"
                },
                "gasUsed": {
                  "type": "string",
                  "pattern": "^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$"
                },
                "transactionHash": {
                  "type": "string"
                }
              }
            }
          }
        }
      }
    }
  }
}
```

## POST `/v1/provider/applications/{applicationId}/policy/review`

Operation: `setRuntimeReviewMode`.

**Why this exists:** Choose manual review or limited automatic publication for future application contract and method changes.

**Who uses it:** Service operator.

**When you need it:** Optional: use after publishing baseline rules. Automatic review accepts only changes whose provider-controlled terms exactly match the current policy; it does not approve existing pending proposals.

**Before you start:** Publish a baseline policy first. An exact configured provider operator chooses automatic or manual review using both expected_revision and expected_review_revision with a UUID idempotency key. Choose the review mode explicitly.

**Result and next step:** 200: a durable review decision. Automatic mode publishes subsequent contract/method changes only when provider terms exactly match the enabled current policy. Claims, value/call limits, validity, enablement and chain remain provider controlled. Existing pending proposals are not retroactively accepted.

**Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `applicationId`   | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{64}$"}`                                                        |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["expected_revision", "expected_review_revision", "mode"],
  "properties": {
    "expected_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "expected_review_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "mode": {
      "type": "string",
      "enum": ["automatic", "manual"]
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["mode", "revision", "approved_by"],
  "properties": {
    "mode": {
      "type": "string",
      "enum": ["automatic", "manual"]
    },
    "revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "approved_by": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    }
  }
}
```

## GET `/v1/application/policy`

Operation: `readRuntimeConfiguration`.

**Why this exists:** Read the active allowed calls, identity claims and transaction limits before requesting permission or preparing a change.

**Who uses it:** Application developer.

**When you need it:** Use during application integration and before proposing changes. This reads the published policy, not business declarations or anyone’s wallet permission.

**Before you start:** Use your registered application token with configuration-read permission.

**Result and next step:** 200: the current published transaction policy and its revision, or the unpublished state. Retain the revision before proposing changes and show current terms before collecting transaction consent.

**Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter        | Location | Required | Schema                                                                           |
| ---------------- | -------- | -------- | -------------------------------------------------------------------------------- |
| `wallet-network` | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}` |

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "application_id",
    "active_revision",
    "revision",
    "authorizes_spending"
  ],
  "properties": {
    "application_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "active_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "publication": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "application_id",
        "revision",
        "previous_revision",
        "policy_hash",
        "policy",
        "published_at",
        "published_by"
      ],
      "properties": {
        "application_id": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        },
        "revision": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,19})$"
        },
        "previous_revision": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,19})$"
        },
        "policy_hash": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        },
        "policy": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "version",
            "enabled",
            "chain_id",
            "contracts",
            "maximum_calls",
            "maximum_native_value_wei",
            "max_validity_seconds",
            "claim_requirements"
          ],
          "properties": {
            "action_requirements": {
              "type": "array",
              "maxItems": 64,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["name", "description", "fields"],
                "properties": {
                  "name": {
                    "type": "string",
                    "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                  },
                  "description": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                  },
                  "fields": {
                    "type": "array",
                    "maxItems": 32,
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["name", "required", "allowed_values"],
                      "properties": {
                        "name": {
                          "type": "string",
                          "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                        },
                        "required": {
                          "type": "boolean"
                        },
                        "allowed_values": {
                          "type": "array",
                          "minItems": 1,
                          "maxItems": 64,
                          "uniqueItems": true,
                          "items": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 128
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            "application_resources_hash": {
              "type": "string",
              "pattern": "^[0-9a-f]{64}$"
            },
            "version": {
              "type": "string",
              "enum": ["1"]
            },
            "enabled": {
              "type": "boolean"
            },
            "chain_id": {
              "type": "string",
              "enum": [
                "eip155:84532",
                "eip155:8453",
                "eip155:1",
                "eip155:11155111"
              ]
            },
            "contracts": {
              "type": "array",
              "maxItems": 32,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["address", "code_hash", "methods"],
                "properties": {
                  "address": {
                    "type": "string",
                    "pattern": "^0x[0-9a-fA-F]{40}$"
                  },
                  "code_hash": {
                    "type": "string",
                    "pattern": "^0x[0-9a-f]{64}$"
                  },
                  "implementation": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "code_hash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "code_hash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      }
                    }
                  },
                  "methods": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 32,
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["signature", "maximum_value_wei"],
                      "properties": {
                        "signature": {
                          "type": "string",
                          "minLength": 3,
                          "maxLength": 256
                        },
                        "maximum_value_wei": {
                          "type": "string",
                          "pattern": "^(0|[1-9][0-9]{0,77})$"
                        },
                        "user_address_parameters": {
                          "type": "array",
                          "minItems": 1,
                          "maxItems": 16,
                          "uniqueItems": true,
                          "items": {
                            "type": "integer",
                            "minimum": 0,
                            "maximum": 31
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            "call_adapters": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "tokenTransfers": {
                  "type": "array",
                  "maxItems": 128,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["token", "recipients", "maximumAmount"],
                    "properties": {
                      "token": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "recipients": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 128,
                        "uniqueItems": true,
                        "items": {
                          "type": "string",
                          "pattern": "^0x[0-9a-fA-F]{40}$"
                        }
                      },
                      "maximumAmount": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      },
                      "lifetimeAmount": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      }
                    }
                  }
                },
                "swaps": {
                  "type": "array",
                  "maxItems": 128,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "id",
                      "router",
                      "tokenIn",
                      "tokenOut",
                      "fee",
                      "maximumInput"
                    ],
                    "properties": {
                      "id": {
                        "type": "string",
                        "pattern": "^[A-Za-z0-9._-]{1,64}$"
                      },
                      "router": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "tokenIn": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "tokenOut": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "fee": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 999999
                      },
                      "maximumInput": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      }
                    }
                  }
                },
                "vaults": {
                  "type": "array",
                  "maxItems": 128,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "id",
                      "router",
                      "vault",
                      "asset",
                      "maximumAssets"
                    ],
                    "properties": {
                      "id": {
                        "type": "string",
                        "pattern": "^[A-Za-z0-9._-]{1,64}$"
                      },
                      "router": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "vault": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "asset": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "maximumAssets": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      }
                    }
                  }
                }
              }
            },
            "native_transfers": {
              "type": "array",
              "maxItems": 32,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["address", "code_hash", "maximum_value_wei"],
                "properties": {
                  "address": {
                    "type": "string",
                    "pattern": "^0x[0-9a-fA-F]{40}$"
                  },
                  "code_hash": {
                    "type": "string",
                    "pattern": "^0x[0-9a-f]{64}$"
                  },
                  "maximum_value_wei": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            },
            "maximum_calls": {
              "type": "integer",
              "minimum": 1,
              "maximum": 16
            },
            "maximum_native_value_wei": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            },
            "max_validity_seconds": {
              "type": "integer",
              "minimum": 1,
              "maximum": 3600
            },
            "claim_requirements": {
              "type": "array",
              "maxItems": 16,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["name", "allowed_values", "max_age_seconds"],
                "properties": {
                  "name": {
                    "type": "string",
                    "pattern": "^[a-z][a-z0-9_]{0,63}$"
                  },
                  "allowed_values": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 32,
                    "uniqueItems": true,
                    "items": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 128
                    }
                  },
                  "max_age_seconds": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 31536000
                  }
                }
              }
            }
          }
        },
        "published_at": {
          "type": "string",
          "format": "date-time"
        },
        "proposal_id": {
          "type": "string",
          "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        },
        "published_by": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        }
      }
    },
    "authorizes_spending": {
      "type": "boolean",
      "enum": [false]
    }
  }
}
```

## GET `/v1/provider/applications/{applicationId}/policy`

Operation: `readRuntimeApplicationConfiguration`.

**Why this exists:** Inspect the active transaction rules for a selected application before approving or changing them.

**Who uses it:** Service operator.

**When you need it:** Use for provider review. The separate application route lets an application read only its own current rules.

**Before you start:** Use a separately configured provider operator token. Application tokens cannot read another application’s registry or publish changes.

**Result and next step:** 200: the current durable publication and predecessor information. Read it before preparing a compare-and-set policy update. Configuration does not authorize spending.

**Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter        | Location | Required | Schema                                                                           |
| ---------------- | -------- | -------- | -------------------------------------------------------------------------------- |
| `applicationId`  | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{64}$"}`                                   |
| `wallet-network` | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}` |

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "application_id",
    "active_revision",
    "revision",
    "authorizes_spending"
  ],
  "properties": {
    "application_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "active_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "publication": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "application_id",
        "revision",
        "previous_revision",
        "policy_hash",
        "policy",
        "published_at",
        "published_by"
      ],
      "properties": {
        "application_id": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        },
        "revision": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,19})$"
        },
        "previous_revision": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,19})$"
        },
        "policy_hash": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        },
        "policy": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "version",
            "enabled",
            "chain_id",
            "contracts",
            "maximum_calls",
            "maximum_native_value_wei",
            "max_validity_seconds",
            "claim_requirements"
          ],
          "properties": {
            "action_requirements": {
              "type": "array",
              "maxItems": 64,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["name", "description", "fields"],
                "properties": {
                  "name": {
                    "type": "string",
                    "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                  },
                  "description": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                  },
                  "fields": {
                    "type": "array",
                    "maxItems": 32,
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["name", "required", "allowed_values"],
                      "properties": {
                        "name": {
                          "type": "string",
                          "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                        },
                        "required": {
                          "type": "boolean"
                        },
                        "allowed_values": {
                          "type": "array",
                          "minItems": 1,
                          "maxItems": 64,
                          "uniqueItems": true,
                          "items": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 128
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            "application_resources_hash": {
              "type": "string",
              "pattern": "^[0-9a-f]{64}$"
            },
            "version": {
              "type": "string",
              "enum": ["1"]
            },
            "enabled": {
              "type": "boolean"
            },
            "chain_id": {
              "type": "string",
              "enum": [
                "eip155:84532",
                "eip155:8453",
                "eip155:1",
                "eip155:11155111"
              ]
            },
            "contracts": {
              "type": "array",
              "maxItems": 32,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["address", "code_hash", "methods"],
                "properties": {
                  "address": {
                    "type": "string",
                    "pattern": "^0x[0-9a-fA-F]{40}$"
                  },
                  "code_hash": {
                    "type": "string",
                    "pattern": "^0x[0-9a-f]{64}$"
                  },
                  "implementation": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "code_hash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "code_hash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      }
                    }
                  },
                  "methods": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 32,
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["signature", "maximum_value_wei"],
                      "properties": {
                        "signature": {
                          "type": "string",
                          "minLength": 3,
                          "maxLength": 256
                        },
                        "maximum_value_wei": {
                          "type": "string",
                          "pattern": "^(0|[1-9][0-9]{0,77})$"
                        },
                        "user_address_parameters": {
                          "type": "array",
                          "minItems": 1,
                          "maxItems": 16,
                          "uniqueItems": true,
                          "items": {
                            "type": "integer",
                            "minimum": 0,
                            "maximum": 31
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            "call_adapters": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "tokenTransfers": {
                  "type": "array",
                  "maxItems": 128,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["token", "recipients", "maximumAmount"],
                    "properties": {
                      "token": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "recipients": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 128,
                        "uniqueItems": true,
                        "items": {
                          "type": "string",
                          "pattern": "^0x[0-9a-fA-F]{40}$"
                        }
                      },
                      "maximumAmount": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      },
                      "lifetimeAmount": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      }
                    }
                  }
                },
                "swaps": {
                  "type": "array",
                  "maxItems": 128,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "id",
                      "router",
                      "tokenIn",
                      "tokenOut",
                      "fee",
                      "maximumInput"
                    ],
                    "properties": {
                      "id": {
                        "type": "string",
                        "pattern": "^[A-Za-z0-9._-]{1,64}$"
                      },
                      "router": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "tokenIn": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "tokenOut": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "fee": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 999999
                      },
                      "maximumInput": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      }
                    }
                  }
                },
                "vaults": {
                  "type": "array",
                  "maxItems": 128,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "id",
                      "router",
                      "vault",
                      "asset",
                      "maximumAssets"
                    ],
                    "properties": {
                      "id": {
                        "type": "string",
                        "pattern": "^[A-Za-z0-9._-]{1,64}$"
                      },
                      "router": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "vault": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "asset": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "maximumAssets": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      }
                    }
                  }
                }
              }
            },
            "native_transfers": {
              "type": "array",
              "maxItems": 32,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["address", "code_hash", "maximum_value_wei"],
                "properties": {
                  "address": {
                    "type": "string",
                    "pattern": "^0x[0-9a-fA-F]{40}$"
                  },
                  "code_hash": {
                    "type": "string",
                    "pattern": "^0x[0-9a-f]{64}$"
                  },
                  "maximum_value_wei": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            },
            "maximum_calls": {
              "type": "integer",
              "minimum": 1,
              "maximum": 16
            },
            "maximum_native_value_wei": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            },
            "max_validity_seconds": {
              "type": "integer",
              "minimum": 1,
              "maximum": 3600
            },
            "claim_requirements": {
              "type": "array",
              "maxItems": 16,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["name", "allowed_values", "max_age_seconds"],
                "properties": {
                  "name": {
                    "type": "string",
                    "pattern": "^[a-z][a-z0-9_]{0,63}$"
                  },
                  "allowed_values": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 32,
                    "uniqueItems": true,
                    "items": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 128
                    }
                  },
                  "max_age_seconds": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 31536000
                  }
                }
              }
            }
          }
        },
        "published_at": {
          "type": "string",
          "format": "date-time"
        },
        "proposal_id": {
          "type": "string",
          "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        },
        "published_by": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        }
      }
    },
    "authorizes_spending": {
      "type": "boolean",
      "enum": [false]
    }
  }
}
```

## GET `/v1/application/policy/revisions/{revision}`

Operation: `readRuntimeConfigurationRevision`.

**Why this exists:** Read an immutable published rules version to understand which terms applied at that point.

**Who uses it:** Application developer.

**When you need it:** Optional: use for audit and troubleshooting. Reading history does not reactivate those rules or restore wallet permission.

**Before you start:** Use your application token and the exact saved policy revision. Historical versions remain immutable.

**Result and next step:** 200: the requested historical publication. Compare it with the current policy when investigating a request; its presence does not make it current.

**Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter        | Location | Required | Schema                                                                           |
| ---------------- | -------- | -------- | -------------------------------------------------------------------------------- |
| `revision`       | path     | yes      | `{"type":"string","pattern":"^(0\|[1-9][0-9]{0,19})$"}`                          |
| `wallet-network` | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}` |

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "application_id",
    "active_revision",
    "revision",
    "authorizes_spending"
  ],
  "properties": {
    "application_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "active_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "publication": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "application_id",
        "revision",
        "previous_revision",
        "policy_hash",
        "policy",
        "published_at",
        "published_by"
      ],
      "properties": {
        "application_id": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        },
        "revision": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,19})$"
        },
        "previous_revision": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,19})$"
        },
        "policy_hash": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        },
        "policy": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "version",
            "enabled",
            "chain_id",
            "contracts",
            "maximum_calls",
            "maximum_native_value_wei",
            "max_validity_seconds",
            "claim_requirements"
          ],
          "properties": {
            "action_requirements": {
              "type": "array",
              "maxItems": 64,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["name", "description", "fields"],
                "properties": {
                  "name": {
                    "type": "string",
                    "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                  },
                  "description": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                  },
                  "fields": {
                    "type": "array",
                    "maxItems": 32,
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["name", "required", "allowed_values"],
                      "properties": {
                        "name": {
                          "type": "string",
                          "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                        },
                        "required": {
                          "type": "boolean"
                        },
                        "allowed_values": {
                          "type": "array",
                          "minItems": 1,
                          "maxItems": 64,
                          "uniqueItems": true,
                          "items": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 128
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            "application_resources_hash": {
              "type": "string",
              "pattern": "^[0-9a-f]{64}$"
            },
            "version": {
              "type": "string",
              "enum": ["1"]
            },
            "enabled": {
              "type": "boolean"
            },
            "chain_id": {
              "type": "string",
              "enum": [
                "eip155:84532",
                "eip155:8453",
                "eip155:1",
                "eip155:11155111"
              ]
            },
            "contracts": {
              "type": "array",
              "maxItems": 32,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["address", "code_hash", "methods"],
                "properties": {
                  "address": {
                    "type": "string",
                    "pattern": "^0x[0-9a-fA-F]{40}$"
                  },
                  "code_hash": {
                    "type": "string",
                    "pattern": "^0x[0-9a-f]{64}$"
                  },
                  "implementation": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "code_hash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "code_hash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      }
                    }
                  },
                  "methods": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 32,
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["signature", "maximum_value_wei"],
                      "properties": {
                        "signature": {
                          "type": "string",
                          "minLength": 3,
                          "maxLength": 256
                        },
                        "maximum_value_wei": {
                          "type": "string",
                          "pattern": "^(0|[1-9][0-9]{0,77})$"
                        },
                        "user_address_parameters": {
                          "type": "array",
                          "minItems": 1,
                          "maxItems": 16,
                          "uniqueItems": true,
                          "items": {
                            "type": "integer",
                            "minimum": 0,
                            "maximum": 31
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            "call_adapters": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "tokenTransfers": {
                  "type": "array",
                  "maxItems": 128,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["token", "recipients", "maximumAmount"],
                    "properties": {
                      "token": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "recipients": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 128,
                        "uniqueItems": true,
                        "items": {
                          "type": "string",
                          "pattern": "^0x[0-9a-fA-F]{40}$"
                        }
                      },
                      "maximumAmount": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      },
                      "lifetimeAmount": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      }
                    }
                  }
                },
                "swaps": {
                  "type": "array",
                  "maxItems": 128,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "id",
                      "router",
                      "tokenIn",
                      "tokenOut",
                      "fee",
                      "maximumInput"
                    ],
                    "properties": {
                      "id": {
                        "type": "string",
                        "pattern": "^[A-Za-z0-9._-]{1,64}$"
                      },
                      "router": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "tokenIn": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "tokenOut": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "fee": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 999999
                      },
                      "maximumInput": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      }
                    }
                  }
                },
                "vaults": {
                  "type": "array",
                  "maxItems": 128,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "id",
                      "router",
                      "vault",
                      "asset",
                      "maximumAssets"
                    ],
                    "properties": {
                      "id": {
                        "type": "string",
                        "pattern": "^[A-Za-z0-9._-]{1,64}$"
                      },
                      "router": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "vault": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "asset": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          },
                          "implementation": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["address", "codeHash"],
                            "properties": {
                              "address": {
                                "type": "string",
                                "pattern": "^0x[0-9a-fA-F]{40}$"
                              },
                              "codeHash": {
                                "type": "string",
                                "pattern": "^0x[0-9a-f]{64}$"
                              }
                            }
                          }
                        }
                      },
                      "maximumAssets": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      }
                    }
                  }
                }
              }
            },
            "native_transfers": {
              "type": "array",
              "maxItems": 32,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["address", "code_hash", "maximum_value_wei"],
                "properties": {
                  "address": {
                    "type": "string",
                    "pattern": "^0x[0-9a-fA-F]{40}$"
                  },
                  "code_hash": {
                    "type": "string",
                    "pattern": "^0x[0-9a-f]{64}$"
                  },
                  "maximum_value_wei": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            },
            "maximum_calls": {
              "type": "integer",
              "minimum": 1,
              "maximum": 16
            },
            "maximum_native_value_wei": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            },
            "max_validity_seconds": {
              "type": "integer",
              "minimum": 1,
              "maximum": 3600
            },
            "claim_requirements": {
              "type": "array",
              "maxItems": 16,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["name", "allowed_values", "max_age_seconds"],
                "properties": {
                  "name": {
                    "type": "string",
                    "pattern": "^[a-z][a-z0-9_]{0,63}$"
                  },
                  "allowed_values": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 32,
                    "uniqueItems": true,
                    "items": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 128
                    }
                  },
                  "max_age_seconds": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 31536000
                  }
                }
              }
            }
          }
        },
        "published_at": {
          "type": "string",
          "format": "date-time"
        },
        "proposal_id": {
          "type": "string",
          "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        },
        "published_by": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        }
      }
    },
    "authorizes_spending": {
      "type": "boolean",
      "enum": [false]
    }
  }
}
```

## POST `/v1/application/policy/proposals`

Operation: `proposeRuntimeConfiguration`.

**Why this exists:** Propose the contract calls and limits your application needs without publishing them yourself.

**Who uses it:** Application developer.

**When you need it:** Use when initially configuring transactions or requesting changes. A provider operator reviews and publishes the proposal unless an explicitly enabled automatic-review rule applies.

**Before you start:** Read the current policy first. Use your application token, expected_revision and an original UUIDv4 idempotency key.

**Result and next step:** 200: a durable proposal and its outcome. Keep its ID and inspect it through the proposal-status endpoint. Publication follows the provider’s explicit review mode; proposing never authorizes spending.

**Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["expected_revision", "policy"],
  "properties": {
    "expected_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "policy": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "version",
        "enabled",
        "chain_id",
        "contracts",
        "maximum_calls",
        "maximum_native_value_wei",
        "max_validity_seconds",
        "claim_requirements"
      ],
      "properties": {
        "action_requirements": {
          "type": "array",
          "maxItems": 64,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "description", "fields"],
            "properties": {
              "name": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "description": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "fields": {
                "type": "array",
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["name", "required", "allowed_values"],
                  "properties": {
                    "name": {
                      "type": "string",
                      "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                    },
                    "required": {
                      "type": "boolean"
                    },
                    "allowed_values": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 64,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "application_resources_hash": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        },
        "version": {
          "type": "string",
          "enum": ["1"]
        },
        "enabled": {
          "type": "boolean"
        },
        "chain_id": {
          "type": "string",
          "enum": ["eip155:84532", "eip155:8453", "eip155:1", "eip155:11155111"]
        },
        "contracts": {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["address", "code_hash", "methods"],
            "properties": {
              "address": {
                "type": "string",
                "pattern": "^0x[0-9a-fA-F]{40}$"
              },
              "code_hash": {
                "type": "string",
                "pattern": "^0x[0-9a-f]{64}$"
              },
              "implementation": {
                "type": "object",
                "additionalProperties": false,
                "required": ["address", "code_hash"],
                "properties": {
                  "address": {
                    "type": "string",
                    "pattern": "^0x[0-9a-fA-F]{40}$"
                  },
                  "code_hash": {
                    "type": "string",
                    "pattern": "^0x[0-9a-f]{64}$"
                  }
                }
              },
              "methods": {
                "type": "array",
                "minItems": 1,
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["signature", "maximum_value_wei"],
                  "properties": {
                    "signature": {
                      "type": "string",
                      "minLength": 3,
                      "maxLength": 256
                    },
                    "maximum_value_wei": {
                      "type": "string",
                      "pattern": "^(0|[1-9][0-9]{0,77})$"
                    },
                    "user_address_parameters": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 16,
                      "uniqueItems": true,
                      "items": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 31
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "call_adapters": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "tokenTransfers": {
              "type": "array",
              "maxItems": 128,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["token", "recipients", "maximumAmount"],
                "properties": {
                  "token": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "recipients": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 128,
                    "uniqueItems": true,
                    "items": {
                      "type": "string",
                      "pattern": "^0x[0-9a-fA-F]{40}$"
                    }
                  },
                  "maximumAmount": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  },
                  "lifetimeAmount": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            },
            "swaps": {
              "type": "array",
              "maxItems": 128,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "id",
                  "router",
                  "tokenIn",
                  "tokenOut",
                  "fee",
                  "maximumInput"
                ],
                "properties": {
                  "id": {
                    "type": "string",
                    "pattern": "^[A-Za-z0-9._-]{1,64}$"
                  },
                  "router": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "tokenIn": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "tokenOut": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "fee": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 999999
                  },
                  "maximumInput": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            },
            "vaults": {
              "type": "array",
              "maxItems": 128,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["id", "router", "vault", "asset", "maximumAssets"],
                "properties": {
                  "id": {
                    "type": "string",
                    "pattern": "^[A-Za-z0-9._-]{1,64}$"
                  },
                  "router": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "vault": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "asset": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "maximumAssets": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            }
          }
        },
        "native_transfers": {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["address", "code_hash", "maximum_value_wei"],
            "properties": {
              "address": {
                "type": "string",
                "pattern": "^0x[0-9a-fA-F]{40}$"
              },
              "code_hash": {
                "type": "string",
                "pattern": "^0x[0-9a-f]{64}$"
              },
              "maximum_value_wei": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]{0,77})$"
              }
            }
          }
        },
        "maximum_calls": {
          "type": "integer",
          "minimum": 1,
          "maximum": 16
        },
        "maximum_native_value_wei": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "max_validity_seconds": {
          "type": "integer",
          "minimum": 1,
          "maximum": 3600
        },
        "claim_requirements": {
          "type": "array",
          "maxItems": 16,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "allowed_values", "max_age_seconds"],
            "properties": {
              "name": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_]{0,63}$"
              },
              "allowed_values": {
                "type": "array",
                "minItems": 1,
                "maxItems": 32,
                "uniqueItems": true,
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128
                }
              },
              "max_age_seconds": {
                "type": "integer",
                "minimum": 1,
                "maximum": 31536000
              }
            }
          }
        }
      }
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "proposal_id",
    "application_id",
    "based_on_revision",
    "policy_hash",
    "policy",
    "created_at"
  ],
  "properties": {
    "proposal_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "application_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "based_on_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "policy_hash": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "policy": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "version",
        "enabled",
        "chain_id",
        "contracts",
        "maximum_calls",
        "maximum_native_value_wei",
        "max_validity_seconds",
        "claim_requirements"
      ],
      "properties": {
        "action_requirements": {
          "type": "array",
          "maxItems": 64,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "description", "fields"],
            "properties": {
              "name": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "description": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "fields": {
                "type": "array",
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["name", "required", "allowed_values"],
                  "properties": {
                    "name": {
                      "type": "string",
                      "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                    },
                    "required": {
                      "type": "boolean"
                    },
                    "allowed_values": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 64,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "application_resources_hash": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        },
        "version": {
          "type": "string",
          "enum": ["1"]
        },
        "enabled": {
          "type": "boolean"
        },
        "chain_id": {
          "type": "string",
          "enum": ["eip155:84532", "eip155:8453", "eip155:1", "eip155:11155111"]
        },
        "contracts": {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["address", "code_hash", "methods"],
            "properties": {
              "address": {
                "type": "string",
                "pattern": "^0x[0-9a-fA-F]{40}$"
              },
              "code_hash": {
                "type": "string",
                "pattern": "^0x[0-9a-f]{64}$"
              },
              "implementation": {
                "type": "object",
                "additionalProperties": false,
                "required": ["address", "code_hash"],
                "properties": {
                  "address": {
                    "type": "string",
                    "pattern": "^0x[0-9a-fA-F]{40}$"
                  },
                  "code_hash": {
                    "type": "string",
                    "pattern": "^0x[0-9a-f]{64}$"
                  }
                }
              },
              "methods": {
                "type": "array",
                "minItems": 1,
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["signature", "maximum_value_wei"],
                  "properties": {
                    "signature": {
                      "type": "string",
                      "minLength": 3,
                      "maxLength": 256
                    },
                    "maximum_value_wei": {
                      "type": "string",
                      "pattern": "^(0|[1-9][0-9]{0,77})$"
                    },
                    "user_address_parameters": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 16,
                      "uniqueItems": true,
                      "items": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 31
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "call_adapters": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "tokenTransfers": {
              "type": "array",
              "maxItems": 128,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["token", "recipients", "maximumAmount"],
                "properties": {
                  "token": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "recipients": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 128,
                    "uniqueItems": true,
                    "items": {
                      "type": "string",
                      "pattern": "^0x[0-9a-fA-F]{40}$"
                    }
                  },
                  "maximumAmount": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  },
                  "lifetimeAmount": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            },
            "swaps": {
              "type": "array",
              "maxItems": 128,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "id",
                  "router",
                  "tokenIn",
                  "tokenOut",
                  "fee",
                  "maximumInput"
                ],
                "properties": {
                  "id": {
                    "type": "string",
                    "pattern": "^[A-Za-z0-9._-]{1,64}$"
                  },
                  "router": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "tokenIn": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "tokenOut": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "fee": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 999999
                  },
                  "maximumInput": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            },
            "vaults": {
              "type": "array",
              "maxItems": 128,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["id", "router", "vault", "asset", "maximumAssets"],
                "properties": {
                  "id": {
                    "type": "string",
                    "pattern": "^[A-Za-z0-9._-]{1,64}$"
                  },
                  "router": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "vault": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "asset": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "maximumAssets": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            }
          }
        },
        "native_transfers": {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["address", "code_hash", "maximum_value_wei"],
            "properties": {
              "address": {
                "type": "string",
                "pattern": "^0x[0-9a-fA-F]{40}$"
              },
              "code_hash": {
                "type": "string",
                "pattern": "^0x[0-9a-f]{64}$"
              },
              "maximum_value_wei": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]{0,77})$"
              }
            }
          }
        },
        "maximum_calls": {
          "type": "integer",
          "minimum": 1,
          "maximum": 16
        },
        "maximum_native_value_wei": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "max_validity_seconds": {
          "type": "integer",
          "minimum": 1,
          "maximum": 3600
        },
        "claim_requirements": {
          "type": "array",
          "maxItems": 16,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "allowed_values", "max_age_seconds"],
            "properties": {
              "name": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_]{0,63}$"
              },
              "allowed_values": {
                "type": "array",
                "minItems": 1,
                "maxItems": 32,
                "uniqueItems": true,
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128
                }
              },
              "max_age_seconds": {
                "type": "integer",
                "minimum": 1,
                "maximum": 31536000
              }
            }
          }
        }
      }
    },
    "created_at": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

## GET `/v1/application/policy/proposals/{proposalId}`

Operation: `readRuntimeConfigurationProposal`.

**Why this exists:** Inspect a saved proposal to see its requested rules and publication outcome.

**Who uses it:** Application developer.

**When you need it:** Use after submitting a proposal or losing its response. Keep its ID so you can check the original request.

**Before you start:** Use your application token and the original proposal ID. Applications cannot inspect another application’s proposals.

**Result and next step:** 200: the retained proposal and any publication result. If it still needs manual review, ask the provider operator to review that proposal rather than submitting duplicates.

**Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter        | Location | Required | Schema                                                                                                |
| ---------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `proposalId`     | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network` | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "proposal_id",
    "application_id",
    "based_on_revision",
    "policy_hash",
    "policy",
    "created_at"
  ],
  "properties": {
    "proposal_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "application_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "based_on_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "policy_hash": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "policy": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "version",
        "enabled",
        "chain_id",
        "contracts",
        "maximum_calls",
        "maximum_native_value_wei",
        "max_validity_seconds",
        "claim_requirements"
      ],
      "properties": {
        "action_requirements": {
          "type": "array",
          "maxItems": 64,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "description", "fields"],
            "properties": {
              "name": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "description": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "fields": {
                "type": "array",
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["name", "required", "allowed_values"],
                  "properties": {
                    "name": {
                      "type": "string",
                      "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                    },
                    "required": {
                      "type": "boolean"
                    },
                    "allowed_values": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 64,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "application_resources_hash": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        },
        "version": {
          "type": "string",
          "enum": ["1"]
        },
        "enabled": {
          "type": "boolean"
        },
        "chain_id": {
          "type": "string",
          "enum": ["eip155:84532", "eip155:8453", "eip155:1", "eip155:11155111"]
        },
        "contracts": {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["address", "code_hash", "methods"],
            "properties": {
              "address": {
                "type": "string",
                "pattern": "^0x[0-9a-fA-F]{40}$"
              },
              "code_hash": {
                "type": "string",
                "pattern": "^0x[0-9a-f]{64}$"
              },
              "implementation": {
                "type": "object",
                "additionalProperties": false,
                "required": ["address", "code_hash"],
                "properties": {
                  "address": {
                    "type": "string",
                    "pattern": "^0x[0-9a-fA-F]{40}$"
                  },
                  "code_hash": {
                    "type": "string",
                    "pattern": "^0x[0-9a-f]{64}$"
                  }
                }
              },
              "methods": {
                "type": "array",
                "minItems": 1,
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["signature", "maximum_value_wei"],
                  "properties": {
                    "signature": {
                      "type": "string",
                      "minLength": 3,
                      "maxLength": 256
                    },
                    "maximum_value_wei": {
                      "type": "string",
                      "pattern": "^(0|[1-9][0-9]{0,77})$"
                    },
                    "user_address_parameters": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 16,
                      "uniqueItems": true,
                      "items": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 31
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "call_adapters": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "tokenTransfers": {
              "type": "array",
              "maxItems": 128,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["token", "recipients", "maximumAmount"],
                "properties": {
                  "token": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "recipients": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 128,
                    "uniqueItems": true,
                    "items": {
                      "type": "string",
                      "pattern": "^0x[0-9a-fA-F]{40}$"
                    }
                  },
                  "maximumAmount": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  },
                  "lifetimeAmount": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            },
            "swaps": {
              "type": "array",
              "maxItems": 128,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "id",
                  "router",
                  "tokenIn",
                  "tokenOut",
                  "fee",
                  "maximumInput"
                ],
                "properties": {
                  "id": {
                    "type": "string",
                    "pattern": "^[A-Za-z0-9._-]{1,64}$"
                  },
                  "router": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "tokenIn": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "tokenOut": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "fee": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 999999
                  },
                  "maximumInput": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            },
            "vaults": {
              "type": "array",
              "maxItems": 128,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["id", "router", "vault", "asset", "maximumAssets"],
                "properties": {
                  "id": {
                    "type": "string",
                    "pattern": "^[A-Za-z0-9._-]{1,64}$"
                  },
                  "router": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "vault": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "asset": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "maximumAssets": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            }
          }
        },
        "native_transfers": {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["address", "code_hash", "maximum_value_wei"],
            "properties": {
              "address": {
                "type": "string",
                "pattern": "^0x[0-9a-fA-F]{40}$"
              },
              "code_hash": {
                "type": "string",
                "pattern": "^0x[0-9a-f]{64}$"
              },
              "maximum_value_wei": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]{0,77})$"
              }
            }
          }
        },
        "maximum_calls": {
          "type": "integer",
          "minimum": 1,
          "maximum": 16
        },
        "maximum_native_value_wei": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "max_validity_seconds": {
          "type": "integer",
          "minimum": 1,
          "maximum": 3600
        },
        "claim_requirements": {
          "type": "array",
          "maxItems": 16,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "allowed_values", "max_age_seconds"],
            "properties": {
              "name": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_]{0,63}$"
              },
              "allowed_values": {
                "type": "array",
                "minItems": 1,
                "maxItems": 32,
                "uniqueItems": true,
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128
                }
              },
              "max_age_seconds": {
                "type": "integer",
                "minimum": 1,
                "maximum": 31536000
              }
            }
          }
        }
      }
    },
    "created_at": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

## POST `/v1/provider/policy/proposals/{proposalId}/publish`

Operation: `publishRuntimeConfiguration`.

**Why this exists:** Make a reviewed application proposal the active transaction policy.

**Who uses it:** Service operator.

**When you need it:** Use for the normal proposal-and-review workflow. This is separate from accepting business declarations; publication defines the exact calls and limits that may be requested.

**Before you start:** Read the proposal and current policy. Use a provider operator token, the proposal ID, expected_revision and a UUIDv4 idempotency key.

**Result and next step:** 200: the published policy revision, effective without restart. Applications must read the new terms and obtain any required fresh consent. The published rules do not authorize a transaction by themselves.

**Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `proposalId`      | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["expected_revision"],
  "properties": {
    "expected_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "application_id",
    "revision",
    "previous_revision",
    "policy_hash",
    "policy",
    "published_at",
    "published_by"
  ],
  "properties": {
    "application_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "previous_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "policy_hash": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "policy": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "version",
        "enabled",
        "chain_id",
        "contracts",
        "maximum_calls",
        "maximum_native_value_wei",
        "max_validity_seconds",
        "claim_requirements"
      ],
      "properties": {
        "action_requirements": {
          "type": "array",
          "maxItems": 64,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "description", "fields"],
            "properties": {
              "name": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "description": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "fields": {
                "type": "array",
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["name", "required", "allowed_values"],
                  "properties": {
                    "name": {
                      "type": "string",
                      "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                    },
                    "required": {
                      "type": "boolean"
                    },
                    "allowed_values": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 64,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "application_resources_hash": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        },
        "version": {
          "type": "string",
          "enum": ["1"]
        },
        "enabled": {
          "type": "boolean"
        },
        "chain_id": {
          "type": "string",
          "enum": ["eip155:84532", "eip155:8453", "eip155:1", "eip155:11155111"]
        },
        "contracts": {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["address", "code_hash", "methods"],
            "properties": {
              "address": {
                "type": "string",
                "pattern": "^0x[0-9a-fA-F]{40}$"
              },
              "code_hash": {
                "type": "string",
                "pattern": "^0x[0-9a-f]{64}$"
              },
              "implementation": {
                "type": "object",
                "additionalProperties": false,
                "required": ["address", "code_hash"],
                "properties": {
                  "address": {
                    "type": "string",
                    "pattern": "^0x[0-9a-fA-F]{40}$"
                  },
                  "code_hash": {
                    "type": "string",
                    "pattern": "^0x[0-9a-f]{64}$"
                  }
                }
              },
              "methods": {
                "type": "array",
                "minItems": 1,
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["signature", "maximum_value_wei"],
                  "properties": {
                    "signature": {
                      "type": "string",
                      "minLength": 3,
                      "maxLength": 256
                    },
                    "maximum_value_wei": {
                      "type": "string",
                      "pattern": "^(0|[1-9][0-9]{0,77})$"
                    },
                    "user_address_parameters": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 16,
                      "uniqueItems": true,
                      "items": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 31
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "call_adapters": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "tokenTransfers": {
              "type": "array",
              "maxItems": 128,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["token", "recipients", "maximumAmount"],
                "properties": {
                  "token": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "recipients": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 128,
                    "uniqueItems": true,
                    "items": {
                      "type": "string",
                      "pattern": "^0x[0-9a-fA-F]{40}$"
                    }
                  },
                  "maximumAmount": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  },
                  "lifetimeAmount": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            },
            "swaps": {
              "type": "array",
              "maxItems": 128,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "id",
                  "router",
                  "tokenIn",
                  "tokenOut",
                  "fee",
                  "maximumInput"
                ],
                "properties": {
                  "id": {
                    "type": "string",
                    "pattern": "^[A-Za-z0-9._-]{1,64}$"
                  },
                  "router": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "tokenIn": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "tokenOut": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "fee": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 999999
                  },
                  "maximumInput": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            },
            "vaults": {
              "type": "array",
              "maxItems": 128,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["id", "router", "vault", "asset", "maximumAssets"],
                "properties": {
                  "id": {
                    "type": "string",
                    "pattern": "^[A-Za-z0-9._-]{1,64}$"
                  },
                  "router": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "vault": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "asset": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "maximumAssets": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            }
          }
        },
        "native_transfers": {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["address", "code_hash", "maximum_value_wei"],
            "properties": {
              "address": {
                "type": "string",
                "pattern": "^0x[0-9a-fA-F]{40}$"
              },
              "code_hash": {
                "type": "string",
                "pattern": "^0x[0-9a-f]{64}$"
              },
              "maximum_value_wei": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]{0,77})$"
              }
            }
          }
        },
        "maximum_calls": {
          "type": "integer",
          "minimum": 1,
          "maximum": 16
        },
        "maximum_native_value_wei": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "max_validity_seconds": {
          "type": "integer",
          "minimum": 1,
          "maximum": 3600
        },
        "claim_requirements": {
          "type": "array",
          "maxItems": 16,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "allowed_values", "max_age_seconds"],
            "properties": {
              "name": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_]{0,63}$"
              },
              "allowed_values": {
                "type": "array",
                "minItems": 1,
                "maxItems": 32,
                "uniqueItems": true,
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128
                }
              },
              "max_age_seconds": {
                "type": "integer",
                "minimum": 1,
                "maximum": 31536000
              }
            }
          }
        }
      }
    },
    "published_at": {
      "type": "string",
      "format": "date-time"
    },
    "proposal_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "published_by": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    }
  }
}
```

## POST `/v1/provider/applications/{applicationId}/policy/revisions`

Operation: `updateRuntimeConfiguration`.

**Why this exists:** Publish a provider-authored rules version without first creating an application proposal.

**Who uses it:** Service operator.

**When you need it:** Alternative setup path: use for a baseline or provider-controlled policy change. Use proposal publication instead when reviewing an application’s saved proposal; both retain version history.

**Before you start:** Use a provider operator token, the application ID, current expected_revision and a UUIDv4 idempotency key. Submit a complete reviewed policy.

**Result and next step:** 200: a new immutable policy publication, effective without restart. Earlier publications remain available for audit. Applications still need current owner consent and approved agreements before transactions.

**Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `applicationId`   | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{64}$"}`                                                        |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `wallet-network`  | header   | no       | `{"type":"string","enum":["base","base-sepolia","ethereum","ethereum-sepolia"]}`                      |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["expected_revision", "policy"],
  "properties": {
    "expected_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "policy": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "version",
        "enabled",
        "chain_id",
        "contracts",
        "maximum_calls",
        "maximum_native_value_wei",
        "max_validity_seconds",
        "claim_requirements"
      ],
      "properties": {
        "action_requirements": {
          "type": "array",
          "maxItems": 64,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "description", "fields"],
            "properties": {
              "name": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "description": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "fields": {
                "type": "array",
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["name", "required", "allowed_values"],
                  "properties": {
                    "name": {
                      "type": "string",
                      "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                    },
                    "required": {
                      "type": "boolean"
                    },
                    "allowed_values": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 64,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "application_resources_hash": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        },
        "version": {
          "type": "string",
          "enum": ["1"]
        },
        "enabled": {
          "type": "boolean"
        },
        "chain_id": {
          "type": "string",
          "enum": ["eip155:84532", "eip155:8453", "eip155:1", "eip155:11155111"]
        },
        "contracts": {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["address", "code_hash", "methods"],
            "properties": {
              "address": {
                "type": "string",
                "pattern": "^0x[0-9a-fA-F]{40}$"
              },
              "code_hash": {
                "type": "string",
                "pattern": "^0x[0-9a-f]{64}$"
              },
              "implementation": {
                "type": "object",
                "additionalProperties": false,
                "required": ["address", "code_hash"],
                "properties": {
                  "address": {
                    "type": "string",
                    "pattern": "^0x[0-9a-fA-F]{40}$"
                  },
                  "code_hash": {
                    "type": "string",
                    "pattern": "^0x[0-9a-f]{64}$"
                  }
                }
              },
              "methods": {
                "type": "array",
                "minItems": 1,
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["signature", "maximum_value_wei"],
                  "properties": {
                    "signature": {
                      "type": "string",
                      "minLength": 3,
                      "maxLength": 256
                    },
                    "maximum_value_wei": {
                      "type": "string",
                      "pattern": "^(0|[1-9][0-9]{0,77})$"
                    },
                    "user_address_parameters": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 16,
                      "uniqueItems": true,
                      "items": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 31
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "call_adapters": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "tokenTransfers": {
              "type": "array",
              "maxItems": 128,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["token", "recipients", "maximumAmount"],
                "properties": {
                  "token": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "recipients": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 128,
                    "uniqueItems": true,
                    "items": {
                      "type": "string",
                      "pattern": "^0x[0-9a-fA-F]{40}$"
                    }
                  },
                  "maximumAmount": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  },
                  "lifetimeAmount": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            },
            "swaps": {
              "type": "array",
              "maxItems": 128,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "id",
                  "router",
                  "tokenIn",
                  "tokenOut",
                  "fee",
                  "maximumInput"
                ],
                "properties": {
                  "id": {
                    "type": "string",
                    "pattern": "^[A-Za-z0-9._-]{1,64}$"
                  },
                  "router": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "tokenIn": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "tokenOut": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "fee": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 999999
                  },
                  "maximumInput": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            },
            "vaults": {
              "type": "array",
              "maxItems": 128,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["id", "router", "vault", "asset", "maximumAssets"],
                "properties": {
                  "id": {
                    "type": "string",
                    "pattern": "^[A-Za-z0-9._-]{1,64}$"
                  },
                  "router": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "vault": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "asset": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "maximumAssets": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            }
          }
        },
        "native_transfers": {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["address", "code_hash", "maximum_value_wei"],
            "properties": {
              "address": {
                "type": "string",
                "pattern": "^0x[0-9a-fA-F]{40}$"
              },
              "code_hash": {
                "type": "string",
                "pattern": "^0x[0-9a-f]{64}$"
              },
              "maximum_value_wei": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]{0,77})$"
              }
            }
          }
        },
        "maximum_calls": {
          "type": "integer",
          "minimum": 1,
          "maximum": 16
        },
        "maximum_native_value_wei": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "max_validity_seconds": {
          "type": "integer",
          "minimum": 1,
          "maximum": 3600
        },
        "claim_requirements": {
          "type": "array",
          "maxItems": 16,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "allowed_values", "max_age_seconds"],
            "properties": {
              "name": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_]{0,63}$"
              },
              "allowed_values": {
                "type": "array",
                "minItems": 1,
                "maxItems": 32,
                "uniqueItems": true,
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128
                }
              },
              "max_age_seconds": {
                "type": "integer",
                "minimum": 1,
                "maximum": 31536000
              }
            }
          }
        }
      }
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "application_id",
    "revision",
    "previous_revision",
    "policy_hash",
    "policy",
    "published_at",
    "published_by"
  ],
  "properties": {
    "application_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "previous_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,19})$"
    },
    "policy_hash": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "policy": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "version",
        "enabled",
        "chain_id",
        "contracts",
        "maximum_calls",
        "maximum_native_value_wei",
        "max_validity_seconds",
        "claim_requirements"
      ],
      "properties": {
        "action_requirements": {
          "type": "array",
          "maxItems": 64,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "description", "fields"],
            "properties": {
              "name": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_-]{0,63}$"
              },
              "description": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "fields": {
                "type": "array",
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["name", "required", "allowed_values"],
                  "properties": {
                    "name": {
                      "type": "string",
                      "pattern": "^[a-z][a-z0-9_-]{0,63}$"
                    },
                    "required": {
                      "type": "boolean"
                    },
                    "allowed_values": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 64,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "application_resources_hash": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        },
        "version": {
          "type": "string",
          "enum": ["1"]
        },
        "enabled": {
          "type": "boolean"
        },
        "chain_id": {
          "type": "string",
          "enum": ["eip155:84532", "eip155:8453", "eip155:1", "eip155:11155111"]
        },
        "contracts": {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["address", "code_hash", "methods"],
            "properties": {
              "address": {
                "type": "string",
                "pattern": "^0x[0-9a-fA-F]{40}$"
              },
              "code_hash": {
                "type": "string",
                "pattern": "^0x[0-9a-f]{64}$"
              },
              "implementation": {
                "type": "object",
                "additionalProperties": false,
                "required": ["address", "code_hash"],
                "properties": {
                  "address": {
                    "type": "string",
                    "pattern": "^0x[0-9a-fA-F]{40}$"
                  },
                  "code_hash": {
                    "type": "string",
                    "pattern": "^0x[0-9a-f]{64}$"
                  }
                }
              },
              "methods": {
                "type": "array",
                "minItems": 1,
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["signature", "maximum_value_wei"],
                  "properties": {
                    "signature": {
                      "type": "string",
                      "minLength": 3,
                      "maxLength": 256
                    },
                    "maximum_value_wei": {
                      "type": "string",
                      "pattern": "^(0|[1-9][0-9]{0,77})$"
                    },
                    "user_address_parameters": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 16,
                      "uniqueItems": true,
                      "items": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 31
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "call_adapters": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "tokenTransfers": {
              "type": "array",
              "maxItems": 128,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["token", "recipients", "maximumAmount"],
                "properties": {
                  "token": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "recipients": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 128,
                    "uniqueItems": true,
                    "items": {
                      "type": "string",
                      "pattern": "^0x[0-9a-fA-F]{40}$"
                    }
                  },
                  "maximumAmount": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  },
                  "lifetimeAmount": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            },
            "swaps": {
              "type": "array",
              "maxItems": 128,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "id",
                  "router",
                  "tokenIn",
                  "tokenOut",
                  "fee",
                  "maximumInput"
                ],
                "properties": {
                  "id": {
                    "type": "string",
                    "pattern": "^[A-Za-z0-9._-]{1,64}$"
                  },
                  "router": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "tokenIn": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "tokenOut": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "fee": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 999999
                  },
                  "maximumInput": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            },
            "vaults": {
              "type": "array",
              "maxItems": 128,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["id", "router", "vault", "asset", "maximumAssets"],
                "properties": {
                  "id": {
                    "type": "string",
                    "pattern": "^[A-Za-z0-9._-]{1,64}$"
                  },
                  "router": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "vault": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "asset": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["address", "codeHash"],
                    "properties": {
                      "address": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "codeHash": {
                        "type": "string",
                        "pattern": "^0x[0-9a-f]{64}$"
                      },
                      "implementation": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["address", "codeHash"],
                        "properties": {
                          "address": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "codeHash": {
                            "type": "string",
                            "pattern": "^0x[0-9a-f]{64}$"
                          }
                        }
                      }
                    }
                  },
                  "maximumAssets": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            }
          }
        },
        "native_transfers": {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["address", "code_hash", "maximum_value_wei"],
            "properties": {
              "address": {
                "type": "string",
                "pattern": "^0x[0-9a-fA-F]{40}$"
              },
              "code_hash": {
                "type": "string",
                "pattern": "^0x[0-9a-f]{64}$"
              },
              "maximum_value_wei": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]{0,77})$"
              }
            }
          }
        },
        "maximum_calls": {
          "type": "integer",
          "minimum": 1,
          "maximum": 16
        },
        "maximum_native_value_wei": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "max_validity_seconds": {
          "type": "integer",
          "minimum": 1,
          "maximum": 3600
        },
        "claim_requirements": {
          "type": "array",
          "maxItems": 16,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "allowed_values", "max_age_seconds"],
            "properties": {
              "name": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_]{0,63}$"
              },
              "allowed_values": {
                "type": "array",
                "minItems": 1,
                "maxItems": 32,
                "uniqueItems": true,
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128
                }
              },
              "max_age_seconds": {
                "type": "integer",
                "minimum": 1,
                "maximum": 31536000
              }
            }
          }
        }
      }
    },
    "published_at": {
      "type": "string",
      "format": "date-time"
    },
    "proposal_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "published_by": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    }
  }
}
```

## GET `/v1/provider/networks`

Operation: `readProviderNetworks`.

**Why this exists:** See saved network choices and whether a restart is needed to apply them.

**Who uses it:** Service operator.

**When you need it:** Use the Networks page in administration, or this request for management tools.

**Before you start:** Use a current provider administrator or management-tool token.

**Result and next step:** 200: the fixed default, saved choices, running choices and restart requirement. Network selection does not grant spending authority.

**Request details:** Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending.

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "revision",
    "default_network",
    "networks",
    "running_networks",
    "restart_required",
    "available"
  ],
  "properties": {
    "revision": {
      "type": "integer"
    },
    "default_network": {
      "type": "string"
    },
    "networks": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "running_networks": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "restart_required": {
      "type": "boolean"
    },
    "available": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "network": {
            "type": "string"
          },
          "name": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

## POST `/v1/provider/networks`

Operation: `saveProviderNetworks`.

**Why this exists:** Save network choices while preserving the default used by existing applications.

**Who uses it:** Service operator.

**When you need it:** Use when adding or removing a network, then restart the provider to apply the saved choices.

**Before you start:** Read the current revision first. Keep the default selected. Additional networks start disabled and need separate application agreements and funding.

**Result and next step:** 200: saved choices and restart requirement. Existing wallets and previously issued transactions are retained.

**Request details:** Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["expected_revision", "networks"],
  "properties": {
    "expected_revision": {
      "type": "integer",
      "minimum": 1
    },
    "networks": {
      "type": "array",
      "minItems": 1,
      "maxItems": 4,
      "uniqueItems": true,
      "items": {
        "enum": ["base", "base-sepolia", "ethereum", "ethereum-sepolia"]
      }
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "revision",
    "default_network",
    "networks",
    "running_networks",
    "restart_required",
    "available"
  ],
  "properties": {
    "revision": {
      "type": "integer"
    },
    "default_network": {
      "type": "string"
    },
    "networks": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "running_networks": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "restart_required": {
      "type": "boolean"
    },
    "available": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "network": {
            "type": "string"
          },
          "name": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

## GET `/v1/provider/users`

Operation: `listProviderUsers`.

**Why this exists:** Browse stored application-scoped users and their KYC evidence summaries.

**Who uses it:** Provider operator.

**When you need it:** Use when building a provider user directory or reviewing users registered through application-led access.

**Before you start:** Authenticate as a current administrator or management tool. Use limit (1–100, default 25), optional application_id and next_cursor as after for the next page. Keep filters unchanged between pages. Concurrent changes are not a snapshot.

**Result and next step:** 200: users and next_cursor, or null at the end. Each application user remains distinct; expired evidence remains visible. Hosted compatibility identities are excluded. This read does not establish current wallet or spending authority.

**Request details:** List stored application-attested users in ascending provider user ID order. Defaults to 25, maximum 100. Pass next_cursor as after; null ends pagination. Optional application_id filters registrations. Each application user is distinct. Results report stored evidence, not current spending eligibility. Identity fields and wallets are available from the detail route. Concurrent changes are not a snapshot.

| Parameter        | Location | Required | Schema                                                       |
| ---------------- | -------- | -------- | ------------------------------------------------------------ |
| `limit`          | query    | no       | `{"type":"string","pattern":"^(?:[1-9]\|[1-9][0-9]\|100)$"}` |
| `after`          | query    | no       | `{"type":"string","pattern":"^[a-f0-9]{64}$"}`               |
| `application_id` | query    | no       | `{"type":"string","minLength":1,"maxLength":256}`            |

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["users", "next_cursor"],
  "properties": {
    "users": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "application_id", "issuer", "user_id", "kyc"],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-f0-9]{64}$"
          },
          "application_id": {
            "type": "string"
          },
          "issuer": {
            "type": "string"
          },
          "user_id": {
            "type": "string"
          },
          "kyc": {
            "type": "object",
            "additionalProperties": false,
            "required": ["source", "level", "verified_at", "accepted_until"],
            "properties": {
              "source": {
                "enum": ["application_attestation"]
              },
              "level": {
                "type": "string"
              },
              "verified_at": {
                "type": "string",
                "format": "date-time"
              },
              "accepted_until": {
                "type": "string",
                "format": "date-time"
              },
              "reference": {
                "type": "string"
              },
              "fields": {
                "type": "object",
                "additionalProperties": {
                  "type": "string"
                }
              }
            }
          }
        }
      }
    },
    "next_cursor": {
      "type": "string",
      "pattern": "^[a-f0-9]{64}$",
      "nullable": true
    }
  }
}
```

## GET `/v1/provider/users/{id}`

Operation: `readProviderUser`.

**Why this exists:** Read an application-scoped user’s stored identity information and associated wallets.

**Who uses it:** Provider operator.

**When you need it:** Use after selecting a provider user ID from the directory.

**Before you start:** Authenticate as a current administrator or management tool. Use the directory id, not the application user_id. Treat identity fields and wallet addresses as private customer data.

**Result and next step:** 200: application-attested KYC evidence and owned, linked, invited or active member wallets, including suspended accounts. Removed memberships are omitted. Stored evidence is not a fresh KYC decision or wallet authorization. Unknown IDs return 404.

**Request details:** Read a stored application-scoped user, application-attested identity fields and owned, linked or invited/active member wallets. Uses the provider user ID returned by the directory, not the application user_id. Includes expired evidence and suspended accounts for administration; does not establish current KYC, consent or transaction authority. Hosted compatibility identities are outside this directory. Unknown IDs return 404.

| Parameter | Location | Required | Schema                                         |
| --------- | -------- | -------- | ---------------------------------------------- |
| `id`      | path     | yes      | `{"type":"string","pattern":"^[a-f0-9]{64}$"}` |

| Status | Content type             | Description             |
| ------ | ------------------------ | ----------------------- |
| 200    | application/json         | Default Response        |
| 400    | application/problem+json | Problem response        |
| 401    | application/problem+json | Problem response        |
| 403    | application/problem+json | Problem response        |
| 404    | application/problem+json | Provider user not found |
| 409    | application/problem+json | Problem response        |
| 413    | application/problem+json | Problem response        |
| 415    | application/problem+json | Problem response        |
| 422    | application/problem+json | Problem response        |
| 429    | application/problem+json | Problem response        |
| 500    | application/problem+json | Problem response        |
| 503    | application/problem+json | Problem response        |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["id", "application_id", "issuer", "user_id", "kyc", "wallets"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^[a-f0-9]{64}$"
    },
    "application_id": {
      "type": "string"
    },
    "issuer": {
      "type": "string"
    },
    "user_id": {
      "type": "string"
    },
    "kyc": {
      "type": "object",
      "additionalProperties": false,
      "required": ["source", "level", "verified_at", "accepted_until"],
      "properties": {
        "source": {
          "enum": ["application_attestation"]
        },
        "level": {
          "type": "string"
        },
        "verified_at": {
          "type": "string",
          "format": "date-time"
        },
        "accepted_until": {
          "type": "string",
          "format": "date-time"
        },
        "reference": {
          "type": "string"
        },
        "fields": {
          "type": "object",
          "additionalProperties": {
            "type": "string"
          }
        }
      }
    },
    "wallets": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["account_id", "wallet", "role", "status"],
        "properties": {
          "account_id": {
            "type": "string",
            "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
          },
          "network": {
            "type": "string",
            "enum": ["base", "base-sepolia", "ethereum", "ethereum-sepolia"]
          },
          "wallet": {
            "type": "object",
            "additionalProperties": false,
            "required": ["reference", "name", "kind"],
            "properties": {
              "reference": {
                "type": "string"
              },
              "name": {
                "type": "string"
              },
              "kind": {
                "enum": ["personal", "shared"]
              }
            }
          },
          "role": {
            "enum": ["owner", "member"]
          },
          "status": {
            "enum": ["active", "suspended"]
          },
          "address": {
            "type": "string"
          },
          "membership_state": {
            "enum": ["invited", "active"]
          }
        }
      }
    }
  }
}
```

## GET `/v1/provider/user-checks`

Operation: `readProviderUserChecks`.

**Why this exists:** See the identity information and permission limits every connected application must follow.

**Who uses it:** Service operator.

**When you need it:** Use when reviewing your service’s user checks. The same settings are available under User checks in administration.

**Before you start:** Sign in as a provider operator. These shared settings are also shown under User checks in administration.

**Result and next step:** 200: required identity fields, the agreed verification label, maximum check age, permission duration and current settings revision. This returns requirements, not anyone’s KYC records.

**Request details:** Read the shared identity information, check age and wallet permission duration required from applications. available is false for hosted compatibility installations. No customer identity records are returned.

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "available",
    "revision",
    "required_fields",
    "verification_level",
    "max_identity_age_days",
    "max_access_days"
  ],
  "properties": {
    "available": {
      "type": "boolean"
    },
    "revision": {
      "type": "integer",
      "minimum": 1
    },
    "required_fields": {
      "type": "array",
      "maxItems": 16,
      "uniqueItems": true,
      "items": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_]{0,63}$"
      },
      "description": "Identity field names every application must submit. Values are nonempty strings, up to 512 characters; presence does not verify their accuracy."
    },
    "verification_level": {
      "type": "string",
      "description": "Agreed verification label; empty when application user-check settings are unavailable in hosted mode."
    },
    "max_identity_age_days": {
      "type": "integer",
      "minimum": 1,
      "maximum": 365
    },
    "max_access_days": {
      "type": "integer",
      "minimum": 1,
      "maximum": 365
    }
  }
}
```

## POST `/v1/provider/user-checks`

Operation: `saveProviderUserChecks`.

**Why this exists:** Set required identity information, the maximum age of checks and how long wallet permission lasts.

**Who uses it:** Service operator.

**When you need it:** Use when your shared requirements change. Applications read the resulting requirements through GET /v1/access-policy.

**Before you start:** Review the requirements with the applications you trust. Read the current revision first and send it as expected_revision with a new UUIDv4 idempotency key. Repeat an uncertain request with the same key and body.

**Result and next step:** 200: saved requirements, effective immediately and retained across restarts. Changed settings end existing wallet approvals and pending access requests across all applications; people must approve the new terms. Identical settings preserve approvals. Applications must read GET /v1/access-policy for the new policy revision.

**Request details:** Save shared user-check requirements without restarting the service. Use the current revision and a UUIDv4 idempotency key. Changed settings end all current wallet approvals and pending access requests; people must give fresh permission to the new terms. Identical settings preserve approvals. This does not perform KYC, change application trust or enable transactions.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "expected_revision",
    "required_fields",
    "verification_level",
    "max_identity_age_days",
    "max_access_days"
  ],
  "properties": {
    "expected_revision": {
      "type": "integer",
      "minimum": 1
    },
    "required_fields": {
      "type": "array",
      "maxItems": 16,
      "uniqueItems": true,
      "items": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_]{0,63}$"
      },
      "description": "Identity field names every application must submit. Values are nonempty strings, up to 512 characters; presence does not verify their accuracy."
    },
    "verification_level": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100,
      "description": "Exact agreed label for completed identity checks, such as verified."
    },
    "max_identity_age_days": {
      "type": "integer",
      "minimum": 1,
      "maximum": 365
    },
    "max_access_days": {
      "type": "integer",
      "minimum": 1,
      "maximum": 365
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "available",
    "revision",
    "required_fields",
    "verification_level",
    "max_identity_age_days",
    "max_access_days"
  ],
  "properties": {
    "available": {
      "type": "boolean"
    },
    "revision": {
      "type": "integer",
      "minimum": 1
    },
    "required_fields": {
      "type": "array",
      "maxItems": 16,
      "uniqueItems": true,
      "items": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_]{0,63}$"
      },
      "description": "Identity field names every application must submit. Values are nonempty strings, up to 512 characters; presence does not verify their accuracy."
    },
    "verification_level": {
      "type": "string",
      "description": "Agreed verification label; empty when application user-check settings are unavailable in hosted mode."
    },
    "max_identity_age_days": {
      "type": "integer",
      "minimum": 1,
      "maximum": 365
    },
    "max_access_days": {
      "type": "integer",
      "minimum": 1,
      "maximum": 365
    }
  }
}
```

## POST `/v1/provider/claim`

Operation: `claimProviderInstallation`.

**Why this exists:** Establish the administrator for a new, unclaimed installation using its private setup code.

**Who uses it:** Installer.

**When you need it:** Use once after installation. The First-time setup form in administration sends this request; ordinary sign-in does not use it.

**Before you start:** Use the privately delivered, unexpired installation claim credential. This succeeds once.

**Result and next step:** 200: a provider administrator registration; wallet execution remains disabled.

**Request details:** Atomically claim a new installation using its privately delivered single-use credential. Expires 30 minutes after first initialization. Restart never reopens claiming. Establishes administration only.

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["claim", "username", "password"],
  "properties": {
    "claim": {
      "type": "string",
      "minLength": 43,
      "maxLength": 128
    },
    "username": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9-]{2,47}$"
    },
    "password": {
      "type": "string",
      "minLength": 14,
      "maxLength": 256
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id",
    "name",
    "role",
    "enabled",
    "revision",
    "credentialRevision",
    "scopes"
  ],
  "properties": {
    "id": {
      "type": "string"
    },
    "name": {
      "type": "string"
    },
    "role": {
      "enum": ["administrator", "automation", "application"]
    },
    "enabled": {
      "type": "boolean"
    },
    "revision": {
      "type": "integer"
    },
    "credentialRevision": {
      "type": "integer"
    },
    "scopes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "policy": {
      "type": "object",
      "additionalProperties": true
    },
    "client_secret": {
      "type": "string"
    },
    "credential_replayed": {
      "type": "boolean"
    }
  }
}
```

## GET `/v1/provider/status`

Operation: `readProviderStatus`.

**Why this exists:** See whether administration is available, which applications are registered and whether wallet operations are enabled.

**Who uses it:** Service operator.

**When you need it:** Use on your administration dashboard or when troubleshooting service setup.

**Before you start:** Authenticate as a current dedicated provider operator.

**Result and next step:** 200: management availability, application registrations and wallet activation status.

**Request details:** Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending.

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "installation_id",
    "claimed",
    "applications",
    "management_available",
    "wallet_operations_enabled"
  ],
  "properties": {
    "installation_id": {
      "type": "string"
    },
    "claimed": {
      "enum": [true]
    },
    "applications": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "name",
          "role",
          "enabled",
          "revision",
          "credentialRevision",
          "scopes"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "role": {
            "enum": ["administrator", "automation", "application"]
          },
          "enabled": {
            "type": "boolean"
          },
          "revision": {
            "type": "integer"
          },
          "credentialRevision": {
            "type": "integer"
          },
          "scopes": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "policy": {
            "type": "object",
            "additionalProperties": true
          },
          "client_secret": {
            "type": "string"
          },
          "credential_replayed": {
            "type": "boolean"
          }
        }
      }
    },
    "management_available": {
      "enum": [true]
    },
    "management_identities": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "name",
          "role",
          "enabled",
          "revision",
          "credentialRevision",
          "scopes"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "role": {
            "enum": ["administrator", "automation", "application"]
          },
          "enabled": {
            "type": "boolean"
          },
          "revision": {
            "type": "integer"
          },
          "credentialRevision": {
            "type": "integer"
          },
          "scopes": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "policy": {
            "type": "object",
            "additionalProperties": true
          },
          "client_secret": {
            "type": "string"
          },
          "credential_replayed": {
            "type": "boolean"
          }
        }
      }
    },
    "user_checks": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "available",
        "revision",
        "required_fields",
        "verification_level",
        "max_identity_age_days",
        "max_access_days"
      ],
      "properties": {
        "available": {
          "type": "boolean"
        },
        "revision": {
          "type": "integer",
          "minimum": 1
        },
        "required_fields": {
          "type": "array",
          "maxItems": 16,
          "uniqueItems": true,
          "items": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_]{0,63}$"
          },
          "description": "Identity field names every application must submit. Values are nonempty strings, up to 512 characters; presence does not verify their accuracy."
        },
        "verification_level": {
          "type": "string",
          "description": "Agreed verification label; empty when application user-check settings are unavailable in hosted mode."
        },
        "max_identity_age_days": {
          "type": "integer",
          "minimum": 1,
          "maximum": 365
        },
        "max_access_days": {
          "type": "integer",
          "minimum": 1,
          "maximum": 365
        }
      }
    },
    "network_settings": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "revision",
        "default_network",
        "networks",
        "running_networks",
        "restart_required",
        "available"
      ],
      "properties": {
        "revision": {
          "type": "integer"
        },
        "default_network": {
          "type": "string"
        },
        "networks": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "running_networks": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "restart_required": {
          "type": "boolean"
        },
        "available": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "network": {
                "type": "string"
              },
              "name": {
                "type": "string"
              }
            }
          }
        }
      }
    },
    "network_status": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "network": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "configured": {
            "type": "boolean"
          }
        }
      }
    },
    "wallet_operations_enabled": {
      "type": "boolean"
    }
  }
}
```

## GET `/v1/provider/identities`

Operation: `listProviderIdentities`.

**Why this exists:** List registered connections so you can find the one to inspect or change.

**Who uses it:** Service operator.

**When you need it:** Use when managing registrations. This lists application and tool connections, not wallet owners.

**Before you start:** Authenticate as a current dedicated provider operator.

**Result and next step:** 200: identity metadata without authentication verifiers or secrets.

**Request details:** Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending.

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "array",
  "maxItems": 100,
  "items": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "id",
      "name",
      "role",
      "enabled",
      "revision",
      "credentialRevision",
      "scopes"
    ],
    "properties": {
      "id": {
        "type": "string"
      },
      "name": {
        "type": "string"
      },
      "role": {
        "enum": ["administrator", "automation", "application"]
      },
      "enabled": {
        "type": "boolean"
      },
      "revision": {
        "type": "integer"
      },
      "credentialRevision": {
        "type": "integer"
      },
      "scopes": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "policy": {
        "type": "object",
        "additionalProperties": true
      },
      "client_secret": {
        "type": "string"
      },
      "credential_replayed": {
        "type": "boolean"
      }
    }
  }
}
```

## POST `/v1/provider/identities`

Operation: `createProviderIdentity`.

**Why this exists:** Give an application or administration tool its own connection ID and secret.

**Who uses it:** Service operator.

**When you need it:** Use once per new connection. Most operators can use Add application or Add management tool in administration.

**Before you start:** Use a dedicated provider operator and a fresh idempotency key.

**Result and next step:** 200: registration metadata and a secret shown once. Replay returns metadata only; registration does not accept identity trust.

**Request details:** Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["name", "role"],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "role": {
      "enum": ["application", "automation"]
    },
    "scopes": {
      "type": "array",
      "minItems": 1,
      "maxItems": 50,
      "uniqueItems": true,
      "items": {
        "enum": [
          "wallet:configuration:read",
          "wallet:configuration:propose",
          "wallet:access",
          "wallet:access:read",
          "wallet:account:read",
          "wallet:provision",
          "wallet:actions",
          "wallet:sign",
          "wallet:execute",
          "wallet:execute:read",
          "provider:manage",
          "wallet:configuration:write"
        ]
      }
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id",
    "name",
    "role",
    "enabled",
    "revision",
    "credentialRevision",
    "scopes"
  ],
  "properties": {
    "id": {
      "type": "string"
    },
    "name": {
      "type": "string"
    },
    "role": {
      "enum": ["administrator", "automation", "application"]
    },
    "enabled": {
      "type": "boolean"
    },
    "revision": {
      "type": "integer"
    },
    "credentialRevision": {
      "type": "integer"
    },
    "scopes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "policy": {
      "type": "object",
      "additionalProperties": true
    },
    "client_secret": {
      "type": "string"
    },
    "credential_replayed": {
      "type": "boolean"
    }
  }
}
```

## PATCH `/v1/provider/identities/{id}`

Operation: `updateProviderIdentity`.

**Why this exists:** Rename a connection, pause access, or change the agreement and permissions for an application.

**Who uses it:** Service operator.

**When you need it:** Use after adding a connection. Changing trust or permissions ends its current wallet approvals; renaming alone preserves them.

**Before you start:** Supply the current revision and an idempotency key. Application identities cannot perform this operation.

**Result and next step:** 200: updated registration. Authority changes invalidate obsolete tokens; suspension, trust and owner-permission changes revoke related grants. Renaming preserves authority. Wallet activation is unchanged.

**Request details:** Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending.

| Parameter         | Location | Required | Schema                                                                                                                 |
| ----------------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `id`              | path     | yes      | `{"type":"string","maxLength":100,"pattern":"^(?:(?:app\|automation)-[a-f0-9-]{36}\|operator-[a-z][a-z0-9-]{2,47})$"}` |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}`                  |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["expected_revision"],
  "properties": {
    "expected_revision": {
      "type": "integer",
      "minimum": 1
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "scopes": {
      "type": "array",
      "minItems": 1,
      "maxItems": 50,
      "uniqueItems": true,
      "items": {
        "enum": [
          "wallet:configuration:read",
          "wallet:configuration:propose",
          "wallet:access",
          "wallet:access:read",
          "wallet:account:read",
          "wallet:provision",
          "wallet:actions",
          "wallet:sign",
          "wallet:execute",
          "wallet:execute:read",
          "provider:manage",
          "wallet:configuration:write"
        ]
      }
    },
    "enabled": {
      "type": "boolean"
    },
    "trust_agreement": {
      "type": "string",
      "minLength": 1,
      "maxLength": 256,
      "nullable": true
    },
    "wallet_sharing": {
      "description": "Allow selected applications to request these wallets under a reviewed identity-and-consent sharing agreement. Null disables sharing and ends dependent approvals. Each requester needs its own consent and permissions.",
      "type": "object",
      "additionalProperties": false,
      "required": ["applications", "matchingFields", "agreement"],
      "properties": {
        "applications": {
          "type": "array",
          "minItems": 1,
          "maxItems": 99,
          "uniqueItems": true,
          "items": {
            "type": "string",
            "maxLength": 256
          }
        },
        "matchingFields": {
          "type": "array",
          "maxItems": 16,
          "uniqueItems": true,
          "items": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_]{0,63}$"
          },
          "description": "All fields must match exactly. Include identity_number, document_type and issuing_country; each must also be required under User checks.",
          "minItems": 3
        },
        "agreement": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        }
      },
      "nullable": true
    },
    "permissions": {
      "type": "array",
      "minItems": 1,
      "maxItems": 4,
      "uniqueItems": true,
      "items": {
        "enum": [
          "account:read",
          "contracts:request",
          "operations:request",
          "members:manage"
        ]
      }
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id",
    "name",
    "role",
    "enabled",
    "revision",
    "credentialRevision",
    "scopes"
  ],
  "properties": {
    "id": {
      "type": "string"
    },
    "name": {
      "type": "string"
    },
    "role": {
      "enum": ["administrator", "automation", "application"]
    },
    "enabled": {
      "type": "boolean"
    },
    "revision": {
      "type": "integer"
    },
    "credentialRevision": {
      "type": "integer"
    },
    "scopes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "policy": {
      "type": "object",
      "additionalProperties": true
    },
    "client_secret": {
      "type": "string"
    },
    "credential_replayed": {
      "type": "boolean"
    }
  }
}
```

## POST `/v1/provider/identities/{id}/credentials`

Operation: `rotateProviderIdentityCredential`.

**Why this exists:** Replace lost or exposed connection details so the old secret and its tokens stop working.

**Who uses it:** Service operator.

**When you need it:** Use for an existing application or management tool. You can also choose Replace secret in administration.

**Before you start:** Use a dedicated provider operator, current revision and an idempotency key.

**Result and next step:** 200: a replacement secret shown once. Obsolete credentials and tokens are rejected.

**Request details:** Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending.

| Parameter         | Location | Required | Schema                                                                                                                 |
| ----------------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `id`              | path     | yes      | `{"type":"string","maxLength":100,"pattern":"^(?:(?:app\|automation)-[a-f0-9-]{36}\|operator-[a-z][a-z0-9-]{2,47})$"}` |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}`                  |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["expected_revision"],
  "properties": {
    "expected_revision": {
      "type": "integer",
      "minimum": 1
    }
  }
}
```

| Status | Content type             | Description      |
| ------ | ------------------------ | ---------------- |
| 200    | application/json         | Default Response |
| 400    | application/problem+json | Problem response |
| 401    | application/problem+json | Problem response |
| 403    | application/problem+json | Problem response |
| 409    | application/problem+json | Problem response |
| 413    | application/problem+json | Problem response |
| 415    | application/problem+json | Problem response |
| 422    | application/problem+json | Problem response |
| 429    | application/problem+json | Problem response |
| 500    | application/problem+json | Problem response |
| 503    | application/problem+json | Problem response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id",
    "name",
    "role",
    "enabled",
    "revision",
    "credentialRevision",
    "scopes"
  ],
  "properties": {
    "id": {
      "type": "string"
    },
    "name": {
      "type": "string"
    },
    "role": {
      "enum": ["administrator", "automation", "application"]
    },
    "enabled": {
      "type": "boolean"
    },
    "revision": {
      "type": "integer"
    },
    "credentialRevision": {
      "type": "integer"
    },
    "scopes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "policy": {
      "type": "object",
      "additionalProperties": true
    },
    "client_secret": {
      "type": "string"
    },
    "credential_replayed": {
      "type": "boolean"
    }
  }
}
```
