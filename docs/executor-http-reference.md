# Execution service HTTP reference

Use the [designated execution service guide](execution-service.md) for deployment, signed service requests, current wallet authority and recovery. This is a separate process and API from the wallet service. The [generated OpenAPI contract](../spec/execution-api.json) includes all implemented service operations.

## GET /v1/executor-capabilities

Operation: `getExecutorCapabilities`.

Authenticated discovery of provider IDs/revisions allowed for the pinned wallet origin. No credentials or sponsor bindings are exposed.

Success response:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["contract", "profiles", "providers"],
  "properties": {
    "contract": {
      "type": "string",
      "enum": ["execution-dispatch-v1"]
    },
    "profiles": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": ["erc3009-executor-v1", "approved-evm-executor-v1"]
      }
    },
    "providers": {
      "type": "array",
      "maxItems": 32,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "revision"],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[A-Za-z0-9._-]{1,64}$"
          },
          "revision": {
            "type": "string",
            "pattern": "^[1-9][0-9]{0,19}$"
          }
        }
      }
    }
  }
}
```

## POST /v1/dispatches

Operation: `dispatchApprovedExecution`.

Signed exact immutable dispatch. A duplicate identity joins its original durable attempt; unknown provider effects never dispatch again. Fresh wallet owner/grant/KYC/consent/approval and durable handoff authority is checked after preparation, claim and immediately before effects.

Request body:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "contract",
    "execution_id",
    "provider_id",
    "provider_revision",
    "wallet_attempt",
    "plan"
  ],
  "properties": {
    "contract": {
      "type": "string",
      "enum": ["execution-dispatch-v1"]
    },
    "execution_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "provider_id": {
      "type": "string",
      "pattern": "^[A-Za-z0-9._-]{1,64}$"
    },
    "provider_revision": {
      "type": "string",
      "pattern": "^[1-9][0-9]{0,19}$"
    },
    "wallet_attempt": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "namespace",
        "provider",
        "attemptId",
        "kind",
        "accountId",
        "resourceKey",
        "requestHash"
      ],
      "properties": {
        "namespace": {
          "type": "string",
          "enum": ["configured-execution-v1"]
        },
        "provider": {
          "type": "string",
          "enum": ["erc3009-executor-v1", "approved-evm-executor-v1"]
        },
        "attemptId": {
          "type": "string",
          "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        },
        "kind": {
          "type": "string",
          "enum": ["relay_transaction"]
        },
        "accountId": {
          "type": "string",
          "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        },
        "resourceKey": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        },
        "requestHash": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        }
      }
    },
    "plan": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "profile",
            "revision",
            "configurationHash",
            "genesisHash",
            "tokenCodeHash",
            "scanFromBlock",
            "data",
            "action",
            "sponsor"
          ],
          "properties": {
            "profile": {
              "type": "string",
              "enum": ["erc3009-executor-v1", "approved-evm-executor-v1"]
            },
            "revision": {
              "type": "string",
              "enum": ["1"]
            },
            "configurationHash": {
              "type": "string",
              "pattern": "^[0-9a-f]{64}$"
            },
            "genesisHash": {
              "type": "string",
              "pattern": "^0x[0-9a-fA-F]{64}$"
            },
            "tokenCodeHash": {
              "type": "string",
              "pattern": "^0x[0-9a-fA-F]{64}$"
            },
            "scanFromBlock": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            },
            "data": {
              "type": "string",
              "pattern": "^0x[0-9a-f]+$",
              "maxLength": 8192
            },
            "action": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "action_id",
                "operation_id",
                "kind",
                "profile",
                "profile_revision",
                "status",
                "chain_id",
                "chain_account_id",
                "binding_revision",
                "capability_revision",
                "plan_revision",
                "plan_hash",
                "payload_hash",
                "expires_at",
                "dependencies",
                "payload"
              ],
              "properties": {
                "action_id": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
                },
                "operation_id": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
                },
                "kind": {
                  "type": "string",
                  "enum": ["sign_typed_data"]
                },
                "profile": {
                  "type": "string",
                  "enum": ["evm_eoa_v1"]
                },
                "profile_revision": {
                  "type": "string",
                  "enum": ["1"]
                },
                "status": {
                  "type": "string",
                  "enum": ["ready"]
                },
                "chain_id": {
                  "type": "string",
                  "enum": ["eip155:84532"]
                },
                "chain_account_id": {
                  "type": "string",
                  "pattern": "^eip155:84532:0x[0-9a-fA-F]{40}$"
                },
                "binding_revision": {
                  "type": "string",
                  "pattern": "^[1-9][0-9]{0,19}$"
                },
                "capability_revision": {
                  "type": "string",
                  "enum": ["1"]
                },
                "plan_revision": {
                  "type": "string",
                  "enum": ["1"]
                },
                "plan_hash": {
                  "type": "string",
                  "pattern": "^0x[0-9a-fA-F]{64}$"
                },
                "payload_hash": {
                  "type": "string",
                  "pattern": "^0x[0-9a-fA-F]{64}$"
                },
                "expires_at": {
                  "type": "string",
                  "format": "date-time"
                },
                "dependencies": {
                  "type": "array",
                  "maxItems": 0,
                  "items": {
                    "type": "object"
                  }
                },
                "payload": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["primaryType", "domain", "types", "message"],
                  "properties": {
                    "primaryType": {
                      "type": "string",
                      "enum": ["TransferWithAuthorization"]
                    },
                    "domain": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "name",
                        "version",
                        "chainId",
                        "verifyingContract"
                      ],
                      "properties": {
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
                          "pattern": "^0x[0-9a-fA-F]{64}$"
                        }
                      }
                    }
                  }
                }
              }
            },
            "sponsor": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "clientId",
                "accountId",
                "binding",
                "fundingAgreement",
                "gasLimit",
                "maxFeePerGas",
                "maxPriorityFeePerGas",
                "l1FeeReserveWei",
                "lifetimeBudgetWei"
              ],
              "properties": {
                "clientId": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 256
                },
                "accountId": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
                },
                "binding": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["address", "bindingRevision"],
                  "properties": {
                    "address": {
                      "type": "string",
                      "pattern": "^0x[0-9a-fA-F]{40}$"
                    },
                    "bindingRevision": {
                      "type": "string",
                      "pattern": "^[1-9][0-9]{0,19}$"
                    }
                  }
                },
                "fundingAgreement": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 256
                },
                "gasLimit": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "maxFeePerGas": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "maxPriorityFeePerGas": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "l1FeeReserveWei": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "lifetimeBudgetWei": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                }
              }
            }
          },
          "description": "Exact immutable ApprovedExecutionPlan for the selected execution profile. ERC-3009 transfers or Safe calls, owner signature, sponsor, code pins, hashes and all action fields are independently validated against server policy and the current wallet authority callback before effects."
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "profile",
            "revision",
            "configurationHash",
            "genesisHash",
            "scanFromBlock",
            "data",
            "action",
            "sponsor",
            "intent"
          ],
          "properties": {
            "profile": {
              "type": "string",
              "enum": ["approved-evm-executor-v1"]
            },
            "revision": {
              "type": "string",
              "enum": ["1"]
            },
            "configurationHash": {
              "type": "string",
              "pattern": "^[0-9a-f]{64}$"
            },
            "genesisHash": {
              "type": "string",
              "pattern": "^0x[0-9a-fA-F]{64}$"
            },
            "tokenCodeHash": {
              "type": "string",
              "pattern": "^0x[0-9a-fA-F]{64}$"
            },
            "scanFromBlock": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]{0,77})$"
            },
            "data": {
              "type": "string",
              "pattern": "^0x[0-9a-f]+$",
              "maxLength": 32768
            },
            "action": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "action_id",
                "operation_id",
                "kind",
                "profile",
                "profile_revision",
                "status",
                "chain_id",
                "chain_account_id",
                "binding_revision",
                "capability_revision",
                "plan_revision",
                "plan_hash",
                "payload_hash",
                "expires_at",
                "dependencies",
                "payload"
              ],
              "properties": {
                "action_id": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
                },
                "operation_id": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
                },
                "kind": {
                  "type": "string",
                  "enum": ["sign_typed_data"]
                },
                "profile": {
                  "type": "string",
                  "enum": ["evm_eoa_v1"]
                },
                "profile_revision": {
                  "type": "string",
                  "enum": ["1"]
                },
                "status": {
                  "type": "string",
                  "enum": ["ready"]
                },
                "chain_id": {
                  "type": "string",
                  "enum": ["eip155:84532"]
                },
                "chain_account_id": {
                  "type": "string",
                  "pattern": "^eip155:84532:0x[0-9a-fA-F]{40}$"
                },
                "binding_revision": {
                  "type": "string",
                  "pattern": "^[1-9][0-9]{0,19}$"
                },
                "capability_revision": {
                  "type": "string",
                  "enum": ["1"]
                },
                "plan_revision": {
                  "type": "string",
                  "enum": ["1"]
                },
                "plan_hash": {
                  "type": "string",
                  "pattern": "^0x[0-9a-fA-F]{64}$"
                },
                "payload_hash": {
                  "type": "string",
                  "pattern": "^0x[0-9a-fA-F]{64}$"
                },
                "expires_at": {
                  "type": "string",
                  "format": "date-time"
                },
                "dependencies": {
                  "type": "array",
                  "maxItems": 0,
                  "items": {
                    "type": "object"
                  }
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
                }
              }
            },
            "sponsor": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "clientId",
                "accountId",
                "binding",
                "fundingAgreement",
                "gasLimit",
                "maxFeePerGas",
                "maxPriorityFeePerGas",
                "l1FeeReserveWei",
                "lifetimeBudgetWei"
              ],
              "properties": {
                "clientId": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 256
                },
                "accountId": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
                },
                "binding": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["address", "bindingRevision"],
                  "properties": {
                    "address": {
                      "type": "string",
                      "pattern": "^0x[0-9a-fA-F]{40}$"
                    },
                    "bindingRevision": {
                      "type": "string",
                      "pattern": "^[1-9][0-9]{0,19}$"
                    }
                  }
                },
                "fundingAgreement": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 256
                },
                "gasLimit": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "maxFeePerGas": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "maxPriorityFeePerGas": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "l1FeeReserveWei": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
                },
                "lifetimeBudgetWei": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]{0,77})$"
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
          },
          "description": "Exact immutable ApprovedExecutionPlan for the selected execution profile. ERC-3009 transfers or Safe calls, owner signature, sponsor, code pins, hashes and all action fields are independently validated against server policy and the current wallet authority callback before effects."
        }
      ]
    }
  }
}
```

