import { UsdZarFxReader } from './usd-zar-fx.js';
import { randomUUID } from 'node:crypto';
import {
  Interface,
  TypedDataEncoder,
  ZeroAddress,
  keccak256,
  recoverAddress,
} from 'ethers';
import type {
  AuthorityContext,
  VerifiedPrincipal,
} from '../domain/principal.js';
import { EmbeddedWalletService } from '../domain/embedded-wallet.js';
import type {
  WalletSigningProvider,
  TypedDataAction,
} from '../domain/signing.js';
import { WalletProviderError } from '../domain/signing.js';
import type {
  ProviderDatabase,
  FinancialApproval,
  FinancialAuthorization,
} from '../storage/index.js';
import type { OnboardingService } from '../onboarding/service.js';
import type { ProviderState, AccessGrant } from '../onboarding/types.js';
import { deny, fingerprint, uuid } from '../onboarding/policy.js';
import { walletDescription } from '../onboarding/wallets.js';
import {
  runtimeApplicationId,
  type RuntimeConfigurationService,
} from '../runtime-configuration/service.js';
import {
  ApplicationCredentialCipher,
  type ApplicationCredential,
} from '../runtime-configuration/credentials.js';
import { currentRuntimePolicy } from '../runtime-configuration/authority.js';
import {
  proxyImplementationSlot,
  type PinnedContract,
} from '../execution/approved-calls.js';
import type { SafeWalletAccount } from '../sponsorship/safe-wallet.js';
import { RpcReader } from '../execution/chain.js';
import { createJournaledWalletProvider } from '../providers/journaled.js';
import {
  reviewUniswapXV3Order,
  validateUniswapXOrderPolicy,
  type UniswapXOrderPolicy,
  type UniswapXOrderReview,
  baseDutchV3Reactor,
  uniswapXPermit2,
} from './uniswapx-v3.js';
import {
  assessSolverTwap,
  assessSolverFx,
  type OrderSnapshot,
} from './price-policy.js';
import { UniswapXTransport } from './transport.js';
import { recoverUniswapXFill, type OrderFillProof } from './recovery.js';

const tokenAbi = new Interface([
  'function allowance(address,address) view returns(uint256)',
  'function balanceOf(address) view returns(uint256)',
  'function approve(address,uint256) returns(bool)',
]);
const safeAbi = new Interface([
  'function VERSION() view returns(string)',
  'function masterCopy() view returns(address)',
  'function getOwners() view returns(address[])',
  'function getThreshold() view returns(uint256)',
  'function isValidSignature(bytes32,bytes) view returns(bytes4)',
]);
const permitAbi = new Interface([
  'function nonceBitmap(address,uint256) view returns(uint256)',
  'function invalidateUnorderedNonces(uint256,uint256)',
]);
const same = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();
const namespace = 'uniswapx-signing-v1';
function walletAuthorityHash(wallet: SafeWalletAccount) {
  return fingerprint([
    wallet.accountId,
    wallet.applicationId,
    wallet.owner,
    wallet.signer,
    wallet.binding,
  ]);
}
export interface UniswapXOrderRecord {
  plan: {
    id: string;
    accountId: string;
    applicationId: string;
    context: AuthorityContext;
    owner: string;
    grantId: string;
    walletHash: string;
    policyRevision: string;
    policy: UniswapXOrderPolicy;
    quote: Record<string, unknown>;
    requestHash: string;
    review: UniswapXOrderReview;
    approval: FinancialApproval;
    startBlock: number;
    priceProof:
      | Awaited<ReturnType<typeof assessSolverTwap>>
      | Awaited<ReturnType<typeof assessSolverFx>>;
  };
  state:
    | 'authorizing'
    | 'prepared'
    | 'requires_approval'
    | 'signed'
    | 'open'
    | 'unknown'
    | 'succeeded'
    | 'cancelled'
    | 'expired'
    | 'needs_review';
  signature?: ApplicationCredential;
  postDispatched: boolean;
  chainFinalized?: boolean;
  cancellation?: {
    transactionHash: string;
    blockNumber: number;
    blockHash: string;
  };
  fill?: OrderFillProof;
  code?:
    | 'signing_pending'
    | 'post_unknown'
    | 'chain_unavailable'
    | 'unexpected_effect';
}
export interface UniswapXServiceOptions {
  policy: UniswapXOrderPolicy;
  module: PinnedContract;
  genesisHash: string;
  authorityRevision: string;
  apiKey: () => string;
  active: () => boolean;
  fetch?: typeof fetch;
}
/** Owns exact-order signing and durable dispatch. Recovering a process never
 * grants another signature or a replacement order. Existing wallet grants do
 * not include the separate orders:authorize permission. */
