# HTTP schema reference

Use these request and response schemas with the
[implemented provider contract](../spec/provider-api.json). For contributing or
regeneration, see the [development guide](../CONTRIBUTING.md#development).
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
        "enum": [
          "provider-authorized-erc3009-v1",
          "provider-approved-contracts-v1"
        ]
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
  "oneOf": [
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
    },
    {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "action_id",
        "account_id",
        "status",
        "expires_at",
        "payload_hash",
        "payload",
        "intent"
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
          "required": ["primaryType", "domain", "types", "message"],
          "properties": {
            "primaryType": {
              "type": "string",
              "enum": ["SafeTx"]
            },
            "domain": {
              "type": "object",
              "additionalProperties": false,
              "required": ["chainId", "verifyingContract"],
              "properties": {
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
              "required": ["SafeTx"],
              "properties": {
                "SafeTx": {
                  "type": "array",
                  "minItems": 10,
                  "maxItems": 10,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["name", "type"],
                    "properties": {
                      "name": {
                        "type": "string",
                        "enum": [
                          "to",
                          "value",
                          "data",
                          "operation",
                          "safeTxGas",
                          "baseGas",
                          "gasPrice",
                          "gasToken",
                          "refundReceiver",
                          "nonce"
                        ]
                      },
                      "type": {
                        "type": "string",
                        "enum": ["address", "uint256", "bytes", "uint8"]
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
                "to",
                "value",
                "data",
                "operation",
                "safeTxGas",
                "baseGas",
                "gasPrice",
                "gasToken",
                "refundReceiver",
                "nonce"
              ],
              "properties": {
                "to": {
                  "type": "string",
                  "pattern": "^0x[0-9a-fA-F]{40}$"
                },
                "value": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "data": {
                  "type": "string",
                  "pattern": "^0x(?:[0-9a-f]{2})*$",
                  "maxLength": 8192
                },
                "operation": {
                  "type": "string",
                  "enum": ["0", "1"]
                },
                "safeTxGas": {
                  "type": "string",
                  "enum": ["0"]
                },
                "baseGas": {
                  "type": "string",
                  "enum": ["0"]
                },
                "gasPrice": {
                  "type": "string",
                  "enum": ["0"]
                },
                "gasToken": {
                  "type": "string",
                  "enum": ["0x0000000000000000000000000000000000000000"]
                },
                "refundReceiver": {
                  "type": "string",
                  "enum": ["0x0000000000000000000000000000000000000000"]
                },
                "nonce": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                }
              }
            }
          }
        },
        "intent": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "version",
            "mechanism",
            "input",
            "account",
            "multiSend",
            "calls",
            "contracts",
            "effects",
            "nonce"
          ],
          "properties": {
            "version": {
              "type": "string",
              "enum": ["1"]
            },
            "mechanism": {
              "type": "string",
              "enum": ["safe-1.4.1"]
            },
            "input": {
              "oneOf": [
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["account_id", "kind", "calls"],
                  "properties": {
                    "account_id": {
                      "type": "string",
                      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
                    },
                    "kind": {
                      "type": "string",
                      "enum": ["contract-call"]
                    },
                    "calls": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 16,
                      "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["to", "value", "data"],
                        "properties": {
                          "to": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "value": {
                            "type": "string",
                            "pattern": "^(0|[1-9][0-9]{0,77})$"
                          },
                          "data": {
                            "type": "string",
                            "pattern": "^0x(?:[0-9a-f]{2}){4,4096}$"
                          }
                        }
                      }
                    }
                  }
                },
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "account_id",
                    "kind",
                    "route",
                    "amount_in",
                    "minimum_out",
                    "deadline"
                  ],
                  "properties": {
                    "account_id": {
                      "type": "string",
                      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
                    },
                    "kind": {
                      "type": "string",
                      "enum": ["swap"]
                    },
                    "route": {
                      "type": "string",
                      "pattern": "^[A-Za-z0-9._-]{1,64}$"
                    },
                    "amount_in": {
                      "type": "string",
                      "pattern": "^(0|[1-9][0-9]{0,77})$"
                    },
                    "minimum_out": {
                      "type": "string",
                      "pattern": "^(0|[1-9][0-9]{0,77})$"
                    },
                    "deadline": {
                      "type": "string",
                      "pattern": "^(0|[1-9][0-9]{0,77})$"
                    }
                  }
                },
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "account_id",
                    "kind",
                    "route",
                    "assets",
                    "minimum_shares"
                  ],
                  "properties": {
                    "account_id": {
                      "type": "string",
                      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
                    },
                    "kind": {
                      "type": "string",
                      "enum": ["vault-deposit"]
                    },
                    "route": {
                      "type": "string",
                      "pattern": "^[A-Za-z0-9._-]{1,64}$"
                    },
                    "assets": {
                      "type": "string",
                      "pattern": "^(0|[1-9][0-9]{0,77})$"
                    },
                    "minimum_shares": {
                      "type": "string",
                      "pattern": "^(0|[1-9][0-9]{0,77})$"
                    }
                  }
                }
              ]
            },
            "account": {
              "type": "object",
              "additionalProperties": false,
              "required": ["address", "codeHash", "accountId", "singleton"],
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
                },
                "accountId": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
                },
                "singleton": {
                  "type": "object",
                  "additionalProperties": false,
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
                }
              }
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
            "calls": {
              "type": "array",
              "minItems": 1,
              "maxItems": 16,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["to", "value", "data"],
                "properties": {
                  "to": {
                    "type": "string",
                    "pattern": "^0x[0-9a-fA-F]{40}$"
                  },
                  "value": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  },
                  "data": {
                    "type": "string",
                    "pattern": "^0x(?:[0-9a-f]{2}){4,4096}$"
                  }
                }
              }
            },
            "contracts": {
              "type": "array",
              "maxItems": 32,
              "items": {
                "type": "object",
                "additionalProperties": false,
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
              }
            },
            "effects": {
              "type": "array",
              "maxItems": 16,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["token", "from", "to", "minimum"],
                "properties": {
                  "token": {
                    "type": "string",
                    "pattern": "^0x[0-9a-fA-F]{40}$"
                  },
                  "from": {
                    "type": "string"
                  },
                  "to": {
                    "type": "string"
                  },
                  "minimum": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  },
                  "maximum": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            },
            "nonce": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            }
          }
        }
      }
    }
  ]
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
  "oneOf": [
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
    },
    {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "action_id",
        "account_id",
        "status",
        "expires_at",
        "payload_hash",
        "payload",
        "intent"
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
          "required": ["primaryType", "domain", "types", "message"],
          "properties": {
            "primaryType": {
              "type": "string",
              "enum": ["SafeTx"]
            },
            "domain": {
              "type": "object",
              "additionalProperties": false,
              "required": ["chainId", "verifyingContract"],
              "properties": {
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
              "required": ["SafeTx"],
              "properties": {
                "SafeTx": {
                  "type": "array",
                  "minItems": 10,
                  "maxItems": 10,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["name", "type"],
                    "properties": {
                      "name": {
                        "type": "string",
                        "enum": [
                          "to",
                          "value",
                          "data",
                          "operation",
                          "safeTxGas",
                          "baseGas",
                          "gasPrice",
                          "gasToken",
                          "refundReceiver",
                          "nonce"
                        ]
                      },
                      "type": {
                        "type": "string",
                        "enum": ["address", "uint256", "bytes", "uint8"]
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
                "to",
                "value",
                "data",
                "operation",
                "safeTxGas",
                "baseGas",
                "gasPrice",
                "gasToken",
                "refundReceiver",
                "nonce"
              ],
              "properties": {
                "to": {
                  "type": "string",
                  "pattern": "^0x[0-9a-fA-F]{40}$"
                },
                "value": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "data": {
                  "type": "string",
                  "pattern": "^0x(?:[0-9a-f]{2})*$",
                  "maxLength": 8192
                },
                "operation": {
                  "type": "string",
                  "enum": ["0", "1"]
                },
                "safeTxGas": {
                  "type": "string",
                  "enum": ["0"]
                },
                "baseGas": {
                  "type": "string",
                  "enum": ["0"]
                },
                "gasPrice": {
                  "type": "string",
                  "enum": ["0"]
                },
                "gasToken": {
                  "type": "string",
                  "enum": ["0x0000000000000000000000000000000000000000"]
                },
                "refundReceiver": {
                  "type": "string",
                  "enum": ["0x0000000000000000000000000000000000000000"]
                },
                "nonce": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                }
              }
            }
          }
        },
        "intent": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "version",
            "mechanism",
            "input",
            "account",
            "multiSend",
            "calls",
            "contracts",
            "effects",
            "nonce"
          ],
          "properties": {
            "version": {
              "type": "string",
              "enum": ["1"]
            },
            "mechanism": {
              "type": "string",
              "enum": ["safe-1.4.1"]
            },
            "input": {
              "oneOf": [
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["account_id", "kind", "calls"],
                  "properties": {
                    "account_id": {
                      "type": "string",
                      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
                    },
                    "kind": {
                      "type": "string",
                      "enum": ["contract-call"]
                    },
                    "calls": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 16,
                      "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["to", "value", "data"],
                        "properties": {
                          "to": {
                            "type": "string",
                            "pattern": "^0x[0-9a-fA-F]{40}$"
                          },
                          "value": {
                            "type": "string",
                            "pattern": "^(0|[1-9][0-9]{0,77})$"
                          },
                          "data": {
                            "type": "string",
                            "pattern": "^0x(?:[0-9a-f]{2}){4,4096}$"
                          }
                        }
                      }
                    }
                  }
                },
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "account_id",
                    "kind",
                    "route",
                    "amount_in",
                    "minimum_out",
                    "deadline"
                  ],
                  "properties": {
                    "account_id": {
                      "type": "string",
                      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
                    },
                    "kind": {
                      "type": "string",
                      "enum": ["swap"]
                    },
                    "route": {
                      "type": "string",
                      "pattern": "^[A-Za-z0-9._-]{1,64}$"
                    },
                    "amount_in": {
                      "type": "string",
                      "pattern": "^(0|[1-9][0-9]{0,77})$"
                    },
                    "minimum_out": {
                      "type": "string",
                      "pattern": "^(0|[1-9][0-9]{0,77})$"
                    },
                    "deadline": {
                      "type": "string",
                      "pattern": "^(0|[1-9][0-9]{0,77})$"
                    }
                  }
                },
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "account_id",
                    "kind",
                    "route",
                    "assets",
                    "minimum_shares"
                  ],
                  "properties": {
                    "account_id": {
                      "type": "string",
                      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
                    },
                    "kind": {
                      "type": "string",
                      "enum": ["vault-deposit"]
                    },
                    "route": {
                      "type": "string",
                      "pattern": "^[A-Za-z0-9._-]{1,64}$"
                    },
                    "assets": {
                      "type": "string",
                      "pattern": "^(0|[1-9][0-9]{0,77})$"
                    },
                    "minimum_shares": {
                      "type": "string",
                      "pattern": "^(0|[1-9][0-9]{0,77})$"
                    }
                  }
                }
              ]
            },
            "account": {
              "type": "object",
              "additionalProperties": false,
              "required": ["address", "codeHash", "accountId", "singleton"],
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
                },
                "accountId": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
                },
                "singleton": {
                  "type": "object",
                  "additionalProperties": false,
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
                }
              }
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
            "calls": {
              "type": "array",
              "minItems": 1,
              "maxItems": 16,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["to", "value", "data"],
                "properties": {
                  "to": {
                    "type": "string",
                    "pattern": "^0x[0-9a-fA-F]{40}$"
                  },
                  "value": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  },
                  "data": {
                    "type": "string",
                    "pattern": "^0x(?:[0-9a-f]{2}){4,4096}$"
                  }
                }
              }
            },
            "contracts": {
              "type": "array",
              "maxItems": 32,
              "items": {
                "type": "object",
                "additionalProperties": false,
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
              }
            },
            "effects": {
              "type": "array",
              "maxItems": 16,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["token", "from", "to", "minimum"],
                "properties": {
                  "token": {
                    "type": "string",
                    "pattern": "^0x[0-9a-fA-F]{40}$"
                  },
                  "from": {
                    "type": "string"
                  },
                  "to": {
                    "type": "string"
                  },
                  "minimum": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  },
                  "maximum": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  }
                }
              }
            },
            "nonce": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            }
          }
        }
      }
    }
  ]
}
```

## POST /v1/contract-call-requests

Operation: `enqueueContractCall`.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

Request body (application/json):

```json
{
  "oneOf": [
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["account_id", "kind", "calls"],
      "properties": {
        "account_id": {
          "type": "string",
          "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        },
        "kind": {
          "type": "string",
          "enum": ["contract-call"]
        },
        "calls": {
          "type": "array",
          "minItems": 1,
          "maxItems": 16,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["to", "value", "data"],
            "properties": {
              "to": {
                "type": "string",
                "pattern": "^0x[0-9a-fA-F]{40}$"
              },
              "value": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]{0,77})$"
              },
              "data": {
                "type": "string",
                "pattern": "^0x(?:[0-9a-f]{2}){4,4096}$"
              }
            }
          }
        }
      }
    },
    {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "account_id",
        "kind",
        "route",
        "amount_in",
        "minimum_out",
        "deadline"
      ],
      "properties": {
        "account_id": {
          "type": "string",
          "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        },
        "kind": {
          "type": "string",
          "enum": ["swap"]
        },
        "route": {
          "type": "string",
          "pattern": "^[A-Za-z0-9._-]{1,64}$"
        },
        "amount_in": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "minimum_out": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "deadline": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        }
      }
    },
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["account_id", "kind", "route", "assets", "minimum_shares"],
      "properties": {
        "account_id": {
          "type": "string",
          "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        },
        "kind": {
          "type": "string",
          "enum": ["vault-deposit"]
        },
        "route": {
          "type": "string",
          "pattern": "^[A-Za-z0-9._-]{1,64}$"
        },
        "assets": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "minimum_shares": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        }
      }
    }
  ]
}
```

| Status | Content type     | Description      |
| ------ | ---------------- | ---------------- |
| 202    | application/json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "request_id",
    "account_id",
    "status",
    "expires_at",
    "next_poll_after_ms"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "account_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "action_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "status": {
      "type": "string",
      "enum": [
        "queued",
        "executing",
        "succeeded",
        "cancelled",
        "expired",
        "blocked"
      ]
    },
    "expires_at": {
      "type": "string",
      "format": "date-time"
    },
    "next_poll_after_ms": {
      "type": "integer",
      "minimum": 5000,
      "maximum": 300000
    }
  }
}
```

