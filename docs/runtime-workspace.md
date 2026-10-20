---
prev: { 'text': 'Install and sign in', 'link': '/docs/provider-installation' }
next:
  { 'text': 'User checks and permission', 'link': '/docs/application-access' }
---

# Connect your first application

Once you can sign in to your wallet service, you are ready to add an application.
An application might be your own product or a partner’s service. Adding it gives
its server a way to identify itself; each person still decides whether to allow
wallet access.

Have the application’s name and a secure way to share connection details with its
developer ready. User checks and transaction rules can be agreed afterward.

## 1. Add the application

Open **Applications** in `/admin/` and choose **Add application**. Save the returned
application ID and secret in your password manager or secret store. The secret
is shown once. Give it only to the application’s trusted server operator.

If the response was lost, inspect the application list before trying again. Use
**Replace secret** to get a new secret; repeating creation does not reveal the old one.

<details>
<summary>Prefer to use the API?</summary>

Create an application with `POST /v1/provider/identities` using a provider operator
token and an `Idempotency-Key`. The exact body is in the
[HTTP reference](http-reference.md#post-v1-provider-identities). Reuse that key for
an identical retry. The registration API also supports separate management tools.

</details>

## 2. Agree how people give permission

In the application’s access settings, record the **Agreement reference** and
choose what people can allow the application to do. The agreement identifies
your reviewed arrangement for checking identity and recording consent. Saving its
reference does not perform those checks.

The application signs people in, carries out the agreed checks and records their
permission. Your service checks its submitted evidence before saving a limited,
expiring wallet approval, called a **grant** in the API. Read
[User checks and permission](application-access.md) with the application developer.

## 3. Share the connection with your developer

Give the developer your service’s HTTPS address, the application ID, secure access
to its secret and the [application API guide](http-api.md). Keep administrator
credentials separate. Application credentials cannot manage the provider.

The developer first obtains an application token and reads your access policy.
For transaction access, continue with [Choose transactions and network-fee limits](application-obligations.md).
Registration alone does not enable transactions or grant access to anyone’s wallet.

## 4. Test before inviting people

Use an isolated [test connection](staging-walkthrough.md) to check permission,
revocation, retries and recovery. Complete [launch checks](conformance.md) before
admitting real wallet use. Installation, application connection and launch are
separate milestones; a running console does not establish custody readiness.

## Look after an existing connection

- **Pause connection** stops new access and revokes related wallet approvals.
  Resuming does not restore those approvals; people must approve access again.
- **Replace secret** stops the old secret and its tokens from working while
  preserving existing wallet approvals. Save the new secret before reconnecting.
- **Save access settings** applies changed user-check agreements or permissions.
  Those changes revoke related approvals; saving identical settings does not.

Renaming an application changes its display name. It does not change its credentials
or wallet approvals. Existing transaction attempts keep their original identities
and checks through these changes. Replacing credentials cannot undo a transaction.

For programmatic updates, use the [provider management API](provider-installation.md#automate-provider-administration).
