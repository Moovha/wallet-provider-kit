# Graphical installation and advanced configuration

The default installation flow is **Choose where to run → Review your setup →
Start and sign in**. It deploys a manageable provider with no
applications. Claim its administrator privately, then configure applications in
`/admin/` or through the API. See [installation](provider-installation.md).

The **Advanced configuration** editor retains the following explicit static
configuration screens for source integrations. Applications configured here are
startup registrations; API-managed installations use durable registrations instead.
Do not mix these authorities in one configuration.

## 1. Provider

Set the provider name, HTTPS origin and privacy notice.

## 2. Wallet storage

Configure the OWS vault binding and retained owner passphrase reference. Each user account is a Safe; the vault account is its private signer.

## 3. Services

Register application authentication and optional staff token controls. Keep secret references separate from values.

## 4. Applications

Define application trust, identity fields, consent and permitted contract calls. Register provider policy operators separately from application clients.

## 5. Deployment

Choose persistent storage and review backup/recovery evidence. Keep wallet operations disabled until acceptance is complete.

## 6. Finish setup

Validate and export the configuration. Retain generated secrets and persistent volumes. Local setup prepares the API, private bundler and paymaster services using the same [Safe configuration](setup.md).