## GET /v1/contract-call-requests/{requestId}

Operation: `readContractCallRequest`.

| Parameter   | Location | Required | Schema                                                                                                |
| ----------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `requestId` | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

| Status | Content type     | Description      |
| ------ | ---------------- | ---------------- |
| 200    | application/json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "request_id",
    "account_id",
    "status",
    "expires_at",
    "next_poll_after_ms"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "account_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "action_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "status": {
      "type": "string",
      "enum": [
        "queued",
        "executing",
        "succeeded",
        "cancelled",
        "expired",
        "blocked"
      ]
    },
    "expires_at": {
      "type": "string",
      "format": "date-time"
    },
    "next_poll_after_ms": {
      "type": "integer",
      "minimum": 5000,
      "maximum": 300000
    }
  }
}
```

## POST /v1/contract-call-requests/{requestId}/cancel

Operation: `cancelContractCallRequest`.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `requestId`       | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
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

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "request_id",
    "account_id",
    "status",
    "expires_at",
    "next_poll_after_ms"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "account_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "action_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "status": {
      "type": "string",
      "enum": [
        "queued",
        "executing",
        "succeeded",
        "cancelled",
        "expired",
        "blocked"
      ]
    },
    "expires_at": {
      "type": "string",
      "format": "date-time"
    },
    "next_poll_after_ms": {
      "type": "integer",
      "minimum": 5000,
      "maximum": 300000
    }
  }
}
```

