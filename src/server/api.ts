import 'server-only';
import { NextResponse } from 'next/server';
import { ReadOnlyViolation } from '../core/github/client.ts';
import { redact, redactDeep } from '../core/security/redact.ts';

const NO_STORE = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(redactDeep(data), { status, headers: NO_STORE });
}

export function errorJson(status: number, message: string): NextResponse {
  return json({ error: redact(message) }, status);
}

export function handleError(e: unknown): NextResponse {
  if (e instanceof ReadOnlyViolation) return errorJson(400, e.message);
  return errorJson(500, (e as Error).message ?? 'Unexpected error');
}

export { publicCapabilities, publicInstallation } from './api-shapes.ts';

export function download(body: string, filename: string, type: string): NextResponse {
  return new NextResponse(body, {
    headers: { ...NO_STORE, 'content-type': `${type}; charset=utf-8`, 'content-disposition': `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"` },
  });
}
