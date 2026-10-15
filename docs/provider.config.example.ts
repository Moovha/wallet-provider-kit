// Copy into your provider application. Public settings live here; credentials come from your secret store.
import { resolve } from 'node:path';
import { createOnboardingProvider } from '@moovha/wallet-provider-kit/onboarding';
import { createCdpWalletProvider } from '@moovha/wallet-provider-kit/cdp';

function secret(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

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
        // Human-readable name shown to the account owner on the consent screen.
        name: 'Your Connected Application',
        permissions: ['account:read', 'operations:request'],
        // Add funding only after agreeing who pays, the cap and reimbursement terms.
        // funding: { agreement: 'signed-partner-agreement', monthlyLimitMinor: yourUsdCentsCap },
      },
    ],
    // Defaults: provider review, identity no older than 365 days, access up to 30 days.
    // identity: { maxAgeDays: 90 },
    // access: { maxAgeDays: 7 },
  },
  oauth: {
    issuer: 'https://applications.example.com',
    audience: 'your-wallet-provider',
    jwksUrl: 'https://applications.example.com/jwks',
  },
  ownerLogin: {
    // Separate OIDC registration: this wallet service uses it to sign owners in.
    issuer: 'https://your-existing-login.example.com',
    clientId: 'your-provider-login-client',
    clientSecret: secret('PROVIDER_LOGIN_SECRET'),
  },
  reviewers: ['your-provider-reviewer-oidc-subject'],
  identity: {
    didit: {
      apiKey: secret('DIDIT_API_KEY'),
      workflowId: '00000000-0000-4000-8000-000000000001',
      // Add confirmed importPrice/verificationPrice to enable budgeted vendor calls.
      // importPrice: { maximumMinor: yourConfirmedUsdCentsBound, termsReference: 'vendor-terms' },
    },
    // Or use Sumsub (both can be configured):
    // sumsub: {
    //   appToken: secret('SUMSUB_APP_TOKEN'), secretKey: secret('SUMSUB_SECRET_KEY'),
    //   levelName: 'your-recipient-level', reusableKycShareEnabled: true,
    // },
  },
  storageDirectory: resolve('.provider-data'),
  walletBackend: createCdpWalletProvider({
    WALLET_SERVICE_MODE: 'provider',
    WALLET_BACKEND: 'cdp',
    WALLET_CDP_API_KEY_ID: secret('WALLET_CDP_API_KEY_ID'),
    WALLET_CDP_API_KEY_SECRET: secret('WALLET_CDP_API_KEY_SECRET'),
    WALLET_CDP_WALLET_SECRET: secret('WALLET_CDP_WALLET_SECRET'),
  }),
  ready: async () => false, // Replace after backend lifecycle/recovery acceptance; credentials alone are insufficient.
});

await app.listen({ host: '127.0.0.1', port: 8080 });
