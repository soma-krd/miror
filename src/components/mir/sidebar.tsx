"use client";

import {
  LayoutDashboard,
  FolderTree,
  ScrollText,
  Settings as SettingsIcon,
  Database as DatabaseIcon,
  GitBranch,
  Container,
  HardDrive,
  Activity,
  PanelLeftClose,
  PanelLeft,
  Plus,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useMir, type ViewId } from "@/store/mir-store";
import { StatusDot } from "./status-badge";
import { MirLogo } from "./mir-logo";

const NAV: { id: ViewId; label: string; icon: LucideIcon; shortcut: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, shortcut: "G D" },
  { id: "projects",  label: "Projects",  icon: FolderTree,      shortcut: "G P" },
  { id: "logs",      label: "Logs",      icon: ScrollText,      shortcut: "G L" },
  { id: "database",  label: "Database",  icon: DatabaseIcon,    shortcut: "G B" },
  { id: "git",       label: "Git",       icon: GitBranch,       shortcut: "G G" },
  { id: "docker",    label: "Docker",    icon: Container,       shortcut: "G O" },
  { id: "storage",   label: "Storage",   icon: HardDrive,       shortcut: "G T" },
  { id: "activity",  label: "Activity",  icon: Activity,        shortcut: "G A" },
  { id: "settings",  label: "Settings",  icon: SettingsIcon,    shortcut: "G S" },
];

export function Sidebar() {
  const {
    view, setView, activeProjectId, setActiveProject,
    projects, services, sidebarCollapsed, toggleSidebar,
  } = useMir();

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set(activeProjectId ? [activeProjectId] : [])
  );

  const toggleProject = (id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (sidebarCollapsed) {
    return (
      <aside className="mir-sidebar flex w-14 flex-col items-center gap-1.5 py-4">
        <div className="mb-2">
          <MirLogo className="h-7 w-7 shrink-0" />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          aria-label="Expand sidebar"
          className="h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground mir-press"
        >
          <PanelLeft className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </Button>
        <div className="my-1 h-px w-6 bg-sidebar-border" />
        {NAV.map((item) => (
          <Button
            key={item.id}
            variant={view === item.id ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setView(item.id)}
            className={cn(
              "h-8 w-8 mir-press",
              view === item.id
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
            )}
            title={item.label}
          >
            <item.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </Button>
        ))}
      </aside>
    );
  }

  return (
    <aside className="mir-sidebar flex w-60 flex-col">
      {/* Brand — Apple-style: minimal, centered, generous padding */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <MirLogo className="h-7 w-7 shrink-0" />
        <div className="flex-1">
          <div className="text-[13px] font-semibold tracking-tight text-sidebar-foreground">
            Mir
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          aria-label="Collapse sidebar"
          className="h-6 w-6 text-sidebar-foreground/50 hover:text-sidebar-foreground mir-press"
        >
          <PanelLeftClose className="h-3.5 w-3.5" strokeWidth={1.75} />
        </Button>
      </div>

      {/* Nav — Apple sidebar style: translucent selection, SF Symbols spacing */}
      <nav className="px-2.5 pb-1.5">
        {NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setView(item.id);
              if (item.id === "projects") setActiveProject(null);
            }}
            className={cn(
              "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[6px] text-[13px] font-medium transition-all mir-press",
              view === item.id
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            )}
          >
            <item.icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} />
            <span className="flex-1 text-left">{item.label}</span>
            <kbd className="hidden text-[10px] font-normal text-muted-foreground/60 group-hover:inline">
              {item.shortcut}
            </kbd>
          </button>
        ))}
      </nav>

      {/* Projects section */}
      <div className="flex-1 overflow-y-auto mir-scroll px-2.5 pb-2">
        <div className="flex items-center justify-between px-2.5 pt-3 pb-1">
          <span className="text-[11px] font-medium text-muted-foreground/80">
            Projects
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground/60 hover:text-sidebar-foreground"
            onClick={() => { setView("projects"); }}
            aria-label="Add project"
          >
            <Plus className="h-3 w-3" strokeWidth={2} />
          </Button>
        </div>

        {projects.map((proj) => {
          const projServices = services.filter((s) => s.projectId === proj.id);
          const runningCount = projServices.filter((s) => s.status === "running").length;
          const errorCount = projServices.filter((s) => s.status === "error").length;
          const expanded = expandedProjects.has(proj.id);
          const active = activeProjectId === proj.id && view === "projects";

          return (
            <div key={proj.id} className="mb-0.5">
              <div
                className={cn(
                  "group flex items-center gap-1.5 rounded-lg px-2.5 py-[6px] text-[13px] cursor-pointer transition-all",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50"
                )}
                onClick={() => {
                  setActiveProject(proj.id);
                  setView("projects");
                  toggleProject(proj.id);
                }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); toggleProject(proj.id); }}
                  className="text-muted-foreground/60 hover:text-sidebar-foreground shrink-0"
                  aria-label={expanded ? "Collapse" : "Expand"}
                >
                  {expanded
                    ? <ChevronDown className="h-3 w-3" strokeWidth={2} />
                    : <ChevronRight className="h-3 w-3" strokeWidth={2} />}
                </button>
                <span className="text-sm leading-none">{proj.icon ?? "📁"}</span>
                <span className="flex-1 truncate font-medium">{proj.name}</span>
                {errorCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-status-error/15 px-1 text-[10px] font-medium text-status-error">
                    {errorCount}
                  </span>
                )}
                {runningCount > 0 && errorCount === 0 && (
                  <span className="text-[11px] font-medium text-status-running/80">
                    {runningCount}
                  </span>
                )}
              </div>

              {expanded && (
                <div className="ml-7 mt-0.5 space-y-0.5 border-l border-sidebar-border/60 pl-2.5">
                  {projServices.map((svc) => (
                    <button
                      key={svc.id}
                      onClick={() => {
                        setActiveProject(proj.id);
                        setView("logs");
                        useMir.getState().setActiveService(svc.id);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-[12px] text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground transition-colors"
                    >
                      <StatusDot status={svc.status} className="h-1.5 w-1.5 shrink-0" />
                      <span className="flex-1 truncate text-left">{svc.name}</span>
                      {svc.port && (
                        <span className="font-mono text-[10px] text-muted-foreground/50">:{svc.port}</span>
                      )}
                    </button>
                  ))}
                  {projServices.length === 0 && (
                    <div className="px-2 py-1 text-[11px] text-muted-foreground/50">No services</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {projects.length === 0 && (
          <div className="px-3 py-6 text-center">
            <p className="text-[12px] text-muted-foreground">No projects yet.</p>
            <button
              onClick={() => setView("projects")}
              className="mt-1.5 text-[12px] font-medium text-primary hover:underline"
            >
              Add your first project
            </button>
          </div>
        )}
      </div>

      {/* Footer — minimal, Apple-style */}
      <div className="px-4 py-2.5 border-t border-sidebar-border/50">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground/60">
          <span className="font-mono">v1.0.0</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1 w-1 rounded-full bg-status-running" />
            Connected
          </span>
        </div>
      </div>
    </aside>
  );
}
