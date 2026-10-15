import { pathToFileURL } from 'node:url';

type Request = (
  path: string,
  options?: { method: 'POST' | 'PUT'; body: unknown },
) => Promise<unknown>;

interface Branch {
  protected: boolean;
  commit: { sha: string };
}

interface PullRequest {
  number: number;
  state: string;
  draft: boolean;
  user: { login: string };
  head: { ref: string; sha: string; repo: { full_name: string } | null };
  base: { ref: string };
  mergeable: boolean | null;
  mergeable_state: string;
  requested_reviewers: unknown[];
  requested_teams: unknown[];
  labels: { name: string }[];
}

interface Review {
  user: { login: string };
  state: string;
}

const workingBranch = 'codex/toolkit';
const maintainer = 'BossBuusMuus';
const waiting = (reason: string) => ({ status: 'waiting', reason });

/** The caller supplies GitHub transport; tests never contact GitHub. */
export async function autoMerge(request: Request, repository: string) {
  if (repository.toLowerCase() !== 'moovha/wallet-provider-kit') {
    return waiting(
      'This workflow is limited to the Moovha toolkit repository.',
    );
  }
  const root = `/repos/${repository}`;
  const read = async <T>(path: string) => (await request(path)) as T;
  const pages = async <T>(path: string): Promise<T[]> => {
    const result: T[] = [];
    for (let page = 1; page <= 10; page++) {
      const separator = path.includes('?') ? '&' : '?';
      const batch = await read<T[]>(
        `${path}${separator}per_page=100&page=${page}`,
      );
      if (!Array.isArray(batch)) throw new Error('Unexpected GitHub response');
      result.push(...batch);
      if (batch.length < 100) return result;
    }
    throw new Error('GitHub pagination limit reached');
  };
  const openPulls = () => pages<PullRequest>(`${root}/pulls?state=open`);
  const isOurs = (pull: PullRequest) =>
    pull.head.repo?.full_name.toLowerCase() === repository.toLowerCase() &&
    pull.head.ref === workingBranch &&
    pull.base.ref === 'main';

  const open = await openPulls();
  const candidates = open.filter(isOurs);
  if (candidates.length !== 1)
    return waiting('Open one toolkit branch PR to main.');
  const candidate = candidates[0];
  if (open.some((pull) => pull.number !== candidate.number)) {
    return waiting('Other open pull requests need attention first.');
  }

  const pull = await read<PullRequest>(`${root}/pulls/${candidate.number}`);
  const canMerge = (value: PullRequest) =>
    isOurs(value) &&
    value.state === 'open' &&
    value.draft === false &&
    value.user.login.toLowerCase() === maintainer.toLowerCase() &&
    value.mergeable === true &&
    value.mergeable_state === 'clean' &&
    value.requested_reviewers?.length === 0 &&
    value.requested_teams?.length === 0 &&
    !value.labels.some((label) =>
      ['hold', 'manual-review'].includes(label.name.toLowerCase()),
    );
  if (!canMerge(pull)) return waiting('The toolkit PR needs checks or review.');

  const base = await read<Branch>(`${root}/branches/main`);
  const head = await read<Branch>(
    `${root}/branches/${encodeURIComponent(workingBranch)}`,
  );
  if (base.protected !== true || head.commit.sha !== pull.head.sha) {
    return waiting(
      'Protect main and verify the current working branch commit.',
    );
  }
  const comparison = await read<{ status: string; behind_by: number }>(
    `${root}/compare/${base.commit.sha}...${head.commit.sha}`,
  );
  if (comparison.status !== 'ahead' || comparison.behind_by !== 0) {
    return waiting(
      'Merge the latest main into the working branch and rerun CI.',
    );
  }

  const runs = await read<{
    total_count: number;
    workflow_runs: {
      id: number;
      head_sha: string;
      head_branch: string;
      status: string;
      conclusion: string | null;
      actor: { login: string };
    }[];
  }>(
    `${root}/actions/workflows/ci.yml/runs?event=push&head_sha=${head.commit.sha}&per_page=100`,
  );
  const latest = runs.workflow_runs.sort((a, b) => b.id - a.id)[0];
  if (
    runs.total_count > 100 ||
    !latest ||
    latest.head_sha !== head.commit.sha ||
    latest.head_branch !== workingBranch ||
    latest.actor.login.toLowerCase() !== maintainer.toLowerCase() ||
    latest.status !== 'completed' ||
    latest.conclusion !== 'success'
  ) {
    return waiting(
      'The current maintainer push must pass the verify workflow.',
    );
  }

  const checks = await read<{
    total_count: number;
    check_runs: { status: string; conclusion: string | null }[];
  }>(
    `${root}/commits/${head.commit.sha}/check-runs?filter=latest&per_page=100`,
  );
  const statuses = await read<{ total_count: number; state: string }>(
    `${root}/commits/${head.commit.sha}/status?per_page=100`,
  );
  if (
    checks.total_count < 1 ||
    checks.total_count > 100 ||
    !checks.check_runs.every(
      (check) => check.status === 'completed' && check.conclusion === 'success',
    ) ||
    statuses.total_count > 100 ||
    (statuses.total_count > 0 && statuses.state !== 'success')
  ) {
    return waiting('All checks and commit statuses must pass.');
  }

  const reviews = await pages<Review>(`${root}/pulls/${pull.number}/reviews`);
  const decisions = new Map<string, string>();
  for (const review of reviews) {
    if (review.state === 'COMMENTED') continue;
    if (
      !['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)
    ) {
      return waiting('A review is pending or has an unknown state.');
    }
    decisions.set(review.user.login.toLowerCase(), review.state);
  }
  if ([...decisions.values()].includes('CHANGES_REQUESTED')) {
    return waiting('Resolve the requested changes first.');
  }
  const [owner, name] = repository.split('/');
  const threads = (await request('/graphql', {
    method: 'POST',
    body: {
      query: `query($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) {
          pullRequest(number: $number) {
            reviewThreads(first: 100) {
              nodes { isResolved }
              pageInfo { hasNextPage }
            }
          }
        }
      }`,
      variables: { owner, name, number: pull.number },
    },
  })) as {
    errors?: unknown[];
    data?: {
      repository?: {
        pullRequest?: {
          reviewThreads: {
            nodes: { isResolved: boolean }[];
            pageInfo: { hasNextPage: boolean };
          };
        };
      };
    };
  };
  const reviewThreads = threads.data?.repository?.pullRequest?.reviewThreads;
  if (
    threads.errors?.length ||
    !reviewThreads ||
    reviewThreads.pageInfo.hasNextPage !== false ||
    !reviewThreads.nodes.every((thread) => thread.isResolved === true)
  ) {
    return waiting('Resolve all review threads before merging.');
  }

  // Re-read immediately before the write; never leave native auto-merge armed.
  const currentOpen = await openPulls();
  const current = await read<PullRequest>(`${root}/pulls/${pull.number}`);
  const currentBase = await read<Branch>(`${root}/branches/main`);
  const currentHead = await read<Branch>(
    `${root}/branches/${encodeURIComponent(workingBranch)}`,
  );
  if (
    currentOpen.length !== 1 ||
    currentOpen[0].number !== pull.number ||
    !canMerge(current) ||
    current.head.sha !== head.commit.sha ||
    currentHead.commit.sha !== head.commit.sha ||
    currentBase.protected !== true ||
    currentBase.commit.sha !== base.commit.sha
  ) {
    return waiting(
      'The contribution queue or branch state changed; check again.',
    );
  }
  const merged = (await request(`${root}/pulls/${pull.number}/merge`, {
    method: 'PUT',
    body: { sha: head.commit.sha, merge_method: 'merge' },
  })) as { merged: boolean };
  if (merged.merged !== true) return waiting('GitHub declined the merge.');

  // GITHUB_TOKEN merges don't trigger push CI, so explicitly verify the result.
  await request(`${root}/actions/workflows/ci.yml/dispatches`, {
    method: 'POST',
    body: { ref: 'main' },
  });
  return {
    status: 'merged',
    reason: 'Integrated the verified toolkit commit into main.',
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const token = process.env.GITHUB_TOKEN;
    const repository = process.env.GITHUB_REPOSITORY;
    if (!token || !repository) throw new Error('Missing GitHub configuration');
    const request: Request = async (path, options) => {
      const response = await fetch(`https://api.github.com${path}`, {
        method: options?.method ?? 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
          'x-github-api-version': '2026-03-10',
        },
        body: options ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('GitHub request failed');
      return response.status === 204 ? null : response.json();
    };
    console.log(JSON.stringify(await autoMerge(request, repository)));
  } catch {
    console.error(
      'Toolkit merge stopped; inspect repository checks and settings.',
    );
    process.exitCode = 1;
  }
}
