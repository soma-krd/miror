// SQLite-backed persistence for projects, services, and recent logs.
// Uses rusqlite (synchronous) wrapped in tokio::task::spawn_blocking to avoid
// blocking the async runtime. State is small enough that a Mutex<Connection>
// is sufficient — no connection pool needed.

use std::path::Path;
use std::sync::Arc;
use tokio::sync::Mutex;
use rusqlite::{params, Connection};
use anyhow::{Result, Context};
use uuid::Uuid;
use chrono::Utc;

use crate::models::*;

pub struct Store {
    conn: Arc<Mutex<Connection>>,
}

impl Store {
    pub fn new(db_path: &Path) -> Result<Self> {
        let conn = Connection::open(db_path)
            .with_context(|| format!("failed to open sqlite at {:?}", db_path))?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        Self::migrate(&conn)?;
        Ok(Self { conn: Arc::new(Mutex::new(conn)) })
    }

    fn migrate(conn: &Connection) -> Result<()> {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                root_path TEXT NOT NULL,
                icon TEXT,
                color TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS services (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                cwd TEXT NOT NULL,
                command TEXT NOT NULL,
                shell TEXT NOT NULL,
                env TEXT NOT NULL,         -- JSON
                auto_start INTEGER NOT NULL,
                depends_on TEXT NOT NULL,   -- JSON array
                port INTEGER,
                health_probe TEXT NOT NULL DEFAULT '{"type":"none"}',  -- JSON HealthProbe
                restart_count INTEGER NOT NULL DEFAULT 0,
                total_uptime_ms INTEGER NOT NULL DEFAULT 0,
                last_start_duration_ms INTEGER
            );

            CREATE TABLE IF NOT EXISTS logs (
                id TEXT PRIMARY KEY,
                service_id TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                log_type TEXT NOT NULL,
                message TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_logs_service ON logs(service_id, timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(timestamp DESC);
            "#,
        )?;
        Ok(())
    }

    // ---------- Projects ----------

    pub async fn list_projects(&self) -> Result<Vec<Project>> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || {
            let c = conn.blocking_lock();
            let mut stmt = c.prepare("SELECT id, name, root_path, icon, color, created_at FROM projects ORDER BY created_at")?;
            let rows = stmt.query_map([], |r| {
                Ok(Project {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    root_path: r.get(2)?,
                    icon: r.get(3)?,
                    color: r.get(4)?,
                    created_at: r.get(5)?,
                })
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        }).await?
    }

    pub async fn create_project(&self, p: CreateProjectPayload) -> Result<Project> {
        let id = format!("proj_{}", Uuid::new_v4().simple());
        let created_at = Utc::now().to_rfc3339();
        let project = Project {
            id: id.clone(),
            name: p.name,
            root_path: p.root_path,
            icon: p.icon,
            color: p.color,
            created_at,
        };
        let conn = self.conn.clone();
        let p_clone = project.clone();
        tokio::task::spawn_blocking(move || {
            let c = conn.blocking_lock();
            c.execute(
                "INSERT INTO projects (id, name, root_path, icon, color, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                params![p_clone.id, p_clone.name, p_clone.root_path, p_clone.icon, p_clone.color, p_clone.created_at],
            )?;
            Ok::<_, anyhow::Error>(())
        }).await??;
        Ok(project)
    }

    pub async fn update_project(&self, id: &str, patch: UpdateProjectPayload) -> Result<()> {
        let conn = self.conn.clone();
        let id = id.to_string();
        tokio::task::spawn_blocking(move || {
            let c = conn.blocking_lock();
            if let Some(v) = patch.name { c.execute("UPDATE projects SET name=? WHERE id=?", params![v, id])?; }
            if let Some(v) = patch.root_path { c.execute("UPDATE projects SET root_path=? WHERE id=?", params![v, id])?; }
            if let Some(v) = patch.icon { c.execute("UPDATE projects SET icon=? WHERE id=?", params![v, id])?; }
            if let Some(v) = patch.color { c.execute("UPDATE projects SET color=? WHERE id=?", params![v, id])?; }
            Ok::<_, anyhow::Error>(())
        }).await??;
        Ok(())
    }

    pub async fn delete_project(&self, id: &str) -> Result<()> {
        let conn = self.conn.clone();
        let id = id.to_string();
        tokio::task::spawn_blocking(move || {
            let c = conn.blocking_lock();
            c.execute("DELETE FROM projects WHERE id=?", params![id])?;
            Ok::<_, anyhow::Error>(())
        }).await??;
        Ok(())
    }

    pub async fn get_project(&self, id: &str) -> Result<Option<Project>> {
        let conn = self.conn.clone();
        let id = id.to_string();
        tokio::task::spawn_blocking(move || {
            let c = conn.blocking_lock();
            let mut stmt = c.prepare("SELECT id, name, root_path, icon, color, created_at FROM projects WHERE id=?")?;
            let mut rows = stmt.query_map(params![id], |r| {
                Ok(Project {
                    id: r.get(0)?, name: r.get(1)?, root_path: r.get(2)?,
                    icon: r.get(3)?, color: r.get(4)?, created_at: r.get(5)?,
                })
            })?;
            rows.next().transpose().map_err(Into::into)
        }).await?
    }

    // ---------- Services ----------

    pub async fn list_services(&self) -> Result<Vec<Service>> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || {
            let c = conn.blocking_lock();
            // Use try_get for the new columns in case the DB was created before the migration
            let mut stmt = c.prepare("SELECT id, project_id, name, cwd, command, shell, env, auto_start, depends_on, port, health_probe, restart_count, total_uptime_ms, last_start_duration_ms FROM services")?;
            let rows = stmt.query_map([], |r| {
                let env_json: String = r.get(6)?;
                let depends_json: String = r.get(8)?;
                let env: std::collections::HashMap<String, String> = serde_json::from_str(&env_json).unwrap_or_default();
                let depends_on: Vec<String> = serde_json::from_str(&depends_json).unwrap_or_default();
                let shell_str: String = r.get(5)?;
                let shell = match shell_str.as_str() {
                    "zsh" => Shell::Zsh,
                    "powershell" => Shell::Powershell,
                    "cmd" => Shell::Cmd,
                    _ => Shell::Bash,
                };
                let probe_json: String = r.get(10).unwrap_or_else(|_| "{\"type\":\"none\"}".to_string());
                let health_probe: HealthProbe = serde_json::from_str(&probe_json).unwrap_or_default();
                Ok(Service {
                    id: r.get(0)?,
                    project_id: r.get(1)?,
                    name: r.get(2)?,
                    cwd: r.get(3)?,
                    command: r.get(4)?,
                    shell,
                    env,
                    auto_start: r.get::<_, i64>(7)? != 0,
                    depends_on,
                    port: r.get(9)?,
                    status: ServiceStatus::Idle,
                    pid: None,
                    started_at: None,
                    cpu: None,
                    memory: None,
                    uptime_ms: None,
                    exit_code: None,
                    restart_count: r.get::<_, i64>(11).unwrap_or(0) as u32,
                    total_uptime_ms: r.get::<_, i64>(12).unwrap_or(0) as u64,
                    last_start_duration_ms: r.get::<_, Option<i64>>(13).unwrap_or(None).map(|v| v as u64),
                    ready: false,
                    health_probe,
                })
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        }).await?
    }

    pub async fn list_services_for_project(&self, project_id: &str) -> Result<Vec<Service>> {
        let all = self.list_services().await?;
        Ok(all.into_iter().filter(|s| s.project_id == project_id).collect())
    }

    pub async fn create_service(&self, p: CreateServicePayload) -> Result<Service> {
        let id = format!("svc_{}_{}", Uuid::new_v4().simple(), chrono::Utc::now().timestamp() % 100000);
        let port = p.env.get("PORT").and_then(|v| v.parse().ok());
        let service = Service {
            id: id.clone(),
            project_id: p.project_id,
            name: p.name,
            cwd: p.cwd,
            command: p.command,
            shell: p.shell,
            env: p.env,
            auto_start: p.auto_start,
            depends_on: p.depends_on,
            port,
            status: ServiceStatus::Idle,
            pid: None, started_at: None, cpu: None, memory: None, uptime_ms: None, exit_code: None,
            restart_count: 0,
            total_uptime_ms: 0,
            last_start_duration_ms: None,
            ready: false,
            health_probe: p.health_probe.clone(),
        };
        let conn = self.conn.clone();
        let s = service.clone();
        tokio::task::spawn_blocking(move || {
            let c = conn.blocking_lock();
            let env_json = serde_json::to_string(&s.env)?;
            let depends_json = serde_json::to_string(&s.depends_on)?;
            let probe_json = serde_json::to_string(&s.health_probe)?;
            c.execute(
                "INSERT INTO services (id, project_id, name, cwd, command, shell, env, auto_start, depends_on, port, health_probe) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                params![s.id, s.project_id, s.name, s.cwd, s.command, s.shell.as_str(), env_json, s.auto_start as i64, depends_json, s.port, probe_json],
            )?;
            Ok::<_, anyhow::Error>(())
        }).await??;
        Ok(service)
    }

    pub async fn update_service(&self, id: &str, patch: UpdateServicePayload) -> Result<()> {
        let conn = self.conn.clone();
        let id = id.to_string();
        tokio::task::spawn_blocking(move || {
            let c = conn.blocking_lock();
            if let Some(v) = patch.name { c.execute("UPDATE services SET name=? WHERE id=?", params![v, id])?; }
            if let Some(v) = patch.cwd { c.execute("UPDATE services SET cwd=? WHERE id=?", params![v, id])?; }
            if let Some(v) = patch.command { c.execute("UPDATE services SET command=? WHERE id=?", params![v, id])?; }
            if let Some(v) = patch.shell { c.execute("UPDATE services SET shell=? WHERE id=?", params![v.as_str(), id])?; }
            if let Some(v) = patch.env {
                let env_json = serde_json::to_string(&v)?;
                let port = v.get("PORT").and_then(|p| p.parse::<u16>().ok());
                c.execute("UPDATE services SET env=?, port=? WHERE id=?", params![env_json, port, id])?;
            }
            if let Some(v) = patch.auto_start { c.execute("UPDATE services SET auto_start=? WHERE id=?", params![v as i64, id])?; }
            if let Some(v) = patch.depends_on {
                let depends_json = serde_json::to_string(&v)?;
                c.execute("UPDATE services SET depends_on=? WHERE id=?", params![depends_json, id])?;
            }
            if let Some(v) = patch.health_probe {
                let probe_json = serde_json::to_string(&v)?;
                c.execute("UPDATE services SET health_probe=? WHERE id=?", params![probe_json, id])?;
            }
            Ok::<_, anyhow::Error>(())
        }).await??;
        Ok(())
    }

    pub async fn delete_service(&self, id: &str) -> Result<()> {
        let conn = self.conn.clone();
        let id = id.to_string();
        tokio::task::spawn_blocking(move || {
            let c = conn.blocking_lock();
            c.execute("DELETE FROM services WHERE id=?", params![id])?;
            // also null out depends_on references
            let mut stmt = c.prepare("SELECT id, depends_on FROM services WHERE depends_on LIKE ?")?;
            let mut updates: Vec<(String, Vec<String>)> = Vec::new();
            let pattern = format!("%\"{}\"%", id);
            let rows = stmt.query_map(params![pattern], |r| {
                let sid: String = r.get(0)?;
                let dj: String = r.get(1)?;
                let deps: Vec<String> = serde_json::from_str(&dj).unwrap_or_default();
                Ok((sid, deps))
            })?;
            for r in rows {
                if let Ok((sid, deps)) = r {
                    let filtered: Vec<String> = deps.into_iter().filter(|d| d != &id).collect();
                    updates.push((sid, filtered));
                }
            }
            drop(stmt);
            for (sid, deps) in updates {
                let dj = serde_json::to_string(&deps)?;
                c.execute("UPDATE services SET depends_on=? WHERE id=?", params![dj, sid])?;
            }
            Ok::<_, anyhow::Error>(())
        }).await??;
        Ok(())
    }

    // Update lifecycle stats for a service (Feature 5)
    pub async fn update_lifecycle_stats(
        &self,
        id: &str,
        restart_count: Option<u32>,
        total_uptime_ms: Option<u64>,
        last_start_duration_ms: Option<u64>,
    ) -> Result<()> {
        let conn = self.conn.clone();
        let id = id.to_string();
        tokio::task::spawn_blocking(move || {
            let c = conn.blocking_lock();
            if let Some(v) = restart_count {
                c.execute("UPDATE services SET restart_count=? WHERE id=?", params![v as i64, id])?;
            }
            if let Some(v) = total_uptime_ms {
                c.execute("UPDATE services SET total_uptime_ms=? WHERE id=?", params![v as i64, id])?;
            }
            if let Some(v) = last_start_duration_ms {
                c.execute("UPDATE services SET last_start_duration_ms=? WHERE id=?", params![v as i64, id])?;
            }
            Ok::<_, anyhow::Error>(())
        }).await??;
        Ok(())
    }

    pub async fn get_service(&self, id: &str) -> Result<Option<Service>> {
        let all = self.list_services().await?;
        Ok(all.into_iter().find(|s| s.id == id))
    }

    // ---------- Logs (ring buffer) ----------

    pub async fn append_logs(&self, logs: &[LogEntry]) -> Result<()> {
        if logs.is_empty() { return Ok(()); }
        let conn = self.conn.clone();
        let logs = logs.to_vec();
        tokio::task::spawn_blocking(move || {
            let c = conn.blocking_lock();
            {
                let tx = c.unchecked_transaction()?;
                {
                    let mut stmt = tx.prepare("INSERT INTO logs (id, service_id, timestamp, log_type, message) VALUES (?, ?, ?, ?, ?)")?;
                    for log in &logs {
                        let lt = match log.log_type {
                            LogType::Stdout => "stdout",
                            LogType::Stderr => "stderr",
                            LogType::System => "system",
                        };
                        stmt.execute(params![log.id, log.service_id, log.timestamp, lt, log.message])?;
                    }
                    drop(stmt);
                    // Trim: keep only last 5000 logs per service
                    tx.execute(
                        "DELETE FROM logs WHERE id IN (
                            SELECT id FROM logs l1
                            WHERE (SELECT COUNT(*) FROM logs l2 WHERE l2.service_id = l1.service_id AND l2.timestamp > l1.timestamp) >= 5000
                        )", []
                    )?;
                    tx.commit()?;
                }
            }
            Ok::<_, anyhow::Error>(())
        }).await??;
        Ok(())
    }

