<script setup lang="ts">
import AdvancedSettings from './AdvancedSettings.vue';
import SetupField from './SetupField.vue';
import { docs, synchronizeBundledServices } from '../model';
import { applicationScopes } from '../../src/deployment/authorization-contract';
import { computed, watch } from 'vue';
import type { ProviderConfiguration } from '../model';
import SecretField from './SecretField.vue';
const model = defineModel<ProviderConfiguration>({ required: true });
defineProps<{ returnLabel?: string }>();
const emit = defineEmits<{ 'return-to-step': [] }>();
watch(
  () => model.value.oauth.issuer,
  (issuer) => {
    for (const application of model.value.policy.applications)
      application.issuer = issuer;
  },
);
function setAuthorization(value: unknown) {
  if (value === 'bundled') {
    model.value.authorizationServer = {
      signingKey: { env: 'WALLET_OAUTH_SIGNING_KEY' },
      clients: [],
    };
    synchronizeBundledServices(model.value);
  } else {
    delete model.value.authorizationServer;
    model.value.oauth = { issuer: '', audience: '', jwksUrl: '' };
  }
}
function didit(enabled: unknown) {
  if (enabled)
    model.value.identity.didit = {
      apiKey: { env: 'DIDIT_API_KEY' },
      workflowId: '',
    };
  else delete model.value.identity.didit;
}
function sumsub(enabled: unknown) {
  if (enabled)
    model.value.identity.sumsub = {
      appToken: { env: 'SUMSUB_APP_TOKEN' },
      secretKey: { env: 'SUMSUB_SECRET_KEY' },
      levelName: '',
      reusableKycShareEnabled: true,
    };
  else delete model.value.identity.sumsub;
}
const flow = computed(() => model.value.policy.access?.mode ?? 'hosted');
</script>
<template>
  <div class="step-heading">
    <span class="eyebrow">Connected services</span>
    <h2>Bring your services together</h2>
    <p>
      Use the included tools that let applications sign in to your service, or
      connect tools your team already uses. Staff sign-in and optional hosted
      user pages have separate settings.
    </p>
  </div>
  <div class="callout step-orientation">
    <strong>Start with what you need</strong>
    <p>
      Set up application sign-in here. In Applications, decide which user checks
      and permissions your service will accept.
    </p>
    <p v-if="flow === 'application'">
      Users stay in the application. It authenticates them, completes identity
      checks and records consent; no provider user login or staff review is
      required.
    </p>
    <p v-else>
      If your service hosts the user sign-in pages, also set up user login and
      the identity checks selected in Applications.
    </p>
  </div>
  <p v-if="model.safeWallet" class="callout">
    Setup includes the private tools that send approved wallet transactions.
    Each person gets one Safe wallet address. After connection, the
    application’s team sets up network access, transaction rules and funding for
    network fees. Wallet signing keys stay private.
  </p>
  <template v-if="model.ownerLogin">
    <h3>
      {{
        flow === 'application'
          ? 'Optional staff login'
          : 'Login for wallet owners and staff'
      }}
    </h3>

    <div class="field-grid">
      <SetupField
        guide="loginIssuer"
        v-model="model.ownerLogin!.issuer"
        type="url"
        label="Login service issuer URL"
        placeholder="https://login.acme.com"
        validation="required|https_url"
      /><SetupField
        guide="loginClient"
        v-model="model.ownerLogin!.clientId"
        type="text"
        label="Wallet login client ID"
        validation="required|length:1,256"
      />
    </div>
    <SecretField
      guide="loginSecret"
      v-model="model.ownerLogin!.clientSecret"
      label="Wallet login client secret"
    />
    <SetupField
      guide="loginAlgorithm"
      type="select"
      label="Login token signing algorithm"
      :modelValue="model.ownerLogin!.idTokenAlgorithm ?? 'RS256'"
      :options="['RS256', 'ES256']"
      @update:modelValue="
        model.ownerLogin!.idTokenAlgorithm =
          $event === 'ES256' ? 'ES256' : 'RS256'
      "
    />
    <div class="callout">
      <strong>Tell your login provider where to return people</strong>
      <p>
        Copy this address into the login application’s allowed callback URLs. A
        callback is the page people return to after signing in. It uses the
        public wallet service address you chose in Provider.
      </p>
      <code
        >{{
          model.policy.provider.origin || 'https://your-provider.example'
        }}/onboarding/callback</code
      >
      <details>
        <summary>Login compatibility checklist for your administrator</summary>
        <p>
          Use a confidential OpenID Connect (OIDC) client with
          authorization-code flow, PKCE S256 and auth_time. The login service
          owns multi-factor authentication (MFA) and recovery. Confirm
          client_secret_post token authentication, ID tokens valid for at most
          ten minutes, and a fresh auth_time within five minutes.
        </p>
      </details>
    </div>
  </template>
  <h3>How applications sign in</h3>
  <SetupField
    guide="authorizationMode"
    type="select"
    label="Application authentication"
    :modelValue="model.authorizationServer ? 'bundled' : 'external'"
    :options="[
      { label: 'Bundled token service (recommended)', value: 'bundled' },
      { label: 'Connect an existing authorization server', value: 'external' },
    ]"
    @update:modelValue="setAuthorization"
  />
  <template v-if="model.authorizationServer">
    <div class="callout">
      <strong>Application authentication is included</strong>
      <p>
        Your service includes application sign-in. Setup creates missing
        connection secrets privately for the applications you enable.
        Applications use these details to get short-lived access tokens: proofs
        of which application is calling. People continue signing in through
        their application.
      </p>
      <p>
        Issuer:
        <code>{{
          model.oauth.issuer || 'Set the public service address in Provider'
        }}</code>
      </p>
      <p>
        Token endpoint: <code>{{ model.oauth.issuer }}/token</code>
      </p>
      <p>
        Audience: <code>{{ model.oauth.audience }}</code>
      </p>
    </div>
    <AdvancedSettings label="Advanced token signing variable">
      <SecretField
        guide="issuerSigningKey"
        v-model="model.authorizationServer.signingKey"
        label="Application token signing key"
      />
    </AdvancedSettings>
    <fieldset
      v-for="client in model.authorizationServer.clients"
      :key="client.clientId"
      class="repeat-row"
    >
      <legend>
        {{
          model.policy.applications.find(
            (app) => app.clientId === client.clientId,
          )?.name || 'Application'
        }}
      </legend>
      <AdvancedSettings label="Advanced application credential variable">
        <SecretField
          guide="bundledClientSecret"
          v-model="client.clientSecret"
          label="Application client secret"
        />
      </AdvancedSettings>
      <p class="help-text">
        {{ client.scopes.length }} API permissions selected. New applications
        can request wallet access, read wallet details and create accepted
        wallets. Review additional permissions before enabling them.
      </p>
      <AdvancedSettings label="Advanced application API permissions">
        <SetupField
          guide="bundledScopes"
          type="checkbox"
          label="Allowed API scopes"
          v-model="client.scopes"
          :options="
            applicationScopes.map((scope) => ({ label: scope, value: scope }))
          "
          validation="required|min:1"
        />
      </AdvancedSettings>
      <p class="help-text">
        Share only this application’s secret with its team. API permissions let
        it make requests; your service still checks identity, wallet approvals
        and the exact requested action. Transaction permissions start off.
      </p>
    </fieldset>
    <fieldset
      v-for="operator in model.authorizationServer.operatorClients ?? []"
      :key="operator.clientId"
      class="repeat-row"
    >
      <legend>
        Provider operator:
        {{ operator.clientId }}
      </legend>
      <AdvancedSettings label="Advanced operator credential variable">
        <SecretField
          guide="bundledOperatorSecret"
          v-model="operator.clientSecret"
          label="Provider operator client secret"
        />
      </AdvancedSettings>
      <p class="help-text">
        This management connection can update application rules. Keep its ID and
        secret with your administration team. An ordinary application cannot use
        these management permissions.
      </p>
    </fieldset>
  </template>
  <template v-else>
    <SetupField
      guide="tokenIssuer"
      v-model="model.oauth.issuer"
      type="url"
      label="Application token issuer"
      placeholder="https://applications.acme.com"
      validation="required|https_url"
    />
    <div class="field-grid">
      <SetupField
        guide="audience"
        v-model="model.oauth.audience"
        type="text"
        label="Wallet API audience"
        validation="required|length:1,256"
      /><SetupField
        guide="jwks"
        v-model="model.oauth.jwksUrl"
        type="url"
        label="Token verification keys URL (JWKS)"
        validation="required|https_url"
      />
    </div>
    <details class="compatibility-help">
      <summary>Application token compatibility checklist</summary>
      <p>
        Use separate application client registrations and RFC 9068 at+jwt access
        tokens with the required wallet scopes and a lifetime no longer than ten
        minutes. Ordinary ID tokens or vendor API keys cannot replace these.
        Confirm this profile on your selected external token service before
        deployment.
      </p>
      <a
        :href="
          docs +
          'operator-services.html#register-the-application-api-and-clients'
        "
        target="_blank"
        rel="noopener noreferrer"
        >Exact required token fields ↗</a
      >
    </details>
  </template>
  <template v-if="flow === 'hosted'">
    <h3>Identity checks on your service’s pages</h3>
    <p v-if="model.policy.identity?.records" class="help-text">
      Application-record evaluation is selected in Applications. It uses no
      identity-vendor connection. To use a vendor, turn off record evaluation in
      Applications, then configure its connection here.
    </p>
    <template v-else>
      <p class="help-text">
        Connect Didit or Sumsub for external verification. “Verification” starts
        new checks; “import” reuses evidence shared from another service. Set
        each route's agreed price limit and application funding in Applications,
        including free routes.
      </p>
      <fieldset class="vendor-panel">
        <legend>
          <img
            src="/providers/didit.png"
            alt="Didit logo"
            width="28"
            height="28"
          />
          Didit
        </legend>
        <SetupField
          guide="didit"
          type="checkbox"
          label="Use Didit"
          :modelValue="!!model.identity.didit"
          @update:modelValue="didit($event)"
        />
        <a
          href="https://docs.didit.me/"
          target="_blank"
          rel="noopener noreferrer"
          >Didit setup documentation ↗</a
        >
        <template v-if="model.identity.didit"
          ><SetupField
            guide="diditWorkflow"
            v-model="model.identity.didit.workflowId"
            type="text"
            label="Didit workflow ID"
            :validation="[
              ['required'],
              [
                'matches',
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
              ],
            ]" /><SecretField
            guide="diditKey"
            v-model="model.identity.didit.apiKey"
            label="Didit API key"
        /></template>
      </fieldset>
      <fieldset class="vendor-panel">
        <legend>
          <img
            src="/providers/sumsub.png"
            alt="Sumsub logo"
            width="28"
            height="28"
          />
          Sumsub
        </legend>
        <SetupField
          guide="sumsub"
          type="checkbox"
          label="Use Sumsub"
          :modelValue="!!model.identity.sumsub"
          @update:modelValue="sumsub($event)"
        />
        <a
          href="https://docs.sumsub.com/"
          target="_blank"
          rel="noopener noreferrer"
          >Sumsub setup documentation ↗</a
        >
        <template v-if="model.identity.sumsub"
          ><SetupField
            guide="sumsubLevel"
            v-model="model.identity.sumsub.levelName"
            type="text"
            label="Sumsub recipient level name"
            validation="required|length:1,256"
          /><SecretField
            guide="sumsubToken"
            v-model="model.identity.sumsub.appToken"
            label="Sumsub app token"
          /><SecretField
            guide="sumsubSecret"
            v-model="model.identity.sumsub.secretKey"
            label="Sumsub secret key"
          />
          <p class="help-text">
            Ask Sumsub to enable Reusable KYC Share for your account and confirm
            the sharing arrangement. Selecting Sumsub here does not enable that
            product.
          </p>
        </template>
      </fieldset>
      <p
        v-if="
          !model.policy.identity?.records &&
          !model.identity.didit &&
          !model.identity.sumsub
        "
        role="alert"
        class="error-text"
      >
        Choose an identity-checking service here, or select test records in
        Applications, before saving these settings.
      </p>
    </template>
  </template>
  <button
    v-if="returnLabel"
    type="button"
    class="secondary step-shortcut"
    @click="emit('return-to-step')"
  >
    Continue in {{ returnLabel }}
  </button>
</template>
