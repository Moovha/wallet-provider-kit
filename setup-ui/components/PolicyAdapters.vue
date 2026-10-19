<script setup lang="ts">
import type { OperationAdapters } from '../../src/execution/operation-adapters';
import type { PinnedContract } from '../../src/execution/approved-calls';
import type { TransferPolicy } from '../../src/deployment/actions';
import AdapterPinFields from './AdapterPinFields.vue';
import { emptyPin, pinForAdapter } from '../policy-forms';
const props = defineProps<{
  contracts?: PinnedContract[];
  compatibility?: OperationAdapters;
  transfer?: TransferPolicy;
  tokenCodeHash?: string;
}>();
const model = defineModel<OperationAdapters | undefined>({ required: true });
function nextRouteId(kind: 'swaps' | 'vaults', prefix: string) {
  const ids = new Set(
    [
      ...(model.value?.[kind] ?? []),
      ...(props.compatibility?.[kind] ?? []),
    ].map((r) => r.id),
  );
  let candidate = prefix.slice(0, 64),
    suffix = 1;
  while (ids.has(candidate)) {
    const end = `-${suffix++}`;
    candidate = prefix.slice(0, 64 - end.length) + end;
  }
  return candidate;
}
function add(kind: keyof OperationAdapters) {
  const value = (model.value ??= {});
  if (kind === 'tokenTransfers')
    (value.tokenTransfers ??= []).push({
      token: emptyPin(),
      recipients: [''],
      maximumAmount: '',
    });
  if (kind === 'swaps')
    (value.swaps ??= []).push({
      id: nextRouteId('swaps', 'swap'),
      router: emptyPin(),
      tokenIn: emptyPin(),
      tokenOut: emptyPin(),
      fee: 3000,
      maximumInput: '',
    });
  if (kind === 'vaults')
    (value.vaults ??= []).push({
      id: nextRouteId('vaults', 'vault'),
      router: emptyPin(),
      vault: emptyPin(),
      asset: emptyPin(),
      maximumAssets: '',
    });
}
function remove(kind: keyof OperationAdapters, index: number) {
  model.value?.[kind]?.splice(index, 1);
  if (!model.value?.[kind]?.length) delete model.value?.[kind];
  if (model.value && !Object.keys(model.value).length) model.value = undefined;
}
function prefill(index: number) {
  const transfer = props.transfer,
    entry = model.value?.tokenTransfers?.[index];
  if (!entry || !transfer) return;
  const pin = props.contracts?.find(
    (p) => p.address.toLowerCase() === transfer.token.address.toLowerCase(),
  );
  entry.token = pin
    ? pinForAdapter(pin)
    : { address: transfer.token.address, codeHash: props.tokenCodeHash ?? '' };
  entry.recipients = [...transfer.recipients];
  entry.maximumAmount = transfer.maximumAmount;
}
function cumulative(index: number, enabled: boolean) {
  const entry = model.value!.tokenTransfers![index];
  if (enabled)
    entry.lifetimeAmount =
      props.transfer?.token.address.toLowerCase() ===
      entry.token.address.toLowerCase()
        ? props.transfer.lifetimeAmount
        : entry.maximumAmount;
  else delete entry.lifetimeAmount;
}
function copyCompatibility() {
  for (const kind of ['swaps', 'vaults'] as const)
    if (props.compatibility?.[kind]?.length) {
      const value = (model.value ??= {});
      const routes = (value[kind] ??= []);
      for (const route of props.compatibility[kind]!)
        if (
          routes.length < 128 &&
          !routes.some((r) => {
            const { id: _, ...a } = r;
            const { id: __, ...b } = route;
            return JSON.stringify(a) === JSON.stringify(b);
          })
        ) {
          const copied = JSON.parse(JSON.stringify(route));
          copied.id = nextRouteId(kind, route.id.slice(0, 56) + '-adapter');
          routes.push(copied);
        }
    }
}
</script>
<template>
  <section class="policy-adapters" aria-label="Optional policy adapters">
    <h3>Optional policy adapters</h3>
    <p>
      Generic calls work without these rules. Add only the guarantees you want
      to delegate. Token amounts use base units; token decimals and prices are
      not inferred. Gas sponsorship is configured separately.
    </p>
    <p v-if="!model || !Object.values(model).some((v) => v?.length)">
      No optional adapters selected.
    </p>
    <button
      class="secondary"
      v-if="compatibility?.swaps?.length || compatibility?.vaults?.length"
      type="button"
      @click="copyCompatibility"
    >
      Use compatibility routes as optional adapters
    </button>
    <fieldset
      v-for="(entry, index) in model?.tokenTransfers"
      :key="'token' + index"
    >
      <legend>Token transfer adapter {{ index + 1 }}</legend>
      <button v-if="transfer" type="button" @click="prefill(index)">
        Prefill from ERC-3009 policy
      </button>
      <AdapterPinFields
        label="Transfer token"
        v-model="entry.token"
        :contracts="contracts"
      />
      <label
        >Allowed transfer recipients (one per line)<textarea
          :value="entry.recipients.join('\n')"
          @input="
            entry.recipients = ($event.target as HTMLTextAreaElement).value
              .split('\n')
              .map((v) => v.trim())
          "
          required
        />
      </label>
      <label
        >Maximum transfer amount (base units)<input
          v-model="entry.maximumAmount"
          required
          pattern="[1-9][0-9]{0,77}"
          inputmode="numeric"
      /></label>
      <label
        ><input
          type="checkbox"
          :checked="entry.lifetimeAmount !== undefined"
          @change="
            cumulative(index, ($event.target as HTMLInputElement).checked)
          "
        />Use a cumulative token allowance</label
      >
      <label v-if="entry.lifetimeAmount !== undefined"
        >Lifetime token allowance (base units)<input
          v-model="entry.lifetimeAmount"
          required
          pattern="[1-9][0-9]{0,77}"
          inputmode="numeric"
      /></label>
      <p>
        Cumulative accounting shares the existing ERC-3009 allowance for this
        account and token. Usage is retained; changing this term does not reset
        it.
      </p>
      <button type="button" @click="remove('tokenTransfers', index)">
        Remove token adapter {{ index + 1 }}
      </button>
    </fieldset>
    <button
      class="secondary"
      type="button"
      @click="add('tokenTransfers')"
      :disabled="(model?.tokenTransfers?.length ?? 0) >= 128"
    >
      Add token transfer adapter
    </button>
    <fieldset v-for="(entry, index) in model?.swaps" :key="'swap' + index">
      <legend>Swap adapter {{ index + 1 }}</legend>
      <label
        >Swap adapter ID<input
          v-model="entry.id"
          required
          pattern="[A-Za-z0-9._-]{1,64}"
      /></label>
      <AdapterPinFields
        label="Swap router"
        v-model="entry.router"
        :contracts="contracts"
      /><AdapterPinFields
        label="Swap input token"
        v-model="entry.tokenIn"
        :contracts="contracts"
      /><AdapterPinFields
        label="Swap output token"
        v-model="entry.tokenOut"
        :contracts="contracts"
      />
      <label
        >Swap pool fee (millionths)<input
          v-model.number="entry.fee"
          type="number"
          min="1"
          max="999999"
          required
      /></label>
      <label
        >Maximum swap input (base units)<input
          v-model="entry.maximumInput"
          required
          pattern="[1-9][0-9]{0,77}"
          inputmode="numeric"
      /></label>
      <button type="button" @click="remove('swaps', index)">
        Remove swap adapter {{ index + 1 }}
      </button>
    </fieldset>
    <button
      class="secondary"
      type="button"
      @click="add('swaps')"
      :disabled="(model?.swaps?.length ?? 0) >= 128"
    >
      Add swap adapter
    </button>
    <fieldset v-for="(entry, index) in model?.vaults" :key="'vault' + index">
      <legend>Vault adapter {{ index + 1 }}</legend>
      <label
        >Vault adapter ID<input
          v-model="entry.id"
          required
          pattern="[A-Za-z0-9._-]{1,64}"
      /></label>
      <AdapterPinFields
        label="Vault router"
        v-model="entry.router"
        :contracts="contracts"
      /><AdapterPinFields
        label="Vault"
        v-model="entry.vault"
        :contracts="contracts"
      /><AdapterPinFields
        label="Vault asset"
        v-model="entry.asset"
        :contracts="contracts"
      />
      <label
        >Maximum vault deposit (base units)<input
          v-model="entry.maximumAssets"
          required
          pattern="[1-9][0-9]{0,77}"
          inputmode="numeric"
      /></label>
      <button type="button" @click="remove('vaults', index)">
        Remove vault adapter {{ index + 1 }}
      </button>
    </fieldset>
    <button
      class="secondary"
      type="button"
      @click="add('vaults')"
      :disabled="(model?.vaults?.length ?? 0) >= 128"
    >
      Add vault adapter
    </button>
    <p>
      Selected adapters cover one recognized operation per batch. Swap minima,
      deadlines and vault share minima come from the request; these rules do not
      choose prices or routes.
    </p>
  </section>
