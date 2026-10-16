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
          { text: 'Operator getting started', link: '/docs/' },
          { text: 'Services and credentials', link: '/docs/operator-services' },
          { text: 'Application-led access', link: '/docs/application-access' },
          { text: 'Auth0 dashboard setup', link: '/docs/auth0-setup' },
          { text: 'Operator setup wizard', link: '/docs/setup-wizard' },
          { text: 'Deploy the export', link: '/docs/operator-deployment' },
          { text: 'GUI application tokens', link: '/docs/operator-tokens' },
          { text: 'Understand the roles', link: '/docs/concepts' },
          {
            text: 'Install the package',
            link: '/docs/package#build-an-installable-tarball',
          },
          {
            text: 'Run the offline tutorial',
            link: '/docs/integration-example#_1-install-and-run',
          },
          {
            text: 'Connect your backend',
            link: '/docs/backend-guide#choose-an-integration',
          },
        ],
      },
      {
        text: 'API',
        items: [
          {
            text: 'Choose an integration profile',
            link: '/docs/api#choose-a-profile',
          },
          {
            text: 'Core wallet service',
            link: '/docs/api#core-wallet-service',
          },
          { text: 'TypeScript declarations', link: '/docs/api-reference' },
          {
            text: 'HTTP authentication',
            link: '/docs/http-api#authentication-and-profiles',
          },
          { text: 'HTTP schemas', link: '/docs/http-reference' },
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
        text: 'Overview',
        items: [
          { text: 'What the kit does', link: '/' },
          { text: 'Roles and terms', link: '/docs/concepts' },
          { text: 'Assets and gas sponsorship', link: '/docs/assets-and-gas' },
          { text: 'Getting started', link: '/docs/' },
        ],
      },
      {
        text: 'Operator setup',
        items: [
          { text: '1. Get started', link: '/docs/' },
          {
            text: '2. Services and credentials',
            link: '/docs/operator-services',
          },
          { text: 'Application-led access', link: '/docs/application-access' },
          { text: 'Auth0 dashboard setup', link: '/docs/auth0-setup' },
          { text: '3. FormKit wizard', link: '/docs/setup-wizard' },
          { text: '4. Deploy and activate', link: '/docs/operator-deployment' },
          { text: '5. Staging walkthrough', link: '/docs/staging-walkthrough' },
          {
            text: 'Application-record evaluation',
            link: '/docs/application-records',
          },
          { text: 'Get and renew API tokens', link: '/docs/operator-tokens' },
          { text: 'Configuration reference', link: '/docs/setup' },
          { text: 'Built-in SQLite storage', link: '/docs/storage' },
          { text: 'Acceptance checklist', link: '/docs/conformance' },
          { text: 'Operations reference', link: '/docs/operations' },
        ],
      },
      {
        text: 'Advanced development',
        collapsed: true,
        items: [
          { text: 'Custom adapters', link: '/docs/custom-adapters' },
          { text: 'Package and imports', link: '/docs/package' },
          {
            text: 'Offline integration example',
            link: '/docs/integration-example',
          },
          { text: 'Backend integration', link: '/docs/backend-guide' },
          { text: 'Embedded host authority', link: '/docs/provider-guide' },
        ],
      },
      {
        text: 'API reference',
        collapsed: true,
        items: [
          { text: 'API guide', link: '/docs/api' },
          { text: 'TypeScript declarations', link: '/docs/api-reference' },
          { text: 'HTTP guide', link: '/docs/http-api' },
          { text: 'HTTP schemas', link: '/docs/http-reference' },
        ],
      },
      {
        text: 'Backend and access profiles',
        collapsed: true,
        items: [
          { text: 'Stored-action backend', link: '/docs/stored-backend' },
          { text: 'Coinbase CDP', link: '/docs/backend-guide#coinbase-cdp' },
          { text: 'Open Wallet Standard', link: '/docs/ows-adapter' },
          { text: 'OpenZeppelin Relayer', link: '/docs/openzeppelin-relayer' },
          { text: 'Hosted compatibility access', link: '/docs/onboarding' },
          { text: 'OIDC enrollment', link: '/docs/enrollment' },
        ],
      },
      {
        text: 'Understand the boundaries',
        collapsed: true,
        items: [
          {
            text: 'Architecture and wallet control',
            link: '/docs/architecture',
          },
          { text: 'Security model', link: '/docs/security-model' },
          {
            text: 'Durable attempts and recovery',
            link: '/docs/durable-attempts',
          },
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
