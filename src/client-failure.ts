/** Bounded recovery metadata; never retains response bodies or transport exceptions. */
export interface ProviderFailureDetails {
  status?: number;
  problemCode?: string;
  requestId?: string;
  outcome?: 'not_dispatched' | 'rejected' | 'unknown';
  retryAfterSeconds?: number;
}

export async function readProviderFailure(
  response: Response,
): Promise<ProviderFailureDetails> {
  const details: ProviderFailureDetails = { status: response.status };
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter && /^[0-9]{1,15}$/.test(retryAfter)) {
    details.retryAfterSeconds = Number(retryAfter);
  } else if (
    retryAfter &&
    /^[A-Z][a-z]{2}, [0-9]{2} [A-Z][a-z]{2} [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT$/.test(
      retryAfter,
    )
  ) {
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date))
      details.retryAfterSeconds = Math.max(
        0,
        Math.ceil((date - Date.now()) / 1000),
      );
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return details;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return details;
  const problem = value as Record<string, unknown>;
  if (problem.status !== response.status) return details;
  if (
    typeof problem.code === 'string' &&
    /^[a-z][a-z0-9_]{0,127}$/.test(problem.code)
  )
    details.problemCode = problem.code;
  if (
    typeof problem.request_id === 'string' &&
    /^[A-Za-z0-9_-]{1,128}$/.test(problem.request_id)
  )
    details.requestId = problem.request_id;
  if (
    problem.outcome === 'not_dispatched' ||
    problem.outcome === 'rejected' ||
    problem.outcome === 'unknown'
  )
    details.outcome = problem.outcome;
  return details;
}
