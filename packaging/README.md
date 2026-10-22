# Provider release bundle

This bundle installs a provider with zero connected applications. Docker with
Compose and a dedicated unprivileged service account are required. Use a local
Unix-socket Docker context. Keep this bundle and its version for recovery.

Verify the release checksums before running `bash install.sh`. Release checksum
attestations can be verified with GitHub CLI against the repository's provider
release workflow. Checksums alone detect corruption; they do not independently
prove publisher identity.

For local evaluation, run `bash install.sh`. For a server, set `WPK_LOCAL=false`,
`WPK_ORIGIN=https://wallet.example.com`, `WPK_PRIVACY_URL` and optionally
`WPK_DIRECTORY` and `WPK_NAME`, then run the script. Set `WPK_ACCEPT_PLAN=true`
only for an unattended deployment whose resources and exposure were reviewed.
These settings contain no authentication secrets.

The installer prints the administration address and the private claim file's
location, never its contents. Claiming expires 30 minutes after initial service
startup. Keep `provider.env`, storage, vault and deployment configuration private.
Generated Compose contains immutable images and can be inspected and operated
with normal Docker commands. Internal bundler and cache ports are not published.

The service uses one active host. Cloud deployment requires verified persistence,
DNS, HTTPS, backup/recovery and backend acceptance. Installation does not authorize
funds or establish production custody readiness. npm publication is disabled.

The optional `aws-cognito.json` template prepares Cognito managed sign-in for
provider administrators. It requires authenticator-app MFA and explicit approval
group membership. Configure its directory and client outputs under
`management.cognito`; see the installation guide for first-time setup, revocation
and host recovery. This directory is separate from end-user wallets and AWS
console identities. Deploying the template alone does not authorize an administrator.
