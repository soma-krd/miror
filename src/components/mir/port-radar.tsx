"use client";

import { useEffect, useState } from "react";
import {
  Radar, RefreshCw, Skull, AlertTriangle, CheckCircle2, X, Activity,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PortMapping, PortConflict, PortScanResult } from "@/lib/types";
import { backend } from "@/lib/backend-client";
import { cn } from "@/lib/utils";

// Port Conflict Radar — scans all listening ports on the system, cross-references
// with Mir's running services, and surfaces conflicts (2+ processes on same port).
// One-click kill for orphan processes holding ports Mir services need.

interface PortRadarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PortRadar({ open, onOpenChange }: PortRadarProps) {
  const [scan, setScan] = useState<PortScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [killTarget, setKillTarget] = useState<{ port: number; pid: number; name: string } | null>(null);
  const [filter, setFilter] = useState<"all" | "mir" | "system" | "conflicts">("all");

  const refresh = async () => {
    setLoading(true);
    try {
      const result = await backend.scanPorts();
      setScan(result);
    } catch (e) {
      console.warn("port scan failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  const handleKill = async () => {
    if (!killTarget) return;
    try {
      await backend.killPortHolder(killTarget.port, killTarget.pid);
      setTimeout(refresh, 500);
    } catch (e) {
      alert(`Failed to kill: ${e instanceof Error ? e.message : String(e)}`);
    }
    setKillTarget(null);
  };

  const filteredMappings = (scan?.mappings ?? []).filter(m => {
    if (filter === "mir") return m.serviceId;
    if (filter === "system") return !m.serviceId;
    if (filter === "conflicts") return scan?.conflicts.some(c => c.port === m.port);
    return true;
  });

  const mirCount = scan?.mappings.filter(m => m.serviceId).length ?? 0;
  const systemCount = scan?.mappings.length ?? 0 - mirCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radar className="h-4 w-4 text-status-running" />
            Port Conflict Radar
            {scan && (
              <span className="text-xs font-normal text-muted-foreground ml-2">
                {scan.mappings.length} ports · {scan.conflicts.length} conflicts
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <div className="flex items-center gap-1">
            {(["all", "mir", "system", "conflicts"] as const).map(f => {
              const count = f === "all" ? scan?.mappings.length
                : f === "mir" ? mirCount
                : f === "system" ? systemCount
                : scan?.conflicts.length;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors capitalize",
                    filter === f
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  {f === "mir" ? "Mir" : f}
                  {count !== undefined && count > 0 && (
                    <span className="ml-1 font-mono text-[10px] opacity-70">{count}</span>
                  )}
                </button>
              );
            })}
          </div>
          <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 text-xs" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} /> Refresh
          </Button>
        </div>

        {/* Conflicts banner */}
        {scan && scan.conflicts.length > 0 && (
          <div className="rounded-md border border-status-error/30 bg-status-error/5 p-2.5">
            <div className="flex items-center gap-2 text-xs font-medium text-status-error">
              <AlertTriangle className="h-3.5 w-3.5" />
              {scan.conflicts.length} port conflict{scan.conflicts.length > 1 ? "s" : ""} detected
            </div>
            <div className="mt-1.5 space-y-1">
              {scan.conflicts.map(c => (
                <div key={c.port} className="text-[11px] text-muted-foreground">
                  <span className="font-mono text-status-error">:{c.port}</span>
                  {" "}held by {c.holders.length} processes:
                  {" "}{c.holders.map(h => h.serviceName ?? h.processName).join(", ")}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Port list */}
        <div className="flex-1 overflow-y-auto mir-scroll -mx-2 px-2">
          {filteredMappings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-xs text-muted-foreground">
              {loading ? <RefreshCw className="h-6 w-6 animate-spin mb-2" /> : <CheckCircle2 className="h-6 w-6 text-status-running mb-2" />}
              {loading ? "Scanning ports…" : "No ports match the filter."}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredMappings.map((m, i) => (
                <PortRow
                  key={`${m.port}-${m.pid}-${i}`}
                  mapping={m}
                  conflict={scan?.conflicts.find(c => c.port === m.port)}
                  onKill={() => setKillTarget({ port: m.port, pid: m.pid, name: m.serviceName ?? m.processName })}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>

      <AlertDialog open={!!killTarget} onOpenChange={(o) => !o && setKillTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kill process holding port :{killTarget?.port}?</AlertDialogTitle>
            <AlertDialogDescription>
              This sends SIGTERM to PID {killTarget?.pid} ({killTarget?.name}), escalating to SIGKILL after 3 seconds.
              {killTarget?.name && scan?.mappings.find(m => m.pid === killTarget.pid)?.serviceId && (
                <span className="block mt-2 text-status-error">⚠ This is a Mir-managed service. Use the Stop button instead for graceful shutdown.</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-status-error text-white hover:bg-status-error/90"
              onClick={handleKill}
            >
              Kill process
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function PortRow({
  mapping, conflict, onKill,
}: {
  mapping: PortMapping;
  conflict?: PortConflict;
  onKill: () => void;
}) {
  const isMir = !!mapping.serviceId;
  const isConflict = !!conflict;

  return (
    <div className={cn(
      "group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40",
      isConflict && "bg-status-error/5 border border-status-error/20"
    )}>
      {/* Port */}
      <div className="flex h-10 w-16 shrink-0 flex-col items-center justify-center rounded font-mono">
        <span className={cn(
          "text-sm font-bold",
          isConflict ? "text-status-error" : isMir ? "text-status-running" : "text-foreground"
        )}>
          :{mapping.port}
        </span>
        <span className="text-[9px] uppercase text-muted-foreground">{mapping.protocol}</span>
      </div>

      {/* Process info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {isMir ? (
            <Badge variant="outline" className="text-status-running border-status-running/30 text-[9px] h-4">
              Mir
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground text-[9px] h-4">system</Badge>
          )}
          <span className="text-xs font-medium truncate">
            {mapping.serviceName ?? mapping.processName}
          </span>
          {isConflict && (
            <Badge variant="outline" className="text-status-error border-status-error/30 text-[9px] h-4">
              <AlertTriangle className="h-2 w-2 mr-0.5" /> conflict
            </Badge>
          )}
        </div>
        <div className="font-mono text-[10px] text-muted-foreground truncate">
          pid {mapping.pid} · {mapping.state} · {mapping.localAddress}
          {mapping.processCmd && !isMir && (
            <span className="text-muted-foreground/60"> · {mapping.processCmd.slice(0, 80)}</span>
          )}
        </div>
      </div>

      {/* Kill button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs opacity-0 group-hover:opacity-100 hover:text-status-error"
        onClick={onKill}
      >
        <Skull className="h-3 w-3" /> Kill
      </Button>
    </div>
  );
}
