import { randomUUID } from 'node:crypto';
import { Interface, Wallet, TypedDataEncoder } from 'ethers';
import { describe, expect, it } from 'vitest';
import { executionFixture } from './helpers/execution.js';
import { approvedCallsFixture } from './helpers/approved-calls.js';
import {
  runtimeCallPolicy,
  validateRuntimeCalls,
  type RuntimePolicySnapshot,
} from '../src/runtime-configuration/authority.js';
import { normalizeRuntimePolicy } from '../src/runtime-configuration/service.js';
import { serviceHash } from '../src/executor/auth.js';
import {
  approvedCallData,
  approvedCallPayload,
  buildApprovedCallIntent,
} from '../src/execution/approved-calls.js';
import {
  executionAttemptInput,
  validateExecutionDispatch,
  type ExecutionDispatch,
} from '../src/executor/protocol.js';
import type { ExecutorProviderConfiguration } from '../src/executor/config.js';
import { createWalletAttemptRequest } from '../src/providers/attempt-lifecycle.js';

async function fixture() {
  const owner = Wallet.createRandom(),
    original = executionFixture(),
    accountId = randomUUID();
  const base = approvedCallsFixture(accountId, owner.address, original).policy;
  const abi = new Interface([
    'function doWork(uint256)',
    'function doOtherWork(uint256)',
  ]);
  const policy = normalizeRuntimePolicy({
    expected_revision: '0',
    policy: {
      version: '1',
      enabled: true,
      chain_id: 'eip155:84532',
      contracts: [
        {
          address: Wallet.createRandom().address,
          code_hash: base.contracts[0].codeHash,
          methods: [
            { signature: 'doWork(uint256)', maximum_value_wei: '2' },
            { signature: 'doOtherWork(uint256)', maximum_value_wei: '5' },
          ],
        },
      ],
      maximum_calls: 2,
      maximum_native_value_wei: '10',
      max_validity_seconds: 120,
      claim_requirements: [],
    },
  }).policy;
  const snapshot: RuntimePolicySnapshot = {
    application_id: 'a'.repeat(64),
    revision: '1',
    policy_hash: serviceHash(policy),
    policy,
  };
  const input = {
    account_id: accountId,
    kind: 'contract-call' as const,
    calls: [
      {
        to: policy.contracts[0].address,
        value: '1',
        data: abi.encodeFunctionData('doWork', [1]),
      },
    ],
  };
  const plan = await original.plan();
  plan.profile = 'approved-evm-executor-v1';
  plan.runtimePolicy = snapshot;
  delete plan.tokenCodeHash;
  plan.action.expires_at = new Date(
    (Math.floor(Date.now() / 1000) + 120) * 1000,
  ).toISOString();
  plan.intent = buildApprovedCallIntent(
    runtimeCallPolicy(base, snapshot),
    input,
    '0',
    plan.action.expires_at,
  );
  plan.action.payload = approvedCallPayload(plan.intent);
  plan.action.chain_account_id = 'eip155:84532:' + owner.address;
  plan.action.payload_hash = plan.action.plan_hash = TypedDataEncoder.hash(
    plan.action.payload.domain,
    plan.action.payload.types,
    plan.action.payload.message,
  );
  plan.data = approvedCallData(
    plan.action,
    await owner.signTypedData(
      plan.action.payload.domain,
      plan.action.payload.types,
      plan.action.payload.message,
    ),
  );
  plan.sponsor.binding = {
    address: plan.sponsor.binding.address,
    bindingRevision: plan.sponsor.binding.bindingRevision,
  };
  const execution_id = randomUUID();
  const dispatch: ExecutionDispatch = {
    contract: 'execution-dispatch-v1',
    execution_id,
    provider_id: 'sponsor',
    provider_revision: '1',
    plan,
    wallet_attempt: createWalletAttemptRequest(
      'configured-execution-v1',
      plan.profile,
      'relay_transaction',
      accountId,
      execution_id,
      plan.action.action_id,
      executionAttemptInput(plan),
    ),
  };
  const provider: ExecutorProviderConfiguration = {
    id: 'sponsor',
    revision: '1',
    kind: 'openzeppelin-relayer',
    rpc: original.configuration.rpc,
    sponsors: original.configuration.sponsors,
    contractCalls: base,
    runtimeContracts: true,
  };
  return { snapshot, input, base, dispatch, provider };
}
describe('runtime executor snapshots', () => {
  it('independently validates runtime targets absent from its startup allowlist', async () => {
    const f = await fixture();
    expect(f.base.contracts[0].address).not.toBe(f.input.calls[0].to);
    expect(() =>
      validateExecutionDispatch(f.dispatch, f.provider),
    ).not.toThrow();
  });
  it.each([
    'opt-in',
    'hash',
    'revision',
    'infrastructure',
    'provider ceiling',
    'method limit',
    'batch limit',
    'payload',
    'attempt identity',
  ] as const)(
    'rejects invalid %s independently of the wallet callback',
    async (kind) => {
      const f = await fixture();
      if (kind === 'opt-in') f.provider.runtimeContracts = false;
      if (kind === 'hash') f.snapshot.policy_hash = 'b'.repeat(64);
      if (kind === 'revision') f.snapshot.revision = '0';
      if (kind === 'infrastructure')
        f.dispatch.plan.intent!.multiSend.address =
          Wallet.createRandom().address;
      if (kind === 'provider ceiling')
        f.provider.contractCalls!.maximumNativeValueWei = '0';
      if (kind === 'method limit') {
        f.snapshot.policy.contracts[0].methods[0].maximum_value_wei = '0';
        f.snapshot.policy_hash = serviceHash(f.snapshot.policy);
      }
      if (kind === 'batch limit') {
        f.snapshot.policy.maximum_calls = 1;
        f.dispatch.plan.intent!.input = f.input;
        f.input.calls.push(f.input.calls[0]);
        f.snapshot.policy_hash = serviceHash(f.snapshot.policy);
      }
      if (kind === 'payload')
        f.dispatch.plan.action.payload_hash = '0x' + '0'.repeat(64);
      if (kind === 'attempt identity')
        f.dispatch.wallet_attempt = {
          ...f.dispatch.wallet_attempt,
          requestHash: 'c'.repeat(64),
        };
      expect(() => validateExecutionDispatch(f.dispatch, f.provider)).toThrow();
    },
  );
  it('enforces each method limit rather than the largest limit on the contract', async () => {
    const f = await fixture();
    f.input.calls[0].value = '3';
    expect(() => validateRuntimeCalls(f.snapshot, f.input)).toThrow();
  });
});
