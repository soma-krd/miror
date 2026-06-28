"use client";

import { create } from "zustand";
import type { LogEntry, Project, Service, ServiceStatus } from "@/lib/types";
import { backend, type BackendNotification } from "@/lib/backend-client";
import { shouldNotify } from "@/store/settings-store";

export type ViewId = "dashboard" | "projects" | "logs" | "settings" | "database" | "git" | "docker" | "storage" | "activity";

interface Notification {
  id: string;
  serviceId: string;
  serviceName: string;
  kind: "crash" | "port-conflict" | "build-failed";
  message: string;
  timestamp: number;
  read: boolean;
}

interface MirorState {
  // data
  projects: Project[];
  services: Service[];
  logs: LogEntry[];
  backendConnected: boolean;

  // AI Diagnose (Feature 6)
  aiDiagnoseOpen: boolean;
  aiDiagnoseServiceId: string | null;

  // ui
  view: ViewId;
  activeProjectId: string | null;
  activeServiceId: string | null;
  logFilter: "all" | "stdout" | "stderr" | "system";
  search: string;
  sidebarCollapsed: boolean;
  notifications: Notification[];
  loading: boolean;

  // actions
  setView: (v: ViewId) => void;
  setActiveProject: (id: string | null) => void;
  setActiveService: (id: string | null) => void;
  setLogFilter: (f: "all" | "stdout" | "stderr" | "system") => void;
  setSearch: (s: string) => void;
  toggleSidebar: () => void;

  // data loading
  refreshProjects: () => Promise<void>;
  refreshServices: () => Promise<void>;
  refreshLogs: (serviceId?: string) => Promise<void>;

