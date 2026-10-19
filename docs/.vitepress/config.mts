import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';

const root = fileURLToPath(new URL('../../', import.meta.url));
const repository = 'https://github.com/Moovha/wallet-provider-kit';
const rewrites: Record<string, string> = {
  'README.md': 'index.md',
  'docs/README.md': 'docs/index.md',
  'examples/README.md': 'examples/index.md',
  'examples/provider-flow/README.md': 'examples/provider-flow/index.md',
};

export default defineConfig({
  title: 'Moovha Wallet Provider Kit',
  description:
    'Build a blockchain wallet service for on-chain assets, with user-approved application access and application-sponsored gas.',
  lang: 'en-GB',
  base: '/wallet-provider-kit/',
  head: [
    [
      'link',
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/wallet-provider-kit/brand/moovha-logo.svg',
      },
    ],
    ['meta', { name: 'theme-color', content: '#0f2338' }],
    [
      'meta',
      { property: 'og:site_name', content: 'Moovha Wallet Provider Kit' },
    ],
  ],
  srcDir: '..',
  srcExclude: [
    'AGENTS.md',
    'node_modules/**',
    'dist/**',
    'coverage/**',
    'artifacts/**',
  ],
  rewrites,
  vite: { publicDir: resolve(root, 'docs/public') },
  themeConfig: {
    siteTitle: 'Wallet Provider Kit',
    logo: {
      light: '/brand/moovha-mark-navy.png',
      dark: '/brand/moovha-mark-white.png',
      alt: 'Moovha',
    },
    nav: [
      {
        text: 'Get started',
        items: [
          { text: 'Open the setup wizard', link: '/docs/' },
          { text: 'Bundled setup defaults', link: '/docs/bundled-setup' },
          { text: '1. Provider', link: '/docs/setup-wizard#_1-provider' },
          { text: '2. Backend', link: '/docs/setup-wizard#_2-backend' },
          { text: '3. Services', link: '/docs/setup-wizard#_3-services' },
          { text: '4. Applications', link: '/docs/setup-wizard#_4-applications' },
          { text: '5. Deployment', link: '/docs/setup-wizard#_5-deployment' },
          { text: '6. Export', link: '/docs/setup-wizard#_6-export' },
        ],
      },
      {
        text: 'API',
        items: [
          { text: 'Application HTTP guide', link: '/docs/http-api' },
          { text: 'Provider HTTP schemas', link: '/docs/http-reference' },
          {
            text: 'Executor HTTP schemas',
            link: '/docs/executor-http-reference',
          },
          { text: 'Configuration reference', link: '/docs/setup' },
          { text: 'TypeScript integration guide', link: '/docs/api' },
          { text: 'TypeScript declarations', link: '/docs/api-reference' },
        ],
      },
      { text: 'Moovha', link: 'https://moovha.com/' },
    ],
    socialLinks: [
      {
        icon: 'github',
        link: repository,
        ariaLabel: 'Wallet Provider Kit on GitHub',
      },
    ],
    search: { provider: 'local' },
    outline: [2, 3],
    editLink: { pattern: `${repository}/edit/main/:path` },
    sidebar: [
      {
        text: 'Start here',
        items: [
          { text: 'What the kit does', link: '/' },
          { text: 'Open the setup wizard', link: '/docs/' },
          { text: 'Bundled setup defaults', link: '/docs/bundled-setup' },
          { text: 'Roles and terms', link: '/docs/concepts' },
        ],
      },
      {
        text: 'Operator setup',
        items: [
          {
            text: '1. Provider',
            link: '/docs/setup-wizard#_1-provider',
            collapsed: true,
            items: [
              {
                text: 'Domain and privacy notice',
                link: '/docs/operator-services#provider-domain-and-privacy-notice',
              },
              {
                text: 'Wallet control and responsibilities',
                link: '/docs/architecture',
              },
              { text: 'Security boundaries', link: '/docs/security-model' },
            ],
          },
          {
            text: '2. Backend',
            link: '/docs/setup-wizard#_2-backend',
            collapsed: true,
            items: [
              {
                text: 'Choose and prepare a backend',
                link: '/docs/operator-services#choose-one-wallet-backend',
              },
              {
                text: 'Coinbase CDP profile',
                link: '/docs/provider-guide#current-adapter-profile',
              },
              { text: 'Open Wallet Standard', link: '/docs/ows-adapter' },
              {
                text: 'OpenZeppelin Relayer',
                link: '/docs/openzeppelin-relayer',
              },
            ],
          },
          {
            text: '3. Services',
            link: '/docs/setup-wizard#_3-services',
            collapsed: true,
            items: [
              {
                text: 'Application API tokens',
                link: '/docs/operator-services#register-the-application-api-and-clients',
              },
              { text: 'Auth0 registration recipe', link: '/docs/auth0-setup' },
              {
                text: 'Secret names and values',
                link: '/docs/operator-services#put-references-in-the-wizard-values-in-the-deployment',
              },
            ],
          },
          {
            text: '4. Applications',
            link: '/docs/setup-wizard#_4-applications',
            collapsed: true,
            items: [
              {
                text: 'Application trust and access',
                link: '/docs/application-access',
              },
              {
                text: 'Transfer signing terms',
                link: '/docs/setup#supported-financial-policy',
              },
              {
                text: 'Application management APIs',
                link: '/docs/runtime-workspace',
              },
              {
                text: 'Application obligations API',
                link: '/docs/application-obligations',
              },
              {
                text: 'Runtime policy API',
                link: '/docs/runtime-configuration',
              },
            ],
          },
          {
            text: '5. Deployment',
            link: '/docs/setup-wizard#_5-deployment',
            collapsed: true,
            items: [
              { text: 'Storage and recovery', link: '/docs/storage' },
              {
                text: 'Staff application token controls',
                link: '/docs/operator-tokens',
              },
              { text: 'Assets and gas funding', link: '/docs/assets-and-gas' },
              { text: 'Transfer execution', link: '/docs/execution' },
              {
                text: 'Designated execution service',
                link: '/docs/execution-service',
              },
              {
                text: 'Call policies and adapters',
                link: '/docs/approved-contract-calls',
              },
              {
                text: 'Automatic Safe provisioning',
                link: '/docs/safe-provisioning',
              },
              {
                text: 'Safe queues and sponsor pools',
                link: '/docs/safe-queue-and-sponsor-pools',
              },
              {
                text: 'Stuck transaction recovery',
                link: '/docs/stuck-transactions-and-recovery',
              },
              {
                text: 'Bounded fee replacements',
                link: '/docs/automatic-replacements',
              },
              {
                text: 'Fee-only Relayer build',
                link: '/docs/fee-only-relayer',
              },
              {
                text: 'Payer events and health',
                link: '/docs/payer-events-and-health',
              },
              { text: 'Standard wallet calls', link: '/docs/wallet-calls' },
              {
                text: 'Account abstraction helpers',
                link: '/docs/account-abstraction-sponsorship',
              },
            ],
          },
          {
            text: '6. Export',
            link: '/docs/setup-wizard#_6-export',
            collapsed: true,
            items: [
              { text: 'Local Base preview', link: '/docs/local-preview' },
              { text: 'Run locally with progress', link: '/docs/local-setup' },
              {
                text: 'Manual deployment and maintenance',
                link: '/docs/operator-deployment',
              },
              {
                text: 'Staging acceptance walkthrough',
                link: '/docs/staging-walkthrough',
              },
              { text: 'Acceptance checklist', link: '/docs/conformance' },
              { text: 'Monitoring and operations', link: '/docs/operations' },
            ],
          },
        ],
      },
      {
        text: 'API and configuration reference',
        collapsed: true,
        items: [
          { text: 'HTTP integration guide', link: '/docs/http-api' },
          { text: 'HTTP schemas', link: '/docs/http-reference' },
          {
            text: 'Executor HTTP schemas',
            link: '/docs/executor-http-reference',
          },
          { text: 'Exported configuration', link: '/docs/setup' },
          { text: 'TypeScript API guide', link: '/docs/api' },
          { text: 'TypeScript declarations', link: '/docs/api-reference' },
        ],
      },
      {
        text: 'Custom integrations and compatibility',
        collapsed: true,
        items: [
          { text: 'Custom adapters', link: '/docs/custom-adapters' },
          { text: 'Package and imports', link: '/docs/package' },
          {
            text: 'Offline integration tutorial',
            link: '/docs/integration-example',
          },
          { text: 'Backend integration', link: '/docs/backend-guide' },
          { text: 'Embedded host authority', link: '/docs/provider-guide' },
          { text: 'Stored-action backend', link: '/docs/stored-backend' },
          {
            text: 'Durable attempt interfaces',
            link: '/docs/durable-attempts',
          },
          { text: 'Hosted compatibility access', link: '/docs/onboarding' },
          {
            text: 'Hosted record evaluation',
            link: '/docs/application-records',
          },
          { text: 'OIDC enrollment', link: '/docs/enrollment' },
          { text: 'Standards and support limits', link: '/docs/v1-standards' },
          { text: 'Examples and fixtures', link: '/examples/' },
          {
            text: 'Provider flow source guide',
            link: '/examples/provider-flow/',
          },
        ],
      },
      {
        text: 'Contribute',
        collapsed: true,
        items: [
          { text: 'Contributor guide', link: '/CONTRIBUTING' },
          { text: 'Public writing guide', link: '/docs/public-writing' },
          { text: 'Report a vulnerability', link: '/SECURITY' },
          { text: 'Governance', link: '/GOVERNANCE' },
          { text: 'Code of conduct', link: '/CODE_OF_CONDUCT' },
          { text: 'Branch workflow', link: '/docs/branch-workflow' },
          { text: 'Release process', link: '/docs/releases' },
          { text: 'Changelog', link: '/CHANGELOG' },
        ],
      },
    ],
    footer: {
      message: `<a href="https://moovha.com/">Moovha</a> · <a href="${repository}/issues">Issues and integration questions</a> · <a href="${repository}/blob/main/LICENSE">Apache-2.0</a> · <a href="${repository}/blob/main/NOTICE">Attribution</a>`,
    },
  },
  markdown: {
    config(md) {
      const link = md.renderer.rules.link_open!;
      md.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
        const token = tokens[index];
        const href = token.attrGet('href');
        if (href && !/^(?:[a-z]+:|\/\/|#)/i.test(href)) {
          const [pathname, fragment] = href.split('#', 2);
          const file = resolve(
            dirname(env.realPath ?? env.path),
            decodeURI(pathname),
          );
          const source = relative(root, file).replaceAll('\\', '/');
          if (source.startsWith('../') || !existsSync(file)) {
            throw new Error(
              `Broken documentation link in ${env.relativePath}: ${href}`,
            );
          }
          const suffix = fragment ? `#${fragment}` : '';
          token.attrSet(
            'href',
            source.startsWith('docs/public/')
              ? `/${source.slice('docs/public/'.length)}${suffix}`
              : source.endsWith('.md')
                ? `/${rewrites[source] ?? source}${suffix}`
                : `${repository}/blob/main/${source}${suffix}`,
          );
        }
        return link(tokens, index, options, env, renderer);
      };
      const fence = md.renderer.rules.fence!;
      md.renderer.rules.fence = (tokens, index, options, env, renderer) => {
        const token = tokens[index];
        if (token.info.trim() === 'mermaid') {
          const encoded = Buffer.from(token.content).toString('base64');
          return `<WalletDiagram encoded="${encoded}" />\n`;
        }
        return fence(tokens, index, options, env, renderer);
      };
    },
  },
});
