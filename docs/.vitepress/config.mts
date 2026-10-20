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
    '**/AGENTS.md',
    '**/agents.md',
    '**/CLAUDE.md',
    '**/.codex/**',
    '**/.claude/**',
    '**/.idea/**',
    '**/.vscode/**',
    '.local/**',
    'scratch/**',
    'node_modules/**',
    'dist/**',
    'coverage/**',
    'artifacts/**',
    'local-adapters/**',
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
          { text: 'Safe wallets', link: '/docs/self-hosted-sponsorship' },
          { text: 'Service setup', link: '/docs/setup' },
          {
            text: 'Install and administer',
            link: '/docs/provider-installation',
          },
          { text: 'Back up and maintain', link: '/docs/provider-maintenance' },
          { text: 'Advanced configuration', link: '/docs/setup-wizard' },
        ],
      },
      {
        text: 'API',
        items: [
          { text: 'Application HTTP guide', link: '/docs/http-api' },
          { text: 'Provider HTTP schemas', link: '/docs/http-reference' },
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
          { text: 'Safe wallets', link: '/docs/self-hosted-sponsorship' },
          { text: 'Service setup', link: '/docs/setup' },
          { text: 'Roles and terms', link: '/docs/concepts' },
        ],
      },
      {
        text: 'Install and administer',
        items: [
          {
            text: '1. Choose destination',
            link: '/docs/provider-installation#choose-a-destination',
          },
          {
            text: '2. Review and install',
            link: '/docs/provider-installation#install-a-release-bundle',
          },
          {
            text: '3. Open administration',
            link: '/docs/provider-installation#claim-administrator-access',
          },
          {
            text: 'Connect applications',
            link: '/docs/provider-installation#connect-an-application-after-installation',
          },
          {
            text: 'Automate administration',
            link: '/docs/provider-installation#automate-provider-administration',
          },
          { text: 'Back up and maintain', link: '/docs/provider-maintenance' },
          {
            text: 'Design and acceptance record',
            link: '/docs/provider-installation-design',
          },
        ],
      },
      {
        text: 'Advanced configuration',
        collapsed: true,
        items: [
          {
            text: '1. Provider',
            link: '/docs/setup-wizard#_1-provider',
            collapsed: true,
            items: [
              {
                text: 'Domain and privacy notice',
                link: '/docs/operator-services',
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
                text: 'Prepare the OWS vault',
                link: '/docs/ows-adapter',
              },
              { text: 'Open Wallet Standard', link: '/docs/ows-adapter' },
            ],
          },
          {
            text: '3. Services',
            link: '/docs/setup-wizard#_3-services',
            collapsed: true,
            items: [
              {
                text: 'Application API tokens',
                link: '/docs/operator-services',
              },
              { text: 'Auth0 registration recipe', link: '/docs/auth0-setup' },
              {
                text: 'Secret names and values',
                link: '/docs/operator-services',
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
                text: 'Safe call policy',
                link: '/docs/approved-contract-calls',
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
              {
                text: 'Call policies and adapters',
                link: '/docs/approved-contract-calls',
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
          { text: 'Exported configuration', link: '/docs/setup' },
          { text: 'TypeScript API guide', link: '/docs/api' },
          { text: 'TypeScript declarations', link: '/docs/api-reference' },
        ],
      },
      {
        text: 'Integration interfaces',
        collapsed: true,
        items: [
          { text: 'Package and imports', link: '/docs/package' },
          { text: 'Embedded host authority', link: '/docs/provider-guide' },
          {
            text: 'Durable attempt interfaces',
            link: '/docs/durable-attempts',
          },
          { text: 'OIDC enrollment', link: '/docs/enrollment' },
          { text: 'Examples and fixtures', link: '/examples/' },
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
