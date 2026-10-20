# Use advanced configuration when you need it

For a new service, start with [installation](provider-installation.md). Its three
stages are **Choose where to run → Review your setup → Start and sign in**.
You can add applications afterward in the console or through the API.

This page is for developers maintaining an explicit static source configuration.
Choose **Advanced configuration** in setup to open its six screens. Applications
entered here are startup registrations; API-managed installations keep durable
registrations instead. Choose one registration authority per configuration.

## 1. Provider

Give your service a name, final HTTPS address and privacy notice. These tell people
who operates the service and where to find its terms.

## 2. Wallet storage

Choose the private OWS vault location and retained passphrase reference. Each
person receives a Safe; the vault holds its private signer. Follow
[signing-key storage](ows-adapter.md) for the recovery boundary.

## 3. Services

Configure application authentication and, only if needed, staff token controls.
[Service connections](operator-services.md) explain which registration each uses.
Enter secret variable names here and save actual values privately.

## 4. Applications

Set up allowed applications, their user-check agreements, identity requirements,
consent and transaction limits. [User access](application-access.md) explains the
experience to build. Register provider policy operators separately.

## 5. Deployment

Choose persistent storage and review [backup and recovery](provider-maintenance.md).
Keep wallet operations disabled until [launch checks](conformance.md) pass.

## 6. Finish setup

Validate and export, then retain configuration, generated secrets and persistent
volumes together. [Source deployment](operator-deployment.md) prepares the API,
private bundler and paymaster using the [configuration reference](setup.md).
The editor does not update a running service; apply exported changes through a
reviewed restart that preserves pending work.
