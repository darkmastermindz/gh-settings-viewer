// Validation for anything that arrives from a URL (route params, query strings) before it reaches GitHub.

/** GitHub logins and enterprise slugs: alphanumerics and single hyphens, up to 39 (slugs up to 60). */
export function isAccountKey(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,59}$/.test(v);
}

/** Repository names: letters, digits, '.', '-', '_' (not '.' or '..'). */
export function isRepoName(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 100 && /^[A-Za-z0-9._-]+$/.test(v) && v !== '.' && v !== '..';
}

export function isFeatureId(v: unknown): v is string {
  return typeof v === 'string' && /^[a-z0-9-]{1,80}$/.test(v);
}

/** Audit-log style filter text: printable, bounded, no control characters. */
export function cleanFilter(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return s ? s.slice(0, 500) : undefined;
}
