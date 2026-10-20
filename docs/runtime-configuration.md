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
