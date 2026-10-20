# Local setup

From a source checkout, run `npm ci` with the supported Node 24 runtime, then `npm run build`. Run `node dist/main.js setup` to open the local wizard. Follow Choose where to run, Review your setup and Start and sign in.
Application registration is deferred until the provider runs. Select Advanced
configuration only for the explicit static configuration editor.

The wizard checks local Docker/Compose availability and prepares a private deployment directory. Retain the exported configuration, generated environment and persistent volumes. Installation and service startup are explicit operator actions. See [setup](setup.md), [deployment](operator-deployment.md) and [acceptance](conformance.md).

For API-managed installation, open the administration link after setup completes.
Read the private installation-claim file from the displayed deployment directory
and create the administrator within 30 minutes. Management can be healthy while
wallet execution remains disabled. See [administration](provider-installation.md).
