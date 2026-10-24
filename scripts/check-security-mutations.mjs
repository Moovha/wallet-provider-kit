/** Deliberate security regressions must fail behavioral tests in an isolated source copy. */
import assert from 'node:assert/strict';
import {
  cp,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const mutations = [
  {
    name: 'durable-budget-ceiling',
    file: 'src/storage/journal.ts',
    before: 'if (reserved > units(String(budget.maximum)))',
    after: 'if (false)',
    test: 'test/sqlite-storage.test.ts',
    title:
      'allows one dispatch across two independent processes and keeps exact large integer reservations',
  },
  {
    name: 'immutable-action-digest',
    file: 'src/providers/journaled.ts',
    before:
      'TypedDataEncoder.hash(\n        action.payload.domain,\n        types,\n        action.payload.message,\n      ) !== action.payload_hash',
    after: 'false',
    test: 'test/journaled-provider.test.ts',
    title: 'rejects invalid action digest before journal/provider effects',
  },
  {
    name: 'dispatch-revocation',
    file: 'src/providers/attempt-lifecycle.ts',
    before:
      '    try {\n      await authorize(attempt);\n      if (Date.parse(claim.leaseExpiresAt)',
    after: '    try {\n      if (Date.parse(claim.leaseExpiresAt)',
    test: 'test/journaled-provider.test.ts',
    title:
      'rechecks revocation after the journal wait and records a nondispatched failure',
  },
  {
    name: 'cached-result-revocation',
    file: 'src/providers/attempt-lifecycle.ts',
    before:
      "    if (claim.state === 'succeeded') {\n      await authorize(attempt);",
    after: "    if (claim.state === 'succeeded') {",
    test: 'test/journaled-provider.test.ts',
    title: 'rechecks current authorization after waiting for a cached result',
  },
  {
    name: 'signer-binding',
    file: 'src/providers/journaled.ts',
    before:
      'recoverAddress(action.payload_hash, result.signature).toLowerCase() !==\n        account.address.toLowerCase()',
    after: 'false',
    test: 'test/journaled-provider.test.ts',
    title: 'verifies the provider signature independently before persistence',
  },
  {
    name: 'chain-domain',
    file: 'src/sponsorship/user-operation.ts',
    before: '[inner, selected.entryPoint, BigInt(selected.chainId)]',
    after: '[inner, selected.entryPoint, 1n]',
    test: 'test/sepolia-user-operation-domain.test.ts',
    title:
      'pins Ethereum mainnet identity and separates operation hashes from every other supported network',
  },
  {
    name: 'paymaster-gas-reservation',
    file: 'src/sponsorship/user-operation.ts',
    before: "    operation.paymasterPostOpGasLimit ?? '0x0',",
    after: "    '0x0',",
    test: 'test/sponsorship.test.ts',
    title:
      'matches frozen independent viem 2.57.7 UserOperation hash vectors with and without a paymaster',
  },
];
const directory = await mkdtemp(join(tmpdir(), 'wpk-security-mutations-'));
try {
  for (const name of [
    'src',
    'test',
    'scripts',
    'contracts',
    'spec',
    'package.json',
    'tsconfig.json',
    'tsconfig.test.json',
    'vitest.config.ts',
  ])
    await cp(join(root, name), join(directory, name), { recursive: true });
  await symlink(
    join(root, 'node_modules'),
    join(directory, 'node_modules'),
    'dir',
  );
  async function run(test, title) {
    const report = join(directory, 'report.json');
    await rm(report, { force: true });
    let code = 0;
    try {
      await execute(
        process.execPath,
        [
          join(root, 'node_modules/vitest/vitest.mjs'),
          'run',
          test,
          ...(title ? ['-t', title] : []),
          '--reporter=json',
          '--outputFile=' + report,
        ],
        {
          cwd: directory,
          timeout: 120000,
          maxBuffer: 1024 * 1024,
        },
      );
    } catch (error) {
      assert.equal(
        error.code,
        1,
        'Mutation run failed outside test assertions',
      );
      code = error.code;
    }
    const result = JSON.parse(await readFile(report, 'utf8'));
    const assertions = result.testResults.flatMap((suite) => {
      assert.equal(suite.message, '', 'A suite failed to load');
      return suite.assertionResults;
    });
    assert.ok(
      assertions.some(
        (test) => test.status === 'passed' || test.status === 'failed',
      ),
      'No matching tests executed',
    );
    return {
      code,
      failed: assertions.filter((test) => test.status === 'failed').length,
    };
  }
  for (const test of new Set(mutations.map((mutation) => mutation.test))) {
    const baseline = await run(test);
    assert.deepEqual(
      baseline,
      { code: 0, failed: 0 },
      'Baseline tests must pass before mutation',
    );
  }
  for (const mutation of mutations) {
    const path = join(directory, mutation.file);
    const original = await readFile(path, 'utf8');
    assert.equal(
      original.split(mutation.before).length,
      2,
      'Mutation source changed: ' + mutation.name,
    );
    try {
      await writeFile(path, original.replace(mutation.before, mutation.after));
      const result = await run(mutation.test, mutation.title);
      assert.equal(
        result.code,
        1,
        'Surviving security mutation: ' + mutation.name,
      );
      assert.ok(result.failed > 0, 'Mutation must fail an executed assertion');
      console.log('Detected security regression: ' + mutation.name);
    } finally {
      await writeFile(path, original);
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
