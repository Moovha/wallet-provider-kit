import { expect, it } from 'vitest';
import { failureOrigin } from '../src/sponsorship/failure-origin.js';
it('retains only approved static module locations from stack frames', () => {
  const error = new Error('sensitive request text');
  error.stack =
    'Error: sensitive request text\n    at deny (/app/dist/onboarding/policy.js:10:3)\n    at reserve (/app/dist/storage/sponsorship.js:84:9)';
  expect(failureOrigin(error)).toBe('storage/sponsorship:84');
  error.stack =
    'Error\n    at estimate (/app/dist/sponsorship/estimated-gas.js:41:7)';
  expect(failureOrigin(error)).toBe('sponsorship/estimated-gas:41');
  error.stack = 'Error: /app/dist/storage/sponsorship.js:84:9';
  expect(failureOrigin(error)).toBeUndefined();
  error.stack =
    'Error\n    at remote (https://private.example/dist/storage/sponsorship.js:84:9)';
  // A remote URL must never be mistaken for local code.
  expect(failureOrigin(error)).toBeUndefined();
});
