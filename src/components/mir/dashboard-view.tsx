"use client";

import {
  Activity, Cpu, MemoryStick, Server, AlertTriangle, Zap, Terminal,
  Play, Square, RotateCw, FolderGit2,
} from "lucide-react";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMir } from "@/store/mir-store";
import { StatusDot } from "./status-badge";
import { formatCpu, formatMemory, formatUptime } from "./format";

export function DashboardView() {
  const { projects, services, startService, stopService, restartService, setView, setActiveProject } = useMir();

  const stats = useMemo(() => {
    const running = services.filter((s) => s.status === "running");
    const errored = services.filter((s) => s.status === "error");
    const starting = services.filter((s) => s.status === "starting");
    const totalCpu = running.reduce((sum, s) => sum + (s.cpu ?? 0), 0);
    const totalMem = running.reduce((sum, s) => sum + (s.memory ?? 0), 0);
    return {
      total: services.length,
      running: running.length,
      errored: errored.length,
      starting: starting.length,
      totalCpu,
      totalMem,
      projects: projects.length,
    };
  }, [services, projects]);

  const runningServices = services.filter((s) => s.status === "running" || s.status === "starting");

  return (
    <div className="space-y-4 p-4">
      {/* Stat row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <StatCard
          icon={Server}
          label="Running"
          value={stats.running.toString()}
          subtext={`${stats.total} total services`}
          tone="running"
        />
        <StatCard
          icon={AlertTriangle}
          label="Errors"
          value={stats.errored.toString()}
          subtext={stats.errored > 0 ? "needs attention" : "all good"}
          tone={stats.errored > 0 ? "error" : "idle"}
        />
        <StatCard
          icon={Zap}
          label="Starting"
          value={stats.starting.toString()}
          subtext="booting up"
          tone="starting"
        />
        <StatCard
          icon={FolderGit2}
          label="Projects"
          value={stats.projects.toString()}
          subtext="registered"
          tone="idle"
        />
        <StatCard
          icon={Cpu}
          label="Total CPU"
          value={formatCpu(stats.totalCpu)}
          subtext="aggregate"
          tone="running"
        />
        <StatCard
          icon={MemoryStick}
          label="Total Memory"
          value={formatMemory(stats.totalMem)}
          subtext="aggregate"
          tone="running"
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Active services */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity className="h-4 w-4 text-status-running" />
                Active Services
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setView("projects")}
              >
                View all →
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {runningServices.length === 0 ? (
              <EmptyState
                icon={Terminal}
                title="No services running"
                description="Start a service to see live telemetry, logs, and resource usage here."
                action={
                  <Button size="sm" onClick={() => setView("projects")} className="gap-1.5">
                    <Play className="h-3.5 w-3.5" /> Go to Projects
                  </Button>
                }
              />
            ) : (
              <div className="divide-y divide-border">
                {runningServices.map((svc) => {
                  const project = projects.find((p) => p.id === svc.projectId);
                  return (
                    <div key={svc.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                      <StatusDot status={svc.status} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{svc.name}</span>
                          {svc.port && (
                            <Badge variant="outline" className="font-mono text-[10px] h-4">:{svc.port}</Badge>
                          )}
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">{project?.name}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
                          <span>pid {svc.pid ?? "—"}</span>
                          <span>↑ {formatUptime(svc.startedAt)}</span>
                          <span className="truncate">{svc.cwd} $ {svc.command}</span>
                        </div>
                      </div>
                      <div className="hidden md:flex items-center gap-4 w-48">
                        <ResourceMeter label="CPU" value={svc.cpu ?? 0} max={100} suffix="%" tone="running" />
                        <ResourceMeter label="MEM" value={svc.memory ?? 0} max={500} suffix="MB" tone="starting" />
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => restartService(svc.id)}
                          title="Restart"
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 hover:text-status-error"
                          onClick={() => stopService(svc.id)}
                          title="Stop"
                        >
                          <Square className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Project summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FolderGit2 className="h-4 w-4" />
              Projects
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {projects.map((proj) => {
              const projServices = services.filter((s) => s.projectId === proj.id);
              const running = projServices.filter((s) => s.status === "running").length;
              const errored = projServices.filter((s) => s.status === "error").length;
              return (
                <button
                  key={proj.id}
                  onClick={() => { setActiveProject(proj.id); setView("projects"); }}
                  className="group flex w-full items-center gap-3 rounded-md border border-border p-3 text-left hover:border-primary/40 hover:bg-muted/40 transition-colors"
                >
                  <span className="text-xl">{proj.icon ?? "📁"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{proj.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground truncate">{proj.rootPath}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5 text-xs">
                      <StatusDot status={errored > 0 ? "error" : running > 0 ? "running" : "idle"} />
                      <span className="font-mono text-muted-foreground">
                        {running}/{projServices.length}
                      </span>
                    </div>
                    {errored > 0 && (
                      <span className="text-[10px] text-status-error">{errored} error{errored > 1 ? "s" : ""}</span>
                    )}
                  </div>
                </button>
              );
            })}
            {projects.length === 0 && (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No projects yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, subtext, tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  subtext: string;
  tone: "running" | "error" | "starting" | "idle";
}) {
  const toneClasses = {
    running: "text-status-running bg-status-running/10",
    error:   "text-status-error bg-status-error/10",
    starting:"text-status-starting bg-status-starting/10",
    idle:    "text-muted-foreground bg-muted",
  }[tone];

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <div className={`flex h-7 w-7 items-center justify-center rounded ${toneClasses}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
        <div className="mt-2 font-mono text-2xl font-semibold tracking-tight">{value}</div>
        <div className="text-[10px] text-muted-foreground">{subtext}</div>
      </CardContent>
    </Card>
  );
}

function ResourceMeter({
  label, value, max, suffix, tone,
}: {
  label: string;
  value: number;
  max: number;
  suffix: string;
  tone: "running" | "starting" | "error";
}) {
  const pct = Math.min(100, (value / max) * 100);
  const colorClass = {
    running: "bg-status-running",
    starting: "bg-status-starting",
    error: "bg-status-error",
  }[tone];
  return (
    <div className="flex-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono">{value.toFixed(value < 10 ? 1 : 0)}{suffix}</span>
      </div>
      <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${colorClass} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon, title, description, action,
}: {
  icon: typeof Terminal;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-3 text-sm font-medium">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground max-w-sm">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
