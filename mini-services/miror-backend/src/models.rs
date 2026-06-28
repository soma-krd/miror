// Miror data models — shared contract between Rust backend and TypeScript frontend.
// Mirrors `src/lib/types.ts` in the Next.js app 1:1.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum ServiceStatus {
    Idle,
    Starting,
    Running,
    Stopped,
    Error,
}

impl Default for ServiceStatus {
    fn default() -> Self { ServiceStatus::Idle }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Shell {
    Bash,
    Zsh,
    Powershell,
    Cmd,
}

impl Default for Shell {
    fn default() -> Self { Shell::Bash }
}

impl Shell {
    pub fn as_str(&self) -> &str {
        match self {
            Shell::Bash => "bash",
            Shell::Zsh => "zsh",
            Shell::Powershell => "powershell",
            Shell::Cmd => "cmd",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LogType {
    Stdout,
    Stderr,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Service {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub cwd: String,
    pub command: String,
    pub shell: Shell,
    pub env: std::collections::HashMap<String, String>,
    pub auto_start: bool,
    pub depends_on: Vec<String>,
    #[serde(default)]
    pub status: ServiceStatus,
    // Runtime metadata — populated by the process manager
    pub pid: Option<u32>,
    pub started_at: Option<i64>,
    pub port: Option<u16>,
    pub cpu: Option<f32>,
    pub memory: Option<f32>, // MB
    pub uptime_ms: Option<u64>,
    pub exit_code: Option<i32>,
    // Lifecycle stats (Feature 5)
    #[serde(default)]
    pub restart_count: u32,
    #[serde(default)]
    pub total_uptime_ms: u64,
    #[serde(default)]
    pub last_start_duration_ms: Option<u64>,
    // Health check (Feature 2)
    #[serde(default)]
    pub ready: bool,
    #[serde(default)]
    pub health_probe: HealthProbe,
}

// --- Health check probe (Feature 2) ----------------------------------------
// A service is "running" when its process is alive, but "ready" only when
// its health check probe passes. Dependencies wait for "ready" not "running".

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum HealthProbe {
    /// HTTP GET to a path on the service's port. Ready when status is 2xx.
    Http { path: String, port: Option<u16>, expected_status: Option<u16>, timeout_ms: Option<u64> },
    /// TCP connect to host:port. Ready when connection succeeds.
    Tcp { port: Option<u16> },
    /// Stdout/stderr line matches a regex. Ready when first match is seen.
    Log { pattern: String, log_type: Option<LogType> },
    /// Always ready immediately when running (no probe).
    None,
}

impl Default for HealthProbe {
    fn default() -> Self { HealthProbe::None }
}

// --- Port mapping (Feature 1: Port Conflict Radar) -------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortMapping {
    pub port: u16,
    pub protocol: String,       // "tcp" or "udp"
    pub state: String,          // "LISTEN", "ESTABLISHED", etc.
    pub pid: u32,
    pub process_name: String,
    pub process_cmd: String,
    pub service_id: Option<String>,   // Miror service ID if it's one of ours
    pub service_name: Option<String>,
    pub local_address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortScanResult {
    pub mappings: Vec<PortMapping>,
    pub conflicts: Vec<PortConflict>,
    pub scanned_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortConflict {
    pub port: u16,
    pub holders: Vec<PortMapping>,   // 2+ holders = conflict
    pub miror_service_id: Option<String>,
    pub miror_service_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub id: String,
    pub service_id: String,
    pub timestamp: i64,
    pub log_type: LogType,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EnvironmentProfile {
    Development,
    Testing,
    Staging,
    Custom,
}

impl Default for EnvironmentProfile {
    fn default() -> Self { EnvironmentProfile::Development }
}

// miror.json structure — matches the PRD example
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MirorConfig {
    pub version: String,
    pub project: MirorConfigProject,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MirorConfigProject {
    pub name: String,
    pub root_path: String,
    pub services: Vec<MirorConfigService>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MirorConfigService {
    pub id: String,
    pub name: String,
    pub cwd: String,
    pub command: String,
    #[serde(default = "default_shell")]
    pub shell: Shell,
    #[serde(default)]
    pub env: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub auto_start: bool,
    #[serde(default)]
    pub depends_on: Vec<String>,
}

fn default_shell() -> Shell { Shell::Bash }

// API request payloads
#[derive(Debug, Clone, Deserialize)]
pub struct CreateProjectPayload {
    pub name: String,
    pub root_path: String,
    pub icon: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateProjectPayload {
    pub name: Option<String>,
    pub root_path: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateServicePayload {
    pub project_id: String,
    pub name: String,
    pub cwd: String,
    pub command: String,
    pub shell: Shell,
    #[serde(default)]
    pub env: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub auto_start: bool,
    #[serde(default)]
    pub depends_on: Vec<String>,
    #[serde(default)]
    pub health_probe: HealthProbe,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateServicePayload {
    pub name: Option<String>,
    pub cwd: Option<String>,
    pub command: Option<String>,
    pub shell: Option<Shell>,
    pub env: Option<std::collections::HashMap<String, String>>,
    pub auto_start: Option<bool>,
    pub depends_on: Option<Vec<String>>,
    pub health_probe: Option<HealthProbe>,
}

// WebSocket -> frontend messages
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsEvent {
    LogBatch { service_id: String, logs: Vec<LogEntry> },
    StatusChange { service_id: String, status: ServiceStatus, pid: Option<u32> },
    Telemetry { service_id: String, cpu: f32, memory_mb: f32 },
    LogDropped { service_id: String, count: u32 },
    Notification { notification: Notification },
}

#[derive(Debug, Clone, Serialize)]
pub struct Notification {
    pub id: String,
    pub service_id: String,
    pub service_name: String,
    pub kind: String, // "crash" | "port-conflict" | "build-failed"
    pub message: String,
    pub timestamp: i64,
}

// WebSocket -> backend messages
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsCommand {
    Subscribe { service_id: Option<String> },
    Unsubscribe { service_id: String },
}
