"use client";

import { cn } from "@/lib/utils";
import type { ServiceStatus } from "@/lib/types";

// Apple-style status indicators — small, subtle, no harsh glows.
// Inspired by macOS system status dots and Xcode's activity indicators.

const STATUS_META: Record<ServiceStatus, {
  label: string;
  dot: string;
  text: string;
  bg: string;
}> = {
  running:  { label: "Running",  dot: "bg-status-running",  text: "text-status-running",  bg: "bg-status-running/10" },
  starting: { label: "Starting", dot: "bg-status-starting", text: "text-status-starting", bg: "bg-status-starting/10" },
  error:    { label: "Error",    dot: "bg-status-error",    text: "text-status-error",    bg: "bg-status-error/10" },
  idle:     { label: "Idle",     dot: "bg-status-idle",     text: "text-status-idle",     bg: "bg-status-idle/10" },
  stopped:  { label: "Stopped",  dot: "bg-status-stopped",  text: "text-status-stopped",  bg: "bg-status-stopped/10" },
};

export function StatusDot({ status, className }: { status: ServiceStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 rounded-full",
        meta.dot,
        status === "starting" && "mir-pulse",
        className
      )}
      aria-label={meta.label}
    />
  );
}

export function StatusBadge({ status, className }: { status: ServiceStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none",
        meta.bg,
        meta.text,
        className
      )}
    >
      <StatusDot status={status} />
      {meta.label}
    </span>
  );
}

export { STATUS_META };