## POST /v1/actions/contract-calls

Operation: `requestContractCall`.

Request an immutable approved contract call, Uniswap V3 exact-input swap or bounded ERC-4626 router deposit. Requires separately consented contracts:request delegation, current owner/grant/KYC/consent and configured target policies. The service constructs the Safe transaction and reserves its nonce; callers never supply signatures or a signing payload.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

Request body (application/json):

```json
{
  "oneOf": [
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["account_id", "kind", "calls"],
      "properties": {
        "account_id": {
          "type": "string",
          "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        },
        "kind": {
          "type": "string",
          "enum": ["contract-call"]
        },
        "calls": {
          "type": "array",
          "minItems": 1,
          "maxItems": 16,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["to", "value", "data"],
            "properties": {
              "to": {
                "type": "string",
                "pattern": "^0x[0-9a-fA-F]{40}$"
              },
              "value": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]{0,77})$"
              },
              "data": {
                "type": "string",
                "pattern": "^0x(?:[0-9a-f]{2}){4,4096}$"
              }
            }
          }
        }
      }
    },
    {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "account_id",
        "kind",
        "route",
        "amount_in",
        "minimum_out",
        "deadline"
      ],
      "properties": {
        "account_id": {
          "type": "string",
          "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        },
        "kind": {
          "type": "string",
          "enum": ["swap"]
        },
        "route": {
          "type": "string",
          "pattern": "^[A-Za-z0-9._-]{1,64}$"
        },
        "amount_in": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "minimum_out": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "deadline": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        }
      }
    },
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["account_id", "kind", "route", "assets", "minimum_shares"],
      "properties": {
        "account_id": {
          "type": "string",
          "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        },
        "kind": {
          "type": "string",
          "enum": ["vault-deposit"]
        },
        "route": {
          "type": "string",
          "pattern": "^[A-Za-z0-9._-]{1,64}$"
        },
        "assets": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "minimum_shares": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        }
      }
    }
  ]
}
```

| Status | Content type     | Description      |
| ------ | ---------------- | ---------------- |
| 200    | application/json | Default Response |

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
    "payload",
    "intent"
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
      "type": "string"
    },
    "expires_at": {
      "type": "string",
      "format": "date-time"
    },
    "payload_hash": {
      "type": "string"
    },
    "payload": {
      "type": "object",
      "additionalProperties": false,
      "required": ["primaryType", "domain", "types", "message"],
      "properties": {
        "primaryType": {
          "type": "string",
          "enum": ["SafeTx"]
        },
        "domain": {
          "type": "object",
          "additionalProperties": false,
          "required": ["chainId", "verifyingContract"],
          "properties": {
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
          "required": ["SafeTx"],
          "properties": {
            "SafeTx": {
              "type": "array",
              "minItems": 10,
              "maxItems": 10,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["name", "type"],
                "properties": {
                  "name": {
                    "type": "string",
                    "enum": [
                      "to",
                      "value",
                      "data",
                      "operation",
                      "safeTxGas",
                      "baseGas",
                      "gasPrice",
                      "gasToken",
                      "refundReceiver",
                      "nonce"
                    ]
                  },
                  "type": {
                    "type": "string",
                    "enum": ["address", "uint256", "bytes", "uint8"]
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
            "to",
            "value",
            "data",
            "operation",
            "safeTxGas",
            "baseGas",
            "gasPrice",
            "gasToken",
            "refundReceiver",
            "nonce"
          ],
          "properties": {
            "to": {
              "type": "string",
              "pattern": "^0x[0-9a-fA-F]{40}$"
            },
            "value": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            },
            "data": {
              "type": "string",
              "pattern": "^0x(?:[0-9a-f]{2})*$",
              "maxLength": 8192
            },
            "operation": {
              "type": "string",
              "enum": ["0", "1"]
            },
            "safeTxGas": {
              "type": "string",
              "enum": ["0"]
            },
            "baseGas": {
              "type": "string",
              "enum": ["0"]
            },
            "gasPrice": {
              "type": "string",
              "enum": ["0"]
            },
            "gasToken": {
              "type": "string",
              "enum": ["0x0000000000000000000000000000000000000000"]
            },
            "refundReceiver": {
              "type": "string",
              "enum": ["0x0000000000000000000000000000000000000000"]
            },
            "nonce": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            }
          }
        }
      }
    },
    "intent": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "version",
        "mechanism",
        "input",
        "account",
        "multiSend",
        "calls",
        "contracts",
        "effects",
        "nonce"
      ],
      "properties": {
        "version": {
          "type": "string",
          "enum": ["1"]
        },
        "mechanism": {
          "type": "string",
          "enum": ["safe-1.4.1"]
        },
        "input": {
          "oneOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "required": ["account_id", "kind", "calls"],
              "properties": {
                "account_id": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
                },
                "kind": {
                  "type": "string",
                  "enum": ["contract-call"]
                },
                "calls": {
                  "type": "array",
                  "minItems": 1,
                  "maxItems": 16,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["to", "value", "data"],
                    "properties": {
                      "to": {
                        "type": "string",
                        "pattern": "^0x[0-9a-fA-F]{40}$"
                      },
                      "value": {
                        "type": "string",
                        "pattern": "^(0|[1-9][0-9]{0,77})$"
                      },
                      "data": {
                        "type": "string",
                        "pattern": "^0x(?:[0-9a-f]{2}){4,4096}$"
                      }
                    }
                  }
                }
              }
            },
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "account_id",
                "kind",
                "route",
                "amount_in",
                "minimum_out",
                "deadline"
              ],
              "properties": {
                "account_id": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
                },
                "kind": {
                  "type": "string",
                  "enum": ["swap"]
                },
                "route": {
                  "type": "string",
                  "pattern": "^[A-Za-z0-9._-]{1,64}$"
                },
                "amount_in": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "minimum_out": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "deadline": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                }
              }
            },
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "account_id",
                "kind",
                "route",
                "assets",
                "minimum_shares"
              ],
              "properties": {
                "account_id": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
                },
                "kind": {
                  "type": "string",
                  "enum": ["vault-deposit"]
                },
                "route": {
                  "type": "string",
                  "pattern": "^[A-Za-z0-9._-]{1,64}$"
                },
                "assets": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "minimum_shares": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                }
              }
            }
          ]
        },
        "account": {
          "type": "object",
          "additionalProperties": false,
          "required": ["address", "codeHash", "accountId", "singleton"],
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
            },
            "accountId": {
              "type": "string",
              "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
            },
            "singleton": {
              "type": "object",
              "additionalProperties": false,
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
            }
          }
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
        "calls": {
          "type": "array",
          "minItems": 1,
          "maxItems": 16,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["to", "value", "data"],
            "properties": {
              "to": {
                "type": "string",
                "pattern": "^0x[0-9a-fA-F]{40}$"
              },
              "value": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]{0,77})$"
              },
              "data": {
                "type": "string",
                "pattern": "^0x(?:[0-9a-f]{2}){4,4096}$"
              }
            }
          }
        },
        "contracts": {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
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
          }
        },
        "effects": {
          "type": "array",
          "maxItems": 16,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["token", "from", "to", "minimum"],
            "properties": {
              "token": {
                "type": "string",
                "pattern": "^0x[0-9a-fA-F]{40}$"
              },
              "from": {
                "type": "string"
              },
              "to": {
                "type": "string"
              },
              "minimum": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]{0,77})$"
              },
              "maximum": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]{0,77})$"
              }
            }
          }
        },
        "nonce": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        }
      }
    }
  }
}
```

## POST /v1/internal/execution-authority

Operation: `checkExecutionAuthority`.

Read-only callback for the configured designated executor. Requires a pinned signed service request, exact stored plan/attempt and an unexpired handoff lease. Rechecks current owner, grant, KYC, consent, immutable approval and active revision. Application OAuth tokens do not authenticate this endpoint.

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "execution_id",
    "action_id",
    "plan_hash",
    "request_hash",
    "provider_id",
    "provider_revision"
  ],
  "properties": {
    "provider_id": {
      "type": "string",
      "pattern": "^[A-Za-z0-9._-]{1,64}$"
    },
    "provider_revision": {
      "type": "string",
      "pattern": "^[1-9][0-9]{0,19}$"
    },
    "execution_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "action_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "plan_hash": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "request_hash": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    }
  }
}
```

