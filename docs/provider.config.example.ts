// Copy into your provider application. Public settings live here; credentials come from your secret store.
import { resolve } from 'node:path';
import { createOnboardingProvider } from '@moovha/wallet-provider-kit/onboarding';
import { createCdpWalletProvider } from '@moovha/wallet-provider-kit/cdp';
import { openProviderDatabase } from '@moovha/wallet-provider-kit/storage';

function secret(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

// Initialize once with initialize: true in operator setup; normal startup only opens it.
const database = openProviderDatabase({ directory: resolve('.provider-data') });
const app = await createOnboardingProvider({
  policy: {
    version: '1',
    provider: {
      name: 'Your Wallet Provider',
      origin: 'https://wallet.example.com',
      privacyUrl: 'https://wallet.example.com/privacy',
    },
    applications: [
      {
        issuer: 'https://applications.example.com',
        // Connected application's OAuth registration; match its checked token's client_id.
        clientId: 'your-registered-application-client',
        // Human-readable application name for operator tools.
        name: 'Your Connected Application',
        permissions: ['account:read', 'operations:request'],
        assertionTrust: {
          agreement: 'your-reviewed-application-trust-agreement',
        },
      },
    ],
    identity: {
      maxAgeDays: 90,
      application: {
        verificationLevel: 'verified',
        requiredFields: ['country'],
      },
    },
    access: { mode: 'application', maxAgeDays: 7 },
  },
  oauth: {
    issuer: 'https://applications.example.com',
    audience: 'your-wallet-provider',
    jwksUrl: 'https://applications.example.com/jwks',
  },
  identity: {},
  storage: database.onboardingStore,
  walletBackend: createCdpWalletProvider({
    WALLET_SERVICE_MODE: 'provider',
    WALLET_BACKEND: 'cdp',
    WALLET_CDP_API_KEY_ID: secret('WALLET_CDP_API_KEY_ID'),
    WALLET_CDP_API_KEY_SECRET: secret('WALLET_CDP_API_KEY_SECRET'),
    WALLET_CDP_WALLET_SECRET: secret('WALLET_CDP_WALLET_SECRET'),
  }),
  ready: async () => (await database.ready()) && false, // Replace false after backend lifecycle/recovery acceptance.
});

app.addHook('onClose', async () => database.close());
await app.listen({ host: '127.0.0.1', port: 8080 });
