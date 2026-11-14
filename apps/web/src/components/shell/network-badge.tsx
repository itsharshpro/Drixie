"use client";
import { useConfig } from "@/lib/api/queries";
import { cn } from "@/lib/cn";
import { Tooltip } from "../ui/tooltip";

const LABEL: Record<string, string> = { sandbox: "Local sandbox", testnet: "NEAR testnet", mainnet: "NEAR mainnet" };
const TIP: Record<string, string> = {
  sandbox: "A private NEAR chain on this machine. Nothing here is real money.",
  testnet: "NEAR's public test network. Tokens have no value.",
  mainnet: "NEAR mainnet. Real NEAR.",
};

export function NetworkBadge({ rail = false }: { rail?: boolean }) {
  const { data, isError } = useConfig();
  const label = data ? (LABEL[data.network] ?? data.network) : isError ? "Offline" : "Connecting…";
  const tip = data ? (TIP[data.network] ?? label) : isError ? "Can't reach Drixie right now." : "Checking the network…";
  const dot = (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full",
        data ? (data.network === "mainnet" ? "bg-up" : "bg-brand") : isError ? "bg-down" : "bg-ink-3",
      )}
      aria-hidden
    />
  );
  if (rail) {
    return (
      <Tooltip content={`${label} · ${tip}`} side="right">
        <span className="flex size-11 items-center justify-center" role="status" aria-label={`Network: ${label}`}>
          {dot}
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={tip} side="top">
      <span
        role="status"
        aria-label={`Network: ${label}`}
        className="inline-flex h-8 min-w-0 items-center gap-2 rounded-full bg-fill pl-2.5 pr-3 text-caption font-medium text-ink-2"
      >
        {dot}
        <span className="truncate">{label}</span>
      </span>
    </Tooltip>
  );
}
