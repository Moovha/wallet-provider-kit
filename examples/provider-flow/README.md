# Offline provider integration

Follow the [step-by-step tutorial](../../docs/integration-example.md). From the
repository root run `npm run example:provider`. After installing its tarball, run
`node node_modules/@moovha/wallet-provider-kit/examples/provider-flow/run.mjs`.

The example uses real JWT verification, actual HTTP middleware, an ephemeral
unfunded signer and the public journal wrapper. `host.mjs` and
`attempt-journal.mjs` are single-run fixtures, not persistent or deployable host
adapters. The runner opens no port and reads no live credentials. It asserts seven
success/denial/replay/unknown-outcome steps and closes the application on exit.

Read `run.mjs` for composition, `host.mjs` for authority, `backend.mjs` for the
wallet adapter and `attempt-journal.mjs` for the journal fixture. Continue with
[backend integration](../../docs/backend-guide.md) to replace the wallet adapter,
then connect your host's durable policy and storage through the
[provider guide](../../docs/provider-guide.md).
