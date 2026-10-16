# HTTP schema reference

Generated from [provider-api.json](../spec/provider-api.json); do not edit manually.
Read the [HTTP usage guide](http-api.md) for authentication, scopes, error handling
and integration profiles. Optional-profile routes are present in the contract even
when the corresponding service is not configured. Read [roles and terms](concepts.md)
for application clients, account owners, authority and journals.

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
      "enum": ["provider-signing-preview"]
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
        "enum": ["provider-authorized-erc3009-v1"]
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
    "address": {
      "type": "string",
      "pattern": "^0x[0-9a-fA-F]{40}$"
    }
  }
}
```

## POST /v1/actions/{actionId}/sign

Operation: `signAction`.

Requires current owner/grant/KYC authority and a durable attempt. Never retry an unknown outcome blindly. The body must be an empty object.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `actionId`        | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
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
  "required": ["signature"],
  "properties": {
    "signature": {
      "type": "string",
      "pattern": "^0x[0-9a-fA-F]{130}$"
    }
  }
}
```

## POST /v1/transfer-authorizations

Operation: `requestTransferAuthorization`.

Fixed Base Sepolia ERC-3009 transfer authorization. Explicit transfer delegation, current owner-bound access, identity and provider policy authorization are required. No per-transfer owner prompt. No broadcast or settlement.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["account_id", "recipient", "amount"],
  "properties": {
    "account_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "recipient": {
      "type": "string",
      "pattern": "^0x[0-9a-fA-F]{40}$"
    },
    "amount": {
      "type": "string",
      "pattern": "^[1-9][0-9]{0,77}$"
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
  "required": [
    "action_id",
    "account_id",
    "status",
    "expires_at",
    "payload_hash",
    "payload"
  ],
  "properties": {
    "action_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "account_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "status": {
      "type": "string",
      "enum": ["authorizing", "authorized", "denied"]
    },
    "expires_at": {
      "type": "string",
      "format": "date-time"
    },
    "payload_hash": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    },
    "payload": {
      "type": "object",
      "additionalProperties": false,
      "required": ["domain", "types", "primaryType", "message"],
      "properties": {
        "primaryType": {
          "type": "string",
          "enum": ["TransferWithAuthorization"]
        },
        "domain": {
          "type": "object",
          "additionalProperties": false,
          "required": ["name", "version", "chainId", "verifyingContract"],
          "properties": {
            "name": {
              "type": "string"
            },
            "version": {
              "type": "string"
            },
            "chainId": {
              "type": "string",
              "enum": ["84532"]
            },
            "verifyingContract": {
              "type": "string",
              "pattern": "^0x[0-9a-fA-F]{40}$"
            }
          }
        },
        "types": {
          "type": "object",
          "additionalProperties": false,
          "required": ["TransferWithAuthorization"],
          "properties": {
            "TransferWithAuthorization": {
              "type": "array",
              "minItems": 6,
              "maxItems": 6,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["name", "type"],
                "properties": {
                  "name": {
                    "type": "string",
                    "enum": [
                      "from",
                      "to",
                      "value",
                      "validAfter",
                      "validBefore",
                      "nonce"
                    ]
                  },
                  "type": {
                    "type": "string",
                    "enum": ["address", "uint256", "bytes32"]
                  }
                }
              }
            }
          }
        },
        "message": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "from",
            "to",
            "value",
            "validAfter",
            "validBefore",
            "nonce"
          ],
          "properties": {
            "from": {
              "type": "string",
              "pattern": "^0x[0-9a-fA-F]{40}$"
            },
            "to": {
              "type": "string",
              "pattern": "^0x[0-9a-fA-F]{40}$"
            },
            "value": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            },
            "validAfter": {
              "type": "string",
              "enum": ["0"]
            },
            "validBefore": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            },
            "nonce": {
              "type": "string",
              "pattern": "^0x[0-9a-f]{64}$"
            }
          }
        }
      }
    }
  }
}
```

## GET /v1/transfer-authorizations/{actionId}

Operation: `getTransferAuthorization`.

Fixed Base Sepolia ERC-3009 transfer authorization. Explicit transfer delegation, current owner-bound access, identity and provider policy authorization are required. No per-transfer owner prompt. No broadcast or settlement.

| Parameter  | Location | Required | Schema                                                                                                |
| ---------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `actionId` | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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
    "action_id",
    "account_id",
    "status",
    "expires_at",
    "payload_hash",
    "payload"
  ],
  "properties": {
    "action_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "account_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "status": {
      "type": "string",
      "enum": ["authorizing", "authorized", "denied"]
    },
    "expires_at": {
      "type": "string",
      "format": "date-time"
    },
    "payload_hash": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    },
    "payload": {
      "type": "object",
      "additionalProperties": false,
      "required": ["domain", "types", "primaryType", "message"],
      "properties": {
        "primaryType": {
          "type": "string",
          "enum": ["TransferWithAuthorization"]
        },
        "domain": {
          "type": "object",
          "additionalProperties": false,
          "required": ["name", "version", "chainId", "verifyingContract"],
          "properties": {
            "name": {
              "type": "string"
            },
            "version": {
              "type": "string"
            },
            "chainId": {
              "type": "string",
              "enum": ["84532"]
            },
            "verifyingContract": {
              "type": "string",
              "pattern": "^0x[0-9a-fA-F]{40}$"
            }
          }
        },
        "types": {
          "type": "object",
          "additionalProperties": false,
          "required": ["TransferWithAuthorization"],
          "properties": {
            "TransferWithAuthorization": {
              "type": "array",
              "minItems": 6,
              "maxItems": 6,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["name", "type"],
                "properties": {
                  "name": {
                    "type": "string",
                    "enum": [
                      "from",
                      "to",
                      "value",
                      "validAfter",
                      "validBefore",
                      "nonce"
                    ]
                  },
                  "type": {
                    "type": "string",
                    "enum": ["address", "uint256", "bytes32"]
                  }
                }
              }
            }
          }
        },
        "message": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "from",
            "to",
            "value",
            "validAfter",
            "validBefore",
            "nonce"
          ],
          "properties": {
            "from": {
              "type": "string",
              "pattern": "^0x[0-9a-fA-F]{40}$"
            },
            "to": {
              "type": "string",
              "pattern": "^0x[0-9a-fA-F]{40}$"
            },
            "value": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            },
            "validAfter": {
              "type": "string",
              "enum": ["0"]
            },
            "validBefore": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            },
            "nonce": {
              "type": "string",
              "pattern": "^0x[0-9a-f]{64}$"
            }
          }
        }
      }
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
                "transfers:request"
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
  "required": ["request_id", "status", "consent_url"],
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
      "format": "uri"
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
        "enum": ["account:read", "operations:request", "transfers:request"]
      }
    },
    "expires_at": {
      "type": "string",
      "format": "date-time"
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
  "required": ["request_id", "status", "consent_url"],
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
      "format": "uri"
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
        "enum": ["account:read", "operations:request", "transfers:request"]
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
  "required": ["request_id", "status", "consent_url"],
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
      "format": "uri"
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
        "enum": ["account:read", "operations:request", "transfers:request"]
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
