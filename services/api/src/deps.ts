import type { Db } from "@listed/db";
import type { NearRpc } from "@listed/db/near";
import type { ApiConfig } from "./config";
import type { ChainClock } from "./lib/chain-clock";
import type { Mailer } from "./lib/mailer";
import type { FundsHub } from "./funds/stream";

export interface AppDeps {
  cfg: ApiConfig;
  db: Db;
  rpc: NearRpc;
  mailer: Mailer | null;

  fetch: typeof fetch;

  clock?: ChainClock;

  fundsHub?: FundsHub;
}
