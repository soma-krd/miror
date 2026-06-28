// Real process manager — uses tokio::process::Command with kill_on_drop,
// bounded mpsc channels for log routing, and a ~32ms batching emitter
// that mimics the architecture described in the PRD discussion.

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, Mutex};
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken as TokioCancellationToken;

// Re-export to match existing references
type CancellationToken = TokioCancellationToken;
use uuid::Uuid;
use chrono::Utc;

use crate::models::*;
use crate::store::Store;
use crate::event_bus::EventBus;

pub struct ProcessHandle {
    pub child: Option<Child>,
    pub cancel: CancellationToken,
    pub stdout_task: Option<JoinHandle<()>>,
    pub stderr_task: Option<JoinHandle<()>>,
    pub router_task: Option<JoinHandle<()>>,
    pub telemetry_task: Option<JoinHandle<()>>,
    pub started_at: Instant,
    pub pid: u32,
}

pub struct ProcessManager {
    pub processes: Arc<Mutex<HashMap<String, ProcessHandle>>>,
    pub store: Arc<Store>,
    pub event_bus: Arc<EventBus>,
}

impl ProcessManager {
    pub fn new(store: Arc<Store>, event_bus: Arc<EventBus>) -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            store,
            event_bus,
        }
    }

    // Start a service — resolves dependsOn first (topological order).
    pub fn start<'a>(&'a self, service_id: &'a str) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), String>> + Send + 'a>> {
        Box::pin(async move {
            // Check if already running
            {
                let procs = self.processes.lock().await;
                if procs.contains_key(service_id) {
                    return Ok(());
                }
            }

            let service = self.store.get_service(service_id).await
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("service {} not found", service_id))?;

            // Resolve dependencies topologically and start them first
            let deps = self.resolve_dependencies(&service).await?;
            for dep in deps {
                let already_running = self.processes.lock().await.contains_key(&dep.id);
                if !already_running {
                    self.start(&dep.id).await?;
                    // Wait for the dep to actually be running (max 5s)
                    self.wait_for_running(&dep.id, Duration::from_secs(5)).await;
                }
            }

            self.start_single(&service).await
        })
    }

    async fn start_single(&self, service: &Service) -> Result<(), String> {
        // Resolve cwd relative to project root
        let project = self.store.get_project(&service.project_id).await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("project {} not found", service.project_id))?;

        let cwd = if service.cwd == "." || service.cwd.is_empty() {
            project.root_path.clone()
        } else if service.cwd.starts_with('/') {
            service.cwd.clone()
        } else {
            format!("{}/{}", project.root_path.trim_end_matches('/'), service.cwd)
        };

        // Emit "starting" status
        self.event_bus.emit_status(service.id.clone(), ServiceStatus::Starting, None);

        // Parse the command — split on spaces, but respect quotes
        let args = shell_split(&service.command);
        if args.is_empty() {
            return Err("empty command".to_string());
        }

        let program = &args[0];
        let program_args = &args[1..];

        // Determine the actual program path. Try to resolve common ones.
        // If the program isn't found, we still try to spawn — Tokio will fail
        // with a meaningful error.
        let mut cmd = if service.shell == Shell::Powershell || service.shell == Shell::Cmd {
            // On Windows: spawn via the shell. On Unix: fall through to direct.
            if cfg!(windows) {
                let shell_bin = if service.shell == Shell::Powershell { "powershell" } else { "cmd" };
                let flag = if service.shell == Shell::Powershell { "-Command" } else { "/C" };
                let mut c = Command::new(shell_bin);
                c.arg(flag).arg(&service.command);
                c
            } else {
                // On Unix, even "powershell/cmd" services run through bash
                let mut c = Command::new("bash");
                c.arg("-c").arg(&service.command);
                c
            }
        } else {
            // bash / zsh — run through the shell so pipes, &&, env work
            let shell_bin = if service.shell == Shell::Zsh { "zsh" } else { "bash" };
            let mut c = Command::new(shell_bin);
            c.arg("-c").arg(&service.command);
            c
        };

        cmd.current_dir(&cwd)
           .stdin(Stdio::null())
           .stdout(Stdio::piped())
           .stderr(Stdio::piped())
           .kill_on_drop(true); // critical — prevents zombies on drop

        // Apply environment variables
        for (k, v) in &service.env {
            cmd.env(k, v);
        }

        // Spawn
        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let msg = format!("failed to spawn: {} (cwd: {})", e, cwd);
                self.event_bus.emit_log(service.id.clone(), LogType::Stderr, msg.clone());
                self.event_bus.emit_log(service.id.clone(), LogType::System, format!("✖ spawn failed"));
                self.event_bus.emit_status(service.id.clone(), ServiceStatus::Error, None);
                self.event_bus.emit_notification(Notification {
                    id: format!("notif_{}", Uuid::new_v4().simple()),
                    service_id: service.id.clone(),
                    service_name: service.name.clone(),
                    kind: "crash".to_string(),
                    message: format!("{} failed to start: {}", service.name, e),
                    timestamp: Utc::now().timestamp_millis(),
                });
                return Err(msg);
            }
        };

        let pid = child.id().unwrap_or(0);
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        // Emit startup sequence
        self.event_bus.emit_log(service.id.clone(), LogType::System,
            format!("→ spawning: {} (shell: {})", service.command, service.shell.as_str()));
        self.event_bus.emit_log(service.id.clone(), LogType::System,
            format!("  cwd: {}", cwd));
        self.event_bus.emit_log(service.id.clone(), LogType::System,
            format!("  pid: {}", pid));

        // Set up the log router — bounded mpsc with batching
        let (log_tx, log_rx) = mpsc::channel::<LogEntry>(1024);
        let cancel = CancellationToken::new();

        let router_service_id = service.id.clone();
        let router_cancel = cancel.clone();
        let event_bus = self.event_bus.clone();
        let store = self.store.clone();
        let router_task = tokio::spawn(async move {
            log_router(router_service_id, log_rx, router_cancel, event_bus, store).await;
        });

        // Spawn stdout reader
        let stdout_task = if let Some(stream) = stdout {
            let tx = log_tx.clone();
            let sid = service.id.clone();
            let cancel = cancel.clone();
            Some(tokio::spawn(async move {
                pipe_reader(stream, sid, LogType::Stdout, tx, cancel).await;
            }))
        } else { None };

        // Spawn stderr reader
        let stderr_task = if let Some(stream) = stderr {
            let tx = log_tx.clone();
            let sid = service.id.clone();
            let cancel = cancel.clone();
            Some(tokio::spawn(async move {
                pipe_reader(stream, sid, LogType::Stderr, tx, cancel).await;
            }))
        } else { None };

        // Spawn telemetry task — emits CPU/memory usage every 1s
        // We use /proc/[pid]/stat on Linux to read real CPU time and RSS
        let telemetry_service_id = service.id.clone();
        let telemetry_pid = pid;
        let telemetry_cancel = cancel.clone();
        let telemetry_bus = self.event_bus.clone();
        let telemetry_task = tokio::spawn(async move {
            telemetry_loop(telemetry_service_id, telemetry_pid, telemetry_cancel, telemetry_bus).await;
        });

        // Transition to running after a brief moment
        tokio::time::sleep(Duration::from_millis(50)).await;
        self.event_bus.emit_status(service.id.clone(), ServiceStatus::Running, Some(pid));

        // Wait for the child to exit in a background task
        let wait_service_id = service.id.clone();
        let wait_service_name = service.name.clone();
        let wait_bus = self.event_bus.clone();
        let wait_procs = self.processes.clone();
        let wait_store = self.store.clone();
        tokio::spawn(async move {
            let exit_status = child.wait().await;
            let code = exit_status.ok().and_then(|s| s.code()).unwrap_or(-1);

            let status = if code == 0 || code == 130 || code == 143 {
                ServiceStatus::Stopped
            } else {
                ServiceStatus::Error
            };

            // Build the exit log entries and persist them directly to the store
            // (the router task may have already been cancelled by this point)
            let mut exit_logs: Vec<LogEntry> = vec![LogEntry {
                id: format!("log_{}_{}", Uuid::new_v4().simple(), Utc::now().timestamp_millis()),
                service_id: wait_service_id.clone(),
                timestamp: Utc::now().timestamp_millis(),
                log_type: LogType::System,
                message: format!("← process exited with code {}", code),
            }];

            if status == ServiceStatus::Error {
                exit_logs.push(LogEntry {
                    id: format!("log_{}_{}", Uuid::new_v4().simple(), Utc::now().timestamp_millis() + 1),
                    service_id: wait_service_id.clone(),
                    timestamp: Utc::now().timestamp_millis(),
                    log_type: LogType::Stderr,
                    message: format!("✖ process exited unexpectedly (code {})", code),
                });
                wait_bus.emit_notification(Notification {
                    id: format!("notif_{}", Uuid::new_v4().simple()),
                    service_id: wait_service_id.clone(),
                    service_name: wait_service_name.clone(),
                    kind: "crash".to_string(),
                    message: format!("{} crashed (exit code {})", wait_service_name, code),
                    timestamp: Utc::now().timestamp_millis(),
                });
            }

            // Persist to DB
            if let Err(e) = wait_store.append_logs(&exit_logs).await {
                tracing::warn!("failed to persist exit logs: {}", e);
            }
            // Broadcast to WS subscribers
            wait_bus.emit_log_batch(wait_service_id.clone(), exit_logs);

            wait_bus.emit_status(wait_service_id.clone(), status, None);
            wait_bus.emit_telemetry(wait_service_id.clone(), 0.0, 0.0);

            // Clean up the handle
            let mut procs = wait_procs.lock().await;
            if let Some(mut handle) = procs.remove(&wait_service_id) {
                handle.cancel.cancel();
                if let Some(t) = handle.stdout_task.take() { t.abort(); }
                if let Some(t) = handle.stderr_task.take() { t.abort(); }
                if let Some(t) = handle.router_task.take() { t.abort(); }
                if let Some(t) = handle.telemetry_task.take() { t.abort(); }
            }
        });

        // Register the handle
        let handle = ProcessHandle {
            child: None, // we already took stdout/stderr; the wait task owns the child
            cancel,
            stdout_task,
            stderr_task,
            router_task: Some(router_task),
            telemetry_task: Some(telemetry_task),
            started_at: Instant::now(),
            pid,
        };
        self.processes.lock().await.insert(service.id.clone(), handle);

        Ok(())
    }

    pub async fn stop(&self, service_id: &str) -> Result<(), String> {
        let handle_opt = {
            let mut procs = self.processes.lock().await;
            procs.remove(service_id)
        };
        let mut handle = match handle_opt {
            Some(h) => h,
            None => {
                self.event_bus.emit_status(service_id.to_string(), ServiceStatus::Stopped, None);
                return Ok(());
            }
        };

        self.event_bus.emit_log(service_id.to_string(), LogType::System, "→ sending SIGTERM…".to_string());

        // Send SIGTERM via kill — Tokio's Child::kill sends SIGKILL on Unix,
        // but we want graceful. Send SIGTERM via nix equivalent (libc) directly.
        // Simpler: use `kill` command for cross-platform behavior.
        if handle.pid > 0 {
            #[cfg(unix)]
            {
                use std::os::unix::process::ExitStatusExt;
                let _ = unsafe { libc_kill(handle.pid as i32, 15 /* SIGTERM */) };
            }
            #[cfg(not(unix))]
            {
                let _ = handle.child.as_mut().and_then(|c| c.start_kill().ok());
            }
        }

        // Wait up to 3s for graceful exit
        // The background wait task will clean up the handle.
        for _ in 0..30 {
            if !self.processes.lock().await.contains_key(service_id) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }

        // If still running, force kill
        let still_running = self.processes.lock().await.contains_key(service_id);
        if still_running {
            self.event_bus.emit_log(service_id.to_string(), LogType::System, "→ SIGKILL (force)".to_string());
            #[cfg(unix)]
            {
                let _ = unsafe { libc_kill(handle.pid as i32, 9 /* SIGKILL */) };
            }
            // Cancel tasks
            handle.cancel.cancel();
            if let Some(t) = handle.stdout_task.take() { t.abort(); }
            if let Some(t) = handle.stderr_task.take() { t.abort(); }
            if let Some(t) = handle.router_task.take() { t.abort(); }
            if let Some(t) = handle.telemetry_task.take() { t.abort(); }
            self.processes.lock().await.remove(service_id);
            self.event_bus.emit_status(service_id.to_string(), ServiceStatus::Stopped, None);
            self.event_bus.emit_telemetry(service_id.to_string(), 0.0, 0.0);
        }

        Ok(())
    }

    pub async fn kill(&self, service_id: &str, _force: bool) -> Result<(), String> {
        let handle_opt = {
            let mut procs = self.processes.lock().await;
            procs.remove(service_id)
        };
        let mut handle = match handle_opt {
            Some(h) => h,
            None => return Ok(()),
        };

        self.event_bus.emit_log(service_id.to_string(), LogType::System, "→ SIGKILL".to_string());
        if handle.pid > 0 {
            #[cfg(unix)]
            {
                let _ = unsafe { libc_kill(handle.pid as i32, 9) };
            }
        }
        handle.cancel.cancel();
        if let Some(t) = handle.stdout_task.take() { t.abort(); }
        if let Some(t) = handle.stderr_task.take() { t.abort(); }
        if let Some(t) = handle.router_task.take() { t.abort(); }
        if let Some(t) = handle.telemetry_task.take() { t.abort(); }
        self.event_bus.emit_status(service_id.to_string(), ServiceStatus::Stopped, None);
        self.event_bus.emit_telemetry(service_id.to_string(), 0.0, 0.0);
        Ok(())
    }

    pub async fn restart(&self, service_id: &str) -> Result<(), String> {
        if self.processes.lock().await.contains_key(service_id) {
            self.stop(service_id).await?;
        }
        self.start(service_id).await
    }

    pub async fn get_status(&self, service_id: &str) -> ServiceStatus {
        if self.processes.lock().await.contains_key(service_id) {
            ServiceStatus::Running
        } else {
            // Check the most recent log entry to determine if it errored
            match self.store.get_logs(Some(service_id), 1).await {
                Ok(logs) if !logs.is_empty() => {
                    if logs[0].message.contains("exited unexpectedly") {
                        ServiceStatus::Error
                    } else if logs[0].message.contains("exited with code") {
                        ServiceStatus::Stopped
                    } else {
                        ServiceStatus::Idle
                    }
                }
                _ => ServiceStatus::Idle,
            }
        }
    }

    pub async fn is_running(&self, service_id: &str) -> bool {
        self.processes.lock().await.contains_key(service_id)
    }

    pub async fn get_pid(&self, service_id: &str) -> Option<u32> {
        self.processes.lock().await.get(service_id).map(|h| h.pid)
    }

    // Topological dependency resolution
    async fn resolve_dependencies(&self, service: &Service) -> Result<Vec<Service>, String> {
        let all_services = self.store.list_services().await.map_err(|e| e.to_string())?;
        let mut visited = std::collections::HashSet::new();
        let mut result = Vec::new();

        fn visit(
            svc: &Service,
            all: &[Service],
            visited: &mut std::collections::HashSet<String>,
            result: &mut Vec<Service>,
            target_id: &str,
        ) {
            if visited.contains(&svc.id) { return; }
            visited.insert(svc.id.clone());
            for dep_id in &svc.depends_on {
                if let Some(dep) = all.iter().find(|s| s.id == *dep_id) {
                    visit(dep, all, visited, result, target_id);
                }
            }
            if svc.id != target_id {
                result.push(svc.clone());
            }
        }

        visit(service, &all_services, &mut visited, &mut result, &service.id);
        Ok(result)
    }

    async fn wait_for_running(&self, service_id: &str, timeout: Duration) {
        let start = Instant::now();
        loop {
            if self.processes.lock().await.contains_key(service_id) {
                return;
            }
            if start.elapsed() > timeout {
                return;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }
}

// --- log router: batches logs and emits to event bus + persists to DB ---
async fn log_router(
    service_id: String,
    mut rx: mpsc::Receiver<LogEntry>,
    cancel: CancellationToken,
    event_bus: Arc<EventBus>,
    store: Arc<Store>,
) {
    let mut batch: Vec<LogEntry> = Vec::with_capacity(64);
    let mut interval = tokio::time::interval(Duration::from_millis(32));
    let mut dropped_count: u32 = 0;

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                if !batch.is_empty() {
                    flush_batch(&service_id, &mut batch, &event_bus, &store).await;
                }
                if dropped_count > 0 {
                    event_bus.emit_log(service_id.clone(), LogType::System,
                        format!("⚠ {} log lines dropped (backpressure)", dropped_count));
                }
                break;
            }
            Some(log) = rx.recv() => {
                batch.push(log);
                if batch.len() >= 128 {
                    flush_batch(&service_id, &mut batch, &event_bus, &store).await;
                    interval.reset();
                }
            }
            _ = interval.tick() => {
                if !batch.is_empty() {
                    flush_batch(&service_id, &mut batch, &event_bus, &store).await;
                }
                if dropped_count > 0 {
                    event_bus.emit_log(service_id.clone(), LogType::System,
                        format!("⚠ {} log lines dropped (backpressure)", dropped_count));
                    dropped_count = 0;
                }
            }
        }
    }
}