| Status | Content type     | Description      |
| ------ | ---------------- | ---------------- |
| 200    | application/json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "allowed",
    "provider_id",
    "provider_revision",
    "execution_id",
    "action_id",
    "plan_hash",
    "request_hash"
  ],
  "properties": {
    "action_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "allowed": {
      "type": "boolean",
      "enum": [true]
    },
    "provider_id": {
      "type": "string",
      "pattern": "^[A-Za-z0-9._-]{1,64}$"
    },
    "provider_revision": {
      "type": "string",
      "pattern": "^[1-9][0-9]{0,19}$"
    },
    "execution_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "plan_hash": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "request_hash": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    }
  }
}
```

## GET /v1/execution-capabilities

Operation: `getExecutionCapabilities`.

Public versioned execution discovery. Profile implementation, configuration and service readiness do not establish live-provider certification or production custody acceptance. Clients must select an exact supported ID/revision and ignore unknown profiles.

| Status | Content type     | Description      |
| ------ | ---------------- | ---------------- |
| 200    | application/json | Default Response |

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["contract_version", "profiles"],
  "properties": {
    "contract_version": {
      "type": "string",
      "enum": ["1"]
    },
    "profiles": {
      "type": "array",
      "maxItems": 32,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "revision",
          "implemented",
          "configured",
          "ready",
          "chain_id",
          "account_type",
          "signing",
          "token_authorization",
          "submission",
          "verification",
          "finality",
          "minimum_rpc_sources",
          "execute_scopes",
          "read_scopes"
        ],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9._-]{0,63}$"
          },
          "revision": {
            "type": "string",
            "pattern": "^[1-9][0-9]{0,19}$"
          },
          "implemented": {
            "type": "boolean"
          },
          "configured": {
            "type": "boolean"
          },
          "ready": {
            "type": "boolean"
          },
          "chain_id": {
            "type": "string"
          },
          "account_type": {
            "type": "string"
          },
          "signing": {
            "type": "string"
          },
          "token_authorization": {
            "type": "string"
          },
          "submission": {
            "type": "string"
          },
          "verification": {
            "type": "string"
          },
          "finality": {
            "type": "string"
          },
          "minimum_rpc_sources": {
            "type": "integer",
            "minimum": 2
          },
          "execute_scopes": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "read_scopes": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        }
      }
    }
  }
}
```

## POST /v1/actions/{actionId}/reconcile

Operation: `reconcileExecution`.

| Parameter                    | Location | Required | Schema                                                                                                |
| ---------------------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `actionId`                   | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `execution-profile`          | header   | yes      | `{"type":"string","enum":["erc3009-relayer-v1","erc3009-executor-v1","approved-evm-executor-v1"]}`    |
| `execution-profile-revision` | header   | yes      | `{"type":"string","enum":["1"]}`                                                                      |
| `idempotency-key`            | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

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

