// Internal short-lived process. No HTTP listener, ambient vault or key-export command.
import {
  createWallet,
  listWallets,
  signTypedData,
} from '@open-wallet-standard/core';

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
    case 'list':
      result = listWallets(input.vaultPath).map((wallet) => ({
        id: wallet.id,
        name: wallet.name,
        accounts: wallet.accounts.filter(
          (account) => account.chainId === 'eip155:1',
        ),
      }));
      break;
    case 'create':
      createWallet(input.name, input.secret, 24, input.vaultPath);
      result = null;
      break;
    case 'sign':
      result = signTypedData(
        input.walletId,
        'eip155:84532',
        input.payload,
        input.secret,
        0,
        input.vaultPath,
        input.address,
      );
      break;
    default:
      throw new Error();
  }
  process.stdout.write(JSON.stringify(result));
}

run().catch(() => {
  process.exitCode = 1;
});
