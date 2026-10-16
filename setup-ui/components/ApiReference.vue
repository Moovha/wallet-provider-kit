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
        throw new Error(
          'This is a local preview. Open the deployed API explorer to send a request.',
        );
      },
    });
  } catch {
    error.value =
      'The API reference could not be loaded. Choose Reload API reference to try again. If it still fails, restart the setup command and import your saved configuration.';
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
        Explore requests and example responses for your current settings. Choose
        an application to see which permissions you have configured for it.
      </p>
    </div>
    <div class="callout">
      <strong>Local preview · no API calls are sent</strong>
      <p>
        This preview uses the settings in this wizard, including unsaved edits.
        It does not check your deployed service or give an application access.
        Your deployed service still checks its configuration, application
        tokens, owner consent, identity status and permissions before allowing a
        request.
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
        Enter your Public wallet service address in Provider, starting with
        https:// and without a trailing slash or page path, to create this link.
      </p>
      <p>
        Start with GET /v1/capabilities without a token. For protected
        endpoints, use the Application tokens panel when operator token controls
        are configured, or Authorize with a short-lived application access
        token. POST requests can create records, incur vendor charges or issue
        signatures that can authorize later transactions. Use an application
        access token, never a vendor secret or this wizard's local session
        token.
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
        <dt>Required access-token format</dt>
        <dd>
          RFC 9068 JWT (at+jwt) · RS256 or ES256 · valid for at most 10 minutes
        </dd>
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
        >Application to preview<select
          v-model="applicationIndex"
          aria-label="Application to preview"
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
      even when transfer signing is off</label
    >
    <p class="help-text">
      {{ shown.length }} endpoint(s). All wallet backends expose the same wallet
      API. A vendor's own API and custom enrollment or transaction-execution
      integrations are separate.
    </p>
    <div class="api-flow">
      <h3>Connect an application</h3>
      <p>
        Request access → owner signs in and consents → identity checks and staff
        review → read the access status until granted → create the wallet → read
        account details. Identity checks require an agreed price and funding.
        With delegated transfer signing, the application requests a transfer,
        your service authorizes it, then the application requests its signature.
        Submitting the transaction, paying network fees and confirming
        completion are separate steps.
      </p>
      <p>
        Hosted login, consent, access management and provider review pages use
        the owner's or reviewer's browser login, not the application's API
        token. Open returned consent links as a full browser page rather than
        embedding them.
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
        This request is an example. Replace the token, account/request/action
        IDs and any shared-identity token with values from your deployment. Use
        a new UUIDv4 idempotency key for a new POST request and keep the same
        key when retrying it. Transfer amounts are whole numbers of the token's
        base units.
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
      Expand an endpoint to see its inputs, JSON examples, response codes and
      schemas. These are examples, not responses from your service. For a 401,
      check the access token. For a 403, check the required scope and current
      account permission. For a 409, inspect the original request before
      retrying. For a 503, check service readiness and the returned outcome. If
      an outcome is unknown, establish what happened to the original attempt
      before trying again; a new idempotency key does not make it safe to repeat
      the operation.
    </p>
    <p v-if="loading" role="status">Loading endpoint details…</p>
    <p v-if="error" role="alert">
      {{ error }}
      <button type="button" class="secondary" @click="renderReference">
        Reload API reference
      </button>
    </p>
    <p v-if="!shown.length">No endpoints match this filter.</p>
    <div v-show="shown.length" ref="canvas" class="api-swagger"></div>
  </section>
</template>
