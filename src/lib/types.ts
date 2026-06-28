// Mir core data models — mirror the Tauri/Rust backend contract
// These types are the source of truth for both the (future) Rust IPC layer
// and the current in-browser mock process manager.

export type ServiceStatus =
  | "idle"
  | "starting"
  | "running"
  | "stopped"
  | "error";

export type Shell = "bash" | "zsh" | "powershell" | "cmd";

export type LogType = "stdout" | "stderr" | "system";

export type Framework =
  | "nextjs"
  | "nestjs"
  | "vite"
  | "flutter"
  | "docker-compose"
  | "node"
  | "python"
  | "rust"
  | "go"
  | "unknown";

export interface Project {
  id: string;
  name: string;
  rootPath: string;
  icon?: string;
  color?: string;
  createdAt: string;
}

export interface Service {
  id: string;
  projectId: string;
  name: string;
  cwd: string;
  command: string;
  shell: Shell;
  env: Record<string, string>;
  autoStart: boolean;
  dependsOn: string[]; // service IDs
  status: ServiceStatus;
  // Runtime metadata — populated by the process manager
  pid?: number;
  startedAt?: number;
  port?: number;
  cpu?: number;   // 0..100
  memory?: number; // MB
  uptimeMs?: number;
  exitCode?: number | null;
  // Lifecycle stats (Feature 5)
  restartCount?: number;
  totalUptimeMs?: number;
  lastStartDurationMs?: number;
  // Health check (Feature 2)
  ready?: boolean;
  healthProbe?: HealthProbe;
}

// Health check probe — determines when a service is "ready" vs just "running"
export type HealthProbe =
  | { type: "none" }
  | { type: "tcp"; port?: number }
  | { type: "http"; path: string; port?: number; expectedStatus?: number; timeoutMs?: number }
  | { type: "log"; pattern: string; logType?: LogType };

// Port mapping (Feature 1: Port Conflict Radar)
export interface PortMapping {
  port: number;
  protocol: string;
  state: string;
  pid: number;
  processName: string;
  processCmd: string;
  serviceId?: string;
  serviceName?: string;
  localAddress: string;
}

export interface PortConflict {
  port: number;
  holders: PortMapping[];
  mirServiceId?: string;
  mirServiceName?: string;
}

export interface PortScanResult {
  mappings: PortMapping[];
  conflicts: PortConflict[];
  scannedAt: number;
}

export interface LogEntry {
  id: string;
  serviceId: string;
  timestamp: number;
  type: LogType;
  message: string;
}

export type EnvironmentProfile = "development" | "testing" | "staging" | "custom";

export interface ServiceConfig {
  id: string;
  name: string;
  cwd: string;
  command: string;
  shell: Shell;
  env: Record<string, string>;
  autoStart: boolean;
  dependsOn: string[];
}

// IPC contract — these match the Rust signatures in the PRD.
// In production these become `invoke<T>('start_service', { serviceId })` calls.
// In the mock, the process manager implements them directly.
export interface MirIpc {
  startService(serviceId: string): Promise<void>;
  stopService(serviceId: string): Promise<void>;
  killProcess(serviceId: string, force: boolean): Promise<void>;
  getServiceStatus(serviceId: string): Promise<ServiceStatus>;
  subscribeToLogs(serviceId: string): Promise<void>;
  readEnvFile(path: string): Promise<Record<string, string>>;
  writeConfig(projectId: string, config: unknown): Promise<void>;
}
