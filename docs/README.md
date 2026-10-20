# Set up your wallet service

Run a wallet service with one Safe account per user. The bundled OWS engine
holds private signing identities; a private ERC-4337 bundler submits approved
operations and an application-owned paymaster covers gas. Users receive their
Safe address for deposits and transactions.

The service is experimental and single-host. Applications retain responsibility
for current identity evidence, consent, action requests and sponsorship funding.
Offline checks do not establish production custody or latency acceptance.

## Deploy and establish administration

Follow [installation and administration](provider-installation.md) for a reviewed
release bundle on your computer or Linux server, or the AWS deployment template.
Release bundles use pinned prebuilt images with Docker Compose. Verify that the
selected release actually exists before attempting a registry installation.

For contributor evaluation, the source setup command remains available:

```sh
git clone https://github.com/Moovha/wallet-provider-kit.git
cd wallet-provider-kit
npm ci
npm run build
npm start -- setup
```

Source builds require Node 24.22.0 and npm 11.11.1. The graphical flow has three
stages: choose a destination, review deployment and open administration. The
private installation claim establishes the first administrator. No connected
application, RPC credentials or sponsor funding is required to finish installation.

## Connect applications afterward

Use `/admin/` or the protected provider API to register an application. Save its
credential once, accept identity/consent trust and choose permitted owner actions.
Then configure action policies, service credentials and sponsorship through
[application management](runtime-workspace.md). Registration, trust, funding,
activation and owner authority are separate decisions.

An available management service with disabled wallet operations is a successful
installation. Complete [provider acceptance](conformance.md), backups and tested
recovery before admitting wallet use. See [maintenance](provider-maintenance.md).

## Advanced configuration

The setup tool's **Advanced configuration** editor retains six explicit screens
for static source integrations. Follow the [configuration reference](setup-wizard.md)
for that path. It is not a prerequisite for API-managed installations.

## When you need a custom integration

Low-level signing, authority and storage interfaces are available for reviewed
host integrations. They do not select another supported configured execution
flow. Configuration must include the Safe account and its application infrastructure.
