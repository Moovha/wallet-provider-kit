import {
  Interface,
  TypedDataEncoder,
  ZeroAddress,
  concat,
  getAddress,
  solidityPacked,
} from 'ethers';
import type { TypedDataAction } from '../domain/signing.js';
import { WalletProviderError } from '../domain/signing.js';
import { serviceHash } from '../executor/auth.js';

export interface PinnedContract {
  address: string;
  codeHash: string;
  implementation?: { address: string; codeHash: string };
}
export const implementationSlot =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
export interface SafeAccountBinding extends PinnedContract {
  accountId: string;
  singleton: PinnedContract;
}
export interface ApprovedCallPolicy {
  mechanism: 'safe-1.4.1';
  accounts: SafeAccountBinding[];
  multiSend: PinnedContract;
  maximumNativeValueWei: string;
  lifetimeOperations: string;
  contracts: (PinnedContract & {
    selectors: string[];
    maximumValueWei: string;
  })[];
  swaps: {
    id: string;
    router: PinnedContract;
    tokenIn: PinnedContract;
    tokenOut: PinnedContract;
    fee: number;
    maximumInput: string;
  }[];
  vaults: {
    id: string;
    router: PinnedContract;
    vault: PinnedContract;
    asset: PinnedContract;
    maximumAssets: string;
  }[];
}
export interface ApprovedCallsConfiguration {
  policy: ApprovedCallPolicy;
  maxValiditySeconds: number;
}
export interface ApprovedContractCall {
  to: string;
  value: string;
  data: string;
}
export type ApprovedCallInput =
  | { account_id: string; kind: 'contract-call'; calls: ApprovedContractCall[] }
  | {
      account_id: string;
      kind: 'swap';
      route: string;
      amount_in: string;
      minimum_out: string;
      deadline: string;
    }
  | {
      account_id: string;
      kind: 'vault-deposit';
      route: string;
      assets: string;
      minimum_shares: string;
    };
