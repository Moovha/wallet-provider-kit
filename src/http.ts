/** Compose the HTTP resource server with your reviewed host integrations. */
export { createServer } from './service/server.js';
export type { ServerOptions } from './service/server.js';
export { createAuthenticator } from './service/auth.js';
export type { Authenticate, OAuthConfiguration } from './service/auth.js';
export type { paths as ProviderPaths } from './protocol/provider-api.generated.js';

export { WalletCallsService } from './wallet-calls/service.js';
export type { WalletCallsBatchSummary } from './wallet-calls/types.js';
