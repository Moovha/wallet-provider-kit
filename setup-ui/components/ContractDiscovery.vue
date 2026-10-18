<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import type { RuntimePolicy } from '../../src/runtime-configuration/service';
import {
  discoverContract,
  parseAbi,
  maximumAbiBytes,
  type DiscoveredMethod,
} from '../contract-discovery';
const model = defineModel<RuntimePolicy['contracts'][number]>({
  required: true,
});
const busy = ref(false);
const abi = ref('');
const methods = ref<DiscoveredMethod[]>([]);
const error = ref('');
const notice = ref('');
let generation = 0;
let lookup: AbortController | undefined;
let discoveredAddress: string | undefined;
watch(
  () => model.value.address,
  () => {
    generation++;
    lookup?.abort();
    busy.value = false;
    methods.value = [];
    error.value = '';
    notice.value = '';
    abi.value = '';
    if (discoveredAddress) {
      model.value.code_hash = '';
      model.value.implementation = undefined;
      model.value.methods = [{ signature: '', maximum_value_wei: '0' }];
      discoveredAddress = undefined;
    }
  },
);
onBeforeUnmount(() => {
  generation++;
  lookup?.abort();
});
function apply(candidates: DiscoveredMethod[]) {
  methods.value = candidates;
  const previous = new Map(
    model.value.methods.map((method) => [
      method.signature,
      method.maximum_value_wei,
    ]),
  );
  model.value.methods =
    candidates.length <= 32
      ? candidates.map((method) => ({
          signature: method.signature,
          maximum_value_wei: previous.get(method.signature) ?? '0',
        }))
      : [];
  notice.value =
    candidates.length <= 32
      ? `${candidates.length} methods loaded and selected. Uncheck any methods you do not want to register. New methods default to zero native value.`
      : `${candidates.length} methods found. Select up to 32 methods; none were selected automatically because the policy limit would be exceeded.`;
}
async function load() {
  lookup?.abort();
  lookup = new AbortController();
  const current = ++generation;
  const original = JSON.stringify(model.value);
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const found = await discoverContract(
      model.value.address,
      fetch,
      lookup.signal,
    );
    if (current !== generation) return;
    if (JSON.stringify(model.value) !== original)
      throw new Error(
        'The contract fields changed during lookup. Load again to review the current address.',
      );
    discoveredAddress = model.value.address;
    model.value.code_hash = found.code_hash;
    model.value.implementation = found.implementation;
    apply(found.methods);
    notice.value +=
      ' Bytecode pins are suggestions from Sourcify verification metadata; execution independently checks current deployed code.';
  } catch (failure) {
    if (current === generation)
      error.value =
        failure instanceof Error ? failure.message : 'Contract lookup failed.';
  } finally {
    if (current === generation) busy.value = false;
  }
}
function importAbi() {
  error.value = '';
  notice.value = '';
  try {
    apply(parseAbi(abi.value));
  } catch (failure) {
    error.value = (failure as Error).message;
  }
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  lookup?.abort();
  const current = ++generation;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    if (file.size > maximumAbiBytes)
      throw new Error('The ABI or artifact must be no larger than 512 KiB.');
    const text = await file.text();
    if (current !== generation) return;
    const candidates = parseAbi(text);
    abi.value = text;
    apply(candidates);
  } catch (failure) {
    if (current === generation)
      error.value =
        failure instanceof Error
          ? failure.message
          : 'Cannot read this ABI file.';
  } finally {
    input.value = '';
    if (current === generation) busy.value = false;
  }
}
function toggle(method: DiscoveredMethod, selected: boolean) {
  if (selected) {
    if (
      model.value.methods.length >= 32 ||
      model.value.methods.some((item) => item.signature === method.signature)
    )
      return;
    model.value.methods.push({
      signature: method.signature,
      maximum_value_wei: '0',
    });
  } else
    model.value.methods = model.value.methods.filter(
      (item) => item.signature !== method.signature,
    );
}
</script>
<template>
  <section class="contract-discovery" aria-label="Discover contract methods">
    <button type="button" @click="load" :disabled="busy || !model.address">
      {{ busy ? 'Loading contract…' : 'Load verified methods' }}
    </button>
    <p>
      Look up this Base Sepolia address on Sourcify. Only the public address is
      sent; your access token stays with this provider.
    </p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <details>
      <summary>Upload or paste an ABI</summary>
      <p>
        Use an ABI array or a compiler artifact containing an ABI. Supply
        bytecode pins below when they could not be discovered. Imports propose
        methods; they do not prove that an ABI matches deployed code.
      </p>
      <label
        >ABI file<input
          type="file"
          accept=".json,application/json"
          :disabled="busy"
          @change="upload"
      /></label>
      <label
        >ABI JSON<textarea v-model="abi" :disabled="busy" spellcheck="false" />
      </label>
      <button type="button" @click="importAbi" :disabled="busy || !abi.trim()">
        Import ABI
      </button>
    </details>
    <fieldset v-if="methods.length" :disabled="busy">
      <legend>
        Methods to register ({{ model.methods.length }}/32 selected)
      </legend>
      <div class="actions">
        <button
          type="button"
          @click="apply(methods)"
          :disabled="methods.length > 32"
        >
          Select all methods</button
        ><button type="button" @click="model.methods = []">
          Clear method selection
        </button>
      </div>
      <label
        v-for="method in methods"
        :key="method.signature"
        class="discovered-method"
        ><input
          type="checkbox"
          :checked="
            model.methods.some((item) => item.signature === method.signature)
          "
          :disabled="
            model.methods.length >= 32 &&
            !model.methods.some((item) => item.signature === method.signature)
          "
          @change="toggle(method, ($event.target as HTMLInputElement).checked)"
        />{{ method.signature }} <span>· {{ method.mutability }}</span></label
      >
    </fieldset>
  </section>
</template>
