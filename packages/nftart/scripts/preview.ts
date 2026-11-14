import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderBadge, renderBasketCard, renderSeatCard, renderTrophy } from "../src";
import { BADGES, BASKET_ATLAS, BASKET_KITE, SEAT_NOVA, SEAT_ORION_AUCTION, TROPHY_MERIDIAN } from "../test/fixtures";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const out = resolve(process.argv[2] ?? join(root, ".data/nftart"));
mkdirSync(out, { recursive: true });

const files: [string, string][] = [
  ["basket-atlas.svg", renderBasketCard(BASKET_ATLAS)],
  ["basket-kite.svg", renderBasketCard(BASKET_KITE)],
  ["seat-nova.svg", renderSeatCard(SEAT_NOVA)],
  ["seat-orion-auction.svg", renderSeatCard(SEAT_ORION_AUCTION)],
  ["trophy-meridian.svg", renderTrophy(TROPHY_MERIDIAN)],
  ...BADGES.map((b): [string, string] => [`badge-${b.kind}.svg`, renderBadge(b)]),
];
for (const [name, svg] of files) writeFileSync(join(out, name), svg);

const inline = [renderBasketCard(BASKET_ATLAS, { fonts: "none" }), renderSeatCard(SEAT_NOVA, { fonts: "none" }), renderBadge(BADGES[2]!, { fonts: "none" })];

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Drixie NFT art preview</title>
<style>
body{margin:0;padding:40px;background:#F6F7FB;font-family:Geist,system-ui,sans-serif;color:#0F1117}
h2{font-size:15px;font-weight:600;margin:32px 0 16px;color:rgba(15,17,23,.64)}
.row{display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start}
.row img,.row .inl svg{width:360px;height:auto;display:block}
.inl{width:360px}
</style></head><body>
<h2>Basket cards · seats · trophy (img, embedded fonts)</h2>
<div class="row">${files.slice(0, 5).map(([f]) => `<img src="${f}" alt="${f}">`).join("")}</div>
<h2>Investor badges</h2>
<div class="row">${files.slice(5).map(([f]) => `<img src="${f}" alt="${f}">`).join("")}</div>
<h2>Inline (page fonts)</h2>
<div class="row">${inline.map((s) => `<div class="inl">${s}</div>`).join("")}</div>
</body></html>`;
writeFileSync(join(out, "preview.html"), html);
for (const [name, svg] of files) console.log(`${name}\t${(svg.length / 1024).toFixed(1)} KB`);
console.log(`preview: ${join(out, "preview.html")}`);
