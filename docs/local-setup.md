# Run from source

Use this path to evaluate or develop the toolkit from its repository. If you have
a published release bundle, the [installer](provider-installation.md) uses
prebuilt images instead.

## Open setup

Install Node 24.22.0, npm 11.11.1 and Git, and have a local Linux Docker engine
with Compose available. From this repository:

```sh
npm ci
npm run build
node dist/main.js setup
```

Follow **Choose where to run → Review your setup → Start and sign in**. The wizard
checks Docker and prepares a private deployment directory. Review its plan before
starting. Application registration happens later.

## Sign in to your new service

When startup completes, open the administration link shown by setup. Read the
private `installation-claim` file in the displayed deployment directory and use
**First-time setup** within 30 minutes. Follow the
[administrator steps](provider-installation.md#claim-administrator-access).

Keep the generated configuration, environment and persistent volumes together.
Reuse them on restart. The console should be available with zero applications
and wallet operations disabled. Next, [connect an application](runtime-workspace.md).

Choose [Advanced configuration](setup-wizard.md) only when you need to maintain
an explicit static configuration. Before real wallet use, complete the
[launch checks](conformance.md).
