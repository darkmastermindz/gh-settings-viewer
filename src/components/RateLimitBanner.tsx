import type { RateLimitInfo } from '../core/github/ratelimit.ts';

export function RateLimitBanner({ rateLimit }: { rateLimit?: RateLimitInfo }) {
  if (!rateLimit || rateLimit.remaining === undefined) return null;
  const low = rateLimit.limit ? rateLimit.remaining / rateLimit.limit < 0.1 : rateLimit.remaining < 100;
  const reset = rateLimit.resetAt ? new Date(rateLimit.resetAt).toLocaleTimeString() : 'unknown';
  return (
    <p role="status" className={`rounded-md border px-3 py-1.5 text-xs ${low ? 'border-warn text-warn' : 'border-border text-fg-muted'}`}>
      Rate limit for this installation: {rateLimit.remaining.toLocaleString()}
      {rateLimit.limit ? ` of ${rateLimit.limit.toLocaleString()}` : ''} requests left; resets at {reset}.
      {low ? ' Cached pages still load; refreshes may fail until then.' : ''}
    </p>
  );
}
