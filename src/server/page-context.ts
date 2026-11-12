import 'server-only';
import type { Capabilities } from '../core/discovery/discover.ts';
import type { Runtime } from '../core/runtime.ts';
import { redact } from '../core/security/redact.ts';
import { getRuntime } from './runtime.ts';

export type PageContext = { ok: true; rt: Runtime; caps: Capabilities } | { ok: false; error: string };

export async function loadContext(): Promise<PageContext> {
  try {
    const rt = await getRuntime();
    return { ok: true, rt, caps: await rt.capabilities() };
  } catch (e) {
    return { ok: false, error: redact((e as Error).message) };
  }
}
