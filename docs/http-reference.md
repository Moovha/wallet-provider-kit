# HTTP schema reference

After [Export and deployment](setup-wizard.md#_6-export), use these schemas to
implement application access and permitted wallet actions. They describe the
[implemented provider contract](../spec/provider-api.json); the [HTTP guide](http-api.md)
explains the request sequence and the [access guide](application-access.md) connects
identity, consent and grants to the policy configured in the wizard. For contributing or
regeneration, see the [development guide](../CONTRIBUTING.md#development).
Read the [HTTP usage guide](http-api.md) for authentication, scopes, error handling
and the Safe execution contract. Availability depends on current configuration. Read [roles and terms](concepts.md)
for application clients, account owners, authority and journals.

## GET /v1/execution-capabilities

Operation: `getExecutionCapabilities`.

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

## GET /v1/capabilities

Operation: `getCapabilities`.

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

## POST /v1/enrollments

Operation: `beginEnrollment`.

Reserve an owner-enrollment challenge through current host policy and durable storage. No wallet is created.

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

## POST /v1/enrollments/{enrollmentId}/identity

Operation: `submitEnrollmentIdentity`.

Submit a provider-nonce-bound OIDC Identity Assurance ID token. Provider policy decides acceptance; this never creates a wallet or spend grant.

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

## GET /v1/enrollments/{enrollmentId}

Operation: `getEnrollment`.

Read the current authorized enrollment receipt without identity attributes or the proof token.

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

## POST /v1/accounts/{accountId}/provision

Operation: `provisionAccount`.

Provision a host-authorized account by stored ID with an empty body and durable attempt. When enrollment is configured, current provider acceptance for the same caller/account/owner is also required. Acceptance does not grant signing rights.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `accountId`       | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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
          "enum": ["eip155:8453", "eip155:84532"]
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

## GET /v1/configuration/applications/{applicationId}/safe-wallet

Operation: `readSafeWalletInfrastructure`.

| Parameter       | Location | Required | Schema                                         |
| --------------- | -------- | -------- | ---------------------------------------------- |
| `applicationId` | path     | yes      | `{"type":"string","pattern":"^[a-f0-9]{64}$"}` |

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

## POST /v1/configuration/applications/{applicationId}/safe-wallet

Operation: `provisionSafeWalletInfrastructure`.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `applicationId`   | path     | yes      | `{"type":"string","pattern":"^[a-f0-9]{64}$"}`                                                        |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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

## POST /v1/access-requests

Operation: `requestAccountAccess`.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["mode", "authorization_details"],
  "properties": {
    "mode": {
      "type": "string",
      "enum": ["create", "connect"]
    },
    "account_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
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
      "required": ["id", "identity", "consent"],
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
            "maxItems": 3,
            "uniqueItems": true,
            "items": {
              "type": "string",
              "enum": [
                "account:read",
                "operations:request",
                "contracts:request"
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
        "enum": ["account:read", "operations:request", "contracts:request"]
      }
    },
    "expires_at": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

## GET /v1/access-policy

Operation: `getAccountAccessPolicy`.

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
      "enum": ["eip155:8453", "eip155:84532"]
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
              "enum": ["eip155:84532", "eip155:8453"]
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
    "verification_level": {
      "type": "string"
    }
  }
}
```

## POST /v1/access-grants/{grantId}/revoke

Operation: `revokeAccountAccess`.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `grantId`         | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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

## POST /v1/access-records

Operation: `submitAccountAccessRecords`.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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
                    "contracts:request"
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

## GET /v1/access-requests/{requestId}

Operation: `getAccountAccessRequest`.

| Parameter   | Location | Required | Schema                                                                                                |
| ----------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `requestId` | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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
        "enum": ["account:read", "operations:request", "contracts:request"]
      }
    },
    "expires_at": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

## POST /v1/access-requests/{requestId}/identity

Operation: `importAccessIdentity`.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `requestId`       | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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
        "enum": ["account:read", "operations:request", "contracts:request"]
      }
    },
    "expires_at": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

## GET /v1/accounts/{accountId}

Operation: `readGrantedAccount`.

| Parameter   | Location | Required | Schema                                                                                                |
| ----------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `accountId` | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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

## GET /v1/accounts/{accountId}/wallet/calls/{batchId}/events

Operation: `streamWalletCallsStatus`.

Authenticated bounded SSE status stream. Sends current account-authorized EIP-5792 status after durable observation changes. Reconnect after 55 seconds; ordinary status reads remain available.

| Parameter   | Location | Required | Schema                                                                                                |
| ----------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `accountId` | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `batchId`   | path     | yes      | `{"type":"string","maxLength":8194}`                                                                  |

| Status | Content type      | Description                                    |
| ------ | ----------------- | ---------------------------------------------- |
| 200    | text/event-stream | Bounded SSE stream of authorized wallet status |
| 401    | application/json  | Default Response                               |
| 403    | application/json  | Default Response                               |
| 429    | application/json  | Default Response                               |
| 503    | application/json  | Default Response                               |

## GET /v1/accounts/{accountId}/wallet

Operation: `readWalletExecutionAccount`.

| Parameter   | Location | Required | Schema                                                                                                |
| ----------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `accountId` | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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

## POST /v1/accounts/{accountId}/wallet

Operation: `walletCallsRpc`.

Optional account-scoped EIP-5792 2.0.0 JSON-RPC transport. Runtime financial authority, the Safe ERC-4337 driver, current owner consent and method-specific scopes remain required. wallet_sendCalls admits a durable atomic batch without waiting for chain inclusion. Headless wallet_showCallsStatus returns unsupported method; the client adapter can present status through an explicit host callback.

| Parameter   | Location | Required | Schema                                                                                                |
| ----------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `accountId` | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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

## GET /v1/application/gas-funding

Operation: `readApplicationGasFunding`.

Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

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
    "funding_address": {
      "type": "string"
    },
    "paymaster": {
      "type": "string"
    }
  }
}
```

## GET /v1/application/credentials

Operation: `readApplicationCredentials`.

Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

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

## GET /v1/provider/applications/{applicationId}/credentials

Operation: `readProviderApplicationCredentials`.

Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter       | Location | Required | Schema                                         |
| --------------- | -------- | -------- | ---------------------------------------------- |
| `applicationId` | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{64}$"}` |

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

## PUT /v1/application/credentials/{reference}

Operation: `writeApplicationCredential`.

Store or rotate an application-owned HTTPS service endpoint in encrypted storage. Send null to revoke it. Secret paths are never returned. Associated service declarations require provider review after every change.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `reference`       | path     | yes      | `{"type":"string","pattern":"^[A-Za-z0-9_-]{1,128}$"}`                                                |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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

## GET /v1/application/obligations

Operation: `readApplicationObligations`.

Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.

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
                  "maximum_gas_budget_wei",
                  "account_model",
                  "asset_model"
                ],
                "properties": {
                  "chain_id": {
                    "type": "string",
                    "enum": ["eip155:8453", "eip155:84532"]
                  },
                  "funding_agreement": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                  },
                  "maximum_gas_budget_wei": {
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
                }
              }
            ]
          },
          "submitted_at": {
            "type": "string",
            "format": "date-time"
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

## GET /v1/provider/applications/{applicationId}/obligations

Operation: `readProviderApplicationObligations`.

Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.

| Parameter       | Location | Required | Schema                                         |
| --------------- | -------- | -------- | ---------------------------------------------- |
| `applicationId` | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{64}$"}` |

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
                  "maximum_gas_budget_wei",
                  "account_model",
                  "asset_model"
                ],
                "properties": {
                  "chain_id": {
                    "type": "string",
                    "enum": ["eip155:8453", "eip155:84532"]
                  },
                  "funding_agreement": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                  },
                  "maximum_gas_budget_wei": {
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
                }
              }
            ]
          },
          "submitted_at": {
            "type": "string",
            "format": "date-time"
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

## PUT /v1/application/obligations/actions

Operation: `submitApplicationActions`.

Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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
            "maximum_gas_budget_wei",
            "account_model",
            "asset_model"
          ],
          "properties": {
            "chain_id": {
              "type": "string",
              "enum": ["eip155:8453", "eip155:84532"]
            },
            "funding_agreement": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maximum_gas_budget_wei": {
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
          }
        }
      ]
    },
    "submitted_at": {
      "type": "string",
      "format": "date-time"
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

## POST /v1/provider/applications/{applicationId}/obligations/actions/decision

Operation: `decideApplicationActions`.

Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `applicationId`   | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{64}$"}`                                                        |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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
            "maximum_gas_budget_wei",
            "account_model",
            "asset_model"
          ],
          "properties": {
            "chain_id": {
              "type": "string",
              "enum": ["eip155:8453", "eip155:84532"]
            },
            "funding_agreement": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maximum_gas_budget_wei": {
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
          }
        }
      ]
    },
    "submitted_at": {
      "type": "string",
      "format": "date-time"
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

## PUT /v1/application/obligations/services

Operation: `submitApplicationServices`.

Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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
            "maximum_gas_budget_wei",
            "account_model",
            "asset_model"
          ],
          "properties": {
            "chain_id": {
              "type": "string",
              "enum": ["eip155:8453", "eip155:84532"]
            },
            "funding_agreement": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maximum_gas_budget_wei": {
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
          }
        }
      ]
    },
    "submitted_at": {
      "type": "string",
      "format": "date-time"
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

## POST /v1/provider/applications/{applicationId}/obligations/services/decision

Operation: `decideApplicationServices`.

Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `applicationId`   | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{64}$"}`                                                        |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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
            "maximum_gas_budget_wei",
            "account_model",
            "asset_model"
          ],
          "properties": {
            "chain_id": {
              "type": "string",
              "enum": ["eip155:8453", "eip155:84532"]
            },
            "funding_agreement": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maximum_gas_budget_wei": {
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
          }
        }
      ]
    },
    "submitted_at": {
      "type": "string",
      "format": "date-time"
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

## PUT /v1/application/obligations/sponsorship

Operation: `submitApplicationSponsorship`.

Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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
        "maximum_gas_budget_wei",
        "account_model",
        "asset_model"
      ],
      "properties": {
        "chain_id": {
          "type": "string",
          "enum": ["eip155:8453", "eip155:84532"]
        },
        "funding_agreement": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "maximum_gas_budget_wei": {
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
            "maximum_gas_budget_wei",
            "account_model",
            "asset_model"
          ],
          "properties": {
            "chain_id": {
              "type": "string",
              "enum": ["eip155:8453", "eip155:84532"]
            },
            "funding_agreement": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maximum_gas_budget_wei": {
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
          }
        }
      ]
    },
    "submitted_at": {
      "type": "string",
      "format": "date-time"
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

## POST /v1/provider/applications/{applicationId}/obligations/sponsorship/decision

Operation: `decideApplicationSponsorship`.

Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `applicationId`   | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{64}$"}`                                                        |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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
            "maximum_gas_budget_wei",
            "account_model",
            "asset_model"
          ],
          "properties": {
            "chain_id": {
              "type": "string",
              "enum": ["eip155:8453", "eip155:84532"]
            },
            "funding_agreement": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maximum_gas_budget_wei": {
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
          }
        }
      ]
    },
    "submitted_at": {
      "type": "string",
      "format": "date-time"
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

## GET /v1/applications/configurations

Operation: `listApplicationConfigurations`.

Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter        | Location | Required | Schema                                         |
| ---------------- | -------- | -------- | ---------------------------------------------- |
| `application_id` | query    | no       | `{"type":"string","pattern":"^[0-9a-f]{64}$"}` |

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
      "enum": ["base", "base-sepolia"]
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
                    "enum": ["eip155:84532", "eip155:8453"]
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
                      "enum": ["eip155:84532", "eip155:8453"]
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
                      "enum": ["eip155:84532", "eip155:8453"]
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

## GET /v1/wallet/batches

Operation: `listWalletBatches`.

Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

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
            "enum": ["0x14a34", "0x2105"]
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

## POST /v1/provider/applications/{applicationId}/policy/review

Operation: `setRuntimeReviewMode`.

Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `applicationId`   | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{64}$"}`                                                        |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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

## GET /v1/application/policy

Operation: `readRuntimeConfiguration`.

Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

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
              "enum": ["eip155:84532", "eip155:8453"]
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

## GET /v1/provider/applications/{applicationId}/policy

Operation: `readRuntimeApplicationConfiguration`.

Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter       | Location | Required | Schema                                         |
| --------------- | -------- | -------- | ---------------------------------------------- |
| `applicationId` | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{64}$"}` |

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
              "enum": ["eip155:84532", "eip155:8453"]
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

## GET /v1/application/policy/revisions/{revision}

Operation: `readRuntimeConfigurationRevision`.

Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter  | Location | Required | Schema                                                  |
| ---------- | -------- | -------- | ------------------------------------------------------- |
| `revision` | path     | yes      | `{"type":"string","pattern":"^(0\|[1-9][0-9]{0,19})$"}` |

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
              "enum": ["eip155:84532", "eip155:8453"]
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

## POST /v1/application/policy/proposals

Operation: `proposeRuntimeConfiguration`.

Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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
          "enum": ["eip155:84532", "eip155:8453"]
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
          "enum": ["eip155:84532", "eip155:8453"]
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

## GET /v1/application/policy/proposals/{proposalId}

Operation: `readRuntimeConfigurationProposal`.

Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter    | Location | Required | Schema                                                                                                |
| ------------ | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `proposalId` | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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
          "enum": ["eip155:84532", "eip155:8453"]
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

## POST /v1/provider/policy/proposals/{proposalId}/publish

Operation: `publishRuntimeConfiguration`.

Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `proposalId`      | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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
          "enum": ["eip155:84532", "eip155:8453"]
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

## POST /v1/provider/applications/{applicationId}/policy/revisions

Operation: `updateRuntimeConfiguration`.

Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `applicationId`   | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{64}$"}`                                                        |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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
          "enum": ["eip155:84532", "eip155:8453"]
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
          "enum": ["eip155:84532", "eip155:8453"]
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

## POST /v1/provider/claim

Operation: `claimProviderInstallation`.

Atomically claim a new installation using its privately delivered single-use credential. Expires 30 minutes after first initialization. Restart never reopens claiming. Establishes administration only.

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

## GET /v1/provider/status

Operation: `readProviderStatus`.

Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending.

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
    "wallet_operations_enabled": {
      "type": "boolean"
    }
  }
}
```

## GET /v1/provider/identities

Operation: `listProviderIdentities`.

Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending.

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

## POST /v1/provider/identities

Operation: `createProviderIdentity`.

Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending.

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

## PATCH /v1/provider/identities/{id}

Operation: `updateProviderIdentity`.

Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending.

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
    "permissions": {
      "type": "array",
      "minItems": 1,
      "maxItems": 3,
      "uniqueItems": true,
      "items": {
        "enum": ["account:read", "contracts:request", "operations:request"]
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

## POST /v1/provider/identities/{id}/credentials

Operation: `rotateProviderIdentityCredential`.

Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending.

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
