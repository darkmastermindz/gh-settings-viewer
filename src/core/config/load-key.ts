import type { KeyObject } from 'node:crypto';
import { checkKeyFilePermissions, parsePrivateKey, readPem } from './key-file.ts';
import { readKeyFromKeychain } from './keychain.ts';
import type { ResolvedConfig } from './resolve.ts';

export interface LoadedKey {
  key: KeyObject;
  /** Where it came from, for diagnostics (never the key). */
  description: string;
  warnings: string[];
}

/** Reads and parses the private key once. The PEM text is dropped after parsing. */
export async function loadPrivateKey(config: ResolvedConfig): Promise<LoadedKey> {
  const pk = config.privateKey;
  const warnings: string[] = [];
  switch (pk.kind) {
    case 'env':
      return { key: parsePrivateKey(pk.pem), description: 'GITHUB_APP_PRIVATE_KEY environment variable', warnings };
    case 'path': {
      const check = checkKeyFilePermissions(pk.path);
      if (check.warning) warnings.push(check.warning);
      return { key: parsePrivateKey(readPem(pk.path)), description: `file ${pk.path}${check.mode ? ` (${check.mode})` : ''}`, warnings };
    }
    case 'keychain': {
      if (!config.appId) throw new Error('The private key is in the keychain, but no app ID is configured');
      const pem = await readKeyFromKeychain(config.appId);
      if (!pem) throw new Error('The private key is set to come from the OS keychain, but keytar is not installed or has no entry. Run `npx gh-settings-viewer init` again.');
      return { key: parsePrivateKey(pem), description: 'OS keychain', warnings };
    }
    case 'none':
      throw new Error('No private key configured. Run `npx gh-settings-viewer init`, or set GITHUB_APP_PRIVATE_KEY_PATH.');
  }
}
