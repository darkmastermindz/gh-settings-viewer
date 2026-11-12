// Optional OS keychain storage via keytar, used only if keytar can be resolved
// (installed next to this package, or globally with NODE_PATH pointing at the global modules).
import { createRequire } from 'node:module';
import { APP_NAME } from './paths.ts';

interface Keytar {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
}

function loadKeytar(): Keytar | null {
  try {
    const require = createRequire(import.meta.url); // honours NODE_PATH
    const name = 'keytar';
    return require(name) as Keytar;
  } catch {
    return null;
  }
}

const account = (appId: string) => `app-${appId}-private-key`;

export function keychainAvailable(): boolean {
  return loadKeytar() !== null;
}

export async function readKeyFromKeychain(appId: string): Promise<string | null> {
  const k = loadKeytar();
  return k ? k.getPassword(APP_NAME, account(appId)) : null;
}

export async function saveKeyToKeychain(appId: string, pem: string): Promise<boolean> {
  const k = loadKeytar();
  if (!k) return false;
  await k.setPassword(APP_NAME, account(appId), pem);
  return true;
}
