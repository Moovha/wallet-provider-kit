import { expect, it } from 'vitest';
import {
  poolKey,
  poolMembers,
  retainPoolConfiguration,
} from '../src/provisioning/pools.js';
import type { RuntimeConfigurationState } from '../src/runtime-configuration/service.js';
it('retains pool sizes and refuses unreviewed resizing', () => {
  const registry = {} as RuntimeConfigurationState;
  retainPoolConfiguration(registry, 'offline', {
    safeCount: 2,
    sponsorCount: 2,
  });
  expect(registry.applicationPoolConfigurations?.offline).toEqual({
    safeCount: 2,
    sponsorCount: 2,
  });
  expect(() =>
    retainPoolConfiguration(registry, 'offline', {
      safeCount: 3,
      sponsorCount: 2,
    }),
  ).toThrow();
  expect(() =>
    retainPoolConfiguration(registry, 'offline', {
      safeCount: 1,
      sponsorCount: 1,
    }),
  ).toThrow();
});
it('preserves legacy member zero and reconciles retained indexed members', () => {
  expect(poolKey('offline', 0)).toBe('offline');
  expect(poolKey('offline', 1)).toBe('offline:1');
  const registry = {
    applicationSafes: {
      offline: { applicationId: 'offline' },
      'offline:1': { applicationId: 'offline', poolIndex: 1 },
    },
    applicationSponsors: {
      offline: { applicationId: 'offline' },
      'offline:1': { applicationId: 'offline', poolIndex: 1 },
    },
  } as unknown as RuntimeConfigurationState;
  retainPoolConfiguration(registry, 'offline', {
    safeCount: 2,
    sponsorCount: 2,
  });
  expect(
    poolMembers(registry.applicationSafes, 'offline').map(
      (m) => m.poolIndex ?? 0,
    ),
  ).toEqual([0, 1]);
  expect(() => poolKey('offline', 16)).toThrow();
});