</template>
<style scoped>
.policy-adapters {
  margin: 1rem 0;
}
.policy-adapters fieldset {
  margin: 1rem 0;
  padding: 1rem;
  border: 1px solid #cbd5d1;
  border-radius: 8px;
  min-width: 0;
}
.policy-adapters :deep(label) {
  display: grid;
  gap: 0.4rem;
  margin: 0.7rem 0;
}
.policy-adapters :deep(input:not([type='checkbox'])),
.policy-adapters :deep(textarea),
.policy-adapters :deep(select) {
  width: 100%;
  box-sizing: border-box;
  padding: 0.65rem;
  font: inherit;
  min-width: 0;
  border: 1px solid #cbd5d1;
  border-radius: 6px;
  background: white;
  color: inherit;
}
.policy-adapters :deep(input[type='checkbox']) {
  justify-self: start;
}
.policy-adapters :deep(label:has(input[type='checkbox'])) {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.policy-adapters legend {
  font-weight: 600;
}
.policy-adapters button {
  margin: 0.4rem 0.5rem 0.4rem 0;
  padding: 0.6rem 0.9rem;
  border: 1px solid #a7c9b9;
  border-radius: 6px;
  font: inherit;
  font-weight: 600;
  color: #164e3b;
  background: transparent;
}
.policy-adapters p {
  overflow-wrap: anywhere;
}
</style>
