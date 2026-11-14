"use client";
import * as Popover from "@radix-ui/react-popover";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { useConfig } from "@/lib/api/queries";
import { explorerUrl } from "@/lib/chain/tx";
import { cn } from "@/lib/cn";
import { CopyButton } from "./copy-button";

export function VerifyLink({ txHash, className, label = "Verify" }: { txHash: string | null | undefined; className?: string; label?: string }) {
  const { data: config } = useConfig();
  if (!txHash) return null;
  const href = explorerUrl(config, txHash);
  const cls = cn(
    "relative inline-flex min-h-11 items-center gap-1 rounded-chip text-caption font-medium text-brand underline-offset-4 hover:underline",

    "-mx-2 -my-3.5 px-2",
    className,
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {label}
        <ExternalLink className="size-3" aria-hidden />
      </a>
    );
  }
  return (
    <Popover.Root>
      <Popover.Trigger className={cls}>{label}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="pop-in z-[80] w-72 rounded-card bg-paper p-4 shadow-e2 outline-none"
        >
          <div className="flex items-center gap-2 text-label font-medium">
            <ShieldCheck className="size-4 text-up" aria-hidden />
            Recorded on {config?.network === "sandbox" ? "the local network" : "NEAR"}
          </div>
          <p className="mt-1 text-caption text-ink-2">
            {config?.network === "sandbox" ? "This network has no public explorer. Here's the transaction id:" : "Transaction id:"}
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-control bg-fill py-1 pl-3 pr-1">
            <code className="num min-w-0 flex-1 truncate text-caption">{txHash}</code>
            <CopyButton value={txHash} label="Copy transaction id" />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
