import { FileKeyStore, coinsToNumber, currentNetwork, env, poolPriceUsd, quoteBuyCoin, quoteSellCoin, readDeployment, requireFundsDeployment, withSlippageBps, yoctoToNearString, FundsClient, nearToYoctoBig } from "../packages/chain/src/index";
import { fundsCalls, relay, signDelegateAction, type FunctionCallSpec } from "../packages/chain/src/browser";

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? (process.argv[i + 1] as string) : fallback;
};
const has = (name: string) => process.argv.includes(`--${name}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const say = (m: string) => console.log(`[verify] ${m}`);

async function main(): Promise<void> {
  const network = currentNetwork();
  if (network !== "sandbox") throw new Error("funds-verify runs on the local sandbox only.");
  const d = requireFundsDeployment(network);
  const fc = new FundsClient(d);
  const legacy = readDeployment(network);
  const investor = arg("investor", legacy?.seed?.investors?.[0] ?? `dorothy.players.${legacy?.root ?? "listed.test.near"}`);
  const fund = arg("fund", "atlas");
  const near = nearToYoctoBig(arg("near", "1"));
  const waitMin = Number(arg("wait", "17"));
  const relayerUrl = env("RELAYER_URL") ?? "http://localhost:4110";
  const keys = FileKeyStore.forNetwork(network);
  const kf = keys.read(investor);
  if (!kf) throw new Error(`No key for ${investor} in ${keys.dir}`);
  const send = async (calls: FunctionCallSpec[]) => {
    const signed = await signDelegateAction({ accountId: investor, secretKey: kf.private_key, rpcUrl: d.rpcUrl, receiverId: d.contract, actions: calls });
    const r = await relay(relayerUrl, signed);
    return { ...r, mode: signed.startsWith("tx:") ? "signed transaction" : "gasless delegate" };
  };
  say(`contract ${d.contract} · investor ${investor} (${yoctoToNearString(await fc.client.getBalance(investor), 2)} NEAR) · fund ${fund}`);

  if (!has("skip-fill")) {
    const before = BigInt(await fc.coinBalance(fund, investor));
    const sub = await send([fundsCalls.subscribe(fund, near)]);
    const orderId = String((sub.outcome as { returnValue?: unknown } | null)?.returnValue ?? "");
    say(`subscribe ${yoctoToNearString(near, 2)} NEAR → order ${orderId || "?"} (${sub.mode}, tx ${sub.txHash})`);
    const fundView = (await fc.fund(fund)) as Record<string, unknown> | null;
    say(`queued; NAV now $${(Number(fundView?.nav_micro_usd ?? fundView?.nav ?? 0) / 1e6).toFixed(4)}; waiting up to ${waitMin} min for the next NAV post…`);
    const deadline = Date.now() + waitMin * 60_000;
    let filled = false;
    while (Date.now() < deadline) {
      const orders = await fc.orders(investor).catch(() => []);
      const stillQueued = orders.some((o) => String(o.id) === orderId);
      const now = BigInt(await fc.coinBalance(fund, investor));
      if (!stillQueued && now > before) {
        const cfg = await fc.config().catch(() => ({}) as Record<string, unknown>);
        say(`FILLED at the NAV post (last bell ${String(cfg.last_nav_bell ?? cfg.bell ?? "?")}): +${coinsToNumber(now - before).toFixed(6)} coins`);
        filled = true;
        break;
      }
      await sleep(10_000);
    }
    if (!filled) {
      say(`NOT filled within ${waitMin} min: is services/nav posting (curl localhost:4700/health)? The order stays queued and fills at the next post.`);
      process.exitCode = 1;
    }
  }

  const p0 = await fc.pool(fund);
  if (!p0) throw new Error(`no pool for ${fund}`);
  const price0 = poolPriceUsd(p0, d.gameUsdPerNear);
  const buyNear = nearToYoctoBig(arg("swap-near", "0.5"));
  const q = quoteBuyCoin(p0, buyNear);
  const buy = await send([fundsCalls.buyCoin(fund, buyNear, withSlippageBps(q.out, 100))]);
  const p1 = await fc.pool(fund);
  const price1 = poolPriceUsd(p1 as NonNullable<typeof p1>, d.gameUsdPerNear);
  say(`pool buy ${yoctoToNearString(buyNear, 2)} NEAR (${buy.mode}, tx ${buy.txHash}): coin $${price0?.toFixed(4)} → $${price1?.toFixed(4)}`);
  if (!(price0 !== null && price1 !== null && price1 > price0)) {
    say("FAIL: the pool buy did not move the coin price up");
    process.exitCode = 1;
  }
  const held = BigInt(await fc.coinBalance(fund, investor));
  const sellCoins = held / 4n;
  if (sellCoins > 0n) {
    const qs = quoteSellCoin(p1 as NonNullable<typeof p1>, sellCoins);
    const sell = await send([fundsCalls.sellCoin(fund, sellCoins, withSlippageBps(qs.out, 100))]);
    const p2 = await fc.pool(fund);
    const price2 = poolPriceUsd(p2 as NonNullable<typeof p2>, d.gameUsdPerNear);
    say(`pool sell ${coinsToNumber(sellCoins).toFixed(4)} coins (${sell.mode}, tx ${sell.txHash}): coin $${price1?.toFixed(4)} → $${price2?.toFixed(4)}`);
    if (!(price2 !== null && price1 !== null && price2 < price1)) {
      say("FAIL: the pool sell did not move the coin price down");
      process.exitCode = 1;
    }
  }
  say(process.exitCode ? "done with failures" : "all checks passed");
}

main().catch((err) => {
  console.error(`[verify] failed: ${(err as Error).message}`);
  process.exit(1);
});
