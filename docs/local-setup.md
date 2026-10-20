# Local setup

From a source checkout, run `npm ci` with the supported Node 24 runtime, then `npm run build`. Run `node dist/main.js setup` to open the local wizard. Follow Provider, Backend, Services, Applications, Deployment and Export in order.

The wizard checks local Docker/Compose availability and prepares a private deployment directory. Retain the exported configuration, generated environment and persistent volumes. Installation and service startup are explicit operator actions. See [setup](setup.md), [deployment](operator-deployment.md) and [acceptance](conformance.md).
