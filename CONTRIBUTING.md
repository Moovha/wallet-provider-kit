# Contributing

You can help with docs, fixes, tests or signing adapters. If you're new to the
project, a small documentation improvement is a good place to start. Follow the
[code of conduct](CODE_OF_CONDUCT.md); report vulnerabilities through
[SECURITY.md](SECURITY.md).

## Propose a change

For bugs, include the version, expected behavior and an offline reproduction.
If your change affects authorization, custody, public schemas, capabilities or
dependencies, start a design discussion so we can review compatibility, security
and cost together.

Use GitHub issues for proposals and pull requests for changes. The owner's ongoing
work uses the [toolkit branch workflow](docs/branch-workflow.md). Other
contributions use separate branches and receive review before merging.
See [SECURITY.md](SECURITY.md) for private vulnerability reports.

## Development

Use the Node/npm versions in [README.md](README.md):

```sh
npm ci
npm run verify
npm run build
npm run check:package
npm audit
npm pack --dry-run
```

Write readable TypeScript with explicit validation and failure paths. Run
`npm run format`; after schema changes, run `npm run generate:spec` and review
the diff. After public API changes, run `npm run generate:docs` and review the
generated declaration/HTTP references; `verify` checks them for drift. The packaged
provider-flow example is exercised and typechecked by `npm run check:package`.
Dependency changes require exact pins, lockfile and advisory/license review.

Keep Node, its type definitions, CI and Docker on the supported Node 24 major.
Runtime migrations need a coordinated PR; Dependabot still proposes updates within
that major and image digest updates. TypeScript stays on major 5 while
`openapi-typescript` requires its compiler API: [TypeScript 7 removes that
API](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
Dependabot major updates for Node, `@types/node` and TypeScript are paused in
[its configuration](.github/dependabot.yml); revisit those rules during a reviewed
migration. Other dependency majors remain eligible for review.

For tooling updates, check the upstream migration guide, run the full toolkit
suite and inspect generated/formatting changes. Passing dependency PR CI against
an older main alone is not enough to validate pending adapter work.

Use ephemeral offline fixtures. Test supported behavior, denied effects and
uncertain outcomes without live providers, credentials, customer data or funds.
Adapters must include [conformance evidence](docs/conformance.md) and untested cases.

## Documentation and examples

Write for someone installing and integrating the wallet service. Put prerequisites,
commands, expected results and the next integration step close together. Explain
who controls the wallet and which host responsibilities an example replaces.
Keep runnable offline fixtures distinct from production configuration templates.

Keep the blockchain and DeFi context visible in plain language, with concrete
asset examples and verified capability limits. Present gas sponsorship as a
connected-application responsibility and project-supported rail; distinguish
that commitment from the provider kit's implemented signing capabilities.
Use **DeFi** for decentralised finance. When discussing source ownership, name
the repository or service explicitly; a repository name does not define the
toolkit's financial scope.

Document implemented behavior and explicit limits. Keep project assessments,
workspace handoffs and development-session logs outside this repository. Release
and deployment evidence belongs in the corresponding PR, CI artifact or operator's
records; package documentation should explain tasks and contracts.

After changing documentation, check local links and packaged examples. Public
API/schema changes require generated-reference updates and the existing checks.

### Preview and publish documentation

The documentation site uses [VitePress](https://vitepress.dev/) and the same
Markdown as GitHub and the installed package. Navigation lives in
[`docs/.vitepress/config.mts`](docs/.vitepress/config.mts); update its sidebar when
adding a guide. Keep README diagrams in Mermaid fences so GitHub and the site
both render them. Explain the same relationships in nearby prose.

```sh
npm run docs:dev
```

Open the local URL printed by VitePress. Search runs locally in the browser and
requires no external search account. To check the production build:

```sh
npm run docs:build
npm run docs:preview
```

The build rejects missing local links; CI builds the site on every PR. Check
diagram rendering, narrow-screen navigation and search in the preview after
changes to the theme. Source-code and contract links open their GitHub files.
Site tooling, cache and built HTML are excluded from the installable package.

VitePress 1.6.4 uses a scoped Vite 6.4.4 override to avoid advisories in its Vite 5
dependency. Its Vue plugin supports Vite 6. Keep that override audited and tested;
remove it when a stable VitePress release supplies a patched dependency directly.

The published documentation is at
[moovha.github.io/wallet-provider-kit](https://moovha.github.io/wallet-provider-kit/).
GitHub Pages is configured to use GitHub Actions. Toolkit documentation delivery
includes publication to this existing site under the owner's standing
authorization. After checks pass and changes reach `main` through the repository's
merge process, run **Actions → Publish documentation → Run workflow** on `main`.
Verify the workflow succeeds and the live pages contain the update before
reporting documentation delivery complete. The workflow publishes only the
documentation. It still requires dispatch after a push or PR merge; npm
publication remains disabled. See
[GitHub's Pages workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

### Documentation branding and links

The bundled Moovha symbols in `docs/public/brand/` are the existing navy artwork
used by the app and the white artwork used by the website. Keep those originals
intact. `moovha-logo.svg` places the white symbol on its navy background for the
README and favicon. The documentation theme uses the same navy (`#0f2338`) and
app cyan (`#12bfde`); its styles live in `docs/.vitepress/theme/brand.css`.
Assets are local to this repository and included with the packaged Markdown.

Conceptual diagrams live in `docs/public/diagrams/`. They use labelled nodes,
directed connections and explicit responsibility boundaries in the navy/cyan
palette. Use them where a relationship, decision or lifecycle benefits from a
visual explanation. Pair each with descriptive alternative text, a caption and
a relative full-size link so GitHub, the site and packaged docs remain usable.
Keep exact request sequences in editable Mermaid and reference tables in text.
The diagrams are generated raster artwork with a vector style, not editable SVG.
Their prompts are recorded in `docs/public/diagrams/prompts.json`; review labels,
arrows and implementation limits against the owning guide before replacing one.

Use the Moovha website for company information and this repository's GitHub links
for code, issues and contributions. Documentation links should take readers to
the relevant guide or heading. Check their anchors after renaming a section;
check logos, navigation and contrast in both themes and at phone width.

## Submit and review

Use `feat:`, `fix:`, `docs:` or `chore:` commit summaries. Include checks,
limitations and a [changelog](CHANGELOG.md) entry. Review covers correctness,
compatibility, security, licensing and cost; CI must pass. Financial/security
boundary changes require independent competent review before production release.

Contributions use Apache-2.0 and the
[Developer Certificate of Origin 1.1](https://developercertificate.org/).
Sign off every commit with `git commit -s`, only for yourself. This certifies
contribution rights, not a cryptographic signature or copyright transfer.
No separate CLA is required.
