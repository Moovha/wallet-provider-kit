# Find the module you need

Use this reference when embedding or extending the toolkit. Application developers
calling a deployed service can start with the [HTTP guide](http-api.md) instead.

The package exposes core authority, HTTP composition, onboarding, identity,
telemetry, storage, deployment, OWS signing, wallet calls and sponsorship modules.
The generated [TypeScript reference](api-reference.md) lists exact exports and
import paths. Use the [integration guide](api.md) to choose the right boundary.

## Check a package as a maintainer

Run `npm run build` to rebuild from a clean output directory, then
`npm run check:package` to install the packed artifact into an isolated consumer
and verify exports and the executable. npm publication remains disabled with
`private: true`. Follow the [release process](releases.md) for candidate review.