Success response schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "profile",
    "profile_revision",
    "action_id",
    "execution_id",
    "dispatch_status",
    "observation_revision",
    "next_poll_after_ms",
    "chain_status",
    "verification",
    "outcome",
    "settlement",
    "observed_at"
  ],
  "properties": {
    "recovery": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "state",
        "reason",
        "observed_at",
        "pending_age_ms",
        "quarantined",
        "next_action"
      ],
      "properties": {
        "state": {
          "type": "string",
          "enum": [
            "observing",
            "suspected-stuck",
            "awaiting-finality",
            "finalized",
            "unavailable",
            "blocked"
          ]
        },
        "reason": {
          "type": "string",
          "enum": [
            "within-threshold",
            "pending-too-long",
            "nonce-gap-suspected",
            "nonce-consumed-without-result",
            "safe-nonce-advanced",
            "insufficient-sponsor-funds",
            "fee-cap-below-base-fee",
            "transaction-not-visible",
            "provider-nonce-conflict",
            "evidence-unavailable",
            "awaiting-finality",
            "verified-finality"
          ]
        },
        "observed_at": {
          "type": "string",
          "format": "date-time"
        },
        "pending_age_ms": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991
        },
        "quarantined": {
          "type": "boolean"
        },
        "sponsor_nonce": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "confirmed_nonce": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "finalized_nonce": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "safe_nonce": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "next_action": {
          "type": "string",
          "enum": [
            "wait",
            "restore-evidence",
            "fund-sponsor",
            "review-provider-fees",
            "review-provider-nonces",
            "reconcile",
            "operator-review"
          ]
        }
      }
    },
    "profile": {
      "type": "string",
      "enum": [
        "erc3009-relayer-v1",
        "erc3009-executor-v1",
        "approved-evm-executor-v1"
      ]
    },
    "outcome_scope": {
      "type": "string",
      "enum": [
        "token-transfer",
        "contract-execution",
        "swap-effects",
        "vault-deposit-effects"
      ],
      "description": "What verified success establishes: exact token transfer, successful approved calls, or the required swap/vault asset effects. Contract execution alone does not prove an arbitrary business outcome."
    },
    "profile_revision": {
      "type": "string",
      "enum": ["1"]
    },
    "action_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "execution_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "dispatch_status": {
      "type": "string",
      "enum": ["not_started", "pending", "accepted", "unknown", "failed"],
      "description": "Durable submission state. Accepted identifies a durable executor/provider acceptance; it is not chain inclusion or settlement."
    },
    "observation_revision": {
      "type": "integer",
      "minimum": 0
    },
    "next_poll_after_ms": {
      "type": "integer",
      "minimum": 5000,
      "maximum": 300000
    },
    "chain_status": {
      "type": "string",
      "enum": [
        "unobserved",
        "pending",
        "included",
        "safe",
        "finalized",
        "reorged"
      ]
    },
    "verification": {
      "type": "string",
      "enum": ["unverified", "rpc-quorum"],
      "description": "RPC quorum means agreement of all configured trusted RPC sources on exact receipt effects and canonical block evidence, not a cryptographic light-client proof."
    },
    "outcome": {
      "type": "string",
      "enum": ["unknown", "succeeded", "reverted"]
    },
    "settlement": {
      "type": "string",
      "enum": ["pending", "succeeded", "reverted"],
      "description": "The supported token transfer reaches succeeded/reverted settlement only after matching finalized chain evidence. This is not a claim of general business-operation completion."
    },
    "observed_at": {
      "type": "string",
      "format": "date-time"
    },
    "transaction_hash": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    },
    "block_hash": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    },
    "block_number": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,77})$"
    },
    "execution_origin": {
      "type": "string",
      "enum": ["sponsor", "external"],
      "description": "An external party can relay the same ERC-3009 authorization. Only its exact verified token effect can establish success."
    }
  },
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "verification": {
          "enum": ["unverified"]
        },
        "chain_status": {
          "enum": ["unobserved", "pending", "reorged"]
        },
        "outcome": {
          "enum": ["unknown"]
        },
        "settlement": {
          "enum": ["pending"]
        }
      },
      "not": {
        "anyOf": [
          {
            "type": "object",
            "required": ["transaction_hash"]
          },
          {
            "type": "object",
            "required": ["block_hash"]
          },
          {
            "type": "object",
            "required": ["block_number"]
          },
          {
            "type": "object",
            "required": ["execution_origin"]
          }
        ]
      }
    },
    {
      "type": "object",
      "required": [
        "transaction_hash",
        "block_hash",
        "block_number",
        "execution_origin"
      ],
      "properties": {
        "verification": {
          "enum": ["rpc-quorum"]
        },
        "chain_status": {
          "enum": ["included", "safe"]
        },
        "outcome": {
          "enum": ["succeeded", "reverted"]
        },
        "settlement": {
          "enum": ["pending"]
        }
      }
    },
    {
      "type": "object",
      "required": [
        "transaction_hash",
        "block_hash",
        "block_number",
        "execution_origin"
      ],
      "properties": {
        "verification": {
          "enum": ["rpc-quorum"]
        },
        "chain_status": {
          "enum": ["finalized"]
        },
        "outcome": {
          "enum": ["succeeded"]
        },
        "settlement": {
          "enum": ["succeeded"]
        }
      }
    },
    {
      "type": "object",
      "required": [
        "transaction_hash",
        "block_hash",
        "block_number",
        "execution_origin"
      ],
      "properties": {
        "verification": {
          "enum": ["rpc-quorum"]
        },
        "chain_status": {
          "enum": ["finalized"]
        },
        "outcome": {
          "enum": ["reverted"]
        },
        "settlement": {
          "enum": ["reverted"]
        }
      }
    }
  ]
}
```

## POST /v1/actions/{actionId}/execute

Operation: `executeTransfer`.

Optional immutable approved-action execution with exact version selection, current owner/grant/identity/consent/approval checks, durable signing and submission authority, application gas sponsorship and independent RPC receipt/finality verification. Unknown provider submission outcomes never permit redispatch. Contract calls require the approved-evm-executor-v1 profile and a stored policy-approved action; execute never accepts replacement calldata.

| Parameter                    | Location | Required | Schema                                                                                                |
| ---------------------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `actionId`                   | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `execution-profile`          | header   | yes      | `{"type":"string","enum":["erc3009-relayer-v1","erc3009-executor-v1","approved-evm-executor-v1"]}`    |
| `execution-profile-revision` | header   | yes      | `{"type":"string","enum":["1"]}`                                                                      |
| `idempotency-key`            | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false
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
    "profile",
    "profile_revision",
    "action_id",
    "execution_id",
    "dispatch_status",
    "observation_revision",
    "next_poll_after_ms",
    "chain_status",
    "verification",
    "outcome",
    "settlement",
    "observed_at"
  ],
  "properties": {
    "recovery": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "state",
        "reason",
        "observed_at",
        "pending_age_ms",
        "quarantined",
        "next_action"
      ],
      "properties": {
        "state": {
          "type": "string",
          "enum": [
            "observing",
            "suspected-stuck",
            "awaiting-finality",
            "finalized",
            "unavailable",
            "blocked"
          ]
        },
        "reason": {
          "type": "string",
          "enum": [
            "within-threshold",
            "pending-too-long",
            "nonce-gap-suspected",
            "nonce-consumed-without-result",
            "safe-nonce-advanced",
            "insufficient-sponsor-funds",
            "fee-cap-below-base-fee",
            "transaction-not-visible",
            "provider-nonce-conflict",
            "evidence-unavailable",
            "awaiting-finality",
            "verified-finality"
          ]
        },
        "observed_at": {
          "type": "string",
          "format": "date-time"
        },
        "pending_age_ms": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991
        },
        "quarantined": {
          "type": "boolean"
        },
        "sponsor_nonce": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "confirmed_nonce": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "finalized_nonce": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "safe_nonce": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "next_action": {
          "type": "string",
          "enum": [
            "wait",
            "restore-evidence",
            "fund-sponsor",
            "review-provider-fees",
            "review-provider-nonces",
            "reconcile",
            "operator-review"
          ]
        }
      }
    },
    "profile": {
      "type": "string",
      "enum": [
        "erc3009-relayer-v1",
        "erc3009-executor-v1",
        "approved-evm-executor-v1"
      ]
    },
    "outcome_scope": {
      "type": "string",
      "enum": [
        "token-transfer",
        "contract-execution",
        "swap-effects",
        "vault-deposit-effects"
      ],
      "description": "What verified success establishes: exact token transfer, successful approved calls, or the required swap/vault asset effects. Contract execution alone does not prove an arbitrary business outcome."
    },
    "profile_revision": {
      "type": "string",
      "enum": ["1"]
    },
    "action_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "execution_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "dispatch_status": {
      "type": "string",
      "enum": ["not_started", "pending", "accepted", "unknown", "failed"],
      "description": "Durable submission state. Accepted identifies a durable executor/provider acceptance; it is not chain inclusion or settlement."
    },
    "observation_revision": {
      "type": "integer",
      "minimum": 0
    },
    "next_poll_after_ms": {
      "type": "integer",
      "minimum": 5000,
      "maximum": 300000
    },
    "chain_status": {
      "type": "string",
      "enum": [
        "unobserved",
        "pending",
        "included",
        "safe",
        "finalized",
        "reorged"
      ]
    },
    "verification": {
      "type": "string",
      "enum": ["unverified", "rpc-quorum"],
      "description": "RPC quorum means agreement of all configured trusted RPC sources on exact receipt effects and canonical block evidence, not a cryptographic light-client proof."
    },
    "outcome": {
      "type": "string",
      "enum": ["unknown", "succeeded", "reverted"]
    },
    "settlement": {
      "type": "string",
      "enum": ["pending", "succeeded", "reverted"],
      "description": "The supported token transfer reaches succeeded/reverted settlement only after matching finalized chain evidence. This is not a claim of general business-operation completion."
    },
    "observed_at": {
      "type": "string",
      "format": "date-time"
    },
    "transaction_hash": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    },
    "block_hash": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    },
    "block_number": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,77})$"
    },
    "execution_origin": {
      "type": "string",
      "enum": ["sponsor", "external"],
      "description": "An external party can relay the same ERC-3009 authorization. Only its exact verified token effect can establish success."
    }
  },
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "verification": {
          "enum": ["unverified"]
        },
        "chain_status": {
          "enum": ["unobserved", "pending", "reorged"]
        },
        "outcome": {
          "enum": ["unknown"]
        },
        "settlement": {
          "enum": ["pending"]
        }
      },
      "not": {
        "anyOf": [
          {
            "type": "object",
            "required": ["transaction_hash"]
          },
          {
            "type": "object",
            "required": ["block_hash"]
          },
          {
            "type": "object",
            "required": ["block_number"]
          },
          {
            "type": "object",
            "required": ["execution_origin"]
          }
        ]
      }
    },
    {
      "type": "object",
      "required": [
        "transaction_hash",
        "block_hash",
        "block_number",
        "execution_origin"
      ],
      "properties": {
        "verification": {
          "enum": ["rpc-quorum"]
        },
        "chain_status": {
          "enum": ["included", "safe"]
        },
        "outcome": {
          "enum": ["succeeded", "reverted"]
        },
        "settlement": {
          "enum": ["pending"]
        }
      }
    },
    {
      "type": "object",
      "required": [
        "transaction_hash",
        "block_hash",
        "block_number",
        "execution_origin"
      ],
      "properties": {
        "verification": {
          "enum": ["rpc-quorum"]
        },
        "chain_status": {
          "enum": ["finalized"]
        },
        "outcome": {
          "enum": ["succeeded"]
        },
        "settlement": {
          "enum": ["succeeded"]
        }
      }
    },
    {
      "type": "object",
      "required": [
        "transaction_hash",
        "block_hash",
        "block_number",
        "execution_origin"
      ],
      "properties": {
        "verification": {
          "enum": ["rpc-quorum"]
        },
        "chain_status": {
          "enum": ["finalized"]
        },
        "outcome": {
          "enum": ["reverted"]
        },
        "settlement": {
          "enum": ["reverted"]
        }
      }
    }
  ]
}
```

