import { expect, it } from 'vitest';
import { autoMerge } from '../scripts/auto-merge.js';

const repository = 'Moovha/wallet-provider-kit';
const root = `/repos/${repository}`;
const headSha = 'a'.repeat(40);
const baseSha = 'b'.repeat(40);

function fixture() {
  const pull = {
    number: 1,
    state: 'open',
    draft: false,
    user: { login: 'BossBuusMuus' },
    head: {
      ref: 'codex/toolkit',
      sha: headSha,
      repo: { full_name: repository },
    },
    base: { ref: 'main' },
    mergeable: true as boolean | null,
    mergeable_state: 'clean',
    requested_reviewers: [] as unknown[],
    requested_teams: [] as unknown[],
    labels: [] as { name: string }[],
  };
  const state = {
    pull,
    open: [pull],
    base: { protected: true, commit: { sha: baseSha } },
    head: { protected: false, commit: { sha: headSha } },
    comparison: { status: 'ahead', behind_by: 0 },
    runs: {
      total_count: 1,
      workflow_runs: [
        {
          id: 1,
          head_sha: headSha,
          head_branch: 'codex/toolkit',
          status: 'completed',
          conclusion: 'success' as string | null,
          actor: { login: 'BossBuusMuus' },
        },
      ],
    },
    checks: {
      total_count: 1,
      check_runs: [
        { status: 'completed', conclusion: 'success' as string | null },
      ],
    },
    statuses: { total_count: 0, state: 'pending' },
    reviews: [] as { user: { login: string }; state: string }[],
    threads: {
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [] as { isResolved: boolean }[],
              pageInfo: { hasNextPage: false },
            },
          },
        },
      },
    },
  };
  const calls: { path: string; method: string; body?: unknown }[] = [];
  let openReads = 0;
  let beforeFinalRead = () => {};
  const request = async (
    path: string,
    options?: { method: 'POST' | 'PUT'; body: unknown },
  ) => {
    calls.push({ path, method: options?.method ?? 'GET', body: options?.body });
    if (path.startsWith(`${root}/pulls?state=open`)) {
      const page = Number(
        new URL(`https://example.test${path}`).searchParams.get('page'),
      );
      if (page === 1 && ++openReads === 2) beforeFinalRead();
      return structuredClone(state.open.slice((page - 1) * 100, page * 100));
    }
    if (path === `${root}/pulls/1`) return structuredClone(state.pull);
    if (path === `${root}/branches/main`) return structuredClone(state.base);
    if (path === `${root}/branches/codex%2Ftoolkit`)
      return structuredClone(state.head);
    if (path.startsWith(`${root}/compare/`)) return state.comparison;
    if (path.startsWith(`${root}/actions/workflows/ci.yml/runs?`))
      return state.runs;
    if (path.includes('/check-runs?')) return state.checks;
    if (path.includes('/status?')) return state.statuses;
    if (path.includes('/reviews?')) return state.reviews;
    if (path === '/graphql') return state.threads;
    if (path === `${root}/pulls/1/merge`) return { merged: true };
    if (path.endsWith('/dispatches')) return null;
    throw new Error('Unexpected offline request');
  };
  return {
    state,
    calls,
    request,
    writes: () =>
      calls.filter(
        (call) => call.method === 'PUT' || call.path.endsWith('/dispatches'),
      ),
    beforeFinalRead: (callback: () => void) => {
      beforeFinalRead = callback;
    },
  };
}

it('merges the verified head through protected main and dispatches main CI', async () => {
  const f = fixture();
  expect((await autoMerge(f.request, repository)).status).toBe('merged');
  expect(f.writes()).toEqual([
    {
      path: `${root}/pulls/1/merge`,
      method: 'PUT',
      body: { sha: headSha, merge_method: 'merge' },
    },
    {
      path: `${root}/actions/workflows/ci.yml/dispatches`,
      method: 'POST',
      body: { ref: 'main' },
    },
  ]);
});

