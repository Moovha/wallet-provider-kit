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
    'internal-testing/**',
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
      { text: 'Get started', link: '/docs/' },
      { text: 'Applications', link: '/docs/runtime-workspace' },
      { text: 'Operations', link: '/docs/operations' },
      { text: 'API reference', link: '/docs/http-api' },
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
          {
            text: 'Welcome',
            link: '/docs/',
          },
          {
            text: 'What the kit does',
            link: '/',
          },
          {
            text: 'People and services',
            link: '/docs/concepts',
          },
        ],
      },
      {
        text: 'Install your service',
        items: [
          {
            text: 'Choose, install and sign in',
            link: '/docs/provider-installation',
          },
          {
            text: 'Run from source',
            link: '/docs/local-setup',
          },
        ],
      },
      {
        text: 'Connect an application',
        items: [
          {
            text: 'Add your first application',
            link: '/docs/runtime-workspace',
          },
          { text: 'Create a first wallet', link: '/docs/create-wallet' },
          { text: 'Use an existing wallet', link: '/docs/connect-wallet' },
          {
            text: 'Personal and shared wallets',
            link: '/docs/multiple-wallets',
          },
          { text: 'Send a small transfer', link: '/docs/send-transfer' },
          {
            text: 'User checks and permission',
            link: '/docs/application-access',
          },
          {
            text: 'Transactions and fee limits',
            link: '/docs/application-obligations',
          },
          {
            text: 'Application rules',
            link: '/docs/runtime-configuration',
          },
          {
            text: 'Service connections',
            link: '/docs/operator-services',
          },
          {
            text: 'Paying network fees',
            link: '/docs/assets-and-gas',
          },
          {
            text: 'Test the connection',
            link: '/docs/staging-walkthrough',
          },
          {
            text: 'Before welcoming users',
            link: '/docs/conformance',
          },
        ],
      },
      {
        text: 'Run your service',
        collapsed: true,
        items: [
          {
            text: 'Monitoring',
            link: '/docs/operations',
          },
          {
            text: 'Backups and maintenance',
            link: '/docs/provider-maintenance',
          },
          {
            text: 'Lost-response recovery',
            link: '/docs/durable-attempts',
          },
          {
            text: 'Provider responsibilities',
            link: '/docs/provider-guide',
          },
          {
            text: 'Security boundaries',
            link: '/docs/security-model',
          },
          {
            text: 'Deposits on another chain',
            link: '/docs/safe-cross-chain-recovery',
          },
        ],
      },
      {
        text: 'Developer references',
        collapsed: true,
        items: [
          { text: 'Find an API request', link: '/docs/api-endpoints' },
          {
            text: 'Application API guide',
            link: '/docs/http-api',
          },
          {
            text: 'HTTP schemas',
            link: '/docs/http-reference',
          },
          {
            text: 'Send and track transactions',
            link: '/docs/wallet-calls',
          },
          {
            text: 'Exact call restrictions',
            link: '/docs/approved-contract-calls',
          },
          {
            text: 'Architecture',
            link: '/docs/architecture',
          },
          {
            text: 'Transaction execution',
            link: '/docs/user-operation-execution',
          },
          {
            text: 'Signature boundaries',
            link: '/docs/durable-safe-op-signing',
          },
          {
            text: 'Fee-paying infrastructure',
            link: '/docs/self-hosted-sponsorship',
          },
          {
            text: 'Sponsorship contract',
            link: '/docs/account-abstraction-sponsorship',
          },
          {
            text: 'Signing-key storage',
            link: '/docs/ows-adapter',
          },
          {
            text: 'Persistent records',
            link: '/docs/storage',
          },
          {
            text: 'TypeScript integration',
            link: '/docs/api',
          },
          {
            text: 'Package imports',
            link: '/docs/package',
          },
          {
            text: 'TypeScript declarations',
            link: '/docs/api-reference',
          },
          {
            text: 'Examples and fixtures',
            link: '/examples/',
          },
        ],
      },
      {
        text: 'Optional integrations',
        collapsed: true,
        items: [
          {
            text: 'Configuration reference',
            link: '/docs/setup',
          },
          {
            text: 'Deploy a static configuration',
            link: '/docs/operator-deployment',
          },
          {
            text: 'External tokens with Auth0',
            link: '/docs/auth0-setup',
          },
          {
            text: 'Staff API token controls',
            link: '/docs/operator-tokens',
          },
          {
            text: 'Provider-hosted access',
            link: '/docs/onboarding',
          },
          {
            text: 'Custom OIDC enrollment',
            link: '/docs/enrollment',
          },
        ],
      },
      {
        text: 'Maintain the project',
        collapsed: true,
        items: [
          {
            text: 'Contributor guide',
            link: '/CONTRIBUTING',
          },
          {
            text: 'Writing for readers',
            link: '/docs/public-writing',
          },
          {
            text: 'Installation design rationale',
            link: '/docs/provider-installation-design',
          },
          {
            text: 'Branch workflow',
            link: '/docs/branch-workflow',
          },
          {
            text: 'Release process',
            link: '/docs/releases',
          },
          {
            text: 'Report a vulnerability',
            link: '/SECURITY',
          },
          {
            text: 'Governance',
            link: '/GOVERNANCE',
          },
          {
            text: 'Code of conduct',
            link: '/CODE_OF_CONDUCT',
          },
          {
            text: 'Changelog',
            link: '/CHANGELOG',
          },
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
