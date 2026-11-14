import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { baseEncode } from "near-api-js";

export interface WasmFile {
  path: string;
  bytes: Uint8Array;

  hash: string;

  hashHex: string;
}

export function loadWasm(path: string): WasmFile {
  const bytes = new Uint8Array(readFileSync(path));
  const digest = createHash("sha256").update(bytes).digest();
  return { path, bytes, hash: baseEncode(new Uint8Array(digest)), hashHex: digest.toString("hex") };
}