  // project CRUD
  addProject: (p: { name: string; rootPath: string; icon?: string; color?: string }) => Promise<string | null>;
  updateProject: (id: string, patch: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  // service CRUD
  addService: (s: Omit<Service, "id" | "status">) => Promise<string | null>;
  updateService: (id: string, patch: Partial<Service>) => Promise<void>;
  deleteService: (id: string) => Promise<void>;

  // process control — real HTTP calls to the Rust backend
  startService: (id: string) => Promise<void>;
  stopService: (id: string) => Promise<void>;
  killService: (id: string, force?: boolean) => Promise<void>;
  restartService: (id: string) => Promise<void>;
  startAllInProject: (projectId: string) => Promise<void>;
  stopAllInProject: (projectId: string) => Promise<void>;
  restartAllInProject: (projectId: string) => Promise<void>;
  clearLogs: (serviceId?: string) => Promise<void>;

  // editor integration
  openInEditor: (serviceId: string, editor: "vscode" | "cursor" | "files") => Promise<void>;

  // miror.json import/export
  exportMirorJson: (projectId: string) => Promise<void>;
  importMirorJson: (projectId: string) => Promise<void>;

  // notifications
  markNotificationRead: (id: string) => void;
  dismissNotification: (id: string) => void;
  clearNotifications: () => void;

  // WebSocket event ingestion
  _ingestLogs: (logs: LogEntry[]) => void;
  _setStatus: (status: ServiceStatus, serviceId: string, pid: number | null) => void;
  _setTelemetry: (serviceId: string, cpu: number, memMb: number) => void;
  _addNotification: (n: BackendNotification) => void;
  _initWs: () => void;
}

const MAX_LOGS = 4000;

// Convert backend snake_case Service to frontend camelCase
function fromBackendService(s: any): Service {
  return {
    id: s.id,
    projectId: s.project_id,
    name: s.name,
    cwd: s.cwd,
    command: s.command,
    shell: s.shell,
    env: s.env ?? {},
    autoStart: s.auto_start ?? false,
    dependsOn: s.depends_on ?? [],
    status: s.status ?? "idle",
    pid: s.pid ?? undefined,
    startedAt: s.started_at ?? undefined,
    port: s.port ?? undefined,
    cpu: s.cpu ?? undefined,
    memory: s.memory ?? undefined,
    uptimeMs: s.uptime_ms ?? undefined,
    exitCode: s.exit_code ?? undefined,
    restartCount: s.restart_count ?? 0,
    totalUptimeMs: s.total_uptime_ms ?? 0,
    lastStartDurationMs: s.last_start_duration_ms ?? undefined,
    ready: s.ready ?? false,
    healthProbe: s.health_probe ?? { type: "none" },
  };
}

function fromBackendProject(p: any): Project {
  return {
    id: p.id,
    name: p.name,
    rootPath: p.root_path,
    icon: p.icon,
    color: p.color,
    createdAt: p.created_at,
  };
}

function fromBackendLog(l: any): LogEntry {
  return {
    id: l.id,
    serviceId: l.service_id,
    timestamp: l.timestamp,
    type: l.log_type,
    message: l.message,
  };
}

export const useMiror = create<MirorState>((set, get) => ({
  projects: [],
  services: [],
  logs: [],
  backendConnected: false,

  aiDiagnoseOpen: false,
  aiDiagnoseServiceId: null,

  view: "dashboard",
  activeProjectId: null,
  activeServiceId: null,
  logFilter: "all",
  search: "",
  sidebarCollapsed: false,
  notifications: [],
  loading: false,

  setView: (v) => set({ view: v }),
  setActiveProject: (id) => set({ activeProjectId: id, activeServiceId: null }),
  setActiveService: (id) => set({ activeServiceId: id }),
  setLogFilter: (f) => set({ logFilter: f }),
  setSearch: (s) => set({ search: s }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  refreshProjects: async () => {
    try {
      const raw = await backend.listProjects();
      const projects = raw.map(fromBackendProject);
      set((s) => ({
        projects,
        activeProjectId: s.activeProjectId ?? projects[0]?.id ?? null,
      }));
    } catch (e) {
      console.warn("refreshProjects failed:", e);
    }
  },

  refreshServices: async () => {
    try {
      const raw = await backend.listServices();
      const services = raw.map(fromBackendService);
      set({ services });
    } catch (e) {
      console.warn("refreshServices failed:", e);
    }
  },

  refreshLogs: async (serviceId) => {
    try {
      const raw = serviceId
        ? await backend.listLogsForService(serviceId, 1000)
        : await backend.listLogs(undefined, 1000);
      const logs = raw.map(fromBackendLog);
      set({ logs });
    } catch (e) {
      console.warn("refreshLogs failed:", e);
    }
  },

  addProject: async (p) => {
    try {
      const raw = await backend.createProject({
        name: p.name,
        root_path: p.rootPath,
        icon: p.icon,
        color: p.color,
      });
      const project = fromBackendProject(raw);
      set((s) => ({ projects: [...s.projects, project], activeProjectId: project.id }));
      return project.id;
    } catch (e) {
      console.error("addProject failed:", e);
      return null;
    }
  },

  updateProject: async (id, patch) => {
    try {
      await backend.updateProject(id, {
        name: patch.name,
        root_path: patch.rootPath,
        icon: patch.icon,
        color: patch.color,
      });
      set((s) => ({
        projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      }));
    } catch (e) {
      console.error("updateProject failed:", e);
    }
  },

  deleteProject: async (id) => {
    try {
      await backend.deleteProject(id);
      set((s) => ({
        projects: s.projects.filter((p) => p.id !== id),
        services: s.services.filter((sv) => sv.projectId !== id),
        activeProjectId: s.activeProjectId === id ? (s.projects[0]?.id ?? null) : s.activeProjectId,
      }));
    } catch (e) {
      console.error("deleteProject failed:", e);
    }
  },

  addService: async (sv) => {
    try {
      const raw = await backend.createService(sv);
      const service = fromBackendService(raw);
      set((s) => ({ services: [...s.services, service] }));
      return service.id;
    } catch (e) {
      console.error("addService failed:", e);
      return null;
    }
  },

  updateService: async (id, patch) => {
    try {
      await backend.updateService(id, patch);
      set((s) => ({
        services: s.services.map((sv) => (sv.id === id ? { ...sv, ...patch } : sv)),
      }));
    } catch (e) {
      console.error("updateService failed:", e);
    }
  },

  deleteService: async (id) => {
    try {
      await backend.deleteService(id);
      set((s) => ({
        services: s.services.filter((sv) => sv.id !== id && !sv.dependsOn.includes(id)),
        activeServiceId: s.activeServiceId === id ? null : s.activeServiceId,
      }));
    } catch (e) {
      console.error("deleteService failed:", e);
    }
  },

  startService: async (id) => {
    try { await backend.startService(id); }
    catch (e) { console.error("startService failed:", e); }
  },
  stopService: async (id) => {
    try { await backend.stopService(id); }
    catch (e) { console.error("stopService failed:", e); }
  },
  killService: async (id, force = true) => {
    try { await backend.killService(id, force); }
    catch (e) { console.error("killService failed:", e); }
  },
  restartService: async (id) => {
    try { await backend.restartService(id); }
    catch (e) { console.error("restartService failed:", e); }
  },
  startAllInProject: async (projectId) => {
    try { await backend.startAllInProject(projectId); }
    catch (e) { console.error("startAllInProject failed:", e); }
  },
  stopAllInProject: async (projectId) => {
    try { await backend.stopAllInProject(projectId); }
    catch (e) { console.error("stopAllInProject failed:", e); }
  },
  restartAllInProject: async (projectId) => {
    try { await backend.restartAllInProject(projectId); }
    catch (e) { console.error("restartAllInProject failed:", e); }
  },

  clearLogs: async (serviceId) => {
    try {
      await backend.clearLogs(serviceId);
      set((s) => ({
        logs: serviceId ? s.logs.filter((l) => l.serviceId !== serviceId) : [],
      }));
    } catch (e) { console.error("clearLogs failed:", e); }
  },

  openInEditor: async (serviceId, editor) => {
    try {
      const result = await backend.openInEditor(serviceId, editor);
      console.log(`Opened ${editor} at ${result.path}`);
    } catch (e) {
      console.error(`openInEditor(${editor}) failed:`, e);
      alert(`Failed to open in ${editor}: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  exportMirorJson: async (projectId) => {
    try {
      await backend.exportMirorJson(projectId);
      alert("miror.json exported to project root ✓");
    } catch (e) {
      console.error("exportMirorJson failed:", e);
      alert(`Failed to export: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  importMirorJson: async (projectId) => {
    try {
      const result = await backend.importMirorJson(projectId);
      alert(`Imported ${result.imported} services from miror.json ✓`);
      await get().refreshServices();
    } catch (e) {
      console.error("importMirorJson failed:", e);
      alert(`Failed to import: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  markNotificationRead: (id) =>
    set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
  dismissNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
  clearNotifications: () => set({ notifications: [] }),

  // AI Diagnose
  openAIDiagnose: (serviceId: string) => set({ aiDiagnoseOpen: true, aiDiagnoseServiceId: serviceId }),
  closeAIDiagnose: () => set({ aiDiagnoseOpen: false, aiDiagnoseServiceId: null }),

  _ingestLogs: (logs) =>
    set((s) => {
      const next = s.logs.length + logs.length > MAX_LOGS
        ? [...s.logs.slice(-(MAX_LOGS - logs.length)), ...logs]
        : [...s.logs, ...logs];
      return { logs: next };
    }),
  _setStatus: (status, serviceId, pid) =>
    set((s) => ({
      services: s.services.map((sv) =>
        sv.id === serviceId
          ? {
              ...sv,
              status,
              pid: pid ?? undefined,
              startedAt: status === "running" ? Date.now() : sv.startedAt,
              exitCode: status === "error" ? 1 : status === "stopped" ? 0 : sv.exitCode,
            }
          : sv
      ),
    })),
  _setTelemetry: (serviceId, cpu, memMb) =>
    set((s) => ({
      services: s.services.map((sv) =>
        sv.id === serviceId ? { ...sv, cpu, memory: memMb } : sv
      ),
    })),
  _addNotification: (n) =>
    set((s) => ({
      notifications: [
        {
          id: n.id,
          serviceId: n.service_id,
          serviceName: n.service_name,
          kind: n.kind as Notification["kind"],
          message: n.message,
          timestamp: n.timestamp,
          read: false,
        },
        ...s.notifications,
      ].slice(0, 20),
    })),

  _initWs: () => {
    // Subscribe once — backend-client dedupes connections
    backend.onWsEvent((event) => {
      switch (event.type) {
        case "log_batch":
          get()._ingestLogs(event.logs);
          break;
        case "status_change":
          get()._setStatus(event.status, event.service_id, event.pid);
          break;
        case "telemetry":
          get()._setTelemetry(event.service_id, event.cpu, event.memory_mb);
          break;
        case "notification":
          get()._addNotification(event.notification);
          // Fire a native OS notification if we're in Tauri (desktop app)
          fireNativeNotification(event.notification);
          break;
      }
    });
  },
}));

// Fire a native OS notification via Tauri's notification plugin.
// In the browser (sandbox), falls back to the Web Notification API.
// Respects the user's notification preferences from settings-store.
function fireNativeNotification(n: BackendNotification) {
  if (typeof window === "undefined") return;

  // Respect user's notification preferences
  const kind = n.kind as "crash" | "port-conflict" | "build-failed";
  if (!shouldNotify(kind)) return;

  const title = `Miror — ${n.service_name}`;
  const body = n.message;

  // Tauri desktop path
  const tauri = (window as any).__TAURI__;
  if (tauri?.core?.invoke) {
    tauri.core.invoke("show_native_notification", {
      payload: {
        title,
        body,
        service_id: n.service_id,
        kind: n.kind,
      },
    }).catch((e: unknown) => console.warn("native notification failed:", e));
    return;
  }

  // Browser fallback — uses Web Notification API
  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          new Notification(title, { body });
        }
      });
    }
  }
}