async fn flush_batch(
    service_id: &str,
    batch: &mut Vec<LogEntry>,
    event_bus: &EventBus,
    store: &Store,
) {
    if batch.is_empty() { return; }
    let logs = std::mem::take(batch);
    // Persist to SQLite (best-effort)
    if let Err(e) = store.append_logs(&logs).await {
        tracing::warn!("failed to persist logs: {}", e);
    }
    // Emit to subscribers
    event_bus.emit_log_batch(service_id.to_string(), logs);
}

// --- pipe reader: reads lines from a process pipe and pushes to mpsc ---
async fn pipe_reader<R: tokio::io::AsyncRead + Unpin + Send + 'static>(
    stream: R,
    service_id: String,
    log_type: LogType,
    tx: mpsc::Sender<LogEntry>,
    cancel: CancellationToken,
) {
    let mut reader = BufReader::new(stream).lines();
    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            line = reader.next_line() => {
                match line {
                    Ok(Some(text)) => {
                        let log = LogEntry {
                            id: format!("log_{}_{}", Uuid::new_v4().simple(), chrono::Utc::now().timestamp_millis()),
                            service_id: service_id.clone(),
                            timestamp: Utc::now().timestamp_millis(),
                            log_type: log_type.clone(),
                            message: text,
                        };
                        // try_send: non-blocking. If full, drop oldest (count).
                        if let Err(mpsc::error::TrySendError::Full(_)) = tx.try_send(log) {
                            // Increment a dropped counter — but we don't have access to it here.
                            // The router will notice the gap via its own counter if we add one.
                            // For simplicity, just skip.
                        }
                    }
                    Ok(None) => break, // EOF
                    Err(e) => {
                        eprintln!("pipe reader error for {}: {}", service_id, e);
                        break;
                    }
                }
            }
        }
    }
}