Success response:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["contract", "execution_id", "plan_hash", "dispatch_status"],
  "properties": {
    "provider_inspection": {
      "type": "object",
      "additionalProperties": false,
      "required": ["status"],
      "properties": {
        "status": {
          "type": "string",
          "maxLength": 32
        },
        "nonce": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "transactionHash": {
          "type": "string",
          "pattern": "^0x[0-9a-f]{64}$"
        }
      }
    },
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
    "contract": {
      "type": "string",
      "enum": ["execution-dispatch-v1"]
    },
    "execution_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "plan_hash": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "dispatch_status": {
      "type": "string",
      "enum": ["not_started", "pending", "accepted", "unknown", "failed"]
    },
    "transaction_hash": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    }
  }
}
```

## GET /v1/dispatches/{executionId}

Operation: `getExecutorDispatch`.

Read-only durable recovery by stable execution ID. Provider hash and exact chain searches are hints for independent wallet verification. Never claims or submits an attempt.

Success response:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["contract", "execution_id", "plan_hash", "dispatch_status"],
  "properties": {
    "provider_inspection": {
      "type": "object",
      "additionalProperties": false,
      "required": ["status"],
      "properties": {
        "status": {
          "type": "string",
          "maxLength": 32
        },
        "nonce": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,77})$"
        },
        "transactionHash": {
          "type": "string",
          "pattern": "^0x[0-9a-f]{64}$"
        }
      }
    },
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
    "contract": {
      "type": "string",
      "enum": ["execution-dispatch-v1"]
    },
    "execution_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "plan_hash": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "dispatch_status": {
      "type": "string",
      "enum": ["not_started", "pending", "accepted", "unknown", "failed"]
    },
    "transaction_hash": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    }
  }
}
```
