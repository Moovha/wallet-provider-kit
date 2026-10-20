import { expect, it } from 'vitest';
import { getBytes, Wallet } from 'ethers';
import { fixture } from './helpers/safe-4337.js';
import { fingerprint } from '../src/onboarding/policy.js';
import { Safe4337SigningService } from '../src/sponsorship/signing.js';
import {
  createLocalPaymasterTransport,
  localPaymasterUrl,
} from '../src/sponsorship/local-paymaster.js';

async function setup() {
  const f = await fixture((config) => {
    config.paymaster.url = localPaymasterUrl;
    config.acceptance.rpcVerification = 'single';
    config.acceptance.rpcUrls = [config.acceptance.rpcUrls[0]];
  });
  const signer = Wallet.createRandom();
  let signatures = 0;
  let service: Safe4337SigningService;
  const transport = createLocalPaymasterTransport(
    {
      ...f.config.paymaster,
      maximumCostWei: '10000000',
      domain: f.config.acceptance.domain,
      paymaster: f.config.acceptance.paymaster.address,
      signer: signer.address,
      authorize: (request) => service.authorizeLocalPaymaster(request),
      sign: async (hash) => {
        signatures++;
        return signer.signMessage(getBytes(hash));
      },
    },
    f.request,
  );
  service = new Safe4337SigningService(
    f.actions,
    f.db,
    f.config,
    {
      backend: f.backend,
      authorization: async () => 'Bearer offline-internal',
      authorizeSponsorship: async (_context, terms) =>
        f.state.consent
          ? {
              termsHash: fingerprint(terms),
              consentReference: 'offline-local-paymaster',
            }
          : null,
    },
    transport,
  );
  return {
    f,
    service,
    get signatures() {
      return signatures;
    },
  };
}
it('uses the common durable allowance and phase claim for a local final sponsorship quote, without vendor calls or a second quote', async () => {
  const t = await setup(),
    { f, service } = t;
  const admitted = await service.requestCalls(f.context, f.input, f.operation);
  const record = f.db.sponsorship.load(admitted.operation_id)!;
  const request = {
    method: 'pm_getPaymasterStubData' as const,
    operation: f.operation,
    maximumCostWei: record.maximumCostWei,
    context: {
      applicationId: record.preparation.runtimePolicy.application_id,
      policyRevision: record.preparation.runtimePolicy.revision,
      policyHash: record.preparation.runtimePolicy.policy_hash,
      actionId: record.id,
    },
  };
  await expect(service.authorizeLocalPaymaster(request)).rejects.toThrow();
  expect(t.signatures).toBe(0);
  await service.sponsor(f.context, record.id);
  const sponsored = f.db.sponsorship.load(record.id)!;
  expect(sponsored.phases.stub?.result?.isFinal).toBe(true);
  expect(sponsored.phases.final).toBeUndefined();
  expect(t.signatures).toBe(1);
  expect(f.state.posts).toBe(0);
  await service.sponsor(f.context, record.id);
  expect(t.signatures).toBe(1);
  await expect(service.authorizeLocalPaymaster(request)).rejects.toThrow();
});
it('rejects withdrawn sponsorship consent before local signing', async () => {
  const t = await setup(),
    { f, service } = t;
  const admitted = await service.requestCalls(f.context, f.input, f.operation);
  f.state.consent = false;
  await expect(
    service.sponsor(f.context, admitted.operation_id),
  ).rejects.toThrow();
  expect(t.signatures).toBe(0);
  expect(f.state.posts).toBe(0);
});
