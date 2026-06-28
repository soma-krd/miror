"use client";

import { useEffect, useMemo } from "react";
import { useMir } from "@/store/mir-store";
import { useSettings, applyTheme } from "@/store/settings-store";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { DashboardView } from "./dashboard-view";
import { ProjectsView } from "./projects-view";
import { ProjectDetail } from "./project-detail";
import { LogsView } from "./logs-view";
import { SettingsView } from "./settings-view";
import { DatabaseView } from "./database-view";
import { GitView } from "./git-view";
import { DockerView } from "./docker-view";
import { StorageView } from "./storage-view";
import { ActivityView } from "./activity-view";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { SystemTray } from "./system-tray";
import { AIDiagnose } from "./ai-diagnose";

export function MirApp() {
  const theme = useSettings((s) => s.theme);
  const {
    view, activeProjectId, refreshProjects, refreshServices, refreshLogs, _initWs,
    aiDiagnoseOpen, aiDiagnoseServiceId, closeAIDiagnose,
    services, logs,
  } = useMir();

  // Initial load + WS connection
  useEffect(() => {
    _initWs();
    refreshProjects();
    refreshServices();
    refreshLogs();
  }, [_initWs, refreshProjects, refreshServices, refreshLogs]);

  // Apply theme on mount and when it changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Poll services every 5s as a backstop to catch state changes the WS missed
  useEffect(() => {
    const t = setInterval(() => {
      refreshServices();
    }, 5000);
    return () => clearInterval(t);
  }, [refreshServices]);

  // For the AI Diagnose modal — find the crashed service and its logs
  const aiService = useMemo(
    () => aiDiagnoseServiceId ? services.find(s => s.id === aiDiagnoseServiceId) ?? null : null,
    [aiDiagnoseServiceId, services]
  );
  const aiCrashLogs = useMemo(
    () => aiDiagnoseServiceId ? logs.filter(l => l.serviceId === aiDiagnoseServiceId).slice(-50) : [],
    [aiDiagnoseServiceId, logs]
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />

      <div className="flex flex-1 flex-col min-w-0">
        <Topbar />

        <main className="flex-1 overflow-hidden">
          {view === "dashboard" && (
            <div className="h-full overflow-y-auto mir-scroll">
              <DashboardView />
            </div>
          )}

          {view === "projects" && (
            <div className="h-full overflow-y-auto mir-scroll">
              {activeProjectId ? (
                <ProjectDetail projectId={activeProjectId} />
              ) : (
                <ProjectsView />
              )}
            </div>
          )}

          {view === "logs" && (
            <LogsView />
          )}

          {view === "database" && (
            <DatabaseView />
          )}

          {view === "git" && (
            <GitView />
          )}

          {view === "docker" && (
            <DockerView />
          )}

          {view === "storage" && (
            <StorageView />
          )}

          {view === "activity" && (
            <ActivityView />
          )}

          {view === "settings" && (
            <div className="h-full overflow-y-auto mir-scroll">
              <SettingsView />
            </div>
          )}
        </main>
      </div>

      <SystemTray />
      <KeyboardShortcuts />

      {/* AI Crash Diagnostics — globally available, triggered from crash notifications */}
      <AIDiagnose
        open={aiDiagnoseOpen}
        onOpenChange={(o) => !o && closeAIDiagnose()}
        service={aiService}
        crashLogs={aiCrashLogs}
      />
    </div>
  );
}
