Deploy a single-host wallet provider with no connected applications. The bundle
contains a Docker Compose installer, pinned service images and an AWS template.
Claim administrator access privately, then register applications through the
administration console or provider API. Wallet operations start disabled.

The images include SBOM and build provenance. Verify the archive's GitHub
attestation against Moovha/wallet-provider-kit before extraction and installation.
Linux amd64 and arm64 are the release image targets. Each target requires
independent container acceptance evidence. npm publication remains disabled.

This is experimental software. Container startup and offline tests do not
establish production custody readiness, cloud acceptance or provider certification.
Retain installation secrets, data and the matching release bundle for recovery.
