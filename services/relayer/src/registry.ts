import { readFundsDeployment, type ChainClient } from "@listed/chain";
import type { Network } from "@listed/shared";
import type { ReceiverKind } from "./policy";

export interface RegistryDeps {
  network: Network;
  root: string;
  protocolAccounts: string[];
  client: ChainClient;
  refreshMs: number;

  fundsContract?: string | null;
  log?: { warn: (obj: object, msg: string) => void; info: (obj: object, msg: string) => void };
}

export class ReceiverRegistry {
  private funds: { contract: string | null; staff: Set<string> } = { contract: null, staff: new Set() };
  private lastRefreshAt = 0;
  private inflight: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  fundsContractLive = false;
  lastError: string | null = null;

  constructor(private readonly deps: RegistryDeps) {}

  get root(): string {
    return this.deps.root;
  }

  get fundsContract(): string | null {
    return this.funds.contract;
  }

  get lastRefresh(): number {
    return this.lastRefreshAt;
  }

  kindOf(accountId: string): ReceiverKind | null {
    return this.funds.contract && accountId === this.funds.contract ? "funds" : null;
  }

  isProtocolAccount(accountId: string): boolean {
    return (
      accountId === this.deps.root ||
      accountId === this.funds.contract ||
      this.funds.staff.has(accountId) ||
      this.deps.protocolAccounts.includes(accountId)
    );
  }

  async ensureKnown(accountId: string, minAgeMs = 3_000): Promise<ReceiverKind | null> {
    const k = this.kindOf(accountId);
    if (k) return k;
    if (!this.funds.contract && Date.now() - this.lastRefreshAt >= minAgeMs) await this.refresh();
    return this.kindOf(accountId);
  }

  refresh(): Promise<void> {
    if (!this.inflight) {
      this.inflight = this.doRefresh().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async doRefresh(): Promise<void> {
    let contract = this.deps.fundsContract ?? null;
    const staff = new Set<string>();
    try {
      const d = readFundsDeployment(this.deps.network);
      if (d) {
        contract = contract ?? d.contract;
        staff.add(d.operator.account);
        staff.add(d.managersParent);
        for (const m of d.managers) staff.add(m.account);
        for (const h of d.house) staff.add(h.account);
      }
    } catch (err) {
      this.deps.log?.warn({ err: (err as Error).message }, "could not read the funds deployment file");
    }
    if (contract !== this.funds.contract) this.deps.log?.info({ fundsContract: contract }, "funds contract registered");
    this.funds = { contract, staff };
    this.lastRefreshAt = Date.now();
    if (!contract) {
      this.fundsContractLive = false;
      this.lastError = "funds contract not deployed yet";
      return;
    }
    try {
      await this.deps.client.view(contract, "get_config");
      this.fundsContractLive = true;
      this.lastError = null;
    } catch (err) {
      this.fundsContractLive = false;
      this.lastError = (err as Error).message;
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.refresh(), this.deps.refreshMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
