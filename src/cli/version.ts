import { readFileSync } from 'node:fs';

/** package.json sits two levels above dist/cli (and src/cli). */
export function packageInfo(): { name: string; version: string; root: string } {
  const url = new URL('../../package.json', import.meta.url);
  const pkg = JSON.parse(readFileSync(url, 'utf8')) as { name: string; version: string };
  return { name: pkg.name, version: pkg.version, root: new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') };
}
