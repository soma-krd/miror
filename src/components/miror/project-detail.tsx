"use client";

import { useEffect, useState } from "react";
import {
  Plus, Play, Square, RotateCw, Edit3, Trash2, Terminal,
  Cpu, MemoryStick, Clock, Hash, ChevronDown, ArrowDown, Settings2, ArrowLeft,
  Container, FileJson, RefreshCw, Code2, FolderOpen, FlaskConical,
  KeyRound, Filter, Zap, BookTemplate,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Service, ServiceStatus } from "@/lib/types";
import { useMiror } from "@/store/miror-store";
import { useSettings } from "@/store/settings-store";
import { backend } from "@/lib/backend-client";
import { StatusBadge, StatusDot } from "./status-badge";
import { ServiceForm } from "./service-form";
import { EnvManager } from "./env-manager";
import { GitPanel } from "./git-panel";
import { ServiceTemplates } from "./service-templates";
import { formatCpu, formatMemory, formatUptime, formatCumulativeUptime, formatDuration } from "./format";
import { cn } from "@/lib/utils";

const STATUS_FILTERS: { id: ServiceStatus | "all"; label: string }[] = [
  { id: "all",     label: "All" },
  { id: "running", label: "Running" },
  { id: "idle",    label: "Idle" },
  { id: "error",   label: "Error" },
];

