import { tokenInterface, vaultInterface } from './operation-interfaces.js';
import { adapterInput } from './operation-adapters.js';
import type { ApprovedCallIntent } from './approved-calls.js';
import type { RpcReader } from './chain.js';
/** Verify protocol-specific outcomes against already validated logs and block-pinned reads. */
export async function verifyAdapterEffects(
  reader: RpcReader,
  intent: ApprovedCallIntent,
  logs: { address: string; topics: string[]; data: string }[],
  tag: string,
) {
  if (adapterInput(intent).kind === 'vault-deposit') {
    const result = await reader.call('eth_call', [
      {
        to: intent.effects[1].token,
        data: vaultInterface.encodeFunctionData('asset'),
      },
      tag,
    ]);
    if (
      String(
        vaultInterface.decodeFunctionResult('asset', String(result))[0],
      ).toLowerCase() !== intent.effects[0].token.toLowerCase()
    )
      return false;
  }
  if (['swap', 'vault-deposit'].includes(adapterInput(intent).kind)) {
    const token = intent.effects[0].token,
      spender = intent.calls[2].to;
    const result = await reader.call('eth_call', [
      {
        to: token,
        data: tokenInterface.encodeFunctionData('allowance', [
          intent.account.address,
          spender,
        ]),
      },
      tag,
    ]);
    if (
      tokenInterface.decodeFunctionResult('allowance', String(result))[0] !== 0n
    )
      return false;
    if (adapterInput(intent).kind === 'vault-deposit') {
      const approval = await reader.call('eth_call', [
        {
          to: token,
          data: tokenInterface.encodeFunctionData('allowance', [
            spender,
            intent.effects[1].token,
          ]),
        },
        tag,
      ]);
      if (
        tokenInterface.decodeFunctionResult(
          'allowance',
          String(approval),
        )[0] !== 0n
      )
        return false;
    }
  }
  for (const effect of intent.effects) {
    let net = 0n;
    for (const entry of logs) {
      const log = entry;
      if (log.address.toLowerCase() !== effect.token.toLowerCase()) continue;
      try {
        const event = tokenInterface.parseLog({
          topics: log.topics as string[],
          data: String(log.data),
        });
        if (event?.name !== 'Transfer') continue;
        const from = String(event.args.from).toLowerCase(),
          to = String(event.args.to).toLowerCase(),
          value = BigInt(event.args.value);
        if (effect.from === '*') {
          if (to === effect.to.toLowerCase()) net += value;
          if (from === effect.to.toLowerCase()) net -= value;
        } else if (effect.to === '*') {
          if (from === effect.from.toLowerCase()) net += value;
          if (to === effect.from.toLowerCase()) net -= value;
        } else if (
          from === effect.from.toLowerCase() &&
          to === effect.to.toLowerCase()
        )
          net += value;
      } catch {
        /* Non-Transfer events are not asset evidence. */
      }
    }
    if (
      net < BigInt(effect.minimum) ||
      (effect.maximum && net > BigInt(effect.maximum))
    )
      return false;
  }
  if (adapterInput(intent).kind === 'vault-deposit') {
    const deposits = logs.filter((entry) => {
      const log = entry;
      if (log.address.toLowerCase() !== intent.effects[1].token.toLowerCase())
        return false;
      try {
        const event = vaultInterface.parseLog({
          topics: log.topics as string[],
          data: String(log.data),
        });
        return (
          event?.name === 'Deposit' &&
          String(event.args.owner).toLowerCase() ===
            intent.account.address.toLowerCase() &&
          event.args.assets.toString() ===
            (adapterInput(intent) as { assets: string }).assets &&
          event.args.shares >=
            BigInt(
              (adapterInput(intent) as { minimum_shares: string })
                .minimum_shares,
            )
        );
      } catch {
        return false;
      }
    });
    if (deposits.length !== 1) return false;
  }
  return true;
}
