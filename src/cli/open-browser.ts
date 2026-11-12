import { spawn } from 'node:child_process';

/** Opens a URL in the default browser without a shell (no quoting surprises on any OS). */
export function openBrowser(url: string): void {
  if (!/^http:\/\/[^\s"'`]+$/.test(url)) throw new Error('Refusing to open an unexpected URL');
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]];
  try {
    const child = spawn(cmd as string, args as string[], { stdio: 'ignore', detached: true });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    /* no browser available; the URL is printed anyway */
  }
}
