"use client";

import { useEffect, useRef, useState } from "react";
import {
  Play, Square, RotateCw, ChevronDown, ChevronRight, Power, ExternalLink,
  Activity, Bell, X,
} from "lucide-react";
import { useMir } from "@/store/mir-store";
import { backend } from "@/lib/backend-client";
import { StatusDot, StatusBadge } from "./status-badge";
import { cn } from "@/lib/utils";
import { formatUptime } from "./format";

// Tray popup — a compact 380×520 window that lives near the system tray.
//
// It shows:
//   - Header with running count + quit button
//   - Per-project collapsible list of services
//   - Each service row: status dot, name, port, quick action buttons
//   - Click service name → opens main window focused on that service
//
// In the Tauri build, this renders inside a borderless always-on-top window.
// In the sandbox browser, it renders in a regular tab for testing.

export function TrayPopup() {
  const {
    projects, services, notifications, activeProjectId,
    refreshProjects, refreshServices, refreshLogs,
    startService, stopService, restartService,
    setActiveProject, setActiveService, setView,
    _initWs,
  } = useMir();

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [userToggled, setUserToggled] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  // Load on mount + connect WS
  useEffect(() => {
    _initWs();
    refreshProjects();
    refreshServices();
    refreshLogs();
  }, [_initWs, refreshProjects, refreshServices, refreshLogs]);

  // Poll services every 2s (WS may not be reliable in popup)
  useEffect(() => {
    const t = setInterval(refreshServices, 2000);
    return () => clearInterval(t);
  }, [refreshServices]);

  // Compute the effective expanded set:
  // - If the user has manually toggled, use their state
  // - Otherwise, auto-expand projects that have running/error services,
  //   or fall back to expanding all projects
  const effectiveExpanded = new Set(expandedProjects);
  if (!userToggled && projects.length > 0) {
    const running = new Set<string>();
    for (const svc of services) {
      if (svc.status === "running" || svc.status === "error") {
        running.add(svc.projectId);
      }
    }
    if (running.size > 0) {
      for (const id of running) effectiveExpanded.add(id);
    } else {
      for (const p of projects) effectiveExpanded.add(p.id);
    }
  }

  // Close/hide the popup window (Tauri) or no-op (browser)
  const handleClose = () => {
    if (typeof window !== "undefined" && (window as any).__TAURI__) {
      (window as any).__TAURI__.core.invoke("hide_tray_popup").catch(() => {});
    }
  };

  // Click outside to close (in Tauri, calls hide_tray_popup)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    // Only attach if we're in a tray popup window (not the main browser tab)
    const isTray = typeof window !== "undefined" &&
      (window.location.search.includes("tray=1") || (window as any).__TAURI_INTERNALS__);
    if (isTray) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, []);

  const handleQuit = () => {
    if (typeof window !== "undefined" && (window as any).__TAURI__) {
      (window as any).__TAURI__.core.invoke("quit_app").catch(() => {});
    }
  };

  const handleOpenMain = (projectId?: string, serviceId?: string) => {
    if (projectId) {
      setActiveProject(projectId);
      if (serviceId) {
        setActiveService(serviceId);
        setView("logs");
      } else {
        setView("projects");
      }
    }
    // In Tauri, show the main window
    if (typeof window !== "undefined" && (window as any).__TAURI__) {
      (window as any).__TAURI__.core.invoke("show_main_window").catch(() => {});
    }
  };

  const toggleProject = (id: string) => {
    setUserToggled(true);
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runningCount = services.filter(s => s.status === "running").length;
  const errorCount = services.filter(s => s.status === "error").length;
  const startingCount = services.filter(s => s.status === "starting").length;
  const unreadNotifs = notifications.filter(n => !n.read).length;

  return (
    <div
      ref={popupRef}
      className="flex h-screen w-screen flex-col overflow-hidden rounded-xl border border-border bg-card/95 backdrop-blur shadow-2xl"
      style={{ fontFamily: "var(--font-geist-sans)" }}
    >
      {/* Header */}
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-sidebar px-3">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-status-running/15">
          <Activity className="h-3.5 w-3.5 text-status-running" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold leading-none">Mir</div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <StatusDot status="running" className="h-1.5 w-1.5" />
              {runningCount} running
            </span>
            {startingCount > 0 && (
              <span className="flex items-center gap-1">
                <StatusDot status="starting" className="h-1.5 w-1.5" />
                {startingCount} starting
              </span>
            )}
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-status-error">
                <StatusDot status="error" className="h-1.5 w-1.5" />
                {errorCount} error
              </span>
            )}
          </div>
        </div>

        {/* Notifications toggle */}
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="relative flex h-7 w-7 items-center justify-center rounded hover:bg-sidebar-accent"
          aria-label="Notifications"
          title={`${unreadNotifs} unread notifications`}
        >
          <Bell className="h-3.5 w-3.5" />
          {unreadNotifs > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-status-error text-[9px] font-bold text-white">
              {unreadNotifs}
            </span>
          )}
        </button>

        {/* Open main window */}
        <button
          onClick={() => handleOpenMain()}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-sidebar-accent"
          aria-label="Open Mir"
          title="Open main window"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>

        {/* Quit */}
        <button
          onClick={handleQuit}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-status-error/15 hover:text-status-error"
          aria-label="Quit Mir"
          title="Quit Mir"
        >
          <Power className="h-3.5 w-3.5" />
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto mir-scroll">
        {showNotifications ? (
          <NotificationsPanel notifications={notifications} onBack={() => setShowNotifications(false)} />
        ) : projects.length === 0 ? (
          <EmptyState onOpenMain={() => handleOpenMain()} />
        ) : (
          <div className="py-1">
            {projects.map(project => {
              const projServices = services.filter(s => s.projectId === project.id);
              const projRunning = projServices.filter(s => s.status === "running").length;
              const projError = projServices.filter(s => s.status === "error").length;
              const expanded = effectiveExpanded.has(project.id);

              return (
                <div key={project.id} className="mb-0.5">
                  {/* Project header */}
                  <button
                    onClick={() => toggleProject(project.id)}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/50"
                  >
                    {expanded
                      ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                    <span className="text-sm">{project.icon ?? "📁"}</span>
                    <span className="flex-1 truncate text-xs font-medium">{project.name}</span>
                    <div className="flex items-center gap-1 text-[10px]">
                      {projError > 0 && (
                        <span className="rounded-sm bg-status-error/15 px-1 text-status-error">{projError}!</span>
                      )}
                      <span className={cn(
                        "font-mono",
                        projRunning > 0 ? "text-status-running" : "text-muted-foreground"
                      )}>
                        {projRunning}/{projServices.length}
                      </span>
                    </div>
                  </button>

                  {/* Services list */}
                  {expanded && (
                    <div className="border-l border-border ml-3 pl-1">
                      {projServices.map(svc => (
                        <ServiceRow
                          key={svc.id}
                          service={svc}
                          onStart={() => startService(svc.id)}
                          onStop={() => stopService(svc.id)}
                          onRestart={() => restartService(svc.id)}
                          onClick={() => handleOpenMain(project.id, svc.id)}
                        />
                      ))}
                      {projServices.length === 0 && (
                        <div className="px-2 py-1 text-[10px] italic text-muted-foreground">
                          No services
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border bg-sidebar px-3 text-[10px] text-muted-foreground">
        <span className="font-mono">v1.0.0</span>
        <span className="flex items-center gap-1">
          <span className={cn(
            "inline-block h-1.5 w-1.5 rounded-full",
            runningCount > 0 ? "bg-status-running shadow-[0_0_4px_var(--status-running)]" : "bg-status-idle"
          )} />
          {runningCount > 0 ? "live" : "idle"}
        </span>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Service row — one line per service with quick actions
// ---------------------------------------------------------------------------

function ServiceRow({
  service, onStart, onStop, onRestart, onClick,
}: {
  service: import("@/lib/types").Service;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onClick: () => void;
}) {
  const isRunning = service.status === "running" || service.status === "starting";

  return (
    <div className="group flex items-center gap-1.5 px-2 py-1 hover:bg-muted/40 rounded-sm">
      <StatusDot status={service.status} className="h-1.5 w-1.5 shrink-0" />

      {/* Name + port — click to open main window */}
      <button
        onClick={onClick}
        className="flex-1 min-w-0 text-left"
        title={`Open ${service.name} in main window`}
      >
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium truncate">{service.name}</span>
          {service.port && (
            <span className="font-mono text-[9px] text-muted-foreground">:{service.port}</span>
          )}
        </div>
        {isRunning && (
          <div className="font-mono text-[9px] text-muted-foreground/70">
            pid {service.pid ?? "—"} · ↑ {formatUptime(service.startedAt)}
          </div>
        )}
      </button>

      {/* Quick actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {isRunning ? (
          <button
            onClick={(e) => { e.stopPropagation(); onStop(); }}
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-status-error/20 hover:text-status-error"
            title="Stop"
          >
            <Square className="h-2.5 w-2.5" />
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onStart(); }}
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-status-running/20 hover:text-status-running"
            title="Start"
          >
            <Play className="h-2.5 w-2.5" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRestart(); }}
          className="flex h-5 w-5 items-center justify-center rounded hover:bg-status-starting/20 hover:text-status-starting"
          title="Restart"
        >
          <RotateCw className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notifications panel — shown when bell icon is clicked
// ---------------------------------------------------------------------------

function NotificationsPanel({
  notifications, onBack,
}: {
  notifications: ReturnType<typeof useMir.getState>["notifications"];
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ← Back
        </button>
        <span className="text-xs font-medium">Notifications</span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {notifications.length} total
        </span>
      </div>
      <div className="flex-1 overflow-y-auto mir-scroll">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <Bell className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">
              No notifications.
              <br />
              Crashes and port conflicts appear here.
            </p>
          </div>
        ) : (
          notifications.map(n => (
            <div
              key={n.id}
              className={cn(
                "border-b border-border px-3 py-2",
                !n.read && "bg-status-error/5"
              )}
            >
              <div className="flex items-center gap-2">
                <StatusDot status="error" className="h-1.5 w-1.5" />
                <span className="text-xs font-medium flex-1">{n.serviceName}</span>
                <span className="font-mono text-[9px] text-muted-foreground">
                  {new Date(n.timestamp).toLocaleTimeString("en-US", { hour12: false })}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{n.message}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onOpenMain }: { onOpenMain: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
        <Activity className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-medium">No projects yet</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Add a project in the main Mir window to start managing its services.
      </p>
      <button
        onClick={onOpenMain}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
      >
        <ExternalLink className="h-3 w-3" />
        Open Mir
      </button>
    </div>
  );
}