it.each([
  [
    'unprotected main',
    (f: ReturnType<typeof fixture>) => {
      f.state.base.protected = false;
    },
  ],
  [
    'another contribution',
    (f: ReturnType<typeof fixture>) => {
      f.state.open.push({ ...f.state.pull, number: 2, draft: true });
    },
  ],
  [
    'fork with the same branch name',
    (f: ReturnType<typeof fixture>) => {
      f.state.pull.head.repo.full_name = 'someone/wallet-provider-kit';
    },
  ],
  [
    'another PR author',
    (f: ReturnType<typeof fixture>) => {
      f.state.pull.user.login = 'someone';
    },
  ],
  [
    'draft PR',
    (f: ReturnType<typeof fixture>) => {
      f.state.pull.draft = true;
    },
  ],
  [
    'unknown mergeability',
    (f: ReturnType<typeof fixture>) => {
      f.state.pull.mergeable = null;
    },
  ],
  [
    'required review',
    (f: ReturnType<typeof fixture>) => {
      f.state.pull.mergeable_state = 'blocked';
    },
  ],
  [
    'requested reviewer',
    (f: ReturnType<typeof fixture>) => {
      f.state.pull.requested_reviewers.push({});
    },
  ],
  [
    'requested team',
    (f: ReturnType<typeof fixture>) => {
      f.state.pull.requested_teams.push({});
    },
  ],
  [
    'manual review label',
    (f: ReturnType<typeof fixture>) => {
      f.state.pull.labels.push({ name: 'manual-review' });
    },
  ],
  [
    'hold label',
    (f: ReturnType<typeof fixture>) => {
      f.state.pull.labels.push({ name: 'hold' });
    },
  ],
  [
    'outdated branch',
    (f: ReturnType<typeof fixture>) => {
      f.state.comparison.behind_by = 1;
    },
  ],
  [
    'no CI evidence',
    (f: ReturnType<typeof fixture>) => {
      f.state.runs.workflow_runs = [];
    },
  ],
  [
    'failed CI',
    (f: ReturnType<typeof fixture>) => {
      f.state.runs.workflow_runs[0].conclusion = 'failure';
    },
  ],
  [
    'pending CI',
    (f: ReturnType<typeof fixture>) => {
      f.state.runs.workflow_runs[0].status = 'in_progress';
    },
  ],
  [
    'CI for an old commit',
    (f: ReturnType<typeof fixture>) => {
      f.state.runs.workflow_runs[0].head_sha = baseSha;
    },
  ],
  [
    'another push actor',
    (f: ReturnType<typeof fixture>) => {
      f.state.runs.workflow_runs[0].actor.login = 'someone';
    },
  ],
  [
    'pending check',
    (f: ReturnType<typeof fixture>) => {
      f.state.checks.check_runs[0].status = 'queued';
    },
  ],
  [
    'failed check',
    (f: ReturnType<typeof fixture>) => {
      f.state.checks.check_runs[0].conclusion = 'failure';
    },
  ],
  [
    'failed commit status',
    (f: ReturnType<typeof fixture>) => {
      f.state.statuses = { total_count: 1, state: 'failure' };
    },
  ],
  [
    'requested changes',
    (f: ReturnType<typeof fixture>) => {
      f.state.reviews = [
        { user: { login: 'reviewer' }, state: 'CHANGES_REQUESTED' },
        { user: { login: 'reviewer' }, state: 'COMMENTED' },
      ];
    },
  ],
  [
    'pending review',
    (f: ReturnType<typeof fixture>) => {
      f.state.reviews.push({ user: { login: 'reviewer' }, state: 'PENDING' });
    },
  ],
  [
    'unresolved thread',
    (f: ReturnType<typeof fixture>) => {
      f.state.threads.data.repository.pullRequest.reviewThreads.nodes.push({
        isResolved: false,
      });
    },
  ],
  [
    'unread threads',
    (f: ReturnType<typeof fixture>) => {
      f.state.threads.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage = true;
    },
  ],
])('does not write when there is %s', async (_name, change) => {
  const f = fixture();
  change(f);
  expect((await autoMerge(f.request, repository)).status).toBe('waiting');
  expect(f.writes()).toEqual([]);
});

it.each(['APPROVED', 'DISMISSED'])(
  'accepts changes addressed by a later %s review',
  async (state) => {
    const f = fixture();
    f.state.reviews = [
      { user: { login: 'reviewer' }, state: 'CHANGES_REQUESTED' },
      { user: { login: 'reviewer' }, state },
    ];
    expect((await autoMerge(f.request, repository)).status).toBe('merged');
  },
);

it.each(['queue', 'base', 'head', 'review'])(
  'rechecks the %s immediately before merging',
  async (kind) => {
    const f = fixture();
    f.beforeFinalRead(() => {
      if (kind === 'queue') f.state.open.push({ ...f.state.pull, number: 2 });
      if (kind === 'base') f.state.base.commit.sha = 'c'.repeat(40);
      if (kind === 'head') f.state.head.commit.sha = 'c'.repeat(40);
      if (kind === 'review') f.state.pull.requested_reviewers.push({});
    });
    expect((await autoMerge(f.request, repository)).status).toBe('waiting');
    expect(f.writes()).toEqual([]);
  },
);

it('reads every open-PR page rather than assuming the first 100 are complete', async () => {
  const f = fixture();
  for (let i = 2; i <= 101; i++)
    f.state.open.push({ ...f.state.pull, number: i });
  expect((await autoMerge(f.request, repository)).status).toBe('waiting');
  expect(f.calls.some((call) => call.path.endsWith('page=2'))).toBe(true);
  expect(f.writes()).toEqual([]);
});

it('stops on incomplete GraphQL evidence', async () => {
  const f = fixture();
  await autoMerge(
    async (path, options) =>
      path === '/graphql'
        ? { errors: [{ message: 'offline failure' }] }
        : f.request(path, options),
    repository,
  );
  expect(f.writes()).toEqual([]);
});

it('does not retry a rejected merge', async () => {
  const f = fixture();
  let attempts = 0;
  await expect(
    autoMerge(async (path, options) => {
      if (options?.method === 'PUT') {
        attempts++;
        throw new Error('Concurrent main update');
      }
      return f.request(path, options);
    }, repository),
  ).rejects.toThrow('Concurrent main update');
  expect(attempts).toBe(1);
});

it('never acts on a copied workflow in another repository', async () => {
  const f = fixture();
  await autoMerge(f.request, 'someone/wallet-provider-kit');
  expect(f.calls).toEqual([]);
});