## GET /v1/actions/{actionId}/execution

Operation: `getTransferExecution`.

Optional immutable approved-action execution with exact version selection, current owner/grant/identity/consent/approval checks, durable signing and submission authority, application gas sponsorship and independent RPC receipt/finality verification. Unknown provider submission outcomes never permit redispatch. Contract calls require the approved-evm-executor-v1 profile and a stored policy-approved action; execute never accepts replacement calldata.

| Parameter                    | Location | Required | Schema                                                                                                |
| ---------------------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `actionId`                   | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `execution-profile`          | header   | yes      | `{"type":"string","enum":["erc3009-relayer-v1","erc3009-executor-v1","approved-evm-executor-v1"]}`    |
| `execution-profile-revision` | header   | yes      | `{"type":"string","enum":["1"]}`                                                                      |

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
    "profile",
    "profile_revision",
    "action_id",
    "execution_id",
    "dispatch_status",
    "observation_revision",
    "next_poll_after_ms",
    "chain_status",
    "verification",
    "outcome",
    "settlement",
    "observed_at"
  ],
  "properties": {
    "recovery": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "state",
        "reason",
        "observed_at",
        "pending_age_ms",
        "quarantined",
        "next_action"
      ],
      "properties": {
        "state": {
          "type": "string",
          "enum": [
            "observing",
            "suspected-stuck",
            "awaiting-finality",
            "finalized",
            "unavailable",
            "blocked"
          ]
        },
        "reason": {
          "type": "string",
          "enum": [
            "within-threshold",
            "pending-too-long",
            "nonce-gap-suspected",
            "nonce-consumed-without-result",
            "safe-nonce-advanced",
            "insufficient-sponsor-funds",
            "fee-cap-below-base-fee",
            "transaction-not-visible",
            "provider-nonce-conflict",
            "evidence-unavailable",
            "awaiting-finality",
            "verified-finality"
          ]
        },
        "observed_at": {
          "type": "string",
          "format": "date-time"
        },
        "pending_age_ms": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991
        },
        "quarantined": {
          "type": "boolean"
        },
        "sponsor_nonce": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "confirmed_nonce": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "finalized_nonce": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "safe_nonce": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "next_action": {
          "type": "string",
          "enum": [
            "wait",
            "restore-evidence",
            "fund-sponsor",
            "review-provider-fees",
            "review-provider-nonces",
            "reconcile",
            "operator-review"
          ]
        }
      }
    },
    "profile": {
      "type": "string",
      "enum": [
        "erc3009-relayer-v1",
        "erc3009-executor-v1",
        "approved-evm-executor-v1"
      ]
    },
    "outcome_scope": {
      "type": "string",
      "enum": [
        "token-transfer",
        "contract-execution",
        "swap-effects",
        "vault-deposit-effects"
      ],
      "description": "What verified success establishes: exact token transfer, successful approved calls, or the required swap/vault asset effects. Contract execution alone does not prove an arbitrary business outcome."
    },
    "profile_revision": {
      "type": "string",
      "enum": ["1"]
    },
    "action_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "execution_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "dispatch_status": {
      "type": "string",
      "enum": ["not_started", "pending", "accepted", "unknown", "failed"],
      "description": "Durable submission state. Accepted identifies a durable executor/provider acceptance; it is not chain inclusion or settlement."
    },
    "observation_revision": {
      "type": "integer",
      "minimum": 0
    },
    "next_poll_after_ms": {
      "type": "integer",
      "minimum": 5000,
      "maximum": 300000
    },
    "chain_status": {
      "type": "string",
      "enum": [
        "unobserved",
        "pending",
        "included",
        "safe",
        "finalized",
        "reorged"
      ]
    },
    "verification": {
      "type": "string",
      "enum": ["unverified", "rpc-quorum"],
      "description": "RPC quorum means agreement of all configured trusted RPC sources on exact receipt effects and canonical block evidence, not a cryptographic light-client proof."
    },
    "outcome": {
      "type": "string",
      "enum": ["unknown", "succeeded", "reverted"]
    },
    "settlement": {
      "type": "string",
      "enum": ["pending", "succeeded", "reverted"],
      "description": "The supported token transfer reaches succeeded/reverted settlement only after matching finalized chain evidence. This is not a claim of general business-operation completion."
    },
    "observed_at": {
      "type": "string",
      "format": "date-time"
    },
    "transaction_hash": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    },
    "block_hash": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    },
    "block_number": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,77})$"
    },
    "execution_origin": {
      "type": "string",
      "enum": ["sponsor", "external"],
      "description": "An external party can relay the same ERC-3009 authorization. Only its exact verified token effect can establish success."
    }
  },
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "verification": {
          "enum": ["unverified"]
        },
        "chain_status": {
          "enum": ["unobserved", "pending", "reorged"]
        },
        "outcome": {
          "enum": ["unknown"]
        },
        "settlement": {
          "enum": ["pending"]
        }
      },
      "not": {
        "anyOf": [
          {
            "type": "object",
            "required": ["transaction_hash"]
          },
          {
            "type": "object",
            "required": ["block_hash"]
          },
          {
            "type": "object",
            "required": ["block_number"]
          },
          {
            "type": "object",
            "required": ["execution_origin"]
          }
        ]
      }
    },
    {
      "type": "object",
      "required": [
        "transaction_hash",
        "block_hash",
        "block_number",
        "execution_origin"
      ],
      "properties": {
        "verification": {
          "enum": ["rpc-quorum"]
        },
        "chain_status": {
          "enum": ["included", "safe"]
        },
        "outcome": {
          "enum": ["succeeded", "reverted"]
        },
        "settlement": {
          "enum": ["pending"]
        }
      }
    },
    {
      "type": "object",
      "required": [
        "transaction_hash",
        "block_hash",
        "block_number",
        "execution_origin"
      ],
      "properties": {
        "verification": {
          "enum": ["rpc-quorum"]
        },
        "chain_status": {
          "enum": ["finalized"]
        },
        "outcome": {
          "enum": ["succeeded"]
        },
        "settlement": {
          "enum": ["succeeded"]
        }
      }
    },
    {
      "type": "object",
      "required": [
        "transaction_hash",
        "block_hash",
        "block_number",
        "execution_origin"
      ],
      "properties": {
        "verification": {
          "enum": ["rpc-quorum"]
        },
        "chain_status": {
          "enum": ["finalized"]
        },
        "outcome": {
          "enum": ["reverted"]
        },
        "settlement": {
          "enum": ["reverted"]
        }
      }
    }
  ]
}
```

## GET /v1/actions/{actionId}/execution-events

Operation: `getExecutionEvents`.

Authenticated CloudEvents 1.0 execution observations with a monotonic sequence in the active store. At most 64 transitions are retained per execution; history_truncated signals a cursor gap requiring verified-status resynchronization. Reports never become verified events without RPC evidence. This endpoint does not refresh, submit or release budgets.

| Parameter                    | Location | Required | Schema                                                                                                |
| ---------------------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `after`                      | query    | no       | `{"type":"string","pattern":"^(0\|[1-9][0-9]{0,15})$"}`                                               |
| `actionId`                   | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `execution-profile`          | header   | yes      | `{"type":"string","enum":["erc3009-relayer-v1","erc3009-executor-v1","approved-evm-executor-v1"]}`    |
| `execution-profile-revision` | header   | yes      | `{"type":"string","enum":["1"]}`                                                                      |

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
    "profile",
    "profile_revision",
    "action_id",
    "events",
    "oldest_sequence",
    "next_sequence",
    "history_truncated"
  ],
  "properties": {
    "profile": {
      "type": "string",
      "enum": [
        "erc3009-relayer-v1",
        "erc3009-executor-v1",
        "approved-evm-executor-v1"
      ]
    },
    "profile_revision": {
      "type": "string",
      "enum": ["1"]
    },
    "action_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "oldest_sequence": {
      "type": "integer",
      "minimum": 0
    },
    "next_sequence": {
      "type": "integer",
      "minimum": 0
    },
    "history_truncated": {
      "type": "boolean",
      "description": "An explicit cursor gap requires resynchronization through verified execution status. The bounded feed is not a complete historical chain ledger."
    },
    "events": {
      "type": "array",
      "maxItems": 64,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "specversion",
          "id",
          "source",
          "type",
          "subject",
          "time",
          "datacontenttype",
          "sequence",
          "data"
        ],
        "properties": {
          "specversion": {
            "type": "string",
            "enum": ["1.0"]
          },
          "id": {
            "type": "string",
            "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
          },
          "source": {
            "type": "string",
            "format": "uri"
          },
          "type": {
            "type": "string",
            "enum": ["com.moovha.wallet-provider.execution.observed.v1"]
          },
          "subject": {
            "type": "string",
            "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
          },
          "time": {
            "type": "string",
            "format": "date-time"
          },
          "datacontenttype": {
            "type": "string",
            "enum": ["application/json"]
          },
          "sequence": {
            "type": "integer",
            "minimum": 1
          },
          "data": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "profile",
              "profile_revision",
              "action_id",
              "execution_id",
              "dispatch_status",
              "observation_revision",
              "next_poll_after_ms",
              "chain_status",
              "verification",
              "outcome",
              "settlement",
              "observed_at"
            ],
            "properties": {
              "recovery": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "state",
                  "reason",
                  "observed_at",
                  "pending_age_ms",
                  "quarantined",
                  "next_action"
                ],
                "properties": {
                  "state": {
                    "type": "string",
                    "enum": [
                      "observing",
                      "suspected-stuck",
                      "awaiting-finality",
                      "finalized",
                      "unavailable",
                      "blocked"
                    ]
                  },
                  "reason": {
                    "type": "string",
                    "enum": [
                      "within-threshold",
                      "pending-too-long",
                      "nonce-gap-suspected",
                      "nonce-consumed-without-result",
                      "safe-nonce-advanced",
                      "insufficient-sponsor-funds",
                      "fee-cap-below-base-fee",
                      "transaction-not-visible",
                      "provider-nonce-conflict",
                      "evidence-unavailable",
                      "awaiting-finality",
                      "verified-finality"
                    ]
                  },
                  "observed_at": {
                    "type": "string",
                    "format": "date-time"
                  },
                  "pending_age_ms": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 9007199254740991
                  },
                  "quarantined": {
                    "type": "boolean"
                  },
                  "sponsor_nonce": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  },
                  "confirmed_nonce": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  },
                  "finalized_nonce": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  },
                  "safe_nonce": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]{0,77})$"
                  },
                  "next_action": {
                    "type": "string",
                    "enum": [
                      "wait",
                      "restore-evidence",
                      "fund-sponsor",
                      "review-provider-fees",
                      "review-provider-nonces",
                      "reconcile",
                      "operator-review"
                    ]
                  }
                }
              },
              "profile": {
                "type": "string",
                "enum": [
                  "erc3009-relayer-v1",
                  "erc3009-executor-v1",
                  "approved-evm-executor-v1"
                ]
              },
              "outcome_scope": {
                "type": "string",
                "enum": [
                  "token-transfer",
                  "contract-execution",
                  "swap-effects",
                  "vault-deposit-effects"
                ],
                "description": "What verified success establishes: exact token transfer, successful approved calls, or the required swap/vault asset effects. Contract execution alone does not prove an arbitrary business outcome."
              },
              "profile_revision": {
                "type": "string",
                "enum": ["1"]
              },
              "action_id": {
                "type": "string",
                "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
              },
              "execution_id": {
                "type": "string",
                "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
              },
              "dispatch_status": {
                "type": "string",
                "enum": [
                  "not_started",
                  "pending",
                  "accepted",
                  "unknown",
                  "failed"
                ],
                "description": "Durable submission state. Accepted identifies a durable executor/provider acceptance; it is not chain inclusion or settlement."
              },
              "observation_revision": {
                "type": "integer",
                "minimum": 0
              },
              "next_poll_after_ms": {
                "type": "integer",
                "minimum": 5000,
                "maximum": 300000
              },
              "chain_status": {
                "type": "string",
                "enum": [
                  "unobserved",
                  "pending",
                  "included",
                  "safe",
                  "finalized",
                  "reorged"
                ]
              },
              "verification": {
                "type": "string",
                "enum": ["unverified", "rpc-quorum"],
                "description": "RPC quorum means agreement of all configured trusted RPC sources on exact receipt effects and canonical block evidence, not a cryptographic light-client proof."
              },
              "outcome": {
                "type": "string",
                "enum": ["unknown", "succeeded", "reverted"]
              },
              "settlement": {
                "type": "string",
                "enum": ["pending", "succeeded", "reverted"],
                "description": "The supported token transfer reaches succeeded/reverted settlement only after matching finalized chain evidence. This is not a claim of general business-operation completion."
              },
              "observed_at": {
                "type": "string",
                "format": "date-time"
              },
              "transaction_hash": {
                "type": "string",
                "pattern": "^0x[0-9a-f]{64}$"
              },
              "block_hash": {
                "type": "string",
                "pattern": "^0x[0-9a-f]{64}$"
              },
              "block_number": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]{0,77})$"
              },
              "execution_origin": {
                "type": "string",
                "enum": ["sponsor", "external"],
                "description": "An external party can relay the same ERC-3009 authorization. Only its exact verified token effect can establish success."
              }
            },
            "oneOf": [
              {
                "type": "object",
                "properties": {
                  "verification": {
                    "enum": ["unverified"]
                  },
                  "chain_status": {
                    "enum": ["unobserved", "pending", "reorged"]
                  },
                  "outcome": {
                    "enum": ["unknown"]
                  },
                  "settlement": {
                    "enum": ["pending"]
                  }
                },
                "not": {
                  "anyOf": [
                    {
                      "type": "object",
                      "required": ["transaction_hash"]
                    },
                    {
                      "type": "object",
                      "required": ["block_hash"]
                    },
                    {
                      "type": "object",
                      "required": ["block_number"]
                    },
                    {
                      "type": "object",
                      "required": ["execution_origin"]
                    }
                  ]
                }
              },
              {
                "type": "object",
                "required": [
                  "transaction_hash",
                  "block_hash",
                  "block_number",
                  "execution_origin"
                ],
                "properties": {
                  "verification": {
                    "enum": ["rpc-quorum"]
                  },
                  "chain_status": {
                    "enum": ["included", "safe"]
                  },
                  "outcome": {
                    "enum": ["succeeded", "reverted"]
                  },
                  "settlement": {
                    "enum": ["pending"]
                  }
                }
              },
              {
                "type": "object",
                "required": [
                  "transaction_hash",
                  "block_hash",
                  "block_number",
                  "execution_origin"
                ],
                "properties": {
                  "verification": {
                    "enum": ["rpc-quorum"]
                  },
                  "chain_status": {
                    "enum": ["finalized"]
                  },
                  "outcome": {
                    "enum": ["succeeded"]
                  },
                  "settlement": {
                    "enum": ["succeeded"]
                  }
                }
              },
              {
                "type": "object",
                "required": [
                  "transaction_hash",
                  "block_hash",
                  "block_number",
                  "execution_origin"
                ],
                "properties": {
                  "verification": {
                    "enum": ["rpc-quorum"]
                  },
                  "chain_status": {
                    "enum": ["finalized"]
                  },
                  "outcome": {
                    "enum": ["reverted"]
                  },
                  "settlement": {
                    "enum": ["reverted"]
                  }
                }
              }
            ]
          }
        }
      }
    }
  }
}
```