    pub async fn get_logs(&self, service_id: Option<&str>, limit: u32) -> Result<Vec<LogEntry>> {
        let conn = self.conn.clone();
        let sid = service_id.map(|s| s.to_string());
        tokio::task::spawn_blocking(move || {
            let c = conn.blocking_lock();
            let mut stmt = if sid.is_some() {
                c.prepare("SELECT id, service_id, timestamp, log_type, message FROM logs WHERE service_id=? ORDER BY timestamp DESC LIMIT ?")?
            } else {
                c.prepare("SELECT id, service_id, timestamp, log_type, message FROM logs ORDER BY timestamp DESC LIMIT ?")?
            };
            let rows = if let Some(sid) = &sid {
                stmt.query_map(params![sid, limit], map_log)?
            } else {
                stmt.query_map(params![limit], map_log)?
            };
            let mut logs: Vec<LogEntry> = rows.collect::<rusqlite::Result<Vec<_>>>()?;
            logs.reverse(); // we want ascending order
            Ok(logs)
        }).await?
    }

    pub async fn clear_logs(&self, service_id: Option<&str>) -> Result<()> {
        let conn = self.conn.clone();
        let sid = service_id.map(|s| s.to_string());
        tokio::task::spawn_blocking(move || {
            let c = conn.blocking_lock();
            if let Some(sid) = &sid {
                c.execute("DELETE FROM logs WHERE service_id=?", params![sid])?;
            } else {
                c.execute("DELETE FROM logs", [])?;
            }
            Ok::<_, anyhow::Error>(())
        }).await??;
        Ok(())
    }

