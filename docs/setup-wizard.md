# Setup wizard

## 1. Provider

Set the provider name, HTTPS origin and privacy notice.

## 2. Backend

Configure the OWS vault binding and retained owner passphrase reference. Each user account is a Safe; the vault account is its private signer.

## 3. Services

Register application authentication and optional staff token controls. Keep secret references separate from values.

## 4. Applications

Define application trust, identity fields, consent and permitted contract calls. Register provider policy operators separately from application clients.

## 5. Deployment

Choose persistent storage and review backup/recovery evidence. Keep wallet operations disabled until acceptance is complete.

## 6. Export

Validate and export the configuration. Retain generated secrets and persistent volumes. Local setup prepares the API, private bundler and paymaster services using the same [Safe configuration](setup.md).
