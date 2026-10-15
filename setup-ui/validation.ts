export function httpsUrl(node: { value: unknown }) {
  try {
    const url = new URL(String(node.value));
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}
export function httpsOrigin(node: { value: unknown }) {
  return httpsUrl(node) && new URL(String(node.value)).origin === node.value;
}
export function explainIssue(issue: string) {
  const area = issue.startsWith('/policy/provider')
    ? 'Provider'
    : issue.startsWith('/backend')
      ? 'Backend'
      : issue.startsWith('/ownerLogin') ||
          issue.startsWith('/oauth') ||
          issue.startsWith('/identity')
        ? 'Services'
        : issue.startsWith('/policy') || issue.startsWith('/reviewers')
          ? 'Policies'
          : issue.startsWith('/activation') ||
              issue.startsWith('/http') ||
              issue.startsWith('/storage')
            ? 'Deployment'
            : 'Configuration';
  const hints: Record<string, string> = {
    required: 'A required setting is missing.',
    uniqueItems: 'Remove duplicate entries.',
    pattern: 'Use the required format shown beside this field.',
    type: 'Check the value type; credentials must be environment variable references.',
    minProperties: 'Choose at least one identity vendor.',
    additionalProperties: 'This configuration contains an unsupported field.',
    minimum: 'The value is below the supported minimum.',
    maximum: 'The value exceeds the supported maximum.',
  };
  const [path, reason] = issue.split(': ');
  return `${area} — ${path}: ${hints[reason] ?? reason ?? issue}`;
}
