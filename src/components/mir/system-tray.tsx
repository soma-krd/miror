"use client";

import { useEffect, useState } from "react";
import { useMir } from "@/store/mir-store";
import { cn } from "@/lib/utils";

// System-tray-like indicator that lives in the bottom-right corner.
// Mimics the macOS menu bar / Windows system tray quick-access widget:
//  - shows running service count
//  - surfaces unread crash notifications
//  - one-click quick actions (start/stop all in active project)
export function SystemTray() {
  const { services, notifications, activeProjectId, startAllInProject, stopAllInProject } = useMir();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  // tick for uptime display
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const runningCount = services.filter((s) => s.status === "running").length;
  const errorCount = services.filter((s) => s.status === "error").length;
  const unreadNotifs = notifications.filter((n) => !n.read);

  return (
    <div className="fixed bottom-3 right-3 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="w-72 rounded-lg border border-border bg-card/95 backdrop-blur shadow-xl">
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Mir Tray</span>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground text-xs"
                aria-label="Close"
              >×</button>
            </div>
          </div>

          <div className="px-3 py-2 space-y-2">
            <div className="grid grid-cols-3 gap-2 text-center">
              <TrayStat label="Running" value={runningCount} tone="running" />
              <TrayStat label="Errors" value={errorCount} tone={errorCount > 0 ? "error" : "idle"} />
              <TrayStat label="Total" value={services.length} tone="idle" />
            </div>

            {activeProjectId && (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => startAllInProject(activeProjectId)}
                  className="flex-1 rounded-md bg-status-running/10 px-2 py-1.5 text-xs text-status-running hover:bg-status-running/20"
                >
                  Start all
                </button>
                <button
                  onClick={() => stopAllInProject(activeProjectId)}
                  className="flex-1 rounded-md bg-status-error/10 px-2 py-1.5 text-xs text-status-error hover:bg-status-error/20"
                >
                  Stop all
                </button>
              </div>
            )}

            {unreadNotifs.length > 0 && (
              <div className="pt-2 border-t border-border">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Recent alerts
                </div>
                {unreadNotifs.slice(0, 3).map((n) => (
                  <div key={n.id} className="text-xs text-status-error py-0.5">
                    · {n.serviceName}: {n.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 rounded-full border border-border bg-card/90 backdrop-blur px-3 py-1.5 shadow-lg transition-all hover:scale-105",
          errorCount > 0 && "border-status-error/40"
        )}
        aria-label="Mir tray"
      >
        <span className={cn(
          "inline-block h-2 w-2 rounded-full",
          errorCount > 0 ? "bg-status-error" : runningCount > 0 ? "bg-status-running shadow-[0_0_6px_var(--status-running)]" : "bg-status-idle"
        )} />
        <span className="font-mono text-[11px] text-foreground/90">
          {runningCount} up
          {errorCount > 0 && <span className="text-status-error"> · {errorCount} err</span>}
        </span>
      </button>
    </div>
  );
}

function TrayStat({ label, value, tone }: { label: string; value: number; tone: "running" | "error" | "idle" }) {
  const toneClass = {
    running: "text-status-running",
    error:   "text-status-error",
    idle:    "text-muted-foreground",
  }[tone];
  return (
    <div className="rounded-md bg-muted/40 py-1.5">
      <div className={cn("font-mono text-base font-semibold", toneClass)}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
