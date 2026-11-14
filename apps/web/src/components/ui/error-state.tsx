"use client";
import { RotateCw } from "lucide-react";
import { ApiError, UNREACHABLE_BODY, UNREACHABLE_TITLE } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { LINE_ICONS } from "./line-icons";

export function ErrorState({
  error,
  onRetry,
  retrying,
  className,
  compact,
}: {
  error?: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
  compact?: boolean;
}) {
  const api = error instanceof ApiError ? error : null;
  const unreachable = !api || api.isNetwork || api.status >= 500;
  const title = unreachable ? UNREACHABLE_TITLE : api?.isNotFound ? "We couldn't find that" : "That didn't load";
  const body = unreachable ? UNREACHABLE_BODY : (api?.message ?? UNREACHABLE_BODY);

  return (
    <div role="alert" className={cn("rise-in flex flex-col items-center justify-center gap-4 text-center", compact ? "px-6 py-10" : "px-6 py-16", className)}>
      <div className="flex size-16 items-center justify-center">{LINE_ICONS.offline}</div>
      <div className="flex max-w-80 flex-col gap-1">
        <h3 className="text-title-sm font-semibold tracking-[-0.01em]">{title}</h3>
        <p className="text-body-sm text-ink-2">{body}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} loading={retrying} loadingLabel="Retrying">
          <RotateCw className="size-4" />
          Retry
        </Button>
      )}
    </div>
  );
}
