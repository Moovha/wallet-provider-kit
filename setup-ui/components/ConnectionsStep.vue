<script setup lang="ts">
import SetupField from './SetupField.vue';
import { docs } from '../model';
import { computed, watch } from 'vue';
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
  if (enabled && model.value.policy.identity)
    delete model.value.policy.identity.records;
  if (enabled)
    model.value.identity.didit = {
      apiKey: { env: 'DIDIT_API_KEY' },
      workflowId: '',
    };
  else delete model.value.identity.didit;
}
function sumsub(enabled: unknown) {
  if (enabled && model.value.policy.identity)
    delete model.value.policy.identity.records;
  if (enabled)
    model.value.identity.sumsub = {
      appToken: { env: 'SUMSUB_APP_TOKEN' },
      secretKey: { env: 'SUMSUB_SECRET_KEY' },
      levelName: '',
      reusableKycShareEnabled: true,
    };
  else delete model.value.identity.sumsub;
}
const recordFields = computed({
  get: () =>
    model.value.policy.identity?.records?.requiredFields.join('\n') ?? '',
  set: (value: string) => {
    if (model.value.policy.identity?.records)
      model.value.policy.identity.records.requiredFields = value
        .split(/\r?\n/)
        .map((field) => field.trim())
        .filter(Boolean);
  },
});
function records(enabled: unknown) {
  const identity = (model.value.policy.identity ??= {});
  if (enabled) {
    identity.records = { requiredFields: ['display_name', 'country'] };
    model.value.identity = {};
    delete model.value.financial;
    for (const app of model.value.policy.applications) {
      app.permissions = ['account:read'];
      delete app.funding;
    }
  } else delete identity.records;
}
const flow = computed(() => model.value.policy.access?.mode ?? 'hosted');
function setFlow(value: unknown) {
  if (value !== 'application' && value !== 'hosted') return;
  model.value.policy.access = { ...model.value.policy.access, mode: value };
  delete model.value.policy.identity!.records;
  model.value.identity = {};
  if (value === 'application') {
    model.value.policy.identity!.application = {
      requiredFields: ['country'],
      verificationLevel: 'verified',
    };
    if (!model.value.apiExplorer) delete model.value.ownerLogin;
    delete model.value.reviewers;
    for (const app of model.value.policy.applications)
      app.assertionTrust ??= { agreement: '' };
  } else {
    delete model.value.policy.identity!.application;
    model.value.ownerLogin ??= {
      issuer: '',
      clientId: '',
      clientSecret: { env: 'PROVIDER_LOGIN_SECRET' },
    };
    model.value.reviewers = [''];
    for (const app of model.value.policy.applications)
      delete app.assertionTrust;
  }
}
const requiredFields = computed({
  get: () =>
    model.value.policy.identity?.application?.requiredFields.join('\n') ?? '',
  set: (value: string) => {
    if (model.value.policy.identity?.application)
      model.value.policy.identity.application.requiredFields = value
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
  },
});
</script>
<template>
  <div class="step-heading">
    <span class="eyebrow">Connected services</span>
    <h2>Connect applications and identity</h2>
    <p>
      Your application signs users in and completes identity checks. Configure
      how this provider authenticates the application and accepts its evidence.
    </p>
  </div>
  <FormKit
    type="select"
    label="Access flow"
    :modelValue="flow"
    :options="[
      { label: 'Application-led access (standard)', value: 'application' },
      { label: 'Provider-hosted access (compatibility)', value: 'hosted' },
    ]"
    @update:modelValue="setFlow($event)"
    help="Use application-led access for new deployments. Existing hosted deployments retain their own identity and consent flow."
  />
  <div v-if="flow === 'application'" class="callout">
    <strong>Users stay in the application</strong>
    <p>
      The application attests identity and consent under the trust agreement you
      record in Policies. The provider checks the evidence and issues access
      automatically when policy passes. No provider user login or staff review
      is required.
    </p>
    <p>
      User IDs are private to each application. A different application cannot
      connect to an existing wallet by claiming the same user ID. Linking users
      across applications requires a separately verified integration.
    </p>
    <a
      :href="docs + 'application-access.html'"
      target="_blank"
      rel="noopener noreferrer"
      >Application-led access contract ↗</a
    >
    <FormKit
      type="text"
      v-model="model.policy.identity!.application!.verificationLevel"
      label="Required identity level"
      validation="required|length:1,100"
      help="Use the exact verification level agreed with your trusted applications."
    />
    <FormKit
      type="textarea"
      v-model="requiredFields"
      label="Required identity fields (one per line)"
      help="Use lowercase names. Leave empty when the policy needs no additional identity fields."
    />
    <p>
      Use lowercase field names such as country. Matching fields do not prove
      KYC by themselves: only explicitly trusted applications may attest
      completed checks.
    </p>
  </div>
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
  <h3>Access tokens for connected applications</h3>
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
      minutes. Ordinary ID tokens or vendor API keys cannot replace these. Ask
      your token-service administrator to confirm this profile before
      deployment.
    </p>
    <a
      :href="
        docs + 'operator-services.html#register-the-application-api-and-clients'
      "
      target="_blank"
      rel="noopener noreferrer"
      >Exact required token fields ↗</a
    >
  </details>
  <template v-if="flow === 'hosted'">
    <h3>Hosted verification and record evaluation</h3>
    <fieldset class="vendor-panel">
      <legend>Application records · starter evaluation</legend>
      <SetupField
        guide="applicationRecords"
        type="checkbox"
        label="Use application-supplied records for an unfunded evaluation"
        :modelValue="!!model.policy.identity?.records"
        @update:modelValue="records($event)"
      />
      <SetupField
        v-if="model.policy.identity?.records"
        guide="recordFields"
        type="textarea"
        label="Required record fields"
        v-model="recordFields"
        validation="required"
      />
    </fieldset>
    <p class="help-text">
      Start with application records to try onboarding without vendor
      credentials or verification charges. Each submitted record must contain
      your required fields. Owners consent and your staff review each record
      before account access. These records are not externally verified KYC and
      cannot enable transfers. Choose a vendor below when your policy requires
      external verification. Login proves which account signed in; identity
      verification checks who that person is. Your staff still review
      acceptance. “Verification” starts new checks; “import” reuses evidence
      shared from another service. Each route you offer needs a confirmed price
      and an application funding agreement in Policies, even when it is free.
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
      <a href="https://docs.didit.me/" target="_blank" rel="noopener noreferrer"
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
          validation="required|length:1,256" /><SecretField
          guide="sumsubToken"
          v-model="model.identity.sumsub.appToken"
          label="Sumsub app token" /><SecretField
          guide="sumsubSecret"
          v-model="model.identity.sumsub.secretKey"
          label="Sumsub secret key" />
        <p class="help-text">
          Ask Sumsub to enable Reusable KYC Share for your account and confirm
          the sharing arrangement. Selecting Sumsub here does not enable that
          product.
        </p>
        <PriceFields
          v-model="model.identity.sumsub.importPrice"
          label="Sumsub import" /><PriceFields
          v-model="model.identity.sumsub.verificationPrice"
          label="Sumsub verification"
      /></template>
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
      Choose application records or an identity vendor before exporting.
    </p>
  </template>
</template>
