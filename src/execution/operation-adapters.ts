import { ZeroAddress, getAddress } from 'ethers';
import { WalletProviderError } from '../domain/signing.js';
import { serviceHash } from '../executor/auth.js';
import {
  tokenInterface,
  swapInterface,
  vaultRouterInterface,
} from './operation-interfaces.js';
import type {
  ApprovedCallPolicy,
  ApprovedCallInput,
  ApprovedCallIntent,
  ApprovedContractCall,
  SafeAccountBinding,
  PinnedContract,
} from './approved-calls.js';
function denied(): never {
  throw new WalletProviderError('wallet_authorization_denied');
}
function uint(value: string, positive = false) {
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
  if (Object.keys(input).sort().join(',') !== keys.sort().join(',')) denied();
}
export interface TokenTransferAdapter {
  token: PinnedContract;
  recipients: string[];
  maximumAmount: string;
}
export interface OperationAdapters {
  tokenTransfers?: TokenTransferAdapter[];
  swaps?: NonNullable<ApprovedCallPolicy['swaps']>;
  vaults?: NonNullable<ApprovedCallPolicy['vaults']>;
}
export type AdapterInput =
  | Exclude<ApprovedCallInput, { kind: 'contract-call' }>
  | {
      kind: 'token-transfer';
      token: string;
      recipient: string;
      amount: string;
    };
export function adapterInput(intent: ApprovedCallIntent) {
  return intent.adapterInput ?? intent.input;
}
/** Compatibility requests compile to the same ordered calls as generic batches. */
export function compileOperationAdapter(
  policy: ApprovedCallPolicy,
  input: ApprovedCallInput,
  account: SafeAccountBinding,
  expiresAt: string,
) {
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
  if (input.kind === 'swap') {
    exact(input, [
      'account_id',
      'kind',
      'route',
      'amount_in',
      'minimum_out',
      'deadline',
    ]);
    const route = [
      ...(policy.swaps ?? []),
      ...(policy.adapters?.swaps ?? []),
    ].find((r) => r.id === input.route);
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
    const route = [
      ...(policy.vaults ?? []),
      ...(policy.adapters?.vaults ?? []),
    ].find((r) => r.id === input.route);
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
  return { calls, contracts, effects };
}
/** Match server-selected protections from canonical calldata; callers cannot disable them with a label. */
export function matchOperationAdapter(
  policy: ApprovedCallPolicy,
  input: Extract<ApprovedCallInput, { kind: 'contract-call' }>,
  account: SafeAccountBinding,
  expiresAt: string,
) {
  const effective = {
    ...policy,
    swaps: policy.adapters?.swaps ?? [],
    vaults: policy.adapters?.vaults ?? [],
    adapters: undefined,
  };
  for (const call of input.calls) {
    for (const transfer of policy.adapters?.tokenTransfers ?? []) {
      if (
        call.to.toLowerCase() !== transfer.token.address.toLowerCase() ||
        !call.data.startsWith(tokenInterface.getFunction('transfer')!.selector)
      )
        continue;
      const decoded = tokenInterface.decodeFunctionData('transfer', call.data),
        recipient = getAddress(decoded[0]),
        amount = decoded[1].toString();
      if (
        input.calls.length !== 1 ||
        call.value !== '0' ||
        uint(amount, true) > uint(transfer.maximumAmount) ||
        !transfer.recipients.some((r) => getAddress(r) === recipient) ||
        tokenInterface
          .encodeFunctionData('transfer', [recipient, amount])
          .toLowerCase() !== call.data
      )
        denied();
      return {
        input: {
          kind: 'token-transfer' as const,
          token: transfer.token.address,
          recipient,
          amount,
        },
        compiled: {
          calls: input.calls,
          contracts: [transfer.token],
          effects: [
            {
              token: transfer.token.address,
              from: account.address,
              to: recipient,
              minimum: amount,
              maximum: amount,
            },
          ],
        },
      };
    }
    for (const route of effective.swaps) {
      if (
        call.to.toLowerCase() !== route.router.address.toLowerCase() ||
        !call.data.startsWith(
          swapInterface.getFunction('exactInputSingle')!.selector,
        )
      )
        continue;
      const [p] = swapInterface.decodeFunctionData(
        'exactInputSingle',
        call.data,
      );
      if (
        p.tokenIn.toLowerCase() !== route.tokenIn.address.toLowerCase() ||
        p.tokenOut.toLowerCase() !== route.tokenOut.address.toLowerCase() ||
        Number(p.fee) !== route.fee
      )
        continue;
      const candidate: ApprovedCallInput = {
        account_id: input.account_id,
        kind: 'swap',
        route: route.id,
        amount_in: p.amountIn.toString(),
        minimum_out: p.amountOutMinimum.toString(),
        deadline: p.deadline.toString(),
      };
      const compiled = compileOperationAdapter(
        effective,
        candidate,
        account,
        expiresAt,
      );
      if (
        serviceHash(
          compiled.calls.map((c) => ({ ...c, to: c.to.toLowerCase() })),
        ) !==
        serviceHash(input.calls.map((c) => ({ ...c, to: c.to.toLowerCase() })))
      )
        denied();
      return { input: candidate, compiled };
    }
    for (const route of effective.vaults) {
      if (
        call.to.toLowerCase() !== route.router.address.toLowerCase() ||
        !call.data.startsWith(
          vaultRouterInterface.getFunction('depositToVault')!.selector,
        )
      )
        continue;
      const p = vaultRouterInterface.decodeFunctionData(
        'depositToVault',
        call.data,
      );
      if (p.vault.toLowerCase() !== route.vault.address.toLowerCase()) continue;
      const candidate: ApprovedCallInput = {
        account_id: input.account_id,
        kind: 'vault-deposit',
        route: route.id,
        assets: p.amount.toString(),
        minimum_shares: p.minSharesOut.toString(),
      };
      const compiled = compileOperationAdapter(
        effective,
        candidate,
        account,
        expiresAt,
      );
      if (
        serviceHash(
          compiled.calls.map((c) => ({ ...c, to: c.to.toLowerCase() })),
        ) !==
        serviceHash(input.calls.map((c) => ({ ...c, to: c.to.toLowerCase() })))
      )
        denied();
      return { input: candidate, compiled };
    }
  }
  if (
    input.calls.some(
      (c) =>
        effective.swaps.some(
          (r) =>
            r.router.address.toLowerCase() === c.to.toLowerCase() &&
            c.data.startsWith(
              swapInterface.getFunction('exactInputSingle')!.selector,
            ),
        ) ||
        effective.vaults.some(
          (r) =>
            r.router.address.toLowerCase() === c.to.toLowerCase() &&
            c.data.startsWith(
              vaultRouterInterface.getFunction('depositToVault')!.selector,
            ),
        ),
    )
  )
    denied();
  return undefined;
}
