import { createServer } from 'node:net';

export function isPortFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.listen({ port, host, exclusive: true }, () => srv.close(() => resolve(true)));
  });
}

/** The first free port at or after `start` (tries up to 50). */
export async function findFreePort(start: number, host: string, attempts = 50): Promise<number> {
  for (let p = start; p < start + attempts && p <= 65535; p++) if (await isPortFree(p, host)) return p;
  throw new Error(`No free port found between ${start} and ${start + attempts - 1}`);
}
