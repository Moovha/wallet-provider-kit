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
  title: 'Wallet Provider Kit',
  description:
    'Build a wallet service with your backend and your host authority.',
  lang: 'en-GB',
  base: '/wallet-provider-kit/',
  srcDir: '..',
  srcExclude: [
    'AGENTS.md',
    'node_modules/**',
    'dist/**',
    'coverage/**',
    'artifacts/**',
  ],
  rewrites,
  themeConfig: {
    nav: [
      { text: 'Get started', link: '/docs/package' },
      { text: 'API', link: '/docs/api' },
      { text: 'GitHub', link: repository },
    ],
    search: { provider: 'local' },
    outline: [2, 3],
    editLink: { pattern: `${repository}/edit/main/:path` },
    sidebar: [
      {
        text: 'Overview',
        items: [
          { text: 'What the kit does', link: '/' },
          { text: 'Integration path', link: '/docs/' },
        ],
      },
      {
        text: 'Build your wallet service',
        items: [
          { text: '1. Install the package', link: '/docs/package' },
          {
            text: '2. Run the integration example',
            link: '/docs/integration-example',
          },
          { text: '3. Connect your backend', link: '/docs/backend-guide' },
          { text: '4. Supply host authority', link: '/docs/provider-guide' },
          { text: '5. Validate your integration', link: '/docs/conformance' },
          { text: '6. Operate the service', link: '/docs/operations' },
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
          { text: 'Bundled onboarding', link: '/docs/onboarding' },
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
      message: `<a href="${repository}/blob/main/LICENSE">Apache-2.0</a> · <a href="${repository}/blob/main/NOTICE">Attribution</a>`,
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
            source.endsWith('.md')
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
