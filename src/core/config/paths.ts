import envPaths from 'env-paths';
import { join } from 'node:path';

type Env = Record<string, string | undefined>;

export const APP_NAME = 'gh-settings-viewer';

export interface AppPaths {
  configDir: string;
  cacheDir: string;
  configFile: string;
  privateKeyFile: string;
  cacheDb: string;
  updateCheckFile: string;
}

/**
 * Per-user directories: ~/.config/gh-settings-viewer on Linux, ~/Library/Preferences/... on macOS,
 * %APPDATA%\gh-settings-viewer\Config on Windows. GH_SETTINGS_VIEWER_HOME overrides both (tests, portable use).
 */
export function appPaths(env: Env = process.env): AppPaths {
  const home = env.GH_SETTINGS_VIEWER_HOME;
  const p = envPaths(APP_NAME, { suffix: '' });
  const configDir = home ? join(home, 'config') : p.config;
  const cacheDir = home ? join(home, 'cache') : p.cache;
  return {
    configDir,
    cacheDir,
    configFile: join(configDir, 'config.json'),
    privateKeyFile: join(configDir, 'private-key.pem'),
    cacheDb: join(cacheDir, 'cache.sqlite'),
    updateCheckFile: join(cacheDir, 'update-check.json'),
  };
}