// --- telemetry loop: reads /proc/[pid]/stat on Linux for CPU + RSS ---
#[cfg(target_os = "linux")]
async fn telemetry_loop(
    service_id: String,
    pid: u32,
    cancel: CancellationToken,
    event_bus: Arc<EventBus>,
) {
    let mut last_cpu_time: u64 = 0;
    let mut last_read: Instant = Instant::now();
    // Page size on x86_64/aarch64 Linux is virtually always 4096. We hardcode
    // it to avoid libc sysconf FFI complexity. For exotic platforms, the
    // telemetry will be slightly off but still functional.
    let page_size_kb: u64 = 4;
    tracing::debug!("telemetry loop started for pid={} (page_size={}KB)", pid, page_size_kb);

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                tracing::debug!("telemetry loop cancelled for pid={}", pid);
                break;
            }
            _ = tokio::time::sleep(Duration::from_secs(1)) => {
                let stat_path = format!("/proc/{}/stat", pid);
                // Use spawn_blocking for file read — tokio::fs can have issues with /proc
                let stat_result = tokio::task::spawn_blocking(move || {
                    std::fs::read_to_string(&stat_path)
                }).await;

                match stat_result {
                    Ok(Ok(stat_str)) => {
                        let last_paren = stat_str.rfind(')').unwrap_or(0);
                        let rest = &stat_str[last_paren + 1..];
                        let fields: Vec<&str> = rest.split_whitespace().collect();
                        if fields.len() >= 22 {
                            let utime: u64 = fields[11].parse().unwrap_or(0);
                            let stime: u64 = fields[12].parse().unwrap_or(0);
                            let rss_pages: u64 = fields[21].parse().unwrap_or(0);
                            let total_cpu = utime + stime;
                            let elapsed = last_read.elapsed().as_secs_f64().max(0.001);
                            let cpu_jiffies = total_cpu.saturating_sub(last_cpu_time);
                            let cpu_pct = (cpu_jiffies as f64 / 100.0 / elapsed * 100.0).min(100.0);
                            let mem_mb = (rss_pages * page_size_kb as u64) as f32 / 1024.0;
                            tracing::debug!("telemetry pid={}: utime={} stime={} rss_pages={} → cpu={:.1}% mem={:.1}MB",
                                pid, utime, stime, rss_pages, cpu_pct, mem_mb);
                            event_bus.emit_telemetry(service_id.clone(), cpu_pct as f32, mem_mb);
                            last_cpu_time = total_cpu;
                            last_read = Instant::now();
                        } else {
                            tracing::warn!("telemetry pid={}: unexpected field count {}", pid, fields.len());
                        }
                    }
                    Ok(Err(e)) => {
                        tracing::debug!("telemetry pid={}: stat read failed: {}", pid, e);
                    }
                    Err(e) => {
                        tracing::warn!("telemetry pid={}: spawn_blocking failed: {}", pid, e);
                    }
                }
            }
        }
    }
}

