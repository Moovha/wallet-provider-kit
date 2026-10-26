# Run from source

Use this path to evaluate or develop the toolkit from its repository. A published
[release installer](provider-installation.md) uses prebuilt images instead.

## Prepare a disabled service

Use Node 26.12.1, npm 11.11.1 and a local Linux Docker engine with Compose. From
the repository:

```sh
npm ci
npm run build
node dist/main.js init provider.config.json
```

Review the generated provider name, HTTPS origin and privacy notice URL in
`provider.config.json`. Keep `activation.enabled` false. The configuration starts
with zero applications; application registration and user checks belong in the
administration console. For field details, see the [configuration reference](setup.md).

```sh
node dist/main.js local-setup --config provider.config.json
```

The terminal reports runtime requirements and its private deployment directory.
If the runtime is missing, review the proposed installation and explicitly add
`--install-runtime` to install it. Local installation builds containers from this
checkout and retains private storage and generated secrets. It does not enable
wallet operations or publish the service to the internet.

## Sign in

Open the printed administration address, read the private `installation-claim`
file and use **First-time setup** within 30 minutes. Follow the
[administrator steps](provider-installation.md#claim-administrator-access).

In administration, choose **Networks**, **Applications** and **User checks**.
Network choices apply after a provider restart. Keep the generated configuration,
environment and storage together for later restarts and backups. Before real
wallet use, complete the [launch checks](conformance.md).
