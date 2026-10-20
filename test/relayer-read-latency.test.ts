import { expect, it, vi } from 'vitest';
import { createRelayerClient } from '../src/providers/relayer-client.js';
import { executionFixture } from './helpers/execution.js';

it('overlaps independent binding reads and shares only in-flight GETs across ten callers and five sponsors', async () => {
  const sponsors = Array.from({ length: 5 }, (_, index) => {
    const sponsor = executionFixture().configuration.sponsors[0];
    sponsor.binding.relayerId = 'offline-sponsor-' + index;
    return sponsor;
  });
  const sponsor = sponsors[0];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let paused = false;
  const network = {
    id: 'evm:base-sepolia',
    name: 'base-sepolia',
    network_type: 'evm',
    chain_id: 84532,
    is_testnet: true,
  };
  const reads: string[] = [];
  const client = createRelayerClient(
    {
      url: 'https://execution.example.test',
      apiKey: 'offline-relayer-key',
      resolveAccount: async (accountId) => {
        const sponsor = sponsors.find((s) => s.accountId === accountId)!;
        return {
          ...sponsor.binding,
          relayerId: sponsor.binding.relayerId!,
          signerId: sponsor.binding.signerId!,
        };
      },
    },
    async (input) => {
      const path = new URL(String(input)).pathname;
      reads.push(path);
      await gate;
      const selected = sponsors.find((s) =>
        path.endsWith('/' + s.binding.relayerId),
      );
      return Response.json({
        success: true,
        data: path.includes('/networks/')
          ? network
          : {
              id: selected!.binding.relayerId,
              signer_id: selected!.binding.signerId,
              address: selected!.binding.address,
              network: 'base-sepolia',
              network_type: 'evm',
              paused,
            },
      });
    },
  );
  const pending = Array.from({ length: 10 }, (_, index) =>
    client.binding(sponsors[Math.floor(index / 2)].accountId),
  );
  try {
    await vi.waitFor(() => expect(reads).toHaveLength(6));
    expect(reads.some((path) => path.includes('/networks/'))).toBe(true);
    release();
    const results = await Promise.all(pending);
    expect(
      results.every(
        (result, index) =>
          result?.binding.address ===
          sponsors[Math.floor(index / 2)].binding.address,
      ),
    ).toBe(true);
    results[0]!.metadata.paused = true;
    expect(results[1]!.metadata.paused).toBe(false);
    paused = true;
    await expect(client.binding(sponsor.accountId)).rejects.toMatchObject({
      code: 'wallet_provider_response',
    });
    expect(reads).toHaveLength(8);
  } finally {
    release();
    await Promise.allSettled(pending);
  }
});
