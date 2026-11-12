import { createPrivateKey, type KeyObject } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface KeyFileCheck {
  ok: boolean;
  mode?: string;
  warning?: string;
}

/** Warns when a private key file is readable by group or others (POSIX only; Windows uses ACLs). */
export function checkKeyFilePermissions(path: string, platform: NodeJS.Platform = process.platform): KeyFileCheck {
  if (platform === 'win32') return { ok: true };
  const mode = statSync(path).mode & 0o777;
  const modeStr = `0${mode.toString(8)}`;
  if (mode & 0o077) {
    return { ok: false, mode: modeStr, warning: `Private key ${path} has permissions ${modeStr}; it should be 0600. Fix with: chmod 600 "${path}"` };
  }
  return { ok: true, mode: modeStr };
}

/** Writes a PEM as a 0600 file (the directory is created 0700). */
export function writePrivateKeyFile(path: string, pem: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, pem.endsWith('\n') ? pem : `${pem}\n`, { mode: 0o600 });
  if (process.platform !== 'win32') chmodSync(path, 0o600);
}

export function readPem(path: string): string {
  return readFileSync(path, 'utf8');
}

/** Parses a PEM once into a KeyObject (PKCS#1 from GitHub, or PKCS#8). Throws a message without key material. */
export function parsePrivateKey(pem: string): KeyObject {
  try {
    const key = createPrivateKey({ key: pem.replace(/\\n/g, '\n'), format: 'pem' });
    if (key.asymmetricKeyType !== 'rsa') throw new Error('not an RSA key');
    return key;
  } catch (e) {
    // The cause is dropped on purpose: OpenSSL errors can echo key material.
    // eslint-disable-next-line preserve-caught-error
    throw new Error(`Could not parse the GitHub App private key (${(e as Error).message.split('\n')[0]}). Use the .pem file downloaded from the app's settings.`);
  }
}
