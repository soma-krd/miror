"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Trash2, Copy, ArrowDownToLine, Filter, Search, Terminal, X, Brain,
  Container as ContainerIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { LogEntry, LogType } from "@/lib/types";
import { useMir } from "@/store/mir-store";
import { StatusDot } from "./status-badge";
import { formatTimestamp } from "./format";
import { LogIntelligence, type LogIssue } from "./log-intelligence";

const LOG_TYPE_COLORS: Record<LogType, string> = {
  stdout: "text-foreground/90",
  stderr: "text-status-error",
  system: "text-muted-foreground",
};

const LOG_TYPE_LABEL: Record<LogType, string> = {
  stdout: "OUT",
  stderr: "ERR",
  system: "SYS",
};

// Docker container info for the sidebar
interface DockerContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  isRunning: boolean;
}

export function LogsView() {
  const {
    logs, services, projects, activeServiceId, setActiveService,
    logFilter, setLogFilter, search, setSearch, clearLogs,
  } = useMir();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showIntelligence, setShowIntelligence] = useState(false);

  // Docker containers state
  const [dockerContainers, setDockerContainers] = useState<DockerContainerInfo[]>([]);
  const [dockerLogs, setDockerLogs] = useState<LogEntry[]>([]);
  const [dockerLoading, setDockerLoading] = useState(false);

  const isDockerActive = activeServiceId?.startsWith("docker:");

  // Fetch Docker containers on mount
  useEffect(() => {
    fetchDockerContainers();
    const interval = setInterval(fetchDockerContainers, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchDockerContainers = async () => {
    try {
      const res = await fetch("/api/docker/containers");
      if (res.ok) {
        const data = await res.json();
        setDockerContainers(data || []);
      }
    } catch { /* Docker not available */ }
  };

  // Fetch Docker container logs when selected
  useEffect(() => {
    if (!isDockerActive) {
      setDockerLogs([]);
      return;
    }
    const containerId = activeServiceId!.replace("docker:", "");
    setDockerLoading(true);
    fetch(`/api/docker/logs?containerId=${containerId}&tail=500`)
      .then(res => res.json())
      .then(data => {
        setDockerLogs(data.logs || []);
      })
      .catch(() => setDockerLogs([]))
      .finally(() => setDockerLoading(false));
  }, [activeServiceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build service name map for the intelligence panel
  const serviceNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of services) map.set(s.id, s.name);
    for (const c of dockerContainers) map.set(`docker:${c.id}`, c.name);
    return map;
  }, [services, dockerContainers]);

  // Combine Mir logs and Docker logs
  const allLogs = useMemo(() => {
    if (isDockerActive) return dockerLogs;
    return logs;
  }, [logs, dockerLogs, isDockerActive]);

  // Apply filters
  const filtered = useMemo(() => {
    let out = allLogs;
    if (activeServiceId && !isDockerActive) {
      out = out.filter((l) => l.serviceId === activeServiceId);
    }
    // Docker logs are already filtered by containerId from the API
    if (logFilter !== "all") out = out.filter((l) => l.type === logFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((l) => l.message.toLowerCase().includes(q));
    }
    return out;
  }, [allLogs, activeServiceId, logFilter, search, isDockerActive]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 22,
    overscan: 20,
  });

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && filtered.length > 0) {
      virtualizer.scrollToIndex(filtered.length - 1, { align: "end" });
    }
  }, [filtered.length, autoScroll, virtualizer]);

  // Track if user scrolled away from bottom
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    setAutoScroll(atBottom);
  };

  const handleCopy = () => {
    const text = filtered
      .map((l) => `[${formatTimestamp(l.timestamp)}] ${LOG_TYPE_LABEL[l.type]} ${l.message}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const activeService = activeServiceId ? services.find((s) => s.id === activeServiceId) : null;
  const activeProject = activeService ? projects.find((p) => p.id === activeService.projectId) : null;

  // Group services by project for the sidebar picker
  const servicesByProject = useMemo(() => {
    const map = new Map<string, typeof services>();
    for (const svc of services) {
      const list = map.get(svc.projectId) ?? [];
      list.push(svc);
      map.set(svc.projectId, list);
    }
    return map;
  }, [services]);

  return (
    <div className="flex h-full">
      {/* Service picker */}
      <div className="w-56 shrink-0 border-r border-border bg-card/30">
        <div className="border-b border-border px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Log Source
          </div>
        </div>
        <div className="overflow-y-auto mir-scroll p-2">
          <button
            onClick={() => setActiveService(null)}
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs",
              !activeServiceId
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50"
            )}
          >
            <Terminal className="h-3 w-3" />
            <span className="flex-1 text-left">All services</span>
            <span className="font-mono text-[10px]">{logs.length}</span>
          </button>
          {Array.from(servicesByProject.entries()).map(([projId, svcList]) => {
            const proj = projects.find((p) => p.id === projId);
            return (
              <div key={projId} className="mt-2">
                <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <span>{proj?.icon ?? "📁"}</span>
                  <span className="truncate">{proj?.name}</span>
                </div>
                {svcList.map((svc) => {
                  const count = logs.filter((l) => l.serviceId === svc.id).length;
                  return (
                    <button
                      key={svc.id}
                      onClick={() => setActiveService(svc.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs",
                        activeServiceId === svc.id
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/50"
                      )}
                    >
                      <StatusDot status={svc.status} className="h-1.5 w-1.5" />
                      <span className="flex-1 text-left truncate">{svc.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground/70">{count}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* Docker containers section */}
          {dockerContainers.length > 0 && (
            <div className="mt-3 border-t border-border/50 pt-2">
              <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <ContainerIcon className="h-3 w-3" strokeWidth={1.75} />
                <span>Docker Containers</span>
                <span className="font-mono text-muted-foreground/50 ml-auto">{dockerContainers.length}</span>
              </div>
              {dockerContainers.map(c => {
                const dockerId = `docker:${c.id}`;
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveService(dockerId)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs",
                      activeServiceId === dockerId
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50"
                    )}
                  >
                    <span className={cn(
                      "inline-block h-1.5 w-1.5 rounded-full shrink-0",
                      c.isRunning ? "bg-status-running" : "bg-status-idle"
                    )} />
                    <div className="flex-1 min-w-0 text-left">
                      <span className="truncate block">{c.name}</span>
                      <span className="font-mono text-[9px] text-muted-foreground/50 truncate block">{c.image}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Log viewer */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex h-10 items-center gap-2 border-b border-border px-3">
          <div className="flex items-center gap-2 text-sm">
            {isDockerActive ? (
              (() => {
                const container = dockerContainers.find(c => `docker:${c.id}` === activeServiceId);
                return container ? (
                  <>
                    <ContainerIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{container.name}</span>
                    <span className="text-xs text-muted-foreground">· Docker</span>
                  </>
                ) : null;
              })()
            ) : activeService ? (
              <>
                <StatusDot status={activeService.status} />
                <span className="font-medium">{activeService.name}</span>
                {activeProject && (
                  <span className="text-xs text-muted-foreground">
                    · {activeProject.icon} {activeProject.name}
                  </span>
                )}
              </>
            ) : (
              <>
                <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">All services</span>
              </>
            )}
          </div>

          <div className="ml-4 flex items-center gap-1">
            <Filter className="h-3 w-3 text-muted-foreground" />
            {(["all", "stdout", "stderr", "system"] as const).map((f) => (
              <Button
                key={f}
                variant={logFilter === f ? "secondary" : "ghost"}
                size="sm"
                className="h-6 px-2 text-[10px] font-mono"
                onClick={() => setLogFilter(f)}
              >
                {f.toUpperCase()}
              </Button>
            ))}
          </div>

          <div className="relative ml-2 w-48">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="filter…"
              className="h-7 pl-7 pr-7 font-mono text-xs"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1">
            <Badge variant="outline" className="h-5 font-mono text-[10px]">
              {filtered.length} lines
            </Badge>
            <Button
              variant={showIntelligence ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setShowIntelligence(!showIntelligence)}
              title="Toggle Log Intelligence panel"
            >
              <Brain className={cn("h-3 w-3", showIntelligence && "text-primary")} />
              AI
            </Button>
            <Button
              variant="ghost" size="sm" className="h-7 gap-1 text-xs"
              onClick={() => setAutoScroll(!autoScroll)}
              title={autoScroll ? "Auto-scroll on" : "Auto-scroll off"}
            >
              <ArrowDownToLine className={cn("h-3 w-3", autoScroll && "text-status-running")} />
              {autoScroll ? "live" : "paused"}
            </Button>
            <Button
              variant="ghost" size="sm" className="h-7 gap-1 text-xs"
              onClick={handleCopy}
              disabled={filtered.length === 0}
            >
              <Copy className="h-3 w-3" />
              {copied ? "copied!" : "copy"}
            </Button>
            <Button
              variant="ghost" size="sm" className="h-7 gap-1 text-xs hover:text-status-error"
              onClick={() => {
                if (isDockerActive) setDockerLogs([]);
                else clearLogs(activeServiceId ?? undefined);
              }}
              disabled={filtered.length === 0}
            >
              <Trash2 className="h-3 w-3" /> Clear
            </Button>
          </div>
        </div>

        {/* Virtualized log list */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="relative flex-1 overflow-y-auto mir-scroll bg-background font-mono text-xs"
          style={{ contain: "strict" }}
        >
          {filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              <Terminal className="h-10 w-10 mb-3 opacity-30" />
              <div className="text-sm">{dockerLoading ? "Loading Docker logs…" : "No logs yet"}</div>
              <div className="mt-1 text-xs">
                {isDockerActive
                  ? "This container has no recent logs."
                  : activeService
                    ? `Start "${activeService.name}" to see live output.`
                    : "Start a service to see aggregated logs."}
              </div>
            </div>
          ) : (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((vItem) => {
                const log = filtered[vItem.index];
                return (
                  <div
                    key={log.id}
                    data-index={vItem.index}
                    ref={virtualizer.measureElement}
                    className="log-line-enter absolute left-0 top-0 w-full px-3 py-0.5 flex items-start gap-3 hover:bg-muted/30"
                    style={{ transform: `translateY(${vItem.start}px)` }}
                  >
                    <span className="shrink-0 text-muted-foreground/60 text-[10px] tabular-nums">
                      {formatTimestamp(log.timestamp)}
                    </span>
                    <span className={cn(
                      "shrink-0 rounded px-1 text-[9px] font-bold",
                      log.type === "stderr" && "bg-status-error/20 text-status-error",
                      log.type === "stdout" && "bg-muted text-muted-foreground",
                      log.type === "system" && "bg-primary/15 text-primary",
                    )}>
                      {LOG_TYPE_LABEL[log.type]}
                    </span>
                    {!activeServiceId && (
                      <span className="shrink-0 text-[10px] text-muted-foreground/80 truncate max-w-[120px]">
                        {serviceNameMap.get(log.serviceId) ?? "—"}
                      </span>
                    )}
                    <span className={cn("flex-1 break-all whitespace-pre-wrap", LOG_TYPE_COLORS[log.type])}>
                      {log.message}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="flex h-6 items-center justify-between border-t border-border bg-card/30 px-3 text-[10px] text-muted-foreground font-mono">
          <div className="flex items-center gap-3">
            <span>{filtered.length} / {logs.length} lines</span>
            <span>·</span>
            <span>buffer cap: 4000</span>
            <span>·</span>
            <span>virtualized 22px/row</span>
          </div>
          <div className="flex items-center gap-1">
            <span className={cn("inline-block h-1.5 w-1.5 rounded-full", autoScroll ? "bg-status-running" : "bg-status-idle")} />
            {autoScroll ? "streaming" : "paused"}
          </div>
        </div>
      </div>

      {/* Log Intelligence panel (Feature 3) — toggleable right sidebar */}
      {showIntelligence && (
        <div className="w-72 shrink-0 border-l border-border bg-card/30">
          <LogIntelligence
            logs={logs}
            serviceNameMap={serviceNameMap}
            onIssueClick={(issue: LogIssue) => {
              // Navigate to the service that owns the issue
              setActiveService(issue.serviceId);
              // If it's a file reference, could open in editor — for now just log
              if (issue.fileRef) {
                console.log("File ref:", issue.fileRef);
              }
            }}
            className="h-full"
          />
        </div>
      )}
    </div>
  );
}