    // ---------- Seed ----------

    pub async fn seed_if_empty(&self) -> Result<()> {
        let projects = self.list_projects().await?;
        if !projects.is_empty() { return Ok(()); }

        tracing::info!("seeding initial projects and services");

        let boto = self.create_project(CreateProjectPayload {
            name: "Boto.social".to_string(),
            root_path: "/home/z/my-project/test-projects/boto".to_string(),
            icon: Some("🟢".to_string()),
            color: Some("#10b981".to_string()),
        }).await?;

        let mut env_redis = std::collections::HashMap::new();
        env_redis.insert("REDIS_PORT".to_string(), "6379".to_string());
        let svc_redis = self.create_service(CreateServicePayload {
            project_id: boto.id.clone(),
            name: "Redis".to_string(),
            cwd: ".".to_string(),
            command: "./redis-sim.sh".to_string(),
            shell: Shell::Bash,
            env: env_redis,
            auto_start: true,
            depends_on: vec![],
            health_probe: HealthProbe::None,
        }).await?;

        let mut env_api = std::collections::HashMap::new();
        env_api.insert("PORT".to_string(), "3001".to_string());
        env_api.insert("NODE_ENV".to_string(), "development".to_string());
        let svc_api = self.create_service(CreateServicePayload {
            project_id: boto.id.clone(),
            name: "Backend API".to_string(),
            cwd: "apps/api".to_string(),
            command: "./api-sim.sh".to_string(),
            shell: Shell::Bash,
            env: env_api,
            auto_start: true,
            depends_on: vec![svc_redis.id.clone()],
            health_probe: HealthProbe::Log { pattern: "Ready".to_string(), log_type: None },
        }).await?;

        let mut env_web = std::collections::HashMap::new();
        env_web.insert("PORT".to_string(), "3000".to_string());
        let _svc_web = self.create_service(CreateServicePayload {
            project_id: boto.id.clone(),
            name: "Frontend Web".to_string(),
            cwd: "apps/web".to_string(),
            command: "./web-sim.sh".to_string(),
            shell: Shell::Bash,
            env: env_web,
            auto_start: false,
            depends_on: vec![svc_api.id.clone()],
            health_probe: HealthProbe::Log { pattern: "Local".to_string(), log_type: None },
        }).await?;

        let _svc_worker = self.create_service(CreateServicePayload {
            project_id: boto.id.clone(),
            name: "Queue Worker".to_string(),
            cwd: "apps/worker".to_string(),
            command: "./worker-sim.sh".to_string(),
            shell: Shell::Bash,
            env: std::collections::HashMap::new(),
            auto_start: false,
            depends_on: vec![svc_redis.id.clone()],
            health_probe: HealthProbe::Log { pattern: "Ready".to_string(), log_type: None },
        }).await?;

        // Second project — Atlas Analytics
        let atlas = self.create_project(CreateProjectPayload {
            name: "Atlas Analytics".to_string(),
            root_path: "/home/z/my-project/test-projects/atlas".to_string(),
            icon: Some("📊".to_string()),
            color: Some("#f59e0b".to_string()),
        }).await?;

        let mut env_pg = std::collections::HashMap::new();
        env_pg.insert("POSTGRES_PORT".to_string(), "5432".to_string());
        let svc_pg = self.create_service(CreateServicePayload {
            project_id: atlas.id.clone(),
            name: "PostgreSQL".to_string(),
            cwd: ".".to_string(),
            command: "./pg-sim.sh".to_string(),
            shell: Shell::Bash,
            env: env_pg,
            auto_start: true,
            depends_on: vec![],
            health_probe: HealthProbe::None,
        }).await?;

        let mut env_rust = std::collections::HashMap::new();
        env_rust.insert("RUST_LOG".to_string(), "info".to_string());
        let svc_rust = self.create_service(CreateServicePayload {
            project_id: atlas.id.clone(),
            name: "Analytics API".to_string(),
            cwd: "apps/api".to_string(),
            command: "./rust-sim.sh".to_string(),
            shell: Shell::Bash,
            env: env_rust,
            auto_start: true,
            depends_on: vec![svc_pg.id.clone()],
            health_probe: HealthProbe::Log { pattern: "listening".to_string(), log_type: None },
        }).await?;

        let mut env_dash = std::collections::HashMap::new();
        env_dash.insert("PORT".to_string(), "3002".to_string());
        let _svc_dash = self.create_service(CreateServicePayload {
            project_id: atlas.id.clone(),
            name: "Dashboard UI".to_string(),
            cwd: "apps/web".to_string(),
            command: "./dash-sim.sh".to_string(),
            shell: Shell::Bash,
            env: env_dash,
            auto_start: false,
            depends_on: vec![svc_rust.id.clone()],
            health_probe: HealthProbe::Log { pattern: "Local".to_string(), log_type: None },
        }).await?;

        Ok(())
    }
}

fn map_log(r: &rusqlite::Row) -> rusqlite::Result<LogEntry> {
    let lt: String = r.get(3)?;
    let log_type = match lt.as_str() {
        "stderr" => LogType::Stderr,
        "system" => LogType::System,
        _ => LogType::Stdout,
    };
    Ok(LogEntry {
        id: r.get(0)?,
        service_id: r.get(1)?,
        timestamp: r.get(2)?,
        log_type,
        message: r.get(4)?,
    })
}
