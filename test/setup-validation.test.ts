import { expect, it } from 'vitest';
import { explainIssue, identityFields } from '../setup-ui/validation.js';

it('routes policy requirements and vendor price errors to Policies while connection errors stay in Services', () => {
  for (const path of [
    '/policy/access/mode',
    '/policy/identity/application/verificationLevel',
    '/policy/identity/records/requiredFields',
    '/identity/didit/importPrice/maximumMinor',
    '/identity/sumsub/verificationPrice/termsReference',
  ]) {
    expect(explainIssue(`${path}: required`)).toMatch(/^Policies — /);
  }
  for (const path of [
    '/oauth/issuer',
    '/identity/didit/apiKey/env',
    '/identity/sumsub/levelName',
  ]) {
    expect(explainIssue(`${path}: required`)).toMatch(/^Services — /);
  }
});

it('points operators to the visible step and repeated field instead of a JSON path', () => {
  const message = explainIssue(
    '/policy/applications/1/funding/monthlyLimitMinor: maximum',
  );
  expect(message).toContain('Policies');
  expect(message).toContain(
    'Application 2 monthly identity budget (USD cents)',
  );
  expect(message).not.toContain('/policy');
  expect(message).not.toContain('monthlyLimitMinor');
});

it('explains conflicting transfer limits without exposing configuration property names', () => {
  const message = explainIssue(
    '/financial/maximumAmount: must not exceed lifetimeAmount',
  );
  expect(message).toContain(
    'maximum per transfer cannot exceed the total limit',
  );
  expect(message).not.toContain('lifetimeAmount');
});

it('does not reflect unknown imported fields or unexpected diagnostic text into the UI', () => {
  const unknownField = explainIssue(
    '/identity/didit/private-fixture-reference: additionalProperties',
  );
  expect(unknownField).toContain('unsupported field');
  expect(unknownField).not.toContain('private-fixture-reference');
  const unknownReason = explainIssue(
    '/backend/private-fixture-reference: unexpected-fixture-value',
  );
  expect(unknownReason).toContain('field instructions');
  expect(unknownReason).not.toContain('private-fixture-reference');
  expect(unknownReason).not.toContain('unexpected-fixture-value');
});

it('accepts agreed field lists and rejects invalid, duplicate, reserved or excessive requirements before export', () => {
  expect(identityFields({ value: '' })).toBe(true);
  expect(identityFields({ value: 'country\ncustomer_type' })).toBe(true);
  for (const value of [
    'Country',
    'country\ncountry',
    'constructor',
    'prototype',
    'a'.repeat(65),
    Array.from({ length: 17 }, (_, i) => `field_${i}`).join('\n'),
  ]) {
    expect(identityFields({ value })).toBe(false);
  }
});
