import { expect, it } from 'vitest';
import { fixture } from './helpers/safe-4337.js';
import { Safe4337SigningService } from '../src/sponsorship/signing.js';
import { WalletProviderError } from '../src/domain/signing.js';
it.each(['known', 'unknown'])(
  'preserves a %s consent failure without invoking the signing backend',
  async (kind) => {
    const f = await fixture();
    const source = await f.source();
    const error =
      kind === 'known'
        ? new WalletProviderError('wallet_authorization_denied')
        : new Error('private upstream detail');
    const service = new Safe4337SigningService(
      f.actions,
      f.db,
      f.config,
      {
        backend: f.backend,
        authorization: async () => 'Bearer example-fixture',
        authorizeSponsorship: async () => {
          throw error;
        },
      },
      f.request,
    );
    await expect(
      service.admit(f.context, source.action_id, f.operation),
    ).rejects.toMatchObject({
      code:
        kind === 'known'
          ? 'wallet_authorization_denied'
          : 'wallet_attempt_unavailable',
    });
    expect(f.state.signs).toBe(0);
  },
);
