/** EIP-5792 version 2.0.0 wire types for the supported Safe batch profile. */
export interface WalletCallsReceipt {
  logs: { address: string; data: string; topics: string[] }[];
  status: string;
  blockHash: string;
  blockNumber: string;
  gasUsed: string;
  transactionHash: string;
}
export interface WalletCallsStatus {
  version: '2.0.0';
  id: string;
  chainId: '0x14a34' | '0x2105' | '0xaa36a7';
  status: 100 | 200 | 400 | 500;
  atomic: true;
  capabilities?: {
    preconfirmation?: {
      stage: 'preconfirmed';
      transactionHash: string;
      observedAt: string;
    };
  };
  receipts?: WalletCallsReceipt[];
}
export interface WalletCallsMetadata {
  version: '2.0.0';
  id: string;
  sender: string;
  policyHash: string;
  policyRevision: string;
}

export interface WalletCallsBatchSummary extends WalletCallsStatus {
  account_id: string;
  sender: string;
  queue_stage:
    | 'cancelled'
    | 'expired'
    | 'blocked'
    | 'succeeded'
    | 'included'
    | 'failed'
    | 'queued'
    | 'executing';
  policy_revision: string;
  expires_at: string;
  application_id: string;
}