export interface ApprovedCallIntent {
  version: '1';
  mechanism: 'safe-1.4.1';
  input: ApprovedCallInput;
  account: SafeAccountBinding;
  multiSend: PinnedContract;
  calls: ApprovedContractCall[];
  contracts: PinnedContract[];
  effects: {
    token: string;
    from: string;
    to: string;
    minimum: string;
    maximum?: string;
  }[];
  nonce: string;
}
export const safeInterface = new Interface([
  'function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) returns (bool)',
  'function getModulesPaginated(address start,uint256 pageSize) view returns(address[] array,address next)',
  'function nonce() view returns(uint256)',
  'function getOwners() view returns(address[])',
  'function getThreshold() view returns(uint256)',
  'function VERSION() view returns(string)',
  'function masterCopy() view returns(address)',
  'event ExecutionSuccess(bytes32 txHash,uint256 payment)',
  'event ExecutionFailure(bytes32 txHash,uint256 payment)',
]);
export const multiSendInterface = new Interface([
  'function multiSend(bytes transactions)',
]);
export const tokenInterface = new Interface([
  'function approve(address spender,uint256 amount) returns(bool)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
  'function allowance(address owner,address spender) view returns(uint256)',
]);
export const swapInterface = new Interface([
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns(uint256 amountOut)',
]);
// Yearn4626Router-compatible entry point pulls assets and enforces minimum shares atomically.
export const vaultRouterInterface = new Interface([
  'function depositToVault(address vault,uint256 amount,address to,uint256 minSharesOut) payable returns(uint256 sharesOut)',
  'function approve(address token,address spender,uint256 amount) payable',
]);
export const vaultInterface = new Interface([
  'function asset() view returns(address)',
  'event Deposit(address indexed sender,address indexed owner,uint256 assets,uint256 shares)',
]);
export const safeTypes = {
  SafeTx: [
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'data', type: 'bytes' },
    { name: 'operation', type: 'uint8' },
    { name: 'safeTxGas', type: 'uint256' },
    { name: 'baseGas', type: 'uint256' },
    { name: 'gasPrice', type: 'uint256' },
    { name: 'gasToken', type: 'address' },
    { name: 'refundReceiver', type: 'address' },
    { name: 'nonce', type: 'uint256' },
  ],
};
function denied(): never {
  throw new WalletProviderError('wallet_authorization_denied');
}
function uint(value: string, positive = false): bigint {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9][0-9]{0,77})$/.test(value) ||
    BigInt(value) >= 2n ** 256n ||
    (positive && BigInt(value) === 0n)
  )
    denied();
  return BigInt(value);
}
function exact(input: object, keys: string[]) {
  if (!input || Object.keys(input).sort().join(',') !== keys.sort().join(','))
    denied();
}
function pin(value: PinnedContract) {
  if (value.implementation) pin(value.implementation);
  if (
    getAddress(value.address) === ZeroAddress ||
    !/^0x[0-9a-f]{64}$/.test(value.codeHash) ||
    /^0x0{64}$/.test(value.codeHash)
  )
    denied();
}
/** Operator policies explicitly delegate targets/functions; unknown contracts are denied. */
export function validateApprovedCallPolicy(policy: ApprovedCallPolicy): void {
  if (
    policy.mechanism !== 'safe-1.4.1' ||
    !policy.accounts.length ||
    policy.accounts.length > 256 ||
    policy.contracts.length > 128 ||
    policy.swaps.length > 128 ||
    policy.vaults.length > 128
  )
    denied();
  uint(policy.maximumNativeValueWei);
  uint(policy.lifetimeOperations, true);
  pin(policy.multiSend);
  if (policy.multiSend.implementation) denied();
  const accountIds = new Set<string>(),
    accounts = new Set<string>();
  for (const account of policy.accounts) {
    pin(account);
    pin(account.singleton);
    if (account.implementation || account.singleton.implementation) denied();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        account.accountId,
      ) ||
      accountIds.has(account.accountId) ||
      accounts.has(account.address.toLowerCase())
    )
      denied();
    accountIds.add(account.accountId);
    accounts.add(account.address.toLowerCase());
  }
  const pins = new Map<string, string>();
  const register = (value: PinnedContract) => {
    pin(value);
    const address = value.address.toLowerCase(),
      identity = serviceHash({
        address,
        codeHash: value.codeHash,
        ...(value.implementation
          ? { implementation: value.implementation }
          : {}),
      });
    if (pins.has(address) && pins.get(address) !== identity) denied();
    pins.set(address, identity);
  };
  register(policy.multiSend);
  for (const account of policy.accounts) {
    register(account);
    register(account.singleton);
  }
  const targets = new Set<string>();
  for (const target of policy.contracts) {
    register(target);
    uint(target.maximumValueWei);
    if (
      !target.selectors.length ||
      target.selectors.length > 128 ||
      new Set(target.selectors).size !== target.selectors.length ||
      target.selectors.some((s) => !/^0x[0-9a-f]{8}$/.test(s)) ||
      targets.has(target.address.toLowerCase()) ||
      accounts.has(target.address.toLowerCase()) ||
      target.address.toLowerCase() === policy.multiSend.address.toLowerCase()
    )
      denied();
    targets.add(target.address.toLowerCase());
  }
  for (const routes of [policy.swaps, policy.vaults])
    if (new Set(routes.map((r) => r.id)).size !== routes.length) denied();
  for (const route of policy.swaps) {
    register(route.router);
    register(route.tokenIn);
    register(route.tokenOut);
    uint(route.maximumInput, true);
    if (
      route.tokenIn.address.toLowerCase() ===
        route.tokenOut.address.toLowerCase() ||
      !Number.isInteger(route.fee) ||
      route.fee <= 0 ||
      route.fee >= 1000000
    )
      denied();
  }
  for (const route of policy.vaults) {
    register(route.router);
    register(route.vault);
    register(route.asset);
    uint(route.maximumAssets, true);
  }
}
/** Construct exact calls server-side; callers cannot supply a signature, nonce or Safe transaction. */
export function buildApprovedCallIntent(
  policy: ApprovedCallPolicy,
  input: ApprovedCallInput,
  nonce: string,
  expiresAt: string,
): ApprovedCallIntent {
  validateApprovedCallPolicy(policy);
  uint(nonce);
  const account = policy.accounts.find((a) => a.accountId === input.account_id);
  if (!account) denied();
  const calls: ApprovedContractCall[] = [],
    contracts: PinnedContract[] = [],
    effects: ApprovedCallIntent['effects'] = [];
  const call = (target: PinnedContract, data: string, value = '0') => {
    contracts.push({
      address: target.address,
      codeHash: target.codeHash,
      ...(target.implementation
        ? { implementation: structuredClone(target.implementation) }
        : {}),
    });
    calls.push({ to: target.address, value, data: data.toLowerCase() });
  };
  const approval = (token: PinnedContract, spender: string, value: string) =>
    call(token, tokenInterface.encodeFunctionData('approve', [spender, value]));
  if (input.kind === 'contract-call') {
    exact(input, ['account_id', 'kind', 'calls']);
    if (
      !Array.isArray(input.calls) ||
      !input.calls.length ||
      input.calls.length > 16
    )
      denied();
    let total = 0n;
    for (const entry of input.calls) {
      exact(entry, ['to', 'value', 'data']);
      if (!/^0x(?:[0-9a-f]{2}){4,4096}$/.test(entry.data)) denied();
      const target = policy.contracts.find(
        (t) => t.address.toLowerCase() === entry.to.toLowerCase(),
      );
      if (
        !target ||
        !target.selectors.includes(entry.data.slice(0, 10)) ||
        uint(entry.value) > uint(target.maximumValueWei)
      )
        denied();
      total += uint(entry.value);
      call(target, entry.data, entry.value);
    }
    if (total > uint(policy.maximumNativeValueWei)) denied();
  } else if (input.kind === 'swap') {
    exact(input, [
      'account_id',
      'kind',
      'route',
      'amount_in',
      'minimum_out',
      'deadline',
    ]);
    const route = policy.swaps.find((r) => r.id === input.route);
    if (!route || uint(input.amount_in, true) > uint(route.maximumInput))
      denied();
    uint(input.minimum_out, true);
    if (uint(input.deadline, true) * 1000n > BigInt(Date.parse(expiresAt)))
      denied();
    approval(route.tokenIn, route.router.address, '0');
    approval(route.tokenIn, route.router.address, input.amount_in);
    call(
      route.router,
      swapInterface.encodeFunctionData('exactInputSingle', [
        [
          route.tokenIn.address,
          route.tokenOut.address,
          route.fee,
          account.address,
          input.deadline,
          input.amount_in,
          input.minimum_out,
          '0',
        ],
      ]),
    );
    approval(route.tokenIn, route.router.address, '0');
    contracts.push(route.tokenOut);
    effects.push(
      {
        token: route.tokenIn.address,
        from: account.address,
        to: '*',
        minimum: input.amount_in,
        maximum: input.amount_in,
      },
      {
        token: route.tokenOut.address,
        from: '*',
        to: account.address,
        minimum: input.minimum_out,
      },
    );
  } else if (input.kind === 'vault-deposit') {
    exact(input, ['account_id', 'kind', 'route', 'assets', 'minimum_shares']);
    const route = policy.vaults.find((r) => r.id === input.route);
    if (!route || uint(input.assets, true) > uint(route.maximumAssets))
      denied();
    uint(input.minimum_shares, true);
    approval(route.asset, route.router.address, '0');
    approval(route.asset, route.router.address, input.assets);
    call(
      route.router,
      vaultRouterInterface.encodeFunctionData('approve', [
        route.asset.address,
        route.vault.address,
        input.assets,
      ]),
    );
    call(
      route.router,
      vaultRouterInterface.encodeFunctionData('depositToVault', [
        route.vault.address,
        input.assets,
        account.address,
        input.minimum_shares,
      ]),
    );
    call(
      route.router,
      vaultRouterInterface.encodeFunctionData('approve', [
        route.asset.address,
        route.vault.address,
        '0',
      ]),
    );
    approval(route.asset, route.router.address, '0');
    contracts.push(route.vault);
    effects.push(
      {
        token: route.asset.address,
        from: account.address,
        to: '*',
        minimum: input.assets,
        maximum: input.assets,
      },
      {
        token: route.vault.address,
        from: ZeroAddress,
        to: account.address,
        minimum: input.minimum_shares,
      },
    );
  } else denied();
  if (
    calls.reduce((bytes, call) => bytes + (call.data.length - 2) / 2, 0) > 2048
  )
    denied();
  if (
    calls.some(
      (c) =>
        c.to.toLowerCase() === account.address.toLowerCase() ||
        c.to.toLowerCase() === policy.multiSend.address.toLowerCase(),
    )
  )
    denied();
  return structuredClone({
    version: '1',
    mechanism: 'safe-1.4.1',
    input,
    account,
    multiSend: policy.multiSend,
    calls,
    contracts: [
      ...new Map(contracts.map((c) => [c.address.toLowerCase(), c])).values(),
    ],
    effects,
    nonce,
  });
}
export function approvedCallPayload(
  intent: ApprovedCallIntent,
): TypedDataAction['payload'] {
  const packed = concat(
    intent.calls.map((call) =>
      solidityPacked(
        ['uint8', 'address', 'uint256', 'uint256', 'bytes'],
        [0, call.to, call.value, (call.data.length - 2) / 2, call.data],
      ),
    ),
  );
  const single = intent.calls.length === 1 ? intent.calls[0] : undefined;
  return {
    domain: { chainId: '84532', verifyingContract: intent.account.address },
    primaryType: 'SafeTx',
    types: safeTypes,
    message: {
      to: single?.to ?? intent.multiSend.address,
      value: single?.value ?? '0',
      data:
        single?.data ??
        multiSendInterface
          .encodeFunctionData('multiSend', [packed])
          .toLowerCase(),
      operation: single ? '0' : '1',
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: ZeroAddress,
      refundReceiver: ZeroAddress,
      nonce: intent.nonce,
    },
  };
}
export function approvedCallData(
  action: TypedDataAction,
  signature: string,
): string {
  const m = action.payload.message;
  return safeInterface
    .encodeFunctionData('execTransaction', [
      m.to,
      m.value,
      m.data,
      m.operation,
      m.safeTxGas,
      m.baseGas,
      m.gasPrice,
      m.gasToken,
      m.refundReceiver,
      signature,
    ])
    .toLowerCase();
}
export function validateApprovedCallAction(
  policy: ApprovedCallPolicy,
  intent: ApprovedCallIntent,
  action: TypedDataAction,
): void {
  const expected = buildApprovedCallIntent(
    policy,
    intent.input,
    intent.nonce,
    action.expires_at,
  );
  const payload = approvedCallPayload(expected),
    digest = TypedDataEncoder.hash(
      payload.domain,
      payload.types,
      payload.message,
    );
  if (
    serviceHash(expected) !== serviceHash(intent) ||
    serviceHash(payload) !== serviceHash(action.payload) ||
    action.payload_hash !== digest ||
    action.plan_hash !== digest
  )
    denied();
}
