// Redacts token-like strings from anything that might reach a log, the UI, the cache or an export.

const PATTERNS: readonly RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, // classic and installation tokens (ghs_ = installation)
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, // fine-grained PATs
  /\bv1\.[0-9a-f]{40}\b/g, // legacy installation token format
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, // JWTs (app JWT)
  /\b(?:token|bearer)\s+[A-Za-z0-9._~+/-]{20,}=*/gi, // Authorization header values
];

export const REDACTED = '[REDACTED]';

export function redact(text: string): string {
  let out = text;
  for (const re of PATTERNS) out = out.replace(re, (m) => (/^(token|bearer)\s/i.test(m) ? `${m.split(/\s+/)[0]} ${REDACTED}` : REDACTED));
  return out;
}

/** True when the text holds something that looks like a credential. */
export function containsSecret(text: string): boolean {
  return PATTERNS.some((re) => {
    re.lastIndex = 0;
    const hit = re.test(text);
    re.lastIndex = 0;
    return hit;
  });
}

/** Deep-redacts string values in JSON-like data (for API responses sent to the browser). */
export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redact(value) as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v);
    return out as T;
  }
  return value;
}

/** Logger that redacts before writing. All modules log through this. */
export const log = {
  info: (...args: unknown[]) => console.error(redact(args.map(fmt).join(' '))),
  warn: (...args: unknown[]) => console.error(redact(`warning: ${args.map(fmt).join(' ')}`)),
  error: (...args: unknown[]) => console.error(redact(`error: ${args.map(fmt).join(' ')}`)),
};

function fmt(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
