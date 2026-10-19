<script setup lang="ts">
import type { OperationAdapters } from '../../src/execution/operation-adapters';
import type { PinnedContract } from '../../src/execution/approved-calls';
defineProps<{ adapters?: OperationAdapters }>();
const pin = (p: PinnedContract) =>
  `${p.address} · code ${p.codeHash}${p.implementation ? ` · implementation ${p.implementation.address} · ${p.implementation.codeHash}` : ''}`;
</script>
<template>
  <section class="adapter-summary">
    <h4>Selected optional adapters</h4>
    <p v-if="!adapters || !Object.values(adapters).some((v) => v?.length)">
      No optional operation adapters.
    </p>
    <article
      v-for="(entry, index) in adapters?.tokenTransfers"
      :key="'t' + index"
    >
      <p>Token transfer: {{ pin(entry.token) }}</p>
      <p>
        Recipients: {{ entry.recipients.join(', ') }}. Maximum
        {{ entry.maximumAmount }} base units per transfer.
        {{
          entry.lifetimeAmount !== undefined
            ? `Cumulative allowance: ${entry.lifetimeAmount} base units.`
            : 'Cumulative allowance disabled.'
        }}
      </p>
    </article>
    <article v-for="(entry, index) in adapters?.swaps" :key="'s' + index">
      <p>
        Swap {{ entry.id }} · fee {{ entry.fee }} millionths · maximum input
        {{ entry.maximumInput }} base units.
      </p>
      <p>
        Router: {{ pin(entry.router) }}. Input: {{ pin(entry.tokenIn) }}.
        Output: {{ pin(entry.tokenOut) }}.
      </p>
    </article>
    <article v-for="(entry, index) in adapters?.vaults" :key="'v' + index">
      <p>
        Vault {{ entry.id }} · maximum deposit {{ entry.maximumAssets }} base
        units.
      </p>
      <p>
        Router: {{ pin(entry.router) }}. Vault: {{ pin(entry.vault) }}. Asset:
        {{ pin(entry.asset) }}.
      </p>
    </article>
  </section>
</template>
<style scoped>
.adapter-summary {
  overflow-wrap: anywhere;
}
</style>
