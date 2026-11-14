"use client";

import * as RD from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CircleHelp, Coins, CornerDownLeft, ListChecks, Search, ShoppingCart, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { price } from "@/lib/funds/format";
import { useAssets, useFunds } from "@/lib/funds/queries";
import { useHotkey } from "@/lib/hooks/use-hotkey";
import { setUi, useUi } from "@/lib/ui-store";
import { ChangeChip } from "../ui/change-chip";
import { FundIdentity } from "../funds/fund-mark";
import { CompanyIdentity } from "../ui/company-mark";
import { Kbd } from "../ui/kbd";
import { LINE_ICONS } from "../ui/line-icons";
import { NAV as NAV_TYPES } from "../ui/transitions";
import { NAV, SETTINGS_NAV } from "./nav";

const groupCls =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-3";
const itemCls =
  "group flex h-11 cursor-pointer select-none items-center gap-3 rounded-control px-3 text-body-sm text-ink outline-none data-[selected=true]:bg-fill";

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const reduce = useReducedMotion();
  const [q, setQ] = useState("");
  const setOpen = (o: boolean) => {
    setUi({ paletteOpen: o });
    if (!o) setQ("");
  };

  useHotkey("mod+k", () => setUi({ paletteOpen: !open }));
  useHotkey("/", () => setUi({ paletteOpen: true }), !open);

  return (
    <RD.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <RD.Portal forceMount>
            <RD.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-[90] bg-ink/16"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
              />
            </RD.Overlay>
            <RD.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="fixed left-1/2 top-[12dvh] z-[91] w-[calc(100vw-32px)] max-w-xl overflow-hidden rounded-sheet bg-paper shadow-e3 outline-none"
                style={{ x: "-50%" }}
                initial={{ opacity: 0, scale: reduce ? 1 : 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: reduce ? 1 : 0.98 }}
                transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <RD.Title className="sr-only">Search or ask</RD.Title>
                <Palette q={q} setQ={setQ} close={() => setOpen(false)} />
              </motion.div>
            </RD.Content>
          </RD.Portal>
        )}
      </AnimatePresence>
    </RD.Root>
  );
}

function Palette({ q, setQ, close }: { q: string; setQ: (v: string) => void; close: () => void }) {
  const router = useRouter();
  const funds = useFunds();
  const assets = useAssets();
  const rows = useMemo(() => funds.data?.items ?? [], [funds.data]);
  const stocks = useMemo(() => (assets.data?.baskets ?? []).flatMap((b) => b.assets.map((a) => ({ ...a, basketLabel: b.label }))), [assets.data]);

  const go = (href: string, kind: "forward" | "lateral" = "forward") => {
    close();
    router.push(href, { transitionTypes: [...NAV_TYPES[kind]] });
  };

  return (
    <Command label="Search or ask" loop className="flex max-h-[min(560px,72dvh)] flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search className="size-5 shrink-0 text-ink-3" />
        <Command.Input
          autoFocus
          value={q}
          onValueChange={setQ}
          placeholder="Search funds, stocks, pages and actions…"
          className="h-14 min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-ink-3 focus-visible:outline-none"
        />
        <Kbd>Esc</Kbd>
      </div>
      <Command.List className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-2">
        <Command.Empty className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="flex size-14 items-center justify-center">{LINE_ICONS.search}</div>
          <div className="flex flex-col gap-1">
            <p className="text-title-sm font-semibold">No matches for &ldquo;{q}&rdquo;</p>
            <p className="text-body-sm text-ink-2">Try a fund like Atlas, a ticker like NVDA, or a page like Portfolio.</p>
          </div>
        </Command.Empty>

        {rows.length > 0 && (
          <Command.Group heading="Funds" className={groupCls}>
            {rows.map((f) => (
              <Command.Item key={f.id} value={`fund ${f.id} ${f.name} ${f.mandate} ${f.mandateLine}`} onSelect={() => go(`/app/f/${f.id}`)} className={itemCls}>
                <FundIdentity fund={f.id} name={f.name} sub={f.mandateLine} size="md" className="flex-1" />
                <span className="num text-label text-ink">{price(f.nav)}</span>
                <ChangeChip value={f.ret1d} size="sm" />
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {rows.length > 0 && (
          <Command.Group heading="Actions" className={groupCls}>
            <Action icon={ListChecks} label="Take the risk check" hint="Three questions, then a fund that fits" value="risk check profile start quiz recommend" onSelect={() => go("/app/start")} />
            {rows.map((f) => (
              <Action key={`buy-${f.id}`} icon={ShoppingCart} label={`Buy into ${f.name}`} hint="At the next NAV" value={`buy in subscribe invest ${f.id} ${f.name}`} onSelect={() => go(`/app/f/${f.id}?sheet=buy`)} />
            ))}
            {rows.map((f) => (
              <Action key={`coin-${f.id}`} icon={Coins} label={`Trade the ${f.name} coin`} value={`trade coin swap memecoin pool ${f.id} ${f.name}`} onSelect={() => go(`/app/f/${f.id}?sheet=trade`)} />
            ))}
          </Command.Group>
        )}

        {stocks.length > 0 && (
          <Command.Group heading="Stocks" className={groupCls}>
            {stocks.map((a) => (
              <Command.Item key={a.id} value={`stock ${a.id} ${a.name} ${a.basketLabel}`} onSelect={() => go(`/app/s/${encodeURIComponent(a.id)}`)} className={itemCls}>
                <CompanyIdentity ticker={a.id} name={a.name} size="sm" className="flex-1" />
                <span className="num text-label text-ink">{price(a.price)}</span>
                <ChangeChip value={a.change1d} size="sm" />
              </Command.Item>
            ))}
          </Command.Group>
        )}

        <Command.Group heading="Pages" className={groupCls}>
          {NAV.map((n) => (
            <Action key={n.href} icon={n.icon} label={n.label} hint={n.blurb} value={`page ${n.label} ${n.keywords ?? ""}`} onSelect={() => go(n.href, "lateral")} />
          ))}
          <Action
            icon={CircleHelp}
            label="How Drixie works"
            hint="What you can do, what the AI managers do, and every word explained"
            value="help guide how it works what can i do glossary nav premium discount rebalance bell churn reputation promise bond ai bill seat basket card"
            onSelect={() => go("/app/guide", "lateral")}
          />
          <Action icon={SETTINGS_NAV.icon} label="Settings" value="settings account device key sign out" onSelect={() => go(SETTINGS_NAV.href, "lateral")} />
        </Command.Group>
      </Command.List>
      <div className="hidden items-center justify-between border-t border-line px-4 py-2 text-caption text-ink-3 md:flex">
        <span className="flex items-center gap-2">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> to move
        </span>
        <span className="flex items-center gap-2">
          <Kbd>
            <CornerDownLeft className="size-3" />
          </Kbd>
          to open
        </span>
      </div>
    </Command>
  );
}

function Action({ icon: Icon, label, hint, value, onSelect }: { icon: LucideIcon; label: string; hint?: string; value: string; onSelect: () => void }) {
  return (
    <Command.Item value={value} onSelect={onSelect} className={itemCls}>
      <span className="flex size-7 items-center justify-center rounded-control bg-fill text-ink-2 group-data-[selected=true]:bg-paper">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="hidden max-w-[55%] shrink-0 truncate text-right text-caption text-ink-3 sm:inline">{hint}</span>}
    </Command.Item>
  );
}