## POST /v1/actions/{actionId}/transaction-events

Operation: `reportTransactionEvent`.

Record or read unverified application transaction observations for an existing authorized transfer. Current caller, owner, grant, identity, consent and policy checks apply even after signing expiry. Reports never broadcast, reconcile attempts, verify settlement or release budgets.

| Parameter         | Location | Required | Schema                                                                                                |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `actionId`        | path     | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |
| `idempotency-key` | header   | yes      | `{"type":"string","pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}` |

Request body (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["event", "chain_id", "transaction_hash", "observed_at"],
  "properties": {
    "event": {
      "type": "string",
      "enum": ["submitted", "confirmed", "failed"],
      "description": "Application observation only; confirmed is not provider-verified settlement."
    },
    "chain_id": {
      "type": "string",
      "enum": ["eip155:84532"]
    },
    "transaction_hash": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    },
    "observed_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$"
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
    "event",
    "chain_id",
    "transaction_hash",
    "observed_at",
    "report_id",
    "recorded_at",
    "verification",
    "action_id"
  ],
  "properties": {
    "event": {
      "type": "string",
      "enum": ["submitted", "confirmed", "failed"],
      "description": "Application observation only; confirmed is not provider-verified settlement."
    },
    "chain_id": {
      "type": "string",
      "enum": ["eip155:84532"]
    },
    "transaction_hash": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    },
    "observed_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$"
    },
    "report_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "recorded_at": {
      "type": "string",
      "format": "date-time"
    },
    "verification": {
      "type": "string",
      "enum": ["unverified"],
      "description": "No chain receipt, transfer effect or finality verification is performed."
    },
    "action_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    }
  }
}
```

## GET /v1/actions/{actionId}/transaction-events

Operation: `getTransactionEvents`.

Record or read unverified application transaction observations for an existing authorized transfer. Current caller, owner, grant, identity, consent and policy checks apply even after signing expiry. Reports never broadcast, reconcile attempts, verify settlement or release budgets.

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
  "required": ["action_id", "events"],
  "properties": {
    "action_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "events": {
      "type": "array",
      "maxItems": 32,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "event",
          "chain_id",
          "transaction_hash",
          "observed_at",
          "report_id",
          "recorded_at",
          "verification"
        ],
        "properties": {
          "event": {
            "type": "string",
            "enum": ["submitted", "confirmed", "failed"],
            "description": "Application observation only; confirmed is not provider-verified settlement."
          },
          "chain_id": {
            "type": "string",
            "enum": ["eip155:84532"]
          },
          "transaction_hash": {
            "type": "string",
            "pattern": "^0x[0-9a-f]{64}$"
          },
          "observed_at": {
            "type": "string",
            "format": "date-time",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$"
          },
          "report_id": {
            "type": "string",
            "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
          },
          "recorded_at": {
            "type": "string",
            "format": "date-time"
          },
          "verification": {
            "type": "string",
            "enum": ["unverified"],
            "description": "No chain receipt, transfer effect or finality verification is performed."
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
            },
            "transfer_policy_revision": {
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
                "transfers:request",
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
        "enum": [
          "account:read",
          "operations:request",
          "transfers:request",
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
    "transfer_policy_revision": {
      "type": "string"
    },
    "transfer_terms": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "profile",
        "token",
        "recipients",
        "maximumAmount",
        "lifetimeAmount",
        "maxValiditySeconds"
      ],
      "properties": {
        "profile": {
          "enum": ["provider-authorized-erc3009-v1"]
        },
        "token": {
          "type": "object",
          "additionalProperties": false,
          "required": ["address", "name", "version", "symbol", "decimals"],
          "properties": {
            "address": {
              "type": "string",
              "pattern": "^0x[0-9a-fA-F]{40}$"
            },
            "name": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "version": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "symbol": {
              "type": "string",
              "pattern": "^[A-Za-z0-9]{1,12}$"
            },
            "decimals": {
              "type": "integer",
              "minimum": 0,
              "maximum": 36
            }
          }
        },
        "recipients": {
          "type": "array",
          "minItems": 1,
          "maxItems": 100,
          "uniqueItems": true,
          "items": {
            "type": "string",
            "pattern": "^0x[0-9a-fA-F]{40}$"
          }
        },
        "maximumAmount": {
          "type": "string",
          "pattern": "^[1-9][0-9]{0,77}$"
        },
        "lifetimeAmount": {
          "type": "string",
          "pattern": "^[1-9][0-9]{0,77}$"
        },
        "maxValiditySeconds": {
          "type": "integer",
          "minimum": 60,
          "maximum": 3600
        }
      }
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
            "contracts",
            "swaps",
            "vaults"
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
                    "transfers:request",
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
        "enum": [
          "account:read",
          "operations:request",
          "transfers:request",
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
        "enum": [
          "account:read",
          "operations:request",
          "transfers:request",
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
