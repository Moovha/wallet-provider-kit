// Internal short-lived process. No HTTP listener, ambient vault or key-export command.
import {
  createWallet,
  listWallets,
  signTypedData,
} from '@open-wallet-standard/core';

function findWallet(vaultPath: string, walletName: string) {
  const matches = listWallets(vaultPath).filter(
    (wallet) => wallet.name === walletName,
  );
  if (matches.length > 1) throw new Error();
  const wallet = matches[0];
  if (!wallet) return null;
  // Keep the pipe response independent of vault size and exclude unrelated wallets.
  return {
    id: wallet.id,
    name: wallet.name,
    accounts: wallet.accounts.filter(
      (account) => account.chainId === 'eip155:1',
    ),
  };
}

async function run(): Promise<void> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 65536) throw new Error();
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  let result: unknown;
  switch (input.command) {
    case 'find':
      result = findWallet(input.vaultPath, input.walletName);
      break;
    case 'create':
      createWallet(input.name, input.secret, 24, input.vaultPath);
      result = null;
      break;
    case 'sign': {
      // Resolve the current vault binding in the same short-lived process as signing.
      const wallet = findWallet(input.vaultPath, input.walletName);
      if (!wallet) throw new Error();
      const accounts = wallet.accounts;
      if (
        accounts.length !== 1 ||
        accounts[0].address.toLowerCase() !== input.address.toLowerCase()
      )
        throw new Error();
      result = signTypedData(
        wallet.id,
        input.chainId,
        input.payload,
        input.secret,
        0,
        input.vaultPath,
        input.address,
      );
      break;
    }
    default:
      throw new Error();
  }
  process.stdout.write(JSON.stringify(result));
}

run().catch(() => {
  process.exitCode = 1;
});
