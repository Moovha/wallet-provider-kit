import { openProviderDatabase } from '../../src/storage/index.js';
import { OnboardingService } from '../../src/onboarding/service.js';
import { SupportedActions } from '../../src/deployment/actions.js';
import { SafeExecutionQueue } from '../../src/execution/queue.js';
import { fingerprint } from '../../src/onboarding/policy.js';
import type { ProviderConfiguration } from '../../src/deployment/config.js';
import type { AuthorityContext } from '../../src/domain/principal.js';
import type { ApprovedCallInput } from '../../src/execution/approved-calls.js';
let data = '';
for await (const chunk of process.stdin) data += chunk;
const { config, context, input } = JSON.parse(data) as {
  config: ProviderConfiguration;
  context: AuthorityContext;
  input: ApprovedCallInput;
};
const database = openProviderDatabase({ directory: config.storage.directory });
try {
  const revision = await database.onboardingStore.transaction(
    (state) => state.deploymentBindings!['service-v1'].activeRevision!,
  );
  const unused = async (): Promise<never> => {
    throw new Error('Offline enqueue-only fixture');
  };
  const onboarding = new OnboardingService(
    config.policy,
    database.onboardingStore,
    [
      {
        vendor: 'didit',
        policyFingerprint: 'offline',
        importShared: unused,
        read: unused,
      },
    ],
    undefined,
    fingerprint([config.financial ?? null, config.approvedCalls]),
  );
  const actions = new SupportedActions(
    onboarding,
    database,
    config.financial,
    revision,
    config.approvedCalls,
  );
  const queue = new SafeExecutionQueue(
    actions,
    database,
    { refresh: unused, execute: unused },
    unused,
    config.execution!.safeQueue!,
    300,
  );
  await queue.enqueue(context, input);
  process.stdout.write(JSON.stringify({ accepted: true }));
} catch {
  process.stdout.write(JSON.stringify({ accepted: false }));
} finally {
  database.close();
}
