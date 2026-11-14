import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { KeyPair, type KeyPairString } from "near-api-js";
import type { Network } from "@listed/shared";
import { keysDir } from "./paths";

export interface KeyFile {
  account_id: string;
  public_key: string;
  private_key: string;
}

const NAME_RE = /^[a-z0-9._-]+$/;

export class FileKeyStore {
  readonly dir: string;

  constructor(dirOrNetwork: string) {
    this.dir = isNetwork(dirOrNetwork) ? keysDir(dirOrNetwork) : dirOrNetwork;
  }

  static forNetwork(network: Network): FileKeyStore {
    return new FileKeyStore(keysDir(network));
  }

  pathFor(name: string): string {
    if (!NAME_RE.test(name)) throw new Error(`Invalid key name "${name}"`);
    return join(this.dir, `${name}.json`);
  }

  has(name: string): boolean {
    return existsSync(this.pathFor(name));
  }

  read(name: string): KeyFile | null {
    const file = this.pathFor(name);
    if (!existsSync(file)) return null;
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<KeyFile> & { secret_key?: string };
    const privateKey = raw.private_key ?? raw.secret_key;
    if (!raw.account_id || !raw.public_key || !privateKey) {
      throw new Error(`Key file ${file} is malformed (needs account_id, public_key, private_key).`);
    }
    return { account_id: raw.account_id, public_key: raw.public_key, private_key: privateKey };
  }

  getKeyPair(name: string): KeyPair | null {
    const file = this.read(name);
    return file ? KeyPair.fromString(file.private_key as KeyPairString) : null;
  }

  requireKeyPair(name: string): KeyPair {
    const kp = this.getKeyPair(name);
    if (!kp) throw new Error(`No key for ${name} in ${this.dir}. Run scripts/deploy-local.ts first.`);
    return kp;
  }

  write(name: string, accountId: string, keyPair: KeyPair): KeyFile {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const body: KeyFile = {
      account_id: accountId,
      public_key: keyPair.getPublicKey().toString(),
      private_key: keyPair.toString(),
    };
    const file = this.pathFor(name);
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(body, null, 2) + "\n", { mode: 0o600 });
    renameSync(tmp, file);
    chmodSync(file, 0o600);
    return body;
  }

  getOrCreate(name: string, accountId: string): { keyPair: KeyPair; created: boolean } {
    const existing = this.getKeyPair(name);
    if (existing) return { keyPair: existing, created: false };
    const keyPair = KeyPair.fromRandom("ed25519");
    this.write(name, accountId, keyPair);
    return { keyPair, created: true };
  }

  list(): string[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length));
  }
}

function isNetwork(value: string): value is Network {
  return value === "sandbox" || value === "testnet" || value === "mainnet";
}
