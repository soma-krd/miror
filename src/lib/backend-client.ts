// Real backend client — HTTP + WebSocket calls to the Rust miror-backend.
//
// Sandbox: browser on :3000 → gateway :81 with XTransformPort=3001
// Tauri:   static UI → http://127.0.0.1:3001/api/... directly

import { apiUrl, wsUrl } from "./api-origin";

export type WsEvent =
  | { type: "log_batch"; service_id: string; logs: import("./types").LogEntry[] }
  | { type: "status_change"; service_id: string; status: import("./types").ServiceStatus; pid: number | null }
  | { type: "telemetry"; service_id: string; cpu: number; memory_mb: number }
  | { type: "notification"; notification: BackendNotification }
  | { type: "lagged"; message: string };

export interface BackendNotification {
  id: string;
  service_id: string;
  service_name: string;
  kind: string;
  message: string;
  timestamp: number;
}

type WsListener = (event: WsEvent) => void;

class MirorBackend {
  private ws: WebSocket | null = null;
  private wsListeners = new Set<WsListener>();
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wsConnected = false;

  private async http<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = apiUrl(`/api${path}`);
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  }

  // Projects
  listProjects() { return this.http<import("./types").Project[]>("GET", "/projects"); }
  getProject(id: string) { return this.http<import("./types").Project | null>("GET", `/projects/${id}`); }
  createProject(p: { name: string; root_path: string; icon?: string; color?: string }) {
    return this.http<import("./types").Project>("POST", "/projects", p);
  }
  updateProject(id: string, patch: Partial<{ name: string; root_path: string; icon: string; color: string }>) {
    return this.http<{ ok: boolean }>("PUT", `/projects/${id}`, patch);
  }
  deleteProject(id: string) {
    return this.http<{ ok: boolean }>("DELETE", `/projects/${id}`);
  }
  exportMirorJson(id: string) {
    return this.http<unknown>("GET", `/projects/${id}/miror.json`);
  }
  importMirorJson(id: string) {
    return this.http<{ ok: boolean; imported: number }>("POST", `/projects/${id}/miror.json`);
  }
  getDockerInfo(id: string) {
    return this.http<{ exists: boolean; path: string; services: string[] }>("GET", `/projects/${id}/docker`);
  }
  applyEnvProfile(id: string, profile: string) {
    return this.http<{ ok: boolean }>("POST", `/projects/${id}/env-profile`, { profile });
  }

  // Services
  listServices() { return this.http<import("./types").Service[]>("GET", "/services"); }
  getService(id: string) { return this.http<import("./types").Service | null>("GET", `/services/${id}`); }
  createService(s: import("./types").Omit<import("./types").Service, "id" | "status">) {
    return this.http<import("./types").Service>("POST", "/services", {
      project_id: s.projectId,
      name: s.name,
      cwd: s.cwd,
      command: s.command,
      shell: s.shell,
      env: s.env,
      auto_start: s.autoStart,
      depends_on: s.dependsOn,
      health_probe: s.healthProbe ?? { type: "none" },
    });
  }
  updateService(id: string, patch: Partial<import("./types").Service>) {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.cwd !== undefined) body.cwd = patch.cwd;
    if (patch.command !== undefined) body.command = patch.command;
    if (patch.shell !== undefined) body.shell = patch.shell;
    if (patch.env !== undefined) body.env = patch.env;
    if (patch.autoStart !== undefined) body.auto_start = patch.autoStart;
    if (patch.dependsOn !== undefined) body.depends_on = patch.dependsOn;
    if (patch.healthProbe !== undefined) body.health_probe = patch.healthProbe;
    return this.http<{ ok: boolean }>("PUT", `/services/${id}`, body);
  }
  deleteService(id: string) {
    return this.http<{ ok: boolean }>("DELETE", `/services/${id}`);
  }
  startService(id: string) { return this.http<{ ok: boolean }>("POST", `/services/${id}/start`); }
  stopService(id: string) { return this.http<{ ok: boolean }>("POST", `/services/${id}/stop`); }
  killService(id: string, force = true) {
    return this.http<{ ok: boolean }>("POST", `/services/${id}/kill`, { force });
  }
  restartService(id: string) { return this.http<{ ok: boolean }>("POST", `/services/${id}/restart`); }
  getServiceStatus(id: string) {
    return this.http<{ status: import("./types").ServiceStatus }>("GET", `/services/${id}/status`);
  }
  openInEditor(serviceId: string, editor: "vscode" | "cursor" | "files") {
    return this.http<{ ok: boolean; path: string }>("POST", `/services/${serviceId}/editor/${editor}`);
  }

  // Bulk
  startAllInProject(projectId: string) {
    return this.http<{ ok: boolean; errors: string[] }>("POST", `/projects/${projectId}/start-all`);
  }
  stopAllInProject(projectId: string) {
    return this.http<{ ok: boolean; errors: string[] }>("POST", `/projects/${projectId}/stop-all`);
  }
  restartAllInProject(projectId: string) {
    return this.http<{ ok: boolean; errors: string[] }>("POST", `/projects/${projectId}/restart-all`);
  }

  // Logs
  listLogs(serviceId?: string, limit = 1000) {
    const q = serviceId ? `?service_id=${serviceId}&limit=${limit}` : `?limit=${limit}`;
    return this.http<import("./types").LogEntry[]>("GET", `/logs${q}`);
  }
  listLogsForService(serviceId: string, limit = 1000) {
    return this.http<import("./types").LogEntry[]>("GET", `/logs/${serviceId}?limit=${limit}`);
  }
  clearLogs(serviceId?: string) {
    const q = serviceId ? `?service_id=${serviceId}` : "";
    return this.http<{ ok: boolean }>("DELETE", `/logs${q}`);
  }

  // Env file
  readEnvFile(path: string) {
    return this.http<Record<string, string>>("GET", `/env-file?path=${encodeURIComponent(path)}`);
  }
  writeEnvFile(path: string, env: Record<string, string>) {
    return this.http<{ ok: boolean }>("POST", "/env-file", { path, env });
  }

  // Health
  health() {
    return this.http<{
      status: string; backend: string; version: string;
      projects: number; services: number; running: number;
    }>("GET", "/health");
  }

  scanPorts() {
    return this.http<import("./types").PortScanResult>("GET", "/ports");
  }
  killPortHolder(port: number, pid?: number) {
    return this.http<{ ok: boolean; killed_pid: number; port: number }>(
      "POST", `/ports/${port}/kill`, pid !== undefined ? { pid } : {}
    );
  }

  runProbe(serviceId: string) {
    return this.http<{ ready: boolean; probe: unknown }>("GET", `/services/${serviceId}/probe`);
  }

  getGitStatus(projectId: string) {
    return this.http<{
      is_repo: boolean; branch: string; is_dirty: boolean;
      ahead: number; behind: number; staged: number; unstaged: number; untracked: number;
      recent_commits: Array<{ hash: string; message: string; author: string; date: string }>;
    }>("GET", `/projects/${projectId}/git`);
  }

  sqliteInfo(path: string) {
    return this.http<{ db_type: string; database: string; tables: Array<{ name: string; row_count: number; schema: string }> }>(
      "GET", `/database/sqlite/info?path=${encodeURIComponent(path)}`
    );
  }
  sqliteQuery(path: string, sql: string) {
    return this.http<{ columns: string[]; rows: unknown[][]; row_count: number; truncated: boolean }>(
      "POST", "/database/sqlite/query", { path, sql }
    );
  }
  sqliteSchema(path: string, table: string) {
    return this.http<{ table: string; schema: string }>(
      "GET", `/database/sqlite/schema/${table}?path=${encodeURIComponent(path)}`
    );
  }

  postgresInfo(connectionString: string) {
    return this.http<{ db_type: string; database: string; tables: Array<{ name: string; row_count: number; schema: string }> }>(
      "POST", "/database/postgres/info", { connection_string: connectionString }
    );
  }
  postgresQuery(connectionString: string, sql: string) {
    return this.http<{ columns: string[]; rows: unknown[][]; row_count: number; truncated: boolean }>(
      "POST", "/database/postgres/query", { connection_string: connectionString, sql }
    );
  }

  mysqlInfo(connectionString: string) {
    return this.http<{ db_type: string; database: string; tables: Array<{ name: string; row_count: number; schema: string }> }>(
      "POST", "/database/mysql/info", { connection_string: connectionString }
    );
  }
  mysqlQuery(connectionString: string, sql: string) {
    return this.http<{ columns: string[]; rows: unknown[][]; row_count: number; truncated: boolean }>(
      "POST", "/database/mysql/query", { connection_string: connectionString, sql }
    );
  }

  redisScan(connectionString: string, pattern = "*", count = 1000) {
    return this.http<{
      keys: Array<{ key: string; key_type: string; size: number; ttl: number }>;
      total_scanned: number; cursor: string;
    }>("POST", "/database/redis/scan", {
      connection_string: connectionString, pattern, count
    });
  }
  redisGetKey(connectionString: string, key: string) {
    return this.http<{ key: string; type: string; value: unknown }>(
      "GET", `/database/redis/key?connection_string=${encodeURIComponent(connectionString)}&key=${encodeURIComponent(key)}`
    );
  }
  redisSetKey(connectionString: string, key: string, value: string) {
    return this.http<{ ok: boolean }>("POST", "/database/redis/key", {
      connection_string: connectionString, key, value
    });
  }
  redisDeleteKey(connectionString: string, key: string) {
    return this.http<{ ok: boolean }>("POST", "/database/redis/delete", {
      connection_string: connectionString, key
    });
  }
  redisExecute(connectionString: string, command: string) {
    return this.http<{ ok: boolean; output: string }>("POST", "/database/redis/execute", {
      connection_string: connectionString, command
    });
  }

  getResourceHistory(serviceId: string) {
    return this.http<{
      history: Array<{ timestamp: number; cpu: number; memory_mb: number }>;
      interval_ms: number;
    }>("GET", `/services/${serviceId}/history`);
  }

  connectWs() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (typeof window === "undefined") return;

    const url = wsUrl();
    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      console.warn("WebSocket connect failed, retrying in 2s:", e);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.wsConnected = true;
      console.log("[Miror] WebSocket connected to", url);
    };

    this.ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as WsEvent;
        this.wsListeners.forEach(fn => fn(event));
      } catch (err) {
        console.warn("failed to parse WS message:", err);
      }
    };

    this.ws.onerror = (e) => {
      console.warn("[Miror] WebSocket error:", e);
    };

    this.ws.onclose = () => {
      this.wsConnected = false;
      this.ws = null;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.wsReconnectTimer) return;
    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = null;
      this.connectWs();
    }, 2000);
  }

  onWsEvent(fn: WsListener) {
    this.wsListeners.add(fn);
    if (!this.ws) this.connectWs();
    return () => this.wsListeners.delete(fn);
  }

  get wsIsConnected() { return this.wsConnected; }
}

export const backend = new MirorBackend();
