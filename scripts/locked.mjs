#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [name, cmd, ...args] = process.argv.slice(2);
if (!name || !cmd) {
  console.error("usage: node scripts/locked.mjs <lock-name> <command> [args...]");
  process.exit(2);
}
const dir = join(root, ".data", `.lock-${name}`);
mkdirSync(join(root, ".data"), { recursive: true });

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const started = Date.now();
let announced = false;
for (;;) {
  try {
    mkdirSync(dir);
    writeFileSync(join(dir, "pid"), String(process.pid));
    break;
  } catch {
    const pidFile = join(dir, "pid");
    const holder = existsSync(pidFile) ? Number(readFileSync(pidFile, "utf8")) : 0;
    if (holder && !alive(holder)) { rmSync(dir, { recursive: true, force: true }); continue; }
    if (!announced) { console.error(`[locked] waiting for "${name}" (held by pid ${holder || "?"})…`); announced = true; }
    if (Date.now() - started > 30 * 60_000) { console.error(`[locked] gave up after 30 min`); process.exit(1); }
    await sleep(1000);
  }
}
const release = () => { try { rmSync(dir, { recursive: true, force: true }); } catch {} };
const child = spawn(cmd, args, { stdio: "inherit", shell: false });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { child.kill(sig); });
child.on("exit", (code, signal) => { release(); process.exit(code ?? (signal ? 1 : 0)); });
child.on("error", (e) => { release(); console.error(e); process.exit(1); });
