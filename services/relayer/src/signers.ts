import { env, type ChainClient, type FileKeyStore } from "@listed/chain";
import { KeyPair, type Account, type KeyPairString } from "near-api-js";
import { unavailable } from "./errors";

export class Signers {
  constructor(
    private readonly client: ChainClient,
    private readonly keyStore: FileKeyStore,
    private readonly relayerId: string,
    private readonly playersId: string,

    private readonly opts: { sharedPlayersKey: boolean } = { sharedPlayersKey: true },
  ) {}

  private relayerKey(): KeyPair | null {
    const fromEnv = env("RELAYER_PRIVATE_KEY");
    if (fromEnv) return KeyPair.fromString(fromEnv as KeyPairString);
    return this.keyStore.getKeyPair(this.relayerId);
  }

  relayer(): Account {
    const kp = this.relayerKey();
    if (!kp) {
      throw unavailable(
        "relayer_not_configured",
        "The relayer has no signing key yet. Run scripts/deploy-local.ts (or set RELAYER_PRIVATE_KEY) and restart it.",
      );
    }
    return this.client.accountWithKey(this.relayerId, kp);
  }

  players(): Account {
    const own = this.playersOwnKey();
    const kp = own ?? (this.opts.sharedPlayersKey ? this.relayerKey() : null);
    if (!kp) {
      throw unavailable("provisioning_not_configured", "Account creation isn't configured yet. Try again later.");
    }
    return this.client.accountWithKey(this.playersId, kp);
  }

  private playersOwnKey(): KeyPair | null {
    const fromEnv = env("PLAYERS_PRIVATE_KEY");
    if (fromEnv) return KeyPair.fromString(fromEnv as KeyPairString);
    return this.keyStore.getKeyPair(this.playersId);
  }

  get relayerAccountId(): string {
    return this.relayerId;
  }

  get playersAccountId(): string {
    return this.playersId;
  }
}
