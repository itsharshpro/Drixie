export type Network = "sandbox" | "testnet" | "mainnet";

export interface PricePoint {
  t: string; // ISO
  price: number; // display only
  volume: number; // traded in bucket
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Me {
  userId: string;
  handle: string | null;
  accountId: string | null;
  email: string | null;
}

export interface PublicConfig {
  network: Network;
  rpcUrl: string;
  root: string;
  relayerUrl: string;
  explorerTxUrl: string | null; // e.g. https://testnet.nearblocks.io/txns/{hash}
}

export type MeResponse = (Me & { signedIn: true }) | { signedIn: false; userId: null; handle: null; accountId: null; email: null };

export interface AgentsStatus {
  state: "running" | "waiting_for_key" | "unreachable";
  paused: boolean;
  waiting: string | null; // the missing setting, e.g. "AI_API_KEY"
  message: string | null; // one sentence for the UI
  checkedAt: string;
}

export interface StatusResponse {
  network: string;
  agents: AgentsStatus;
}

export interface ApiError {
  error: { code: string; message: string };
}
