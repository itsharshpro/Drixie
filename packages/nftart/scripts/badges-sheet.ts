import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderBadge } from "../src";
import { BADGES } from "../test/fixtures";

const out = resolve(process.argv[2] ?? ".data/nftart");
mkdirSync(out, { recursive: true });
const cells = [...BADGES.map((b) => renderBadge(b)), renderBadge({ kind: "early_backer", fund: null, mintedAt: null })];
const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#F6F7FB;display:flex;gap:16px;flex-wrap:wrap;width:1680px}
.c{width:400px}.c svg{width:400px;height:400px;display:block}</style></head><body>${cells.map((s) => `<div class="c">${s}</div>`).join("")}</body></html>`;
writeFileSync(join(out, "badges.html"), html);
console.log(join(out, "badges.html"));
