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
      { text: 'Get started', link: '/docs/' },
      { text: 'HTTP API', link: '/docs/http-api' },
      { text: 'GitHub', link: repository },
    ],
    search: { provider: 'local' },
    outline: [2, 3],
    sidebar: [
      {
        text: 'Safe service',
        items: [
          { text: 'Setup', link: '/docs/setup' },
          { text: 'Wizard', link: '/docs/setup-wizard' },
          { text: 'Architecture', link: '/docs/architecture' },
          { text: 'Wallet calls', link: '/docs/wallet-calls' },
          { text: 'Sponsorship', link: '/docs/self-hosted-sponsorship' },
          { text: 'Execution latency', link: '/docs/execution-latency' },
          { text: 'HTTP API', link: '/docs/http-api' },
          { text: 'HTTP schemas', link: '/docs/http-reference' },
          { text: 'TypeScript API', link: '/docs/api-reference' },
          { text: 'Storage', link: '/docs/storage' },
          { text: 'Deployment acceptance', link: '/docs/conformance' },
          { text: 'Contribute', link: '/CONTRIBUTING' },
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
