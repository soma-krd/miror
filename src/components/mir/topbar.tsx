"use client";

import { useEffect, useState } from "react";
import {
  Search, Bell, Play, Square, RotateCw, Command,
  Plus, Settings as SettingsIcon, Radar, Camera, Database, BookTemplate,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useMir } from "@/store/mir-store";
import { GlobalSearch } from "./global-search";
import { PortRadar } from "./port-radar";
import { WorkspaceSnapshots } from "./workspace-snapshots";
import { cn } from "@/lib/utils";

export function Topbar() {
  const {
    search, setSearch, setView, view, activeProjectId, setActiveProject,
    projects, services, notifications,
    startAllInProject, stopAllInProject, restartAllInProject,
    dismissNotification, clearNotifications, markNotificationRead,
    openAIDiagnose,
  } = useMir();

  const [now, setNow] = useState(Date.now());
  const [searchOpen, setSearchOpen] = useState(false);
  const [portRadarOpen, setPortRadarOpen] = useState(false);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);

  // clock for header
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Global keyboard shortcuts: Ctrl+K opens command palette, Ctrl+L → logs
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l" && !searchOpen) {
        e.preventDefault();
        setView("logs");
        // Focus the log filter input (handled by LogsView's own Ctrl+L handler if present)
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView, searchOpen]);

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const projectServices = activeProject
    ? services.filter((s) => s.projectId === activeProject.id)
    : [];
  const runningCount = projectServices.filter((s) => s.status === "running").length;
  const unreadNotifs = notifications.filter((n) => !n.read);

  return (
    <>
      <header className="flex h-11 items-center gap-3 px-4 bg-background/60 backdrop-blur-xl border-b border-border/50">
        {/* Breadcrumb — Apple-style: light separators, muted parent */}
        <div className="flex items-center gap-1.5 text-[13px]">
          <span className="text-muted-foreground/60">Mir</span>
          <span className="text-muted-foreground/30">›</span>
          <span className="font-medium capitalize">{view}</span>
          {activeProject && view === "projects" && (
            <>
              <span className="text-muted-foreground/30">›</span>
              <span className="font-medium text-foreground">{activeProject.name}</span>
            </>
          )}
        </div>

        {/* Search — Apple-style pill with subtle background */}
        <button
          onClick={() => setSearchOpen(true)}
          className="relative ml-3 flex h-7 w-full max-w-xs items-center gap-2 rounded-lg bg-muted/50 px-2.5 text-left text-[12px] text-muted-foreground/70 transition-all hover:bg-muted/80 mir-press"
        >
          <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span className="flex-1">Search</span>
          <kbd className="hidden items-center gap-0.5 rounded bg-background/60 px-1 py-0.5 font-mono text-[10px] text-muted-foreground/50 sm:flex">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </button>

        {/* Project quick actions — Apple-style: text buttons, no harsh colors */}
        {activeProject && projectServices.length > 0 && (
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-[12px] font-medium mir-press"
              onClick={() => startAllInProject(activeProject.id)}
              disabled={runningCount === projectServices.length}
            >
              <Play className="h-3 w-3 fill-current" />
              Start All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-[12px] font-medium mir-press"
              onClick={() => stopAllInProject(activeProject.id)}
              disabled={runningCount === 0}
            >
              <Square className="h-3 w-3 fill-current" />
              Stop All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-[12px] font-medium mir-press"
              onClick={() => restartAllInProject(activeProject.id)}
              disabled={runningCount === 0}
            >
              <RotateCw className="h-3 w-3" />
              Restart
            </Button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          {/* Clock — subtle, Apple menu-bar style */}
          <div className="hidden text-[12px] tabular-nums text-muted-foreground/60 md:block mr-2">
            {new Date(now).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
          </div>

          {/* New project quick button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground/70 hover:text-foreground mir-press"
            onClick={() => { setActiveProject(null); setView("projects"); }}
            aria-label="Add project"
            title="New project (Ctrl+N)"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
          </Button>

          {/* Port Conflict Radar */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground/70 hover:text-foreground mir-press"
            onClick={() => setPortRadarOpen(true)}
            aria-label="Port Radar"
            title="Port Conflict Radar"
          >
            <Radar className="h-4 w-4" strokeWidth={1.75} />
          </Button>

          {/* Database Browser — navigates to the Database view */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground/70 hover:text-foreground mir-press"
            onClick={() => setView("database")}
            aria-label="Database Browser"
            title="Database Browser (G B)"
          >
            <Database className="h-4 w-4" strokeWidth={1.75} />
          </Button>

          {/* Workspace Snapshots */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground/70 hover:text-foreground mir-press"
            onClick={() => setSnapshotsOpen(true)}
            aria-label="Snapshots"
            title="Workspace Snapshots"
          >
            <Camera className="h-4 w-4" strokeWidth={1.75} />
          </Button>

          {/* Notifications — Apple-style badge */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-7 w-7 text-muted-foreground/70 hover:text-foreground mir-press" aria-label="Notifications">
                <Bell className="h-4 w-4" strokeWidth={1.75} />
                {unreadNotifs.length > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-status-error px-1 text-[9px] font-semibold text-white">
                    {unreadNotifs.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0 mir-frosted border-border/50">
              <div className="flex items-center justify-between border-b border-border/50 px-3 py-2.5">
                <span className="text-[13px] font-semibold">Notifications</span>
                {notifications.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] font-medium text-primary"
                    onClick={clearNotifications}
                  >
                    Clear All
                  </Button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto mir-scroll">
                {notifications.length === 0 ? (
                  <div className="px-3 py-10 text-center">
                    <Bell className="h-6 w-6 mx-auto mb-2 text-muted-foreground/30" strokeWidth={1.5} />
                    <p className="text-[12px] text-muted-foreground/60">No notifications</p>
                    <br />
                    Crashes and port conflicts appear here.
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={cn(
                        "group flex items-start gap-2 border-b px-3 py-2.5 last:border-0",
                        !n.read && "bg-status-error/5"
                      )}
                      onClick={() => markNotificationRead(n.id)}
                    >
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-status-error/15 text-status-error">
                        <span className="text-xs">!</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium">{n.serviceName}</div>
                        <div className="text-xs text-muted-foreground">{n.message}</div>
                        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">
                          {new Date(n.timestamp).toLocaleTimeString("en-US", { hour12: false })}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); dismissNotification(n.id); }}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                          aria-label="Dismiss"
                        >
                          ×
                        </button>
                        {n.kind === "crash" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openAIDiagnose(n.serviceId);
                            }}
                            className="opacity-0 group-hover:opacity-100 text-[10px] text-primary hover:underline whitespace-nowrap"
                            title="AI Diagnose this crash"
                          >
                            AI Diagnose
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground/70 hover:text-foreground mir-press"
            onClick={() => setView("settings")}
            aria-label="Settings"
          >
            <SettingsIcon className="h-4 w-4" strokeWidth={1.75} />
          </Button>
        </div>
      </header>

      {/* Global search command palette — renders on top of everything when open */}
      {searchOpen && (
        <GlobalSearch
          query={search}
          onQueryChange={setSearch}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* Port Conflict Radar */}
      <PortRadar open={portRadarOpen} onOpenChange={setPortRadarOpen} />

      {/* Workspace Snapshots */}
      <WorkspaceSnapshots open={snapshotsOpen} onOpenChange={setSnapshotsOpen} />
    </>
  );
}
