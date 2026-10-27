---
prev:
  {
    'text': 'Transactions and fee limits',
    'link': '/docs/application-obligations',
  }
next: { 'text': 'Service connections', 'link': '/docs/operator-services' }
---

# Set the application’s transaction rules

Use an application policy to say which transactions people may approve. Start
with a small set of actions and clear limits: the destination contracts, allowed
methods and bounded values or assets. Review those choices with the application
developer before publishing them.

## Trust an application without transaction restrictions

For an application you trust to enforce its own transaction rules, open
**Applications → choose an application → Wallet setup → Transactions**, select the network, and choose
**Trusted app — unrestricted transactions** under **Transaction permissions**.
Read and check the trust acknowledgement, then select **Save transaction mode**.
Restricted mode is the default; only a provider operator can enable trusted mode.

Trusted mode requires no application policy proposal, contract registration or
accepted action declaration. It permits arbitrary external contract calls and
native transfers, including token approvals, swaps and bridge calls. The provider
does not check application contract allowlists, target bytecode pins, token
amount limits or application action declarations in this mode. The application
must validate those business rules and present accurate transaction reviews.

Authentication, current identity checks, wallet ownership and membership, user
consent, exact immutable calls, Safe owner/control checks, durable attempt
recovery and accepted network services and fee limits remain enforced. Owner
and signature-threshold changes still require their separate owner authority.
Generic calls cannot target the user's Safe or the MultiSend infrastructure.
The network must already be enabled and ready for execution.

The setting applies to one application on one network. Internally the service
retains a versioned authority record so consent and pending work can be checked
against the exact setting. Changing modes requires fresh transaction consent and
blocks new dispatch under previous terms. Already submitted transactions and
issued signatures may still execute; inspect their existing status before retrying.
Returning to restricted mode starts with an empty contract list; publish approved
rules before requesting further transactions.

Developers can use
`POST /v1/provider/applications/{applicationId}/transaction-mode` with a provider
operator token, `Wallet-Network`, a saved UUIDv4 `Idempotency-Key`, and this body:

```json
{
  "expected_revision": "0",
  "mode": "unrestricted"
}
```

Use the runtime application ID and its current `active_revision` from
`GET /v1/provider/applications/{applicationId}/policy`. The response returns the
new revision and `policy.transaction_mode: "unrestricted"`. Use
`"mode": "restricted"` and the new expected revision to close the delegation.
An application token cannot enable trusted mode or propose an unrestricted policy.

## Agree and publish the rules

The application proposes a versioned policy. A separate provider operator reviews
and publishes it. Its accepted [actions, services and network-fee agreement](application-obligations.md)
must match the active revision. Publication does not establish anyone’s identity
or consent; the application must show the current terms and obtain permission.

Use the [HTTP reference](http-reference.md) for policy proposals, publication,
review and credential metadata routes. Store secrets through the protected
credential API; metadata never returns their values.

<details>
<summary>How exact call restrictions are enforced</summary>

Policies can restrict target addresses, methods, argument positions and explicit
user-address parameters. The provider binds the current owner to their own Safe
and checks the immutable intent, account proof and financial authority on every
call. Manual or automatic policy review decides whether to publish the rules;
it does not grant permission to execute a transaction. Existing signed operations cannot be rewritten by
publishing a new policy.

</details>

Next, prepare [network services](operator-services.md) and
[network-fee funding](assets-and-gas.md), then [test the connection](staging-walkthrough.md).