export class UniswapXOrderService {
  private readonly policy: UniswapXOrderPolicy;
  private readonly fx: UsdZarFxReader;
  private readonly policyRevision: string;
  private readonly transport: UniswapXTransport;
  private readonly financial: ReturnType<
    ProviderDatabase['financialAuthority']
  >;
  private readonly signing: EmbeddedWalletService;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = false;
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly database: ProviderDatabase,
    private readonly resources: RuntimeConfigurationService,
    private readonly backend: WalletSigningProvider,
    private readonly cipher: ApplicationCredentialCipher,
    private readonly options: UniswapXServiceOptions,
  ) {
    validateUniswapXOrderPolicy(options.policy);
    this.fx = new UsdZarFxReader({ fetch: options.fetch });
    this.policy = structuredClone(options.policy);
    this.policyRevision = fingerprint(['uniswapx-v3-order-v1', this.policy]);
    if (!/^[\x21-\x7e]{16,512}$/.test(options.apiKey()))
      throw new WalletProviderError('wallet_provider_configuration');
    this.transport = new UniswapXTransport(options.apiKey, options.fetch);
    this.financial = database.financialAuthority({
      namespace,
      provider: backend.provider,
      authorize: (context, approval) =>
        this.authorizeSigning(context, approval),
      signatureProtection: {
        seal: (request, signature) =>
          JSON.stringify(
            this.cipher.seal(
              this.signatureMetadata(request.requestHash, request.accountId),
              signature,
            ),
          ),
        open: (request, sealed) => {
          const value = JSON.parse(sealed) as ApplicationCredential;
          const { sealed: _sealed, ...metadata } = value;
          if (
            fingerprint(metadata) !==
            fingerprint(
              this.signatureMetadata(request.requestHash, request.accountId),
            )
          )
            deny();
          return this.cipher.open(value);
        },
      },
    });
    this.signing = new EmbeddedWalletService(
      this.financial.authority,
      createJournaledWalletProvider(backend, {
        namespace,
        journal: this.financial.journal,
        authorizeAttempt: this.financial.authorizeAttempt,
      }),
    );
  }
  private signatureMetadata(reference: string, applicationId: string) {
    return {
      application_id: applicationId,
      reference,
      revision: '1',
      origin: 'uniswapx-v3-order-v1',
      status: 'active' as const,
    };
  }
  async initialize() {
    await this.onboarding.store.transaction((state) => {
      const deployment = state.deploymentBindings?.['service-v1'];
      if (!deployment) deny();
      deployment.uniswapXOrderPolicyRevision = this.policyRevision;
    });
  }
  private async current<T>(
    principal: VerifiedPrincipal,
    accountId: string,
    run: (
      state: ProviderState,
      grant: AccessGrant,
      wallet: SafeWalletAccount,
    ) => T,
  ) {
    if (
      !this.options.active() ||
      !principal.scopes.includes('wallet:actions') ||
      !principal.scopes.includes('wallet:sign')
    )
      deny();
    return this.onboarding.withAccountAccess(
      principal,
      accountId,
      'orders:authorize',
      (state, grant) => {
        const applicationId = runtimeApplicationId(
          principal.issuer,
          principal.clientId,
        );
        const deployment = state.deploymentBindings?.['service-v1'];
        const wallet =
          deployment?.runtimeConfiguration?.safeWalletAccounts?.[accountId];
        const request = state.requests[grant.requestId];
        if (
          deployment?.activeRevision !== this.options.authorityRevision ||
          deployment.uniswapXOrderPolicyRevision !== this.policyRevision ||
          !wallet ||
          wallet.status !== 'ready' ||
          wallet.applicationId !== applicationId ||
          wallet.owner !== grant.owner ||
          wallet.ownerAdministration?.status === 'suspended' ||
          request?.membership ||
          request?.sharing ||
          walletDescription(state.accounts[accountId]).kind !== 'personal'
        )
          deny();
        const snapshot = currentRuntimePolicy(state, principal);
        if (
          !snapshot.policy.enabled ||
          snapshot.policy.chain_id !== 'eip155:8453'
        )
          deny();
        return run(state, grant, wallet);
      },
    );
  }
  private async reader(applicationId: string, readOnlyRecovery = false) {
    let endpoint: string;
    try {
      endpoint = (await this.resources.rpcEndpoints(applicationId))[0];
    } catch {
      if (!readOnlyRecovery)
        throw new WalletProviderError('wallet_provider_unavailable');
      endpoint = 'https://mainnet.base.org';
    }
    return new RpcReader(
      endpoint,
      this.options.fetch ?? fetch,
      2,
      true,
      'endpoint-failover',
    );
  }
  private async pin(reader: RpcReader, pin: PinnedContract, block: unknown) {
    if (
      keccak256(
        String(await reader.call('eth_getCode', [pin.address, block])),
      ) !== pin.codeHash
    )
      deny();
    if (pin.implementation) {
      const storage = String(
        await reader.call('eth_getStorageAt', [
          pin.address,
          proxyImplementationSlot(pin),
          block,
        ]),
      );
      if (
        !/^0x[0-9a-fA-F]{64}$/.test(storage) ||
        !same('0x' + storage.slice(-40), pin.implementation.address)
      )
        deny();
      await this.pin(reader, pin.implementation, block);
    }
  }
  private async verify(
    principal: VerifiedPrincipal,
    accountId: string,
    review: UniswapXOrderReview,
  ) {
    const wallet = await this.current(
      principal,
      accountId,
      (_state, _grant, wallet) => structuredClone(wallet),
    );
    const applicationId = runtimeApplicationId(
      principal.issuer,
      principal.clientId,
    );
    const reader = await this.reader(applicationId);
    if ((await reader.call('eth_chainId', [])) !== '0x2105') deny();
    const genesis = (await reader.call('eth_getBlockByNumber', [
      '0x0',
      false,
    ])) as { hash: string };
    if (genesis.hash !== this.options.genesisHash) deny();
    const raw = (await reader.call('eth_getBlockByNumber', [
      'latest',
      false,
    ])) as { hash: string; number: string; timestamp: string };
    const snapshot: OrderSnapshot = {
      hash: raw.hash,
      number: Number(BigInt(raw.number)),
      timestamp: Number(BigInt(raw.timestamp)),
    };
    const block = { blockHash: snapshot.hash, requireCanonical: true };
    const route =
      this.policy.routes.find(
        (route) =>
          same(route.tokenIn.address, review.tokenIn) &&
          same(route.tokenOut.address, review.tokenOut),
      ) ?? deny();
    await Promise.all([
      this.pin(reader, wallet.binding, block),
      this.pin(reader, wallet.binding.singleton, block),
      this.pin(reader, this.options.module, block),
      this.pin(
        reader,
        { address: baseDutchV3Reactor, codeHash: this.policy.reactorCodeHash },
        block,
      ),
      this.pin(
        reader,
        {
          address: uniswapXPermit2,
          codeHash:
            '0xa67739abc3ede9dbdc0491636c67d6a14ac07fab9030c3f509b1eb7b11dff8ed',
        },
        block,
      ),
      this.pin(reader, route.tokenIn, block),
      this.pin(reader, route.tokenOut, block),
    ]);
    const call = async (
      abi: Interface,
      to: string,
      method: string,
      args: unknown[] = [],
    ) =>
      abi.decodeFunctionResult(
        method,
        String(
          await reader.call('eth_call', [
            { to, data: abi.encodeFunctionData(method, args) },
            block,
          ]),
        ),
      );
    const [
      version,
      singleton,
      owners,
      threshold,
      handler,
      guard,
      balance,
      allowance,
      nonce,
    ] = await Promise.all([
      call(safeAbi, wallet.binding.address, 'VERSION'),
      call(safeAbi, wallet.binding.address, 'masterCopy'),
      call(safeAbi, wallet.binding.address, 'getOwners'),
      call(safeAbi, wallet.binding.address, 'getThreshold'),
      reader.call('eth_getStorageAt', [
        wallet.binding.address,
        keccak256(new TextEncoder().encode('fallback_manager.handler.address')),
        block,
      ]),
      reader.call('eth_getStorageAt', [
        wallet.binding.address,
        keccak256(new TextEncoder().encode('guard_manager.guard.address')),
        block,
      ]),
      call(tokenAbi, review.tokenIn, 'balanceOf', [wallet.binding.address]),
      call(tokenAbi, review.tokenIn, 'allowance', [
        wallet.binding.address,
        uniswapXPermit2,
      ]),
      call(permitAbi, uniswapXPermit2, 'nonceBitmap', [
        wallet.binding.address,
        BigInt(review.nonce) >> 8n,
      ]),
    ]);
    if (
      version[0] !== '1.4.1' ||
      !same(singleton[0], wallet.binding.singleton.address) ||
      threshold[0] !== 1n ||
      owners[0].length !== 1 ||
      !same(owners[0][0], wallet.signer.address) ||
      String(handler).toLowerCase() !==
        '0x' +
          '0'.repeat(24) +
          this.options.module.address.slice(2).toLowerCase() ||
      String(guard) !== '0x' + '0'.repeat(64) ||
      balance[0] < BigInt(review.amountInUnits) ||
      (nonce[0] & (1n << (BigInt(review.nonce) & 255n))) !== 0n
    )
      deny();
    const price =
      this.policy.pricePolicy.profile === 'solver-fiat-fx-v1'
        ? await assessSolverFx(this.fx, this.policy.pricePolicy, review)
        : await assessSolverTwap(
            reader,
            this.policy.pricePolicy,
            review,
            snapshot,
          );
    const latest = (await reader.call('eth_getBlockByNumber', [
      '0x' + snapshot.number.toString(16),
      false,
    ])) as { hash: string };
    if (
      latest.hash !== snapshot.hash ||
      snapshot.timestamp < Math.floor(Date.now() / 1000) - 30
    )
      deny();
    return { reader, snapshot, price, allowance: allowance[0] as bigint };
  }
  private quote(input: Record<string, unknown>) {
    const allowed = [
      'encodedOrder',
      'orderId',
      'orderInfo',
      'input',
      'output',
      'quoteId',
      'slippageTolerance',
      'deadlineBufferSecs',
      'classicGasUseEstimateUSD',
      'expectedAmountIn',
      'expectedAmountOut',
      'aggregatedOutputs',
    ];
    const quote = structuredClone(
      Object.fromEntries(
        allowed
          .filter((key) => Object.hasOwn(input, key))
          .map((key) => [key, input[key]]),
      ),
    );
    if (
      Buffer.byteLength(JSON.stringify(quote)) > 65536 ||
      typeof quote.encodedOrder !== 'string'
    )
      throw new WalletProviderError('wallet_provider_input');
    if (
      !quote.orderInfo ||
      typeof quote.orderInfo !== 'object' ||
      (quote.orderInfo as { chainId?: unknown }).chainId !== 8453
    )
      throw new WalletProviderError('wallet_provider_input');
    return quote;
  }
  private async authorizeSigning(
    context: AuthorityContext,
    approval: FinancialApproval,
  ): Promise<FinancialAuthorization | null> {
    try {
      return await this.current(
        context.principal,
        approval.userAccount?.accountId ?? '',
        (state, grant, wallet) => {
          const record = state.uniswapXOrders?.[approval.action.action_id];
          if (
            !record ||
            record.state === 'authorizing' ||
            record.plan.policyRevision !== this.policyRevision ||
            fingerprint(record.plan.approval) !== fingerprint(approval) ||
            record.plan.grantId !== grant.id ||
            record.plan.owner !== grant.owner ||
            record.plan.walletHash !== walletAuthorityHash(wallet) ||
            fingerprint(
              reviewUniswapXV3Order(
                String(record.plan.quote.encodedOrder),
                wallet.binding.address,
                this.policy,
              ),
            ) !== fingerprint(record.plan.review) ||
            record.plan.review.safeMessageDigest !==
              approval.action.payload_hash ||
            fingerprint([
              record.plan.accountId,
              record.plan.quote,
              this.policyRevision,
            ]) !== record.plan.requestHash ||
            approval.action.plan_hash !== '0x' + record.plan.requestHash
          )
            deny();
          return {
            ownerSubject: grant.owner,
            accountId: wallet.signer.accountId,
            address: wallet.signer.address,
            chainAccountId: approval.action.chain_account_id,
            currentUserStatus: 'ID VERIFIED',
            grantId: grant.id,
            consentReference: grant.requestId,
            policyRevision: this.policyRevision,
            bindingRevision: '1',
            capabilityRevision: '1',
            planRevision: '1',
            planHash: approval.action.plan_hash,
            expiresAt: approval.action.expires_at,
          };
        },
      );
    } catch (error) {
      if (
        error instanceof WalletProviderError &&
        error.code === 'wallet_authorization_denied'
      )
        return null;
      throw error;
    }
  }
  async submit(
    context: AuthorityContext,
    accountId: string,
    input: Record<string, unknown>,
  ) {
    context = structuredClone(context);
    input = structuredClone(input);
    if (!uuid.test(context.idempotencyKey) || !uuid.test(accountId))
      throw new WalletProviderError('wallet_provider_input');
    const wallet = await this.current(
      context.principal,
      accountId,
      (_state, _grant, wallet) => structuredClone(wallet),
    );
    const quote = this.quote(input);
    const key = fingerprint([
      'uniswapx-order',
      context.principal.issuer,
      context.principal.clientId,
      context.principal.subject,
      context.idempotencyKey,
    ]);
    const requestHash = fingerprint([accountId, quote, this.policyRevision]);
    let record = await this.current(context.principal, accountId, (state) => {
      const entry = state.idempotency[key];
      if (!entry) return undefined;
      const saved = state.uniswapXOrders?.[entry.id];
      if (!saved || entry.hash !== requestHash)
        throw new WalletProviderError('wallet_attempt_conflict');
      return saved;
    });
    if (
      record?.postDispatched ||
      record?.state === 'succeeded' ||
      record?.state === 'cancelled' ||
      record?.state === 'expired'
    ) {
      await this.reconcile(record);
      return this.read(context.principal, accountId, record.plan.id, false);
    }
    if (record?.signature) {
      await this.dispatch(record.plan.id);
      return this.read(context.principal, accountId, record.plan.id, true);
    }
    const review = reviewUniswapXV3Order(
      String(quote.encodedOrder),
      wallet.binding.address,
      this.policy,
    );
    if (quote.orderId !== review.witnessHash)
      throw new WalletProviderError('wallet_provider_input');
    const verified = await this.verify(context.principal, accountId, review);
    if (!record) {
      record = await this.current(
        context.principal,
        accountId,
        (state, grant, currentWallet) => {
          const previous = state.idempotency[key];
          if (previous) {
            const saved = state.uniswapXOrders?.[previous.id];
            if (!saved || previous.hash !== requestHash) deny();
            return saved;
          }
          const records = (state.uniswapXOrders ??= {});
          for (const saved of Object.values(records))
            if (
              same(saved.plan.review.swapper, review.swapper) &&
              saved.plan.review.nonce === review.nonce
            )
              throw new WalletProviderError('wallet_attempt_conflict');
          const id = randomUUID();
          const applicationId = runtimeApplicationId(
            context.principal.issuer,
            context.principal.clientId,
          );
          const action: TypedDataAction = {
            action_id: id,
            operation_id: id,
            plan_revision: '1',
            plan_hash: '0x' + requestHash,
            binding_revision: '1',
            capability_revision: '1',
            profile: 'safe_owner_v1',
            profile_revision: '1',
            chain_id: 'eip155:8453',
            chain_account_id: 'eip155:8453:' + currentWallet.signer.address,
            payload_hash: review.safeMessageDigest,
            dependencies: [],
            expires_at: new Date(review.deadline * 1000).toISOString(),
            status: 'ready',
            kind: 'sign_typed_data',
            payload: {
              domain: {
                chainId: '8453',
                verifyingContract: currentWallet.binding.address,
              },
              types: { SafeMessage: [{ name: 'message', type: 'bytes' }] },
              message: { message: review.permit2Digest },
              primaryType: 'SafeMessage',
            },
          };
          const approval: FinancialApproval = {
            ownerSubject: grant.owner,
            caller: {
              issuer: context.principal.issuer,
              subject: context.principal.subject,
              clientId: context.principal.clientId,
              ...(context.principal.accessGrantId
                ? { accessGrantId: context.principal.accessGrantId }
                : {}),
            },
            grantId: grant.id,
            consentReference: grant.requestId,
            policyRevision: this.policyRevision,
            account: currentWallet.signer,
            userAccount: { accountId, address: currentWallet.binding.address },
            action,
            budgetId: fingerprint([
              'uniswapx-input-v1',
              applicationId,
              accountId,
              review.tokenIn,
            ]),
            units: review.amountInUnits,
          };
          const saved: UniswapXOrderRecord = {
            plan: {
              id,
              accountId,
              applicationId,
              context,
              owner: grant.owner,
              grantId: grant.id,
              walletHash: walletAuthorityHash(currentWallet),
              policyRevision: this.policyRevision,
              policy: this.policy,
              quote,
              review,
              requestHash,
              approval,
              startBlock: verified.snapshot.number,
              priceProof: verified.price,
            },
            state: 'authorizing',
            postDispatched: false,
          };
          records[id] = saved;
          state.idempotency[key] = { id, hash: requestHash };
          return saved;
        },
      );
    }
    const retained = record;
    await this.current(
      context.principal,
      accountId,
      (_state, grant, currentWallet) => {
        if (
          grant.id !== retained.plan.grantId ||
          walletAuthorityHash(currentWallet) !== retained.plan.walletHash
        )
          deny();
      },
    );
    const route =
      this.policy.routes.find(
        (route) =>
          same(route.tokenIn.address, review.tokenIn) &&
          same(route.tokenOut.address, review.tokenOut),
      ) ?? deny();
    await this.database.setBudget(
      record.plan.approval.budgetId,
      route.maximumLifetimeInputUnits,
      this.policyRevision,
      'uniswapXOrderPolicyRevision',
    );
    await this.database.approveAction(record.plan.approval);
    await this.current(context.principal, accountId, (state) => {
      const saved = state.uniswapXOrders![retained.plan.id];
      if (saved.state === 'authorizing') saved.state = 'prepared';
    });
    if (verified.allowance < BigInt(review.amountInUnits)) {
      await this.current(context.principal, accountId, (state) => {
        state.uniswapXOrders![retained.plan.id].state = 'requires_approval';
      });
      return this.receipt({ ...record, state: 'requires_approval' });
    }
    let signature: string;
    try {
      signature = await this.signing.sign(context, record.plan.id, async () => {
        const fresh = await this.verify(context.principal, accountId, review);
        if (fresh.allowance < BigInt(review.amountInUnits)) deny();
      });
      if (
        !same(
          recoverAddress(review.safeMessageDigest, signature),
          wallet.signer.address,
        )
      )
        deny();
      const valid = safeAbi.decodeFunctionResult(
        'isValidSignature',
        String(
          await verified.reader.call('eth_call', [
            {
              to: review.swapper,
              data: safeAbi.encodeFunctionData('isValidSignature', [
                review.permit2Digest,
                signature,
              ]),
            },
            'latest',
          ]),
        ),
      );
      if (valid[0] !== '0x1626ba7e') deny();
    } catch (error) {
      await this.onboarding.store.transaction((state) => {
        const saved = state.uniswapXOrders?.[retained.plan.id];
        if (saved && !saved.postDispatched) {
          saved.state = 'unknown';
          saved.code = 'signing_pending';
        }
      });
      throw error;
    }
    await this.current(context.principal, accountId, (state) => {
      const saved = state.uniswapXOrders![retained.plan.id];
      saved.signature = this.cipher.seal(
        this.signatureMetadata(saved.plan.id, saved.plan.applicationId),
        signature,
      );
      saved.state = 'signed';
    });
    await this.dispatch(record.plan.id);
    return this.read(context.principal, accountId, record.plan.id, true);
  }
  private async dispatch(id: string) {
    const record = await this.onboarding.store.transaction(
      (state) => state.uniswapXOrders?.[id] ?? deny(),
    );
    if (
      record.postDispatched ||
      !record.signature ||
      record.plan.policyRevision !== this.policyRevision
    )
      return;
    if (
      fingerprint(
        reviewUniswapXV3Order(
          String(record.plan.quote.encodedOrder),
          record.plan.review.swapper,
          this.policy,
        ),
      ) !== fingerprint(record.plan.review)
    )
      deny();
    const verified = await this.verify(
      record.plan.context.principal,
      record.plan.accountId,
      record.plan.review,
    );
    if (verified.allowance < BigInt(record.plan.review.amountInUnits)) return;
    const { sealed: _sealed, ...metadata } = record.signature;
    if (
      fingerprint(metadata) !==
      fingerprint(
        this.signatureMetadata(record.plan.id, record.plan.applicationId),
      )
    )
      deny();
    const signature = this.cipher.open(record.signature);
    if (
      !same(
        recoverAddress(record.plan.review.safeMessageDigest, signature),
        record.plan.approval.account.address,
      )
    )
      deny();
    const canDispatch = await this.current(
      record.plan.context.principal,
      record.plan.accountId,
      (state, grant, wallet) => {
        const saved = state.uniswapXOrders![id];
        if (saved.postDispatched) return false;
        if (
          grant.id !== record.plan.grantId ||
          walletAuthorityHash(wallet) !== record.plan.walletHash ||
          saved.state !== 'signed'
        )
          deny();
        saved.postDispatched = true;
        saved.state = 'unknown';
        saved.code = 'post_unknown';
        return true;
      },
    );
    if (!canDispatch) return;
    try {
      await this.transport.post(
        record.plan.quote,
        signature,
        record.plan.review.witnessHash,
      );
      await this.onboarding.store.transaction((state) => {
        const saved = state.uniswapXOrders![id];
        if (saved.state === 'unknown') {
          saved.state = 'open';
          delete saved.code;
        }
      });
    } catch {
      /* Signed authority and unknown dispatch remain held for chain reconciliation. */
    }
  }
  private async reconcile(record: UniswapXOrderRecord) {
    if (
      record.chainFinalized &&
      ['succeeded', 'cancelled', 'expired'].includes(record.state)
    )
      return;
    let canonicalityLost = false;
    try {
      const reader = await this.reader(record.plan.applicationId, true);
      const previousEffect = record.fill ?? record.cancellation;
      if (previousEffect) {
        const canonical = (await reader.call('eth_getBlockByNumber', [
          '0x' + previousEffect.blockNumber.toString(16),
          false,
        ])) as { hash: string };
        if (canonical.hash !== previousEffect.blockHash) {
          canonicalityLost = true;
          throw new Error();
        }
      }
      const proof = await recoverUniswapXFill(
        reader,
        record.plan.review,
        record.plan.startBlock,
        this.options.genesisHash,
      );
      let chainFinalized = false;
      try {
        const finalized = (await reader.call('eth_getBlockByNumber', [
          'finalized',
          false,
        ])) as { number: string; timestamp: string };
        if (proof.state === 'filled')
          chainFinalized =
            Number(BigInt(finalized.number)) >= proof.proof.blockNumber;
        if (proof.state === 'cancelled')
          chainFinalized =
            Number(BigInt(finalized.number)) >= proof.blockNumber;
        if (proof.state === 'expired')
          chainFinalized =
            Number(BigInt(finalized.timestamp)) > record.plan.review.deadline;
      } catch {
        chainFinalized = false;
      }
      const checkpoint =
        proof.state === 'filled'
          ? { number: proof.proof.blockNumber, hash: proof.proof.blockHash }
          : proof.state === 'expired' || proof.state === 'cancelled'
            ? proof.checkpoint
            : undefined;
      if (checkpoint) {
        const checked = (await reader.call('eth_getBlockByNumber', [
          '0x' + checkpoint.number.toString(16),
          false,
        ])) as { hash: string };
        if (checked.hash !== checkpoint.hash) {
          canonicalityLost = true;
          throw new Error();
        }
      }
      if (proof.state === 'filled') {
        const route =
          record.plan.policy.routes.find(
            (route) =>
              same(route.tokenIn.address, record.plan.review.tokenIn) &&
              same(route.tokenOut.address, record.plan.review.tokenOut),
          ) ?? deny();
        const block = {
          blockHash: proof.proof.blockHash,
          requireCanonical: true,
        };
        await Promise.all([
          this.pin(reader, route.tokenIn, block),
          this.pin(reader, route.tokenOut, block),
          this.pin(
            reader,
            {
              address: baseDutchV3Reactor,
              codeHash: record.plan.policy.reactorCodeHash,
            },
            block,
          ),
        ]);
      }
      await this.onboarding.store.transaction((state) => {
        const saved = state.uniswapXOrders?.[record.plan.id];
        if (!saved || saved.chainFinalized) return;
        if (proof.state === 'filled') {
          saved.state = 'succeeded';
          saved.fill = proof.proof;
          saved.chainFinalized = chainFinalized;
          delete saved.code;
        } else if (proof.state === 'cancelled' && !saved.fill) {
          saved.state = 'cancelled';
          saved.cancellation = {
            transactionHash: proof.transactionHash,
            blockNumber: proof.blockNumber,
            blockHash: proof.blockHash,
          };
          saved.chainFinalized = chainFinalized;
          delete saved.code;
        } else if (proof.state === 'expired' && !saved.fill) {
          saved.state = 'expired';
          saved.chainFinalized = chainFinalized;
          delete saved.code;
        } else if (
          proof.state === 'pending' &&
          !saved.fill &&
          saved.state !== 'expired' &&
          saved.state !== 'cancelled'
        )
          return;
        else {
          saved.state = 'needs_review';
          saved.chainFinalized = false;
          saved.code = 'unexpected_effect';
        }
      });
    } catch {
      await this.onboarding.store.transaction((state) => {
        const saved = state.uniswapXOrders?.[record.plan.id];
        if (!saved || saved.chainFinalized) return;
        if (canonicalityLost) {
          saved.state = 'needs_review';
          saved.code = 'unexpected_effect';
        } else {
          saved.code = 'chain_unavailable';
        }
      });
    }
  }
  async read(
    principal: VerifiedPrincipal,
    accountId: string,
    id: string,
    refresh = true,
  ) {
    if (!principal.scopes.includes('wallet:execute:read') || !uuid.test(id))
      deny();
    await this.onboarding.authorize(principal, accountId, 'account:read');
    const record = await this.onboarding.store.transaction((state) => {
      const saved = state.uniswapXOrders?.[id];
      if (
        !saved ||
        saved.plan.accountId !== accountId ||
        saved.plan.applicationId !==
          runtimeApplicationId(principal.issuer, principal.clientId)
      )
        deny();
      return saved;
    });
    if (refresh) await this.reconcile(record);
    const latest = await this.onboarding.store.transaction(
      (state) => state.uniswapXOrders![id],
    );
    return this.receipt(latest);
  }
  private receipt(record: UniswapXOrderRecord) {
    return {
      order_id: record.plan.id,
      order_hash: record.plan.review.witnessHash,
      account_id: record.plan.accountId,
      status: record.state,
      review: record.plan.review,
      ...(record.code ? { code: record.code } : {}),
      ...(record.fill ? { fill: record.fill } : {}),
      ...(record.cancellation ? { cancellation: record.cancellation } : {}),
      chain_finalized: record.chainFinalized ?? false,
      ...(!['succeeded', 'cancelled', 'expired'].includes(record.state)
        ? {
            cancellation_calls: [
              {
                to: uniswapXPermit2,
                value: '0x0',
                data: permitAbi.encodeFunctionData(
                  'invalidateUnorderedNonces',
                  [
                    BigInt(record.plan.review.nonce) >> 8n,
                    1n << (BigInt(record.plan.review.nonce) & 255n),
                  ],
                ),
              },
            ],
          }
        : {}),
      ...(record.state === 'requires_approval'
        ? {
            approval_calls: [
              {
                to: record.plan.review.tokenIn,
                value: '0x0',
                data: tokenAbi.encodeFunctionData('approve', [
                  uniswapXPermit2,
                  record.plan.review.amountInUnits,
                ]),
              },
            ],
          }
        : {}),
    };
  }
  private recoveryCursor = 0;
  async runOnce() {
    const records = await this.onboarding.store.transaction((state) =>
      Object.values(state.uniswapXOrders ?? {}).filter(
        (record) => !record.chainFinalized,
      ),
    );
    const cohort = Array.from(
      { length: Math.min(10, records.length) },
      () => records[this.recoveryCursor++ % records.length],
    );
    for (const record of cohort) {
      if (record.state === 'signed' && !record.postDispatched) {
        try {
          await this.dispatch(record.plan.id);
        } catch {
          /* Current policy may pause fixed continuation. */
        }
      }
      await this.reconcile(record);
    }
  }
  start() {
    this.stopped = false;
    const tick = () => {
      if (this.stopped) return;
      this.running = this.runOnce()
        .catch(() => undefined)
        .finally(() => {
          this.running = undefined;
          if (!this.stopped) {
            this.timer = setTimeout(tick, 10000);
            this.timer.unref();
          }
        });
    };
    tick();
  }
  async close() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }
}
