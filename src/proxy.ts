// Runs before every request (Node runtime): Host/Origin checks, the per-launch session token, and a strict CSP.
import { NextResponse, type NextRequest } from 'next/server';
import { checkRequest, isLoopbackHost } from './core/security/host-origin.ts';
import { sessionCookieName, tokensMatch } from './core/security/session-token.ts';

const PUBLIC_PATHS = [/^\/_next\/static\//, /^\/icons\//, /^\/manifest\.webmanifest$/, /^\/sw\.js$/, /^\/offline\.html$/, /^\/favicon\.ico$/];

function securityHeaders(res: NextResponse, csp?: string) {
  if (csp) res.headers.set('content-security-policy', csp);
  res.headers.set('x-content-type-options', 'nosniff');
  res.headers.set('referrer-policy', 'no-referrer');
  res.headers.set('x-frame-options', 'DENY');
  res.headers.set('cross-origin-opener-policy', 'same-origin');
  res.headers.set('cross-origin-resource-policy', 'same-origin');
  res.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  return res;
}

function deny(status: number, message: string) {
  return securityHeaders(
    new NextResponse(
      `<!doctype html><meta charset="utf-8"><title>gh-settings-viewer</title><body style="font:16px system-ui;margin:3rem;max-width:40rem"><h1>${status === 401 ? 'Session required' : 'Request blocked'}</h1><p>${message}</p></body>`,
      { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
    ),
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  );
}

export function proxy(req: NextRequest) {
  const port = process.env.GHSV_PORT ?? req.nextUrl.port;
  const configured = process.env.GHSV_ALLOWED_HOSTS?.split(',').filter(Boolean);
  const dev = process.env.NODE_ENV === 'development';
  const host = req.headers.get('host') ?? '';
  // In `next dev` without the CLI, accept any loopback host; the CLI always passes an explicit list.
  const hosts = configured ?? (dev && isLoopbackHost(host.replace(/:\d+$/, '')) ? [host.toLowerCase()] : []);
  const guard = checkRequest({ host, origin: req.headers.get('origin'), secFetchSite: req.headers.get('sec-fetch-site'), method: req.method }, hosts);
  if (!guard.ok) return deny(guard.status, `${guard.reason}. This server only answers on ${hosts[0] ?? '127.0.0.1'}.`);

  const path = req.nextUrl.pathname;
  if (PUBLIC_PATHS.some((re) => re.test(path))) return securityHeaders(NextResponse.next());

  const expected = process.env.GHSV_SESSION_TOKEN;
  const cookieName = sessionCookieName(port);
  if (!expected && !dev) return deny(401, 'This server was started without a session token. Start it with <code>npx gh-settings-viewer</code>.');
  if (expected) {
    const fromUrl = req.nextUrl.searchParams.get('t');
    if (fromUrl) {
      if (!tokensMatch(fromUrl, expected)) return deny(401, 'That link has expired. Use the link printed by <code>npx gh-settings-viewer</code>.');
      const clean = req.nextUrl.clone();
      clean.searchParams.delete('t');
      const res = NextResponse.redirect(clean, 303);
      res.cookies.set(cookieName, expected, { httpOnly: true, sameSite: 'strict', path: '/', secure: false });
      return securityHeaders(res);
    }
    if (!tokensMatch(req.cookies.get(cookieName)?.value, expected)) {
      return deny(401, 'Open the link printed by <code>npx gh-settings-viewer</code> in your terminal. Each launch uses a new session link.');
    }
  }

  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self'${dev ? " 'unsafe-inline'" : ` 'nonce-${nonce}'`}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  if (path.startsWith('/api/')) res.headers.set('cache-control', 'no-store');
  return securityHeaders(res, csp);
}

export const config = {
  matcher: [{ source: '/:path*' }],
};
