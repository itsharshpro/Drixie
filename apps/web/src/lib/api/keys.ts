export const qk = {
  all: ["listed"] as const,
  config: () => ["listed", "config"] as const,
  health: () => ["listed", "health"] as const,
  me: () => ["listed", "me"] as const,
  agentsStatus: () => ["listed", "agents-status"] as const,
  balance: (account: string) => ["listed", "balance", account] as const,
};
