import 'server-only';
import { resolveConfig } from '../core/config/resolve.ts';
import { Runtime } from '../core/runtime.ts';

// One Runtime per server process (kept on globalThis so dev reloads don't mint new tokens).
// The CLI passes config through environment variables; GH_SETTINGS_VIEWER_CONFIG points at config.json.
const g = globalThis as unknown as { __ghsvRuntime?: Promise<Runtime> };

export function getRuntime(): Promise<Runtime> {
  if (!g.__ghsvRuntime) {
    g.__ghsvRuntime = Runtime.create(resolveConfig({ config: process.env.GH_SETTINGS_VIEWER_CONFIG || undefined })).catch((e) => {
      g.__ghsvRuntime = undefined; // let the next request retry after the user fixes config
      throw e;
    });
  }
  return g.__ghsvRuntime;
}
