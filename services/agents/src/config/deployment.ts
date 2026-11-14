import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { deploymentPath, keyPath } from "./paths.js";

const DeploymentSchema = z.object({
  network: z.string(),
  rpcUrl: z.string(),
  root: z.string(),
  relayer: z.string().optional(),
  players: z.string().optional(),
  compute: z.string(),
  keeper: z.string().optional(),
  operator: z.string().optional(),

  chainId: z.string().optional(),
  startBlock: z.number().int().nonnegative().optional(),
  deployedAt: z.string().optional(),
  companies: z
    .array(
      z.object({
        ticker: z.string(),
        account: z.string(),
        agentPublicKey: z.string().optional(),
      }),
    )
    .default([]),
});

export type Deployment = z.infer<typeof DeploymentSchema>;

export function readDeployment(network: string): Deployment | null {
  const p = deploymentPath(network);
  if (!existsSync(p)) return null;
  const parsed = DeploymentSchema.safeParse(JSON.parse(readFileSync(p, "utf8")));
  if (!parsed.success) throw new Error(`invalid ${p}: ${parsed.error.issues[0]?.message ?? "schema error"}`);
  return parsed.data;
}

const KeyFileSchema = z.object({
  account_id: z.string(),
  public_key: z.string(),
  private_key: z.string().startsWith("ed25519:"),
});

export type KeyFile = z.infer<typeof KeyFileSchema>;

export function readKey(network: string, accountId: string): KeyFile | null {
  const p = keyPath(network, accountId);
  if (!existsSync(p)) return null;
  const parsed = KeyFileSchema.safeParse(JSON.parse(readFileSync(p, "utf8")));
  if (!parsed.success) throw new Error(`invalid key file ${p}`);
  return parsed.data;
}
