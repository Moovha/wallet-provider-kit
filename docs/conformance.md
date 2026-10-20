# Deployment acceptance

Run `npm run verify`, `npm run build`, `npm run check:package`, `npm audit` and `npm pack --dry-run`. These checks validate offline contracts and fixtures, not provider certification.

Before enabling operations, test vault/database recovery, current identity and grant revocation, cross-application isolation, immutable retry behavior, fee ceilings and uncertain dispatch reconciliation. Verify Safe ownership, threshold, modules, handler, guard and all runtime pins against canonical chain state.

Use the same ten retained users for testnet bursts. Count all offered requests and independently verify every operation. See [latency evidence](execution-latency.md); testnet results are not a production service objective.
