const modules = new Set([
  'sponsorship/signing',
  'sponsorship/preparation',
  'sponsorship/estimated-gas',
  'sponsorship/verifier',
  'storage/sponsorship',
  'storage/funding',
  'storage/financial',
  'storage/asset-budgets',
  'storage/budget-reservations',
  'deployment/actions',
  'execution/approved-calls',
]);
/** Retain a bounded static code location, excluding error text and request data. */
export function failureOrigin(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  for (const line of (error.stack ?? '').split('\n').slice(1, 12)) {
    if (/https?:\/\//.test(line)) continue;
    const match =
      /\/(?:src|dist)\/([a-z/-]+)\.(?:ts|js):(\d{1,6}):\d{1,5}\)?$/.exec(line);
    if (match && modules.has(match[1])) return match[1] + ':' + match[2];
  }
  return undefined;
}
