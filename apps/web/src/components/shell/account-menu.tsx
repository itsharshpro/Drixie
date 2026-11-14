"use client";
import * as DM from "@radix-ui/react-dropdown-menu";
import { ArrowDownToLine, ArrowUpFromLine, CircleHelp, Copy, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useState } from "react";
import { toast } from "sonner";
import { useSession, useSignOut } from "@/lib/auth/session";
import { Button } from "../ui/button";
import { useWalletSheets } from "../wallet/wallet-sheets";
import { NAV as NAV_TYPES } from "../ui/transitions";
import { Avatar } from "./avatar";
import { ACCOUNT_HINT_KEY } from "./sidebar-script";

function AccountSkeleton() {
  return (
    <span
      aria-hidden
      className={[
        "skeleton inline-flex h-11 items-center overflow-hidden whitespace-nowrap rounded-full px-4 text-body-sm font-medium text-transparent",
        "[:root[data-acct]_&]:w-11 [:root[data-acct]_&]:px-0",
      ].join(" ")}
    >
      Sign in
    </span>
  );
}

const itemCls =
  "flex h-11 cursor-pointer select-none items-center gap-3 rounded-control px-3 text-body-sm text-ink outline-none data-[highlighted]:bg-fill";

export function AccountMenu() {
  const s = useSession();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const wallet = useWalletSheets();

  useLayoutEffect(() => () => setOpen(false), []);

  const hint = s.status === "loading" || s.status === "error" ? null : !s.me ? "out" : s.accountId ? "acct" : "in";
  useEffect(() => {
    if (hint === null) return;
    try {
      localStorage.setItem(ACCOUNT_HINT_KEY, hint);
      document.documentElement.toggleAttribute("data-acct", false);
      if (hint !== "out") document.documentElement.setAttribute("data-acct", hint);
    } catch {

    }
  }, [hint]);

  if (s.status === "loading") return <AccountSkeleton />;
  if (!s.me) {
    return (
      <Button asChild pill className="px-5">
        <Link href="/signin" transitionTypes={NAV_TYPES.forward}>
          Sign in
        </Link>
      </Button>
    );
  }
  const name = s.me.handle ?? s.me.email ?? "You";

  return (
    <>
    <DM.Root open={open} onOpenChange={setOpen}>
      <DM.Trigger
        className="relative inline-flex size-11 items-center justify-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        aria-label="Account menu"
      >
        <Avatar name={name} size={32} />
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={8} collisionPadding={12} className="pop-in z-[80] w-72 rounded-card bg-paper p-2 shadow-e2">
          <div className="flex items-center gap-3 px-3 pb-3 pt-2">
            <Avatar name={name} size={40} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-body-sm font-semibold text-ink">{name}</div>
              <div className="num truncate text-caption text-ink-3" title={s.accountId ?? undefined}>
                {s.accountId ?? "Account not set up yet"}
              </div>
            </div>
          </div>
          <DM.Separator className="mx-1 my-1 h-px bg-line" />
          {s.accountId ? (
            <DM.Item
              className={itemCls}
              onSelect={async () => {
                try {
                  await navigator.clipboard.writeText(s.accountId as string);
                  toast.success("Account id copied");
                } catch {
                  toast.error("Couldn't copy. Select the id in Settings instead.");
                }
              }}
            >
              <Copy className="size-4 text-ink-2" /> Copy account id
            </DM.Item>
          ) : null}
          {s.accountId ? (
            <>
              <DM.Item className={itemCls} onSelect={() => wallet.open("add")}>
                <ArrowDownToLine className="size-4 text-ink-2" /> Add funds
              </DM.Item>
              <DM.Item className={itemCls} onSelect={() => wallet.open("withdraw")}>
                <ArrowUpFromLine className="size-4 text-ink-2" /> Withdraw
              </DM.Item>
            </>
          ) : (
            <DM.Item asChild className={itemCls}>
              <Link href="/signin?next=%2Fapp" transitionTypes={NAV_TYPES.forward}>
                <span className="flex size-4 items-center justify-center" aria-hidden>
                  <span className="size-2 rounded-full bg-brand" />
                </span>
                Finish setting up
              </Link>
            </DM.Item>
          )}
          <DM.Item asChild className={itemCls}>
            <Link href="/app/guide" transitionTypes={NAV_TYPES.lateral}>
              <CircleHelp className="size-4 text-ink-2" /> How Drixie works
            </Link>
          </DM.Item>
          <DM.Item asChild className={itemCls}>
            <Link href="/app/settings" transitionTypes={NAV_TYPES.lateral}>
              <Settings className="size-4 text-ink-2" /> Settings
            </Link>
          </DM.Item>
          <DM.Separator className="mx-1 my-1 h-px bg-line" />
          <DM.Item className={itemCls} onSelect={() => void signOut()}>
            <LogOut className="size-4 text-ink-2" /> Sign out
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
    {wallet.node}
    </>
  );
}
