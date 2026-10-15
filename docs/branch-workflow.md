# Work on the toolkit branch

The repository is public at
[Moovha/wallet-provider-kit](https://github.com/Moovha/wallet-provider-kit).
Use `codex/toolkit` for ongoing work by
[BossBuusMuus](https://github.com/BossBuusMuus). `main` holds integrated changes.
Other contributors use their own branches and pull requests.

## Make a change

Start with a clean working tree, then bring in the latest main:

```sh
git switch codex/toolkit
git fetch origin
git merge origin/main
```

Make and verify your change, commit with a DCO sign-off, then push:

```sh
git push origin codex/toolkit
```

Open or update a PR from `codex/toolkit` to `main`. Don't force-push or delete this
long-lived branch after merging. The [contribution guide](../CONTRIBUTING.md)
lists the checks to run before pushing.

## When the branch merges

The **Merge toolkit branch** workflow checks the PR after CI and review events.
It also rechecks every fifteen minutes, including after review-thread resolution.
It integrates only the maintainer's PR from this repository's `codex/toolkit`
branch, and only when:

- No other PR is open, including drafts and dependency updates.
- The PR is ready, has no requested reviewers/teams, requested changes or
  unresolved review threads, and has neither `hold` nor `manual-review` labels.
- The latest maintainer push passed `verify`; all commit checks/statuses pass.
- The branch includes the current main, and both commits still match the checks.

Any missing evidence or API failure stops the merge. Review other contributions
first; this workflow never merges them. You can pause your own PR by making it a
draft or adding `hold` / `manual-review`. To disable the workflow, set the repository
Actions variable `TOOLKIT_AUTO_MERGE` to `false` or remove it. Set it to `true` to
enable it. You can also rerun it through **Actions → Merge toolkit branch → Run workflow**.

The first installation must reach main before GitHub can run this trusted-main
workflow. Its initial PR follows the same contribution, review and CI gates;
pending contributions are not bypassed to bootstrap automation.

## Protected main

The workflow requires protected main, a pull request and strict up-to-date
`verify` checks. Force pushes and branch deletion are disabled, administrator
bypass is disabled, and review conversations must be resolved. The workflow uses
GitHub's normal PR merge API with the verified head SHA; it never pushes directly
to main or overrides branch protection. Original commits and sign-offs are
preserved by a merge commit.

Native GitHub auto-merge stays disabled: it doesn't check for other open PRs.
The Actions workflow makes that decision immediately before requesting a merge.

Only trusted main code runs in the merge job. It doesn't execute PR code or load
PR artifacts/caches. The job uses GitHub's short-lived token and dispatches main
verification explicitly after merging, because token-driven writes don't trigger
push CI automatically. It doesn't deploy or publish a package.

The open-PR list is checked again immediately before merging. A new PR can still
arrive between that check and the write: GitHub has no atomic repository-wide
queue condition. API checks are a practical coordination gate, not an exclusive lock.

References: [GitHub auto-merge availability](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/automatically-merging-a-pull-request),
[PR merge API](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request),
[workflow token triggers](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow).
