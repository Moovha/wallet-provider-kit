const messages: Record<number, string> = {
  [-32700]: 'Parse error',
  [-32600]: 'Invalid Request',
  [-32601]: 'Method not found',
  [-32602]: 'Invalid params',
  [-32603]: 'Internal error',
  4100: 'Unauthorized',
  4200: 'Unsupported method',
  4900: 'Disconnected',
  5700: 'Unsupported non-optional capability',
  5710: 'Unsupported chain id',
  5720: 'Duplicate ID',
  5730: 'Unknown bundle id',
  5740: 'Bundle too large',
};
export class WalletCallsError extends Error {
  constructor(readonly code: number) {
    super(messages[code] ?? 'Wallet calls unavailable');
  }
}