export function ProjectDetail({ projectId }: { projectId: string }) {
  const settings = useSettings();
  const {
    projects, services, startService, stopService, killService, restartService,
    updateService, deleteService, setActiveService, setView, setActiveProject,
    startAllInProject, stopAllInProject, restartAllInProject,
    openInEditor, exportMirorJson, importMirorJson,
  } = useMiror();

  const project = projects.find((p) => p.id === projectId);
  const [isServiceFormOpen, setIsServiceFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [dockerInfo, setDockerInfo] = useState<{ exists: boolean; path: string; services: string[] } | null>(null);
  const [envProfile, setEnvProfile] = useState<string>("development");
  const [envManagerService, setEnvManagerService] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ServiceStatus | "all">("all");
  const [templatesOpen, setTemplatesOpen] = useState(false);

  // Fetch docker compose info when project changes
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const info = await backend.getDockerInfo(projectId);
        if (!cancelled) setDockerInfo(info);
      } catch (e) {
        console.warn("getDockerInfo failed:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  if (!project) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Project not found.
      </div>
    );
  }

  const projServices = services.filter((s) => s.projectId === projectId);
  const runningCount = projServices.filter((s) => s.status === "running").length;

  // Build dependency edges for visualization
  const edges: { from: string; to: string }[] = [];
  for (const svc of projServices) {
    for (const depId of svc.dependsOn) {
      if (projServices.find((s) => s.id === depId)) {
        edges.push({ from: depId, to: svc.id });
      }
    }
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setActiveProject(null)}
            title="Back to projects"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-2xl">
            {project.icon}
          </div>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              {project.name}
              <Badge variant="outline" className="text-[10px] h-4">
                {runningCount}/{projServices.length} running
              </Badge>
            </h1>
            <p className="font-mono text-xs text-muted-foreground">{project.rootPath}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5"
            onClick={() => startAllInProject(projectId)}
            disabled={runningCount === projServices.length}
          >
            <Play className="h-3.5 w-3.5 text-status-running" /> Start All
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5"
            onClick={() => stopAllInProject(projectId)}
            disabled={runningCount === 0}
          >
            <Square className="h-3.5 w-3.5 text-status-error" /> Stop All
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5"
            onClick={() => restartAllInProject(projectId)}
            disabled={runningCount === 0}
          >
            <RotateCw className="h-3.5 w-3.5 text-status-starting" /> Restart All
          </Button>
          <Button onClick={() => { setEditingService(null); setIsServiceFormOpen(true); }} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add Service
          </Button>
          <Button onClick={() => setTemplatesOpen(true)} variant="outline" className="gap-1.5">
            <BookTemplate className="h-4 w-4" /> Templates
          </Button>
        </div>
      </div>

      {/* Git Integration Panel */}
      <GitPanel projectId={projectId} />

      {/* Dependency graph */}
      {projServices.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Settings2 className="h-4 w-4" />
              Dependency Graph
              <span className="text-xs font-normal text-muted-foreground">
                · starts left → right
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DependencyGraph services={projServices} edges={edges} />
          </CardContent>
        </Card>
      )}

      {/* Project Tools — Docker, miror.json, env profile, editor integration */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {/* Docker Compose card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Container className="h-4 w-4" />
              Docker Compose
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            {dockerInfo?.exists ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-status-running border-status-running/30 text-[10px] h-4">
                    detected
                  </Badge>
                  <span className="font-mono text-[10px] text-muted-foreground truncate">
                    {dockerInfo.path.split("/").pop()}
                  </span>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Services ({dockerInfo.services.length})
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {dockerInfo.services.slice(0, 5).map((s) => (
                      <Badge key={s} variant="secondary" className="text-[10px] h-4 font-mono">{s}</Badge>
                    ))}
                    {dockerInfo.services.length > 5 && (
                      <span className="text-[10px] text-muted-foreground">+{dockerInfo.services.length - 5}</span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-muted-foreground">
                <div className="text-[11px]">No compose file found</div>
                <div className="font-mono text-[10px] mt-1">docker-compose.yml · compose.yml</div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* miror.json config card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileJson className="h-4 w-4" />
              miror.json
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            <p className="text-muted-foreground text-[11px]">
              Sync config with project root.
            </p>
            <div className="flex gap-1.5">
              <Button
                variant="outline" size="sm" className="h-7 gap-1 text-[11px] flex-1"
                onClick={() => exportMirorJson(projectId)}
              >
                <RefreshCw className="h-3 w-3" /> Export
              </Button>
              <Button
                variant="outline" size="sm" className="h-7 gap-1 text-[11px] flex-1"
                onClick={() => importMirorJson(projectId)}
              >
                <FileJson className="h-3 w-3" /> Import
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Environment Profile card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FlaskConical className="h-4 w-4" />
              Env Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            <p className="text-muted-foreground text-[11px]">
              Swap <code className="font-mono">.env</code> from profile source.
            </p>
            <Select value={envProfile} onValueChange={(v) => {
              setEnvProfile(v);
              backend.applyEnvProfile(projectId, v).catch(e =>
                console.warn("applyEnvProfile failed:", e)
              );
            }}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="development">development (.env)</SelectItem>
                <SelectItem value="testing">testing (.env.testing)</SelectItem>
                <SelectItem value="staging">staging (.env.staging)</SelectItem>
                <SelectItem value="custom">custom (no-op)</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Editor Integration card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Code2 className="h-4 w-4" />
              Open in Editor
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            <p className="text-muted-foreground text-[11px]">
              Launch at project root.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                variant="outline" size="sm" className="h-7 gap-1 text-[11px]"
                onClick={() => backend.openInEditor(
                  // Open at project root — synthesize a virtual "first service" call
                  // Actually we need to call openInEditor with a real service ID.
                  // The backend opens the project root via the service's project_id lookup,
                  // so any service in this project works. Pick the first one.
                  projServices[0]?.id ?? "", "vscode"
                ).catch(e => alert(`VS Code not available: ${e instanceof Error ? e.message : e}`))}
                disabled={projServices.length === 0}
              >
                <Code2 className="h-3 w-3" /> VS Code
              </Button>
              <Button
                variant="outline" size="sm" className="h-7 gap-1 text-[11px]"
                onClick={() => backend.openInEditor(projServices[0]?.id ?? "", "cursor")
                  .catch(e => alert(`Cursor not available: ${e instanceof Error ? e.message : e}`))}
                disabled={projServices.length === 0}
              >
                <Code2 className="h-3 w-3" /> Cursor
              </Button>
              <Button
                variant="outline" size="sm" className="h-7 gap-1 text-[11px] col-span-2"
                onClick={() => backend.openInEditor(projServices[0]?.id ?? "", "files")
                  .catch(e => alert(`File manager failed: ${e instanceof Error ? e.message : e}`))}
                disabled={projServices.length === 0}
              >
                <FolderOpen className="h-3 w-3" /> Reveal in Files
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status filter chips */}
      {projServices.length > 0 && (
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Filter:</span>
          <div className="flex items-center gap-1">
            {STATUS_FILTERS.map(f => {
              const count = f.id === "all"
                ? projServices.length
                : projServices.filter(s => s.status === f.id).length;
              const active = statusFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  {f.label}
                  <span className="ml-1 font-mono text-[10px] opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Services grid */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {projServices
          .filter(svc => statusFilter === "all" || svc.status === statusFilter)
          .map((svc) => (
          <ServiceCard
            key={svc.id}
            service={svc}
            allServices={projServices}
            compact={settings.compactDensity}
            onStart={() => startService(svc.id)}
            onStop={() => stopService(svc.id)}
            onRestart={() => restartService(svc.id)}
            onKill={() => killService(svc.id, true)}
            onEdit={() => { setEditingService(svc.id); setIsServiceFormOpen(true); }}
            onDelete={() => setDeleteTarget(svc.id)}
            onViewLogs={() => { setActiveService(svc.id); setView("logs"); }}
            onToggleAutoStart={(v) => updateService(svc.id, { autoStart: v })}
            onManageEnv={() => setEnvManagerService(svc.id)}
            confirmDelete={settings.confirmServiceDelete}
          />
        ))}
        {projServices.length === 0 && (
          <Card className="lg:col-span-2">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Terminal className="h-6 w-6" />
              </div>
              <h3 className="mt-3 font-medium">No services yet</h3>
              <p className="mt-1 text-xs text-muted-foreground text-center max-w-sm">
                Add your first service — frontend, backend, worker, database, anything that runs in a terminal.
              </p>
              <Button className="mt-4 gap-1.5"
                onClick={() => { setEditingService(null); setIsServiceFormOpen(true); }}
              >
                <Plus className="h-4 w-4" /> Add Service
              </Button>
            </CardContent>
          </Card>
        )}
        {projServices.length > 0 && projServices.filter(svc => statusFilter === "all" || svc.status === statusFilter).length === 0 && (
          <Card className="lg:col-span-2">
            <CardContent className="flex flex-col items-center justify-center py-8 text-xs text-muted-foreground">
              No services match the "{STATUS_FILTERS.find(f => f.id === statusFilter)?.label}" filter.
            </CardContent>
          </Card>
        )}
      </div>

      <ServiceForm
        open={isServiceFormOpen}
        onOpenChange={setIsServiceFormOpen}
        projectId={projectId}
        serviceId={editingService}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete service?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop the service if running and remove its configuration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-status-error text-white hover:bg-status-error/90"
              onClick={() => {
                if (deleteTarget) deleteService(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Env Manager modal */}
      <EnvManager
        open={envManagerService !== null}
        onOpenChange={(o) => !o && setEnvManagerService(null)}
        service={envManagerService ? services.find(s => s.id === envManagerService) ?? null : null}
      />

      {/* Service Templates modal */}
      <ServiceTemplates
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        projectId={projectId}
      />
    </div>
  );
}

// --- Service card -------------------------------------------------------

function ServiceCard({
  service, allServices, compact, onStart, onStop, onRestart, onKill, onEdit, onDelete, onViewLogs, onToggleAutoStart, onManageEnv, confirmDelete: _confirmDelete,
}: {
  service: Service;
  allServices: Service[];
  compact?: boolean;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onKill: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewLogs: () => void;
  onToggleAutoStart: (v: boolean) => void;
  onManageEnv: () => void;
  confirmDelete?: boolean;
}) {
  const deps = allServices.filter((s) => service.dependsOn.includes(s.id));
  const isRunning = service.status === "running" || service.status === "starting";
  const envCount = Object.keys(service.env).length;

  return (
    <Card className="group">
      <CardHeader className={cn(compact ? "pb-2" : "pb-3")}>
        <div className="flex items-start gap-3">
          <StatusDot status={service.status} className="mt-1.5" />
          <div className="flex-1 min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              {service.name}
              {service.port && (
                <Badge variant="outline" className="font-mono text-[10px] h-4">:{service.port}</Badge>
              )}
            </CardTitle>
            <div className="mt-1 font-mono text-[10px] text-muted-foreground truncate">
              <span className="text-muted-foreground/70">$</span>{" "}
              <span className="text-foreground/80">{service.command}</span>
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/70 truncate">
              {service.cwd} · {service.shell}
            </div>
          </div>
          <StatusBadge status={service.status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Runtime stats */}
        {isRunning && (
          <div className="grid grid-cols-4 gap-2 text-xs">
            <RuntimeStat icon={Hash} label="PID" value={service.pid?.toString() ?? "—"} />
            <RuntimeStat icon={Clock} label="Up" value={formatUptime(service.startedAt)} />
            <RuntimeStat icon={Cpu} label="CPU" value={formatCpu(service.cpu)} tone="running" />
            <RuntimeStat icon={MemoryStick} label="Mem" value={formatMemory(service.memory)} tone="starting" />
          </div>
        )}

        {/* Lifecycle stats (Feature 5) + Health probe (Feature 2) */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {/* Health probe indicator */}
          {service.healthProbe && service.healthProbe.type !== "none" && (
            <span className="flex items-center gap-1" title={`Health probe: ${service.healthProbe.type}`}>
              <StatusDot status={service.ready ? "running" : isRunning ? "starting" : "idle"} className="h-1.5 w-1.5" />
              <span>{service.ready ? "ready" : isRunning ? "probing" : "probe"}</span>
            </span>
          )}
          {/* Restart count */}
          {(service.restartCount ?? 0) > 0 && (
            <span className="flex items-center gap-1" title="Restart count">
              <RotateCw className="h-2.5 w-2.5" />
              <span className="font-mono">{service.restartCount} restart{(service.restartCount ?? 0) > 1 ? "s" : ""}</span>
            </span>
          )}
          {/* Total uptime */}
          {(service.totalUptimeMs ?? 0) > 0 && (
            <span className="flex items-center gap-1" title="Cumulative uptime">
              <Clock className="h-2.5 w-2.5" />
              <span className="font-mono">{formatCumulativeUptime(service.totalUptimeMs)} total</span>
            </span>
          )}
          {/* Last start duration */}
          {service.lastStartDurationMs != null && (
            <span className="flex items-center gap-1" title="Last startup time">
              <Zap className="h-2.5 w-2.5" />
              <span className="font-mono">start {formatDuration(service.lastStartDurationMs)}</span>
            </span>
          )}
        </div>

        {/* Dependencies */}
        {deps.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">depends on:</span>
            {deps.map((d) => (
              <span key={d.id} className="flex items-center gap-1">
                <StatusDot status={d.status} className="h-1.5 w-1.5" />
                <span className="text-muted-foreground">{d.name}</span>
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 border-t border-border pt-2">
          {!isRunning ? (
            <Button size="sm" className="gap-1.5 h-7" onClick={onStart}>
              <Play className="h-3 w-3" /> Start
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="gap-1.5 h-7 hover:text-status-error"
              onClick={onStop}
            >
              <Square className="h-3 w-3" /> Stop
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5 h-7" onClick={onRestart}
            disabled={service.status === "starting"}
          >
            <RotateCw className="h-3 w-3" /> Restart
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5 h-7" onClick={onViewLogs}>
            <Terminal className="h-3 w-3" /> Logs
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5 h-7" onClick={onManageEnv}
            title="Manage environment variables"
          >
            <KeyRound className="h-3 w-3" /> Env
            {envCount > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-3.5 px-1 text-[9px] font-mono">{envCount}</Badge>
            )}
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
              <Switch
                checked={service.autoStart}
                onCheckedChange={onToggleAutoStart}
                className="scale-75 origin-right"
              />
              auto
            </label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onKill} className="text-status-error">
                  <Square className="h-3.5 w-3.5" /> Force kill (SIGKILL)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="text-status-error">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RuntimeStat({
  icon: Icon, label, value, tone,
}: {
  icon: typeof Hash;
  label: string;
  value: string;
  tone?: "running" | "starting" | "error";
}) {
  const toneClass = tone
    ? { running: "text-status-running", starting: "text-status-starting", error: "text-status-error" }[tone]
    : "text-foreground";
  return (
    <div className="rounded-md bg-muted/40 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-2.5 w-2.5" /> {label}
      </div>
      <div className={cn("mt-0.5 font-mono text-xs", toneClass)}>{value}</div>
    </div>
  );
}

// --- Dependency graph (simple column-based layout) ---------------------

function DependencyGraph({
  services, edges,
}: {
  services: Service[];
  edges: { from: string; to: string }[];
}) {
  // Compute depth via topological sort — root services (no deps) at depth 0
  const depth = new Map<string, number>();
  const visit = (svcId: string, d: number): void => {
    const current = depth.get(svcId) ?? -1;
    if (d > current) depth.set(svcId, d);
    const children = edges.filter((e) => e.from === svcId).map((e) => e.to);
    for (const c of children) visit(c, d + 1);
  };
  for (const s of services) {
    if (s.dependsOn.length === 0) visit(s.id, 0);
  }
  // fallback for cycles / disconnected nodes
  for (const s of services) if (!depth.has(s.id)) depth.set(s.id, 0);

  const maxDepth = Math.max(...Array.from(depth.values()), 0);
  const columns: Service[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (const s of services) {
    const d = depth.get(s.id) ?? 0;
    columns[d].push(s);
  }

  if (services.length === 0) return null;

  return (
    <div className="flex items-stretch gap-6 overflow-x-auto miror-scroll pb-2">
      {columns.map((col, depth) => (
        <div key={depth} className="flex items-center gap-3">
          <div className="flex flex-col gap-2">
            {col.map((svc) => (
              <div
                key={svc.id}
                className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 min-w-[160px]"
              >
                <StatusDot status={svc.status} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{svc.name}</div>
                  {svc.port && (
                    <div className="font-mono text-[10px] text-muted-foreground">:{svc.port}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {depth < maxDepth && (
            <div className="flex flex-col items-center justify-center text-muted-foreground/50">
              <ArrowDown className="h-3 w-3 -rotate-90" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
