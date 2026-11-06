import { lstatSync } from 'node:fs';
import { WalletProviderError } from '../domain/signing.js';
export function privatePath(path: string, directory: boolean): boolean {
  try {
    const stat = lstatSync(path);
    if (
      stat.isSymbolicLink() ||
      (stat.mode & 0o077) !== 0 ||
      stat.uid !== process.getuid?.() ||
      (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)
    )
      throw new Error();
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw new WalletProviderError('wallet_provider_configuration');
  }
}