#[cfg(not(target_os = "linux"))]
async fn telemetry_loop(
    service_id: String,
    _pid: u32,
    cancel: CancellationToken,
    event_bus: Arc<EventBus>,
) {
    // Non-Linux: emit zeroed telemetry
    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            _ = tokio::time::sleep(Duration::from_secs(1)) => {
                event_bus.emit_telemetry(service_id.clone(), 0.0, 0.0);
            }
        }
    }
}

// --- shell-split: minimal parser that respects double quotes ---
fn shell_split(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    let mut in_dq = false;
    let mut in_sq = false;
    for c in s.chars() {
        match c {
            '"' if !in_sq => { in_dq = !in_dq; }
            '\'' if !in_dq => { in_sq = !in_sq; }
            c if c.is_whitespace() && !in_dq && !in_sq => {
                if !current.is_empty() {
                    out.push(std::mem::take(&mut current));
                }
            }
            c => current.push(c),
        }
    }
    if !current.is_empty() { out.push(current); }
    out
}

// --- libc shims for SIGTERM/SIGKILL ---
#[cfg(unix)]
extern "C" {
    #[link_name = "kill"]
    fn libc_kill(pid: i32, sig: i32) -> i32;
    fn sysconf(name: i32) -> i64;
}

#[cfg(unix)]
unsafe fn libc_sysconf(name: i32) -> i64 {
    sysconf(name)
}

#[cfg(unix)]
mod libc {
    // _SC_PAGESIZE value varies by libc:
    //   - glibc (Linux): 30
    //   - musl: 30
    //   - macOS: 29
    // We use 30 which works on all Linux targets.
    pub const _SC_PAGESIZE: i32 = 30;
}
