<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { ProviderConfiguration } from '../model';
import { docs } from '../model';
import {
  curlExample,
  deployedExplorerUrl,
  referenceOperations,
  referenceOrigin,
  referenceSpec,
  type ApiContract,
} from '../api-reference';
import { loadSwagger, type SwaggerInstance } from '../swagger';
const props = defineProps<{
  config: ProviderConfiguration;
  contract: ApiContract;
}>();
const emit = defineEmits<{ enableDocumentation: [] }>();
const liveUrl = computed(() =>
  deployedExplorerUrl(props.config.policy.provider.origin),
);
const applicationIndex = ref(0);
const search = ref('');
const showUnconfigured = ref(false);
const selectedOperation = ref('requestAccountAccess');
const canvas = ref<HTMLElement>();
const loading = ref(true);
const error = ref('');
const copied = ref('');
let ui: SwaggerInstance | undefined;
const operations = computed(() =>
  referenceOperations(props.contract, props.config, applicationIndex.value),
);
const shown = computed(() =>
  operations.value.filter(
    (item) =>
      (showUnconfigured.value ||
        !item.guide.financial ||
        props.config.financial) &&
      `${item.method} ${item.path} ${item.guide.title} ${item.guide.scope ?? ''}`
        .toLowerCase()
        .includes(search.value.toLowerCase().trim()),
  ),
);
const spec = computed(() =>
  referenceSpec(props.contract, props.config, shown.value),
);
const selected = computed(
  () =>
    shown.value.find(
      (item) => item.operation.operationId === selectedOperation.value,
    ) ?? shown.value[0],
);
const snippet = computed(() =>
  selected.value
    ? curlExample(selected.value, props.config.policy.provider.origin)
    : '',
);
watch(
  () => props.config.policy.applications.length,
  (length) => {
    if (applicationIndex.value >= length) applicationIndex.value = 0;
  },
);
watch(shown, (items) => {
  if (
    !items.some(
      (item) => item.operation.operationId === selectedOperation.value,
    )
  )
    selectedOperation.value = items[0]?.operation.operationId ?? '';
});
watch(snippet, () => {
  copied.value = '';
});
watch(spec, (value) => {
  ui?.specActions.updateSpec(JSON.stringify(value));
});
async function renderReference() {
  loading.value = true;
  error.value = '';
  try {
    const SwaggerUI = await loadSwagger();
    await nextTick();
    ui = SwaggerUI({
      domNode: canvas.value,
      spec: spec.value,
      supportedSubmitMethods: [],
      tryItOutEnabled: false,
      validatorUrl: null,
      persistAuthorization: false,
      queryConfigEnabled: false,
      deepLinking: false,
      docExpansion: 'list',
      defaultModelsExpandDepth: -1,
      plugins: [
        () => ({
          components: {
            authorizeBtn: () => null,
            authorizeOperationBtn: () => null,
            authorizationPopup: () => null,
            auths: () => null,
          },
        }),
      ],
      requestInterceptor: () => {
        throw new Error('Reference only: requests are disabled.');
      },
    });
  } catch {
    error.value =
      'API renderer unavailable. Retry loading it or restart the setup command.';
  } finally {
    loading.value = false;
  }
}
onMounted(renderReference);
function download() {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(spec.value, null, 2) + '\n'], {
      type: 'application/json',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'provider-api.reference.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function copy() {
  try {
    await navigator.clipboard.writeText(snippet.value);
    copied.value = 'Example copied. Replace the placeholders before use.';
  } catch {
    copied.value =
      'Clipboard unavailable. Select and copy the example text below.';
  }
}
</script>
<template>
  <section class="api-reference" aria-label="Provider API reference">
    <div class="step-heading">
      <span class="eyebrow">Explore the interface</span>
      <h2>Provider API reference</h2>
      <p>
        See what your configuration supports, how an application calls it, and
        the responses it can receive.
      </p>
    </div>
    <div class="callout">
      <strong>Local preview · no API calls are sent</strong>
      <p>
        This view follows your current, possibly unsaved and unvalidated
        settings. It does not inspect a deployed service, validate a token or
        grant access. Activation, vendor acceptance and current owner/grant/KYC
        checks still apply. Use application access tokens, never the local
        setup-session token or vendor secrets.
      </p>
    </div>
    <section class="callout api-live" aria-label="Try deployed APIs">
      <span class="eyebrow">After deployment</span>
      <h3>Try it out · real service responses</h3>
      <p>
        Open Swagger on your provider's HTTPS domain to send requests and see
        the actual status, headers, response body and timing. Nothing runs
        automatically. Your local preview and edits stay here.
      </p>
      <p v-if="!config.http?.documentation">
        Enable the deployed explorer in this draft, then validate, export and
        deploy the new configuration. Restart the service for it to take effect.
      </p>
      <button
        v-if="!config.http?.documentation"
        type="button"
        class="secondary"
        @click="emit('enableDocumentation')"
      >
        Enable deployed API explorer in draft
      </button>
      <p v-else>
        Explorer enabled in this draft. Export and deploy it before opening the
        link; this setting does not verify or activate the deployed service.
      </p>
      <p v-if="liveUrl">
        <a :href="liveUrl" target="_blank" rel="noopener noreferrer">
          Open deployed Try it out ↗</a
        ><br /><code>{{ liveUrl }}</code>
      </p>
      <p v-else>
        Set a valid Service HTTPS origin in Provider to create the deployment
        link.
      </p>
      <p>
        Start with GET /v1/capabilities without a token. For protected APIs, use
        Authorize with a short-lived application access token. POST requests can
        create records, incur vendor charges or produce usable signatures.
      </p>
      <a
        :href="docs + 'http-api.html#try-deployed-apis'"
        target="_blank"
        rel="noopener noreferrer"
      >
        Deployment, token and testing instructions ↗</a
      >
    </section>
    <dl class="summary api-auth-summary">
      <div>
        <dt>API base URL</dt>
        <dd>{{ referenceOrigin(config.policy.provider.origin) }}</dd>
      </div>
      <div>
        <dt>Application token issuer</dt>
        <dd>{{ config.oauth.issuer || 'Set in Services' }}</dd>
      </div>
      <div>
        <dt>API audience</dt>
        <dd>{{ config.oauth.audience || 'Set in Services' }}</dd>
      </div>
      <div>
        <dt>Token profile</dt>
        <dd>RFC 9068 at+jwt · RS256/ES256 · at most 600 seconds</dd>
      </div>
    </dl>
    <p class="help-text">
      Get a token from your configured issuer using the calling application's
      own registration.
      <a
        :href="docs + 'auth0-setup.html'"
        target="_blank"
        rel="noopener noreferrer"
        >Login and token setup instructions ↗</a
      >
    </p>
    <div class="field-grid api-controls">
      <label
        >Preview application<select
          v-model="applicationIndex"
          aria-label="Preview application"
        >
          <option
            v-for="(app, index) in config.policy.applications"
            :key="index"
            :value="index"
          >
            {{ app.name || `Application ${index + 1}` }} ·
            {{ app.clientId || 'client ID not set' }}
          </option>
        </select></label
      >
      <label
        >Find an endpoint<input
          v-model="search"
          type="search"
          placeholder="Path, action or scope"
          aria-label="Find an endpoint"
      /></label>
    </div>
    <label class="api-toggle"
      ><input v-model="showUnconfigured" type="checkbox" /> Show transfer APIs
      when the signing profile is not configured</label
    >
    <p class="help-text">
      {{ shown.length }} endpoint(s). All wallet backends expose the same
      provider API; vendor APIs and advanced enrollment/orchestration profiles
      are separate.
    </p>
    <div class="api-flow">
      <h3>Application integration order</h3>
      <p>
        Request access → owner login and consent → funded identity and staff
        review → poll for a grant → provision → read account. With transfer
        signing: request exact approval → owner approves → poll → sign.
        Submission, gas and settlement follow separately.
      </p>
      <p>
        Hosted login, consent, reviewer and approval pages use browser sessions,
        not application bearer tokens. Open returned consent/approval URLs as
        top-level navigation.
      </p>
      <a
        :href="docs + 'http-api.html'"
        target="_blank"
        rel="noopener noreferrer"
        >HTTP authentication and retry guide ↗</a
      >
    </div>
    <div v-if="selected" class="api-example">
      <h3>How to call it</h3>
      <label
        >Example endpoint<select
          v-model="selectedOperation"
          aria-label="Example endpoint"
        >
          <option
            v-for="item in shown"
            :key="item.operation.operationId"
            :value="item.operation.operationId"
          >
            {{ item.method.toUpperCase() }} {{ item.path }}
          </option>
        </select></label
      >
      <p>
        <strong>{{ selected.status }}</strong> · Required scope:
        <code>{{ selected.guide.scope || 'None' }}</code>
      </p>
      <p>{{ selected.guide.prerequisite }}</p>
      <p>{{ selected.guide.success }}</p>
      <p class="help-text">
        Illustrative request. Replace token, object IDs, share token and
        idempotency key with your application's values. The transfer amount is
        in integer base units. Reuse each original mutation key on retries.
      </p>
      <button type="button" class="secondary" @click="copy">
        Copy cURL example
      </button>
      <p v-if="copied" role="status">{{ copied }}</p>
      <pre aria-label="cURL request example">{{ snippet }}</pre>
    </div>
    <div class="section-heading">
      <h3>Requests and responses</h3>
      <button type="button" class="secondary" @click="download">
        Download displayed OpenAPI
      </button>
    </div>
    <p class="help-text">
      Rendered with bundled
      <a
        href="https://swagger.io/tools/swagger-ui/"
        target="_blank"
        rel="noopener noreferrer"
        >Swagger UI ↗</a
      >.
    </p>
    <p>
      Expand an endpoint for parameters, JSON request examples, response codes
      and schemas. Example values are illustrative, not live results. 401 means
      token authentication failed; 403 means scope or current authority was
      denied; 409 requires conflict/retry review; 503 means unavailable. An
      unknown effect must be reconciled, not replaced with a new attempt.
    </p>
    <p v-if="loading" role="status">Loading bundled Swagger UI…</p>
    <p v-if="error" role="alert">
      {{ error }}
      <button type="button" class="secondary" @click="renderReference">
        Retry API renderer
      </button>
    </p>
    <p v-if="!shown.length">No endpoints match this filter.</p>
    <div v-show="shown.length" ref="canvas" class="api-swagger"></div>
  </section>
</template>
