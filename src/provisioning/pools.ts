import { deny } from '../onboarding/policy.js';
import type { RuntimeConfigurationState } from '../runtime-configuration/service.js';

export function retainPoolConfiguration(
  registry: RuntimeConfigurationState,
  applicationId: string,
  expected: { safeCount: number; sponsorCount: number },
) {
  const saved = registry.applicationPoolConfigurations?.[applicationId];
  const legacy =
    !saved &&
    (poolMembers(registry.applicationSafes, applicationId).length ||
      poolMembers(registry.applicationSponsors, applicationId).length);
  const current =
    saved ??
    (legacy
      ? {
          safeCount: Math.max(
            1,
            ...poolMembers(registry.applicationSafes, applicationId).map(
              (r) => (r.poolIndex ?? 0) + 1,
            ),
          ),
          sponsorCount: Math.max(
            1,
            ...poolMembers(registry.applicationSponsors, applicationId).map(
              (r) => (r.poolIndex ?? 0) + 1,
            ),
          ),
        }
      : expected);
  if (
    current.safeCount !== expected.safeCount ||
    current.sponsorCount !== expected.sponsorCount
  )
    deny();
  (registry.applicationPoolConfigurations ??= {})[applicationId] ??= {
    ...current,
  };
}

export function poolKey(applicationId: string, index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > 15) deny();
  return index === 0 ? applicationId : applicationId + ':' + index;
}

export function poolMembers<
  T extends {
    applicationId: string;
    poolIndex?: number;
    userAccountId?: string;
  },
>(records: Record<string, T> | undefined, applicationId: string): T[] {
  return Object.values(records ?? {})
    .filter(
      (r) => r.applicationId === applicationId && r.userAccountId === undefined,
    )
    .sort((a, b) => (a.poolIndex ?? 0) - (b.poolIndex ?? 0));
}
