<script setup lang="ts">
import { watch } from 'vue';
import type { ProviderConfiguration } from '../model';
import SecretField from './SecretField.vue';
import PriceFields from './PriceFields.vue';
const model = defineModel<ProviderConfiguration>({ required: true });
watch(
  () => model.value.oauth.issuer,
  (issuer) => {
    for (const application of model.value.policy.applications)
      application.issuer = issuer;
  },
);
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
</script>
<template>
  <div class="step-heading">
    <span class="eyebrow">Connected services</span>
    <h2>Connect login and identity</h2>
    <p>
      Use registrations at your existing services. Credentials stay in your
      deployment environment.
    </p>
  </div>
  <h3>Account owner login</h3>
  <div class="field-grid">
    <FormKit
      v-model="model.ownerLogin.issuer"
      type="url"
      label="Owner login issuer"
      placeholder="https://login.acme.com"
      validation="required|https_url"
    /><FormKit
      v-model="model.ownerLogin.clientId"
      type="text"
      label="Owner login client ID"
      validation="required|length:1,256"
    />
  </div>
  <SecretField
    v-model="model.ownerLogin.clientSecret"
    label="Owner login client secret"
  />
  <FormKit
    type="select"
    label="ID token algorithm"
    :modelValue="model.ownerLogin.idTokenAlgorithm ?? 'RS256'"
    :options="['RS256', 'ES256']"
    @update:modelValue="
      model.ownerLogin.idTokenAlgorithm = $event === 'ES256' ? 'ES256' : 'RS256'
    "
  />
  <div class="callout">
    <strong>Register this exact callback</strong
    ><code
      >{{
        model.policy.provider.origin || 'https://your-provider.example'
      }}/onboarding/callback</code
    >
    <p>
      Use a confidential OIDC client with code flow, PKCE S256 and auth_time.
      The login service owns MFA and recovery. Confirm client_secret_post token
      authentication, ID tokens valid for at most ten minutes, and a fresh
      auth_time within five minutes.
    </p>
  </div>
  <h3>Connected application API authentication</h3>
  <FormKit
    v-model="model.oauth.issuer"
    type="url"
    label="Application token issuer"
    placeholder="https://applications.acme.com"
    validation="required|https_url"
    help="Applications configured in the next step must use this same issuer."
  />
  <div class="field-grid">
    <FormKit
      v-model="model.oauth.audience"
      type="text"
      label="Dedicated API audience"
      validation="required|length:1,256"
    /><FormKit
      v-model="model.oauth.jwksUrl"
      type="url"
      label="Application JWKS URL"
      validation="required|https_url"
    />
  </div>
  <p class="help-text">
    Use separate application client registrations and RFC 9068 at+jwt access
    tokens with the required wallet scopes and a lifetime no longer than ten
    minutes.
  </p>
  <h3>Identity verification</h3>
  <p class="help-text">
    Select one or both supported vendors. Provider staff still review identity
    acceptance. New verification and shared imports each require agreed price
    bounds and an application funding agreement in Policies, even when the
    agreed cost is zero.
  </p>
  <fieldset class="vendor-panel">
    <legend>
      <img src="/providers/didit.png" alt="Didit logo" width="28" height="28" />
      Didit
    </legend>
    <FormKit
      type="checkbox"
      label="Use Didit"
      :modelValue="!!model.identity.didit"
      @update:modelValue="didit($event)"
    />
    <a href="https://docs.didit.me/" target="_blank" rel="noopener noreferrer"
      >Didit setup documentation ↗</a
    >
    <template v-if="model.identity.didit"
      ><FormKit
        v-model="model.identity.didit.workflowId"
        type="text"
        label="Didit workflow ID"
        :validation="[
          ['required'],
          [
            'matches',
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
          ],
        ]"
        help="Recipient workflow UUID from your Didit account." /><SecretField
        v-model="model.identity.didit.apiKey"
        label="Didit API key" /><PriceFields
        v-model="model.identity.didit.importPrice"
        label="Didit import" /><PriceFields
        v-model="model.identity.didit.verificationPrice"
        label="Didit verification"
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
    <FormKit
      type="checkbox"
      label="Use Sumsub"
      :modelValue="!!model.identity.sumsub"
      @update:modelValue="sumsub($event)"
    />
    <a href="https://docs.sumsub.com/" target="_blank" rel="noopener noreferrer"
      >Sumsub setup documentation ↗</a
    >
    <template v-if="model.identity.sumsub"
      ><FormKit
        v-model="model.identity.sumsub.levelName"
        type="text"
        label="Sumsub recipient level name"
        validation="required|length:1,256" /><SecretField
        v-model="model.identity.sumsub.appToken"
        label="Sumsub app token" /><SecretField
        v-model="model.identity.sumsub.secretKey"
        label="Sumsub secret key" />
      <p class="help-text">
        This adapter requires reusable KYC Share to be enabled at Sumsub.
      </p>
      <PriceFields
        v-model="model.identity.sumsub.importPrice"
        label="Sumsub import" /><PriceFields
        v-model="model.identity.sumsub.verificationPrice"
        label="Sumsub verification"
    /></template>
  </fieldset>
  <p
    v-if="!model.identity.didit && !model.identity.sumsub"
    role="alert"
    class="error-text"
  >
    Choose at least one identity vendor before exporting.
  </p>
</template>
