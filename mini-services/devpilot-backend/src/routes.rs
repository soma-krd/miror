// HTTP + WebSocket routes. The HTTP API is RESTful; WebSocket is for
// real-time log streaming, status changes, and telemetry.

use std::sync::Arc;
use axum::{
    extract::{Path, Query, State, ws::{Message, WebSocketUpgrade, WebSocket}},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, post, put, delete},
    Router,
};
use serde::Deserialize;
use serde_json::json;
use futures_util::{SinkExt, StreamExt as _};
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt as TokioStreamExt;

use crate::models::*;
use crate::store::Store;
use crate::process_manager::ProcessManager;
use crate::event_bus::EventBus;
use crate::services;

#[derive(Clone)]
pub struct AppState {
    pub store: Arc<Store>,
    pub pm: Arc<ProcessManager>,
    pub event_bus: Arc<EventBus>,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        // Projects
        .route("/api/projects", get(list_projects).post(create_project))
        .route("/api/projects/:id", get(get_project).put(update_project).delete(delete_project))
        .route("/api/projects/:id/devpilot.json", get(export_devpilot_json).post(import_devpilot_json))
        .route("/api/projects/:id/docker", get(get_docker_info))
        .route("/api/projects/:id/env-profile", post(apply_env_profile))
        // Services
        .route("/api/services", get(list_services).post(create_service))
        .route("/api/services/:id", get(get_service).put(update_service).delete(delete_service))
        .route("/api/services/:id/start", post(start_service))
        .route("/api/services/:id/stop", post(stop_service))
        .route("/api/services/:id/kill", post(kill_service))
        .route("/api/services/:id/restart", post(restart_service))
        .route("/api/services/:id/status", get(get_service_status))
        .route("/api/services/:id/editor/:editor", post(open_in_editor))
        // Bulk ops
        .route("/api/projects/:id/start-all", post(start_all_in_project))
        .route("/api/projects/:id/stop-all", post(stop_all_in_project))
        .route("/api/projects/:id/restart-all", post(restart_all_in_project))
        // Logs
        .route("/api/logs", get(list_logs))
        .route("/api/logs/:service_id", get(list_logs_for_service))
        .route("/api/logs", delete(clear_logs))
        // Env file
        .route("/api/env-file", get(read_env_file_endpoint).post(write_env_file_endpoint))
        // Port Conflict Radar (Feature 1)
        .route("/api/ports", get(scan_ports_endpoint))
        .route("/api/ports/:port/kill", post(kill_port_holder))
        // Health probe (Feature 2) — manually trigger a probe check
        .route("/api/services/:id/probe", get(run_probe_endpoint))
        // Git Integration (Feature 8)
        .route("/api/projects/:id/git", get(get_git_status_endpoint))
        .route("/api/projects/:id/git/branches", get(get_git_branches_endpoint))
        .route("/api/projects/:id/git/log", get(get_git_log_endpoint))
        .route("/api/projects/:id/git/tree", get(get_git_tree_endpoint))
        .route("/api/projects/:id/git/push", post(git_push_endpoint))
        .route("/api/projects/:id/git/pull", post(git_pull_endpoint))
        .route("/api/projects/:id/git/checkout", post(git_checkout_endpoint))
        .route("/api/projects/:id/git/command", post(git_command_endpoint))
        // Database Browser (Feature 7)
        .route("/api/database/sqlite/info", get(sqlite_info).post(sqlite_info))
        .route("/api/database/sqlite/query", post(sqlite_query_endpoint))
        .route("/api/database/sqlite/schema/:table", get(sqlite_schema_endpoint))
        .route("/api/database/postgres/info", post(postgres_info_endpoint))
        .route("/api/database/postgres/query", post(postgres_query_endpoint))
        .route("/api/database/mysql/info", post(mysql_info_endpoint))
        .route("/api/database/mysql/query", post(mysql_query_endpoint))
        .route("/api/database/redis/scan", post(redis_scan_endpoint))
        .route("/api/database/redis/key", get(redis_get_key_endpoint).post(redis_set_key_endpoint))
        .route("/api/database/redis/delete", post(redis_delete_key_endpoint))
        .route("/api/database/redis/execute", post(redis_execute_endpoint))
        // Resource History (Feature 9)
        .route("/api/services/:id/history", get(get_resource_history))
        // Health
        .route("/api/health", get(health))
        // WebSocket
        .route("/ws", get(ws_handler))
        .layer(tower_http::cors::CorsLayer::very_permissive())
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .with_state(state)
}

// ---------- Projects ----------

async fn list_projects(State(s): State<AppState>) -> impl IntoResponse {
    match s.store.list_projects().await {
        Ok(p) => Json(json!(p)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn get_project(State(s): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    match s.store.get_project(&id).await {
        Ok(Some(p)) => Json(json!(p)).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "project not found").into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn create_project(State(s): State<AppState>, Json(p): Json<CreateProjectPayload>) -> impl IntoResponse {
    match s.store.create_project(p).await {
        Ok(proj) => (StatusCode::CREATED, Json(json!(proj))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn update_project(State(s): State<AppState>, Path(id): Path<String>, Json(p): Json<UpdateProjectPayload>) -> impl IntoResponse {
    match s.store.update_project(&id, p).await {
        Ok(_) => Json(json!({"ok": true})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn delete_project(State(s): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    // Stop all services in the project first
    if let Ok(services) = s.store.list_services_for_project(&id).await {
        for svc in services {
            let _ = s.pm.stop(&svc.id).await;
        }
    }
    match s.store.delete_project(&id).await {
        Ok(_) => Json(json!({"ok": true})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn export_devpilot_json(State(s): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let project = match s.store.get_project(&id).await {
        Ok(Some(p)) => p,
        _ => return (StatusCode::NOT_FOUND, "project not found").into_response(),
    };
    let services = match s.store.list_services_for_project(&id).await {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    let config = services::services_to_devpilot_config(&project, &services);
    // Also write it to disk
    let _ = services::write_devpilot_json(&project.root_path, &config).await;
    Json(json!(config)).into_response()
}

#[derive(Deserialize)]
struct ImportPayload {
    overwrite: Option<bool>,
}

async fn import_devpilot_json(
    State(s): State<AppState>,
    Path(id): Path<String>,
    Query(_q): Query<ImportPayload>,
) -> impl IntoResponse {
    let project = match s.store.get_project(&id).await {
        Ok(Some(p)) => p,
        _ => return (StatusCode::NOT_FOUND, "project not found").into_response(),
    };
    match services::read_devpilot_json(&project.root_path).await {
        Ok(config) => {
            // Sync services from the file into the DB
            for svc_cfg in &config.project.services {
                let existing = s.store.get_service(&svc_cfg.id).await.ok().flatten();
                let payload = CreateServicePayload {
                    project_id: id.clone(),
                    name: svc_cfg.name.clone(),
                    cwd: svc_cfg.cwd.clone(),
                    command: svc_cfg.command.clone(),
                    shell: svc_cfg.shell.clone(),
                    env: svc_cfg.env.clone(),
                    auto_start: svc_cfg.auto_start,
                    depends_on: svc_cfg.depends_on.clone(),
                    health_probe: crate::models::HealthProbe::None,
                };
                if let Some(_existing) = existing {
                    // Update
                    let _ = s.store.update_service(&svc_cfg.id, UpdateServicePayload {
                        name: Some(payload.name.clone()),
                        cwd: Some(payload.cwd.clone()),
                        command: Some(payload.command.clone()),
                        shell: Some(payload.shell.clone()),
                        env: Some(payload.env.clone()),
                        auto_start: Some(payload.auto_start),
                        depends_on: Some(payload.depends_on.clone()),
                        health_probe: None,
                    }).await;
                } else {
                    let _ = s.store.create_service(payload).await;
                }
            }
            Json(json!({"ok": true, "imported": config.project.services.len()})).into_response()
        }
        Err(e) => (StatusCode::BAD_REQUEST, format!("no devpilot.json found or invalid: {}", e)).into_response(),
    }
}

async fn get_docker_info(State(s): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let project = match s.store.get_project(&id).await {
        Ok(Some(p)) => p,
        _ => return (StatusCode::NOT_FOUND, "project not found").into_response(),
    };
    match services::list_docker_compose_services(&project.root_path).await {
        Ok(info) => Json(json!(info)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[derive(Deserialize)]
struct EnvProfilePayload {
    profile: EnvironmentProfile,
}

async fn apply_env_profile(State(s): State<AppState>, Path(id): Path<String>, Json(p): Json<EnvProfilePayload>) -> impl IntoResponse {
    let project = match s.store.get_project(&id).await {
        Ok(Some(proj)) => proj,
        _ => return (StatusCode::NOT_FOUND, "project not found").into_response(),
    };
    match services::apply_env_profile(&project.root_path, &p.profile).await {
        Ok(_) => Json(json!({"ok": true, "profile": format!("{:?}", p.profile)})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ---------- Services ----------

async fn list_services(State(s): State<AppState>) -> impl IntoResponse {
    match s.store.list_services().await {
        Ok(services) => {
            // Augment with runtime status from process manager
            let mut out = Vec::with_capacity(services.len());
            for mut svc in services {
                let pid = s.pm.get_pid(&svc.id).await;
                if pid.is_some() {
                    svc.status = ServiceStatus::Running;
                    svc.pid = pid;
                    svc.started_at = Some(chrono::Utc::now().timestamp_millis()); // approximate
                } else {
                    svc.status = s.pm.get_status(&svc.id).await;
                }
                out.push(svc);
            }
            Json(json!(out)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn get_service(State(s): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    match s.store.get_service(&id).await {
        Ok(Some(mut svc)) => {
            let pid = s.pm.get_pid(&id).await;
            if pid.is_some() {
                svc.status = ServiceStatus::Running;
                svc.pid = pid;
            } else {
                svc.status = s.pm.get_status(&id).await;
            }
            Json(json!(svc)).into_response()
        }
        Ok(None) => (StatusCode::NOT_FOUND, "service not found").into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn create_service(State(s): State<AppState>, Json(p): Json<CreateServicePayload>) -> impl IntoResponse {
    match s.store.create_service(p).await {
        Ok(svc) => (StatusCode::CREATED, Json(json!(svc))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn update_service(State(s): State<AppState>, Path(id): Path<String>, Json(p): Json<UpdateServicePayload>) -> impl IntoResponse {
    match s.store.update_service(&id, p).await {
        Ok(_) => Json(json!({"ok": true})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn delete_service(State(s): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let _ = s.pm.stop(&id).await;
    match s.store.delete_service(&id).await {
        Ok(_) => Json(json!({"ok": true})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn start_service(State(s): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    match s.pm.start(&id).await {
        Ok(_) => Json(json!({"ok": true})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

async fn stop_service(State(s): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    match s.pm.stop(&id).await {
        Ok(_) => Json(json!({"ok": true})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

#[derive(Deserialize)]
struct KillPayload {
    force: Option<bool>,
}

async fn kill_service(State(s): State<AppState>, Path(id): Path<String>, Json(p): Json<KillPayload>) -> impl IntoResponse {
    match s.pm.kill(&id, p.force.unwrap_or(true)).await {
        Ok(_) => Json(json!({"ok": true})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

async fn restart_service(State(s): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    match s.pm.restart(&id).await {
        Ok(_) => Json(json!({"ok": true})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

async fn get_service_status(State(s): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let status = s.pm.get_status(&id).await;
    Json(json!({ "status": status })).into_response()
}

async fn open_in_editor(State(s): State<AppState>, Path((id, editor)): Path<(String, String)>) -> impl IntoResponse {
    let svc = match s.store.get_service(&id).await {
        Ok(Some(svc)) => svc,
        _ => return (StatusCode::NOT_FOUND, "service not found").into_response(),
    };
    let project = match s.store.get_project(&svc.project_id).await {
        Ok(Some(p)) => p,
        _ => return (StatusCode::NOT_FOUND, "project not found").into_response(),
    };
    let path = if svc.cwd == "." || svc.cwd.is_empty() {
        project.root_path.clone()
    } else {
        format!("{}/{}", project.root_path.trim_end_matches('/'), svc.cwd)
    };
    let result = match editor.as_str() {
        "vscode" => services::open_in_vscode(&path).await,
        "cursor" => services::open_in_cursor(&path).await,
        "files" | "finder" | "explorer" => services::reveal_in_file_manager(&path).await,
        _ => return (StatusCode::BAD_REQUEST, format!("unknown editor: {}", editor)).into_response(),
    };
    match result {
        Ok(_) => Json(json!({"ok": true, "editor": editor, "path": path})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ---------- Bulk ops ----------

async fn start_all_in_project(State(s): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let services = match s.store.list_services_for_project(&id).await {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    // Start only those marked autoStart or with no deps
    let to_start: Vec<_> = services.iter()
        .filter(|s| s.auto_start || s.depends_on.is_empty())
        .collect();
    let mut errors = Vec::new();
    for svc in to_start {
        if let Err(e) = s.pm.start(&svc.id).await {
            errors.push(format!("{}: {}", svc.name, e));
        }
    }
    Json(json!({"ok": errors.is_empty(), "errors": errors})).into_response()
}

async fn stop_all_in_project(State(s): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let services = match s.store.list_services_for_project(&id).await {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    let mut errors = Vec::new();
    for svc in &services {
        if let Err(e) = s.pm.stop(&svc.id).await {
            errors.push(format!("{}: {}", svc.name, e));
        }
    }
    Json(json!({"ok": errors.is_empty(), "errors": errors})).into_response()
}

async fn restart_all_in_project(State(s): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let services = match s.store.list_services_for_project(&id).await {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    let mut errors = Vec::new();
    for svc in &services {
        if let Err(e) = s.pm.restart(&svc.id).await {
            errors.push(format!("{}: {}", svc.name, e));
        }
    }
    Json(json!({"ok": errors.is_empty(), "errors": errors})).into_response()
}

// ---------- Logs ----------

#[derive(Deserialize)]
struct LogsQuery {
    service_id: Option<String>,
    limit: Option<u32>,
}

async fn list_logs(State(s): State<AppState>, Query(q): Query<LogsQuery>) -> impl IntoResponse {
    let limit = q.limit.unwrap_or(1000).min(10000);
    match s.store.get_logs(q.service_id.as_deref(), limit).await {
        Ok(logs) => Json(json!(logs)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn list_logs_for_service(State(s): State<AppState>, Path(service_id): Path<String>, Query(q): Query<LogsQuery>) -> impl IntoResponse {
    let limit = q.limit.unwrap_or(1000).min(10000);
    match s.store.get_logs(Some(&service_id), limit).await {
        Ok(logs) => Json(json!(logs)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[derive(Deserialize)]
struct ClearLogsQuery {
    service_id: Option<String>,
}

async fn clear_logs(State(s): State<AppState>, Query(q): Query<ClearLogsQuery>) -> impl IntoResponse {
    match s.store.clear_logs(q.service_id.as_deref()).await {
        Ok(_) => Json(json!({"ok": true})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ---------- Env file ----------

#[derive(Deserialize)]
struct EnvFileQuery {
    path: String,
}

async fn read_env_file_endpoint(Query(q): Query<EnvFileQuery>) -> impl IntoResponse {
    match services::read_env_file(&q.path).await {
        Ok(map) => Json(json!(map)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

#[derive(Deserialize)]
struct WriteEnvFilePayload {
    path: String,
    env: std::collections::HashMap<String, String>,
}

async fn write_env_file_endpoint(Json(p): Json<WriteEnvFilePayload>) -> impl IntoResponse {
    match services::write_env_file(&p.path, &p.env).await {
        Ok(_) => Json(json!({"ok": true})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ---------- Health ----------

async fn health(State(s): State<AppState>) -> impl IntoResponse {
    let project_count = s.store.list_projects().await.map(|p| p.len()).unwrap_or(0);
    let service_count = s.store.list_services().await.map(|s| s.len()).unwrap_or(0);
    let running_count = s.pm.processes.lock().await.len();
    Json(json!({
        "status": "ok",
        "backend": "rust",
        "version": "1.0.0",
        "projects": project_count,
        "services": service_count,
        "running": running_count,
    }))
}

// ---------- Port Conflict Radar (Feature 1) ----------

async fn scan_ports_endpoint(State(s): State<AppState>) -> impl IntoResponse {
    use crate::models::{PortScanResult, PortConflict};
    use std::collections::HashMap;

    // Scan ports from /proc
    let mut mappings = match crate::services::scan_ports().await {
        Ok(m) => m,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    // Cross-reference with Miror's running services to fill in service_id/name
    let services = match s.store.list_services().await {
        Ok(svcs) => svcs,
        Err(_) => vec![],
    };
    let pid_to_service: HashMap<u32, (String, String)> = {
        let procs = s.pm.processes.lock().await;
        let mut map = HashMap::new();
        for svc in &services {
            if let Some(handle) = procs.get(&svc.id) {
                map.insert(handle.pid, (svc.id.clone(), svc.name.clone()));
            }
        }
        map
    };

    for m in mappings.iter_mut() {
        if let Some((id, name)) = pid_to_service.get(&m.pid) {
            m.service_id = Some(id.clone());
            m.service_name = Some(name.clone());
        }
    }

    // Detect conflicts: ports held by 2+ processes
    let mut port_holders: HashMap<(u16, String), Vec<&crate::models::PortMapping>> = HashMap::new();
    for m in &mappings {
        let key = (m.port, m.protocol.clone());
        port_holders.entry(key).or_default().push(m);
    }
    let conflicts: Vec<PortConflict> = port_holders
        .iter()
        .filter(|(_, holders)| holders.len() > 1)
        .map(|((port, _), holders)| {
            let miror_svc = holders.iter().find_map(|h| {
                h.service_id.as_ref().map(|id| (id.clone(), h.service_name.clone().unwrap_or_default()))
            });
            PortConflict {
                port: *port,
                holders: holders.iter().map(|h| (*h).clone()).collect(),
                miror_service_id: miror_svc.as_ref().map(|(id, _)| id.clone()),
                miror_service_name: miror_svc.as_ref().map(|(_, name)| name.clone()),
            }
        })
        .collect();

    Json(json!(PortScanResult {
        mappings,
        conflicts,
        scanned_at: chrono::Utc::now().timestamp_millis(),
    })).into_response()
}

#[derive(serde::Deserialize)]
struct KillPortPayload {
    pid: Option<u32>,
}

async fn kill_port_holder(
    Path(port): Path<u16>,
    State(s): State<AppState>,
    Json(payload): Json<KillPortPayload>,
) -> impl IntoResponse {
    // Find the holder of this port. If a specific PID is given, kill that one.
    // Otherwise, kill the first non-Miror process holding the port.
    let mappings = match crate::services::scan_ports().await {
        Ok(m) => m,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let target_pid = if let Some(pid) = payload.pid {
        pid
    } else {
        // Find first non-Miror holder
        let miror_pids: std::collections::HashSet<u32> = {
            let procs = s.pm.processes.lock().await;
            procs.values().map(|h| h.pid).collect()
        };
        match mappings.iter().find(|m| m.port == port && !miror_pids.contains(&m.pid)) {
            Some(m) => m.pid,
            None => match mappings.iter().find(|m| m.port == port) {
                Some(m) => m.pid,
                None => return (StatusCode::NOT_FOUND, format!("no process holding port {}", port)).into_response(),
            },
        }
    };

    if target_pid == 0 {
        return (StatusCode::NOT_FOUND, "no valid PID to kill".to_string()).into_response();
    }

    // Send SIGTERM, then SIGKILL after 3s
    #[cfg(unix)]
    {
        extern "C" { fn kill(pid: i32, sig: i32) -> i32; }
        unsafe { kill(target_pid as i32, 15); } // SIGTERM
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;
            unsafe { kill(target_pid as i32, 9); } // SIGKILL
        });
    }

    Json(json!({"ok": true, "killed_pid": target_pid, "port": port})).into_response()
}

// ---------- Health Probe (Feature 2) ----------

async fn run_probe_endpoint(State(s): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let svc = match s.store.get_service(&id).await {
        Ok(Some(svc)) => svc,
        _ => return (StatusCode::NOT_FOUND, "service not found").into_response(),
    };

    let ready = match crate::services::run_health_probe(&svc.health_probe, svc.port, &id).await {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    Json(json!({"ready": ready, "probe": svc.health_probe})).into_response()
}

// ---------- Git Integration (Feature 8) ----------

async fn get_git_status_endpoint(State(s): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let project = match s.store.get_project(&id).await {
        Ok(Some(p)) => p,
        _ => return (StatusCode::NOT_FOUND, "project not found").into_response(),
    };
    match crate::git_integration::get_git_status(&project.root_path).await {
        Ok(status) => Json(json!(status)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn get_git_branches_endpoint(State(s): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let project = match s.store.get_project(&id).await {
        Ok(Some(p)) => p,
        _ => return (StatusCode::NOT_FOUND, "project not found").into_response(),
    };
    match crate::git_integration::list_branches(&project.root_path).await {
        Ok(branches) => Json(json!(branches)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct GitCountQuery { count: Option<usize> }

async fn get_git_log_endpoint(State(s): State<AppState>, Path(id): Path<String>, Query(q): Query<GitCountQuery>) -> impl IntoResponse {
    let project = match s.store.get_project(&id).await {
        Ok(Some(p)) => p,
        _ => return (StatusCode::NOT_FOUND, "project not found").into_response(),
    };
    let count = q.count.unwrap_or(50);
    match crate::git_integration::git_log(&project.root_path, count).await {
        Ok(entries) => Json(json!(entries)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn get_git_tree_endpoint(State(s): State<AppState>, Path(id): Path<String>, Query(q): Query<GitCountQuery>) -> impl IntoResponse {
    let project = match s.store.get_project(&id).await {
        Ok(Some(p)) => p,
        _ => return (StatusCode::NOT_FOUND, "project not found").into_response(),
    };
    let count = q.count.unwrap_or(50);
    match crate::git_integration::git_tree(&project.root_path, count).await {
        Ok(entries) => Json(json!(entries)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn git_push_endpoint(State(s): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let project = match s.store.get_project(&id).await {
        Ok(Some(p)) => p,
        _ => return (StatusCode::NOT_FOUND, "project not found").into_response(),
    };
    match crate::git_integration::git_push(&project.root_path).await {
        Ok(output) => Json(json!({"ok": true, "output": output})).into_response(),
        Err(e) => Json(json!({"ok": false, "error": e.to_string()})).into_response(),
    }
}

async fn git_pull_endpoint(State(s): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let project = match s.store.get_project(&id).await {
        Ok(Some(p)) => p,
        _ => return (StatusCode::NOT_FOUND, "project not found").into_response(),
    };
    match crate::git_integration::git_pull(&project.root_path).await {
        Ok(output) => Json(json!({"ok": true, "output": output})).into_response(),
        Err(e) => Json(json!({"ok": false, "error": e.to_string()})).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct GitCheckoutPayload { branch: String }

async fn git_checkout_endpoint(State(s): State<AppState>, Path(id): Path<String>, Json(p): Json<GitCheckoutPayload>) -> impl IntoResponse {
    let project = match s.store.get_project(&id).await {
        Ok(Some(p)) => p,
        _ => return (StatusCode::NOT_FOUND, "project not found").into_response(),
    };
    match crate::git_integration::git_checkout(&project.root_path, &p.branch).await {
        Ok(output) => Json(json!({"ok": true, "output": output})).into_response(),
        Err(e) => Json(json!({"ok": false, "error": e.to_string()})).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct GitCommandPayload { args: Vec<String> }

async fn git_command_endpoint(State(s): State<AppState>, Path(id): Path<String>, Json(p): Json<GitCommandPayload>) -> impl IntoResponse {
    let project = match s.store.get_project(&id).await {
        Ok(Some(p)) => p,
        _ => return (StatusCode::NOT_FOUND, "project not found").into_response(),
    };
    let args: Vec<&str> = p.args.iter().map(|s| s.as_str()).collect();
    match crate::git_integration::git_command(&project.root_path, &args).await {
        Ok(output) => Json(json!({"ok": true, "output": output})).into_response(),
        Err(e) => Json(json!({"ok": false, "error": e.to_string()})).into_response(),
    }
}

// ---------- Database Browser (Feature 7) ----------

#[derive(serde::Deserialize)]
struct SqlitePathPayload { path: String }

async fn sqlite_info(
    Query(q): Query<SqlitePathPayload>,
) -> impl IntoResponse {
    // GET /api/database/sqlite/info?path=/path/to/db.sqlite
    match crate::database_browser::sqlite_list_tables(&q.path) {
        Ok(info) => Json(json!(info)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct SqliteQueryPayload {
    path: String,
    sql: String,
}

async fn sqlite_query_endpoint(Json(p): Json<SqliteQueryPayload>) -> impl IntoResponse {
    match crate::database_browser::sqlite_query(&p.path, &p.sql) {
        Ok(result) => Json(json!(result)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct SqliteSchemaQuery { path: String }

async fn sqlite_schema_endpoint(
    Path(table): Path<String>,
    Query(q): Query<SqliteSchemaQuery>,
) -> impl IntoResponse {
    match crate::database_browser::sqlite_table_schema(&q.path, &table) {
        Ok(schema) => Json(json!({ "table": table, "schema": schema })).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct PostgresPayload { connection_string: String }

async fn postgres_info_endpoint(Json(p): Json<PostgresPayload>) -> impl IntoResponse {
    match crate::database_browser::postgres_list_tables(&p.connection_string).await {
        Ok(info) => Json(json!(info)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct PostgresQueryPayload {
    connection_string: String,
    sql: String,
}

async fn postgres_query_endpoint(Json(p): Json<PostgresQueryPayload>) -> impl IntoResponse {
    match crate::database_browser::postgres_query(&p.connection_string, &p.sql).await {
        Ok(result) => Json(json!(result)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

// ---------- MySQL Browser ----------

#[derive(serde::Deserialize)]
struct MysqlPayload { connection_string: String }

async fn mysql_info_endpoint(Json(p): Json<MysqlPayload>) -> impl IntoResponse {
    match crate::database_browser::mysql_list_tables(&p.connection_string).await {
        Ok(info) => Json(json!(info)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct MysqlQueryPayload {
    connection_string: String,
    sql: String,
}

async fn mysql_query_endpoint(Json(p): Json<MysqlQueryPayload>) -> impl IntoResponse {
    match crate::database_browser::mysql_query(&p.connection_string, &p.sql).await {
        Ok(result) => Json(json!(result)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

// ---------- Redis Browser ----------

#[derive(serde::Deserialize)]
struct RedisScanPayload {
    connection_string: String,
    pattern: Option<String>,
    count: Option<usize>,
}

async fn redis_scan_endpoint(Json(p): Json<RedisScanPayload>) -> impl IntoResponse {
    let pattern = p.pattern.unwrap_or_else(|| "*".to_string());
    let count = p.count.unwrap_or(1000);
    match crate::database_browser::redis_scan(&p.connection_string, &pattern, count).await {
        Ok(result) => Json(json!(result)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct RedisKeyQuery {
    connection_string: String,
    key: String,
}

async fn redis_get_key_endpoint(Query(q): Query<RedisKeyQuery>) -> impl IntoResponse {
    match crate::database_browser::redis_get_key(&q.connection_string, &q.key).await {
        Ok(value) => Json(json!(value)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct RedisSetPayload {
    connection_string: String,
    key: String,
    value: String,
}

async fn redis_set_key_endpoint(Json(p): Json<RedisSetPayload>) -> impl IntoResponse {
    match crate::database_browser::redis_set_key(&p.connection_string, &p.key, &p.value).await {
        Ok(_) => Json(json!({"ok": true})).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct RedisDeletePayload {
    connection_string: String,
    key: String,
}

async fn redis_delete_key_endpoint(Json(p): Json<RedisDeletePayload>) -> impl IntoResponse {
    match crate::database_browser::redis_delete_key(&p.connection_string, &p.key).await {
        Ok(_) => Json(json!({"ok": true})).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct RedisExecutePayload {
    connection_string: String,
    command: String,
}

async fn redis_execute_endpoint(Json(p): Json<RedisExecutePayload>) -> impl IntoResponse {
    match crate::database_browser::redis_execute(&p.connection_string, &p.command).await {
        Ok(output) => Json(json!({"ok": true, "output": output})).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

// ---------- Resource History (Feature 9) ----------

async fn get_resource_history(State(s): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    // Return the last 60 telemetry samples (5 min at 5s intervals)
    // For now, we return the current values as a single-point array.
    // A full implementation would store samples in SQLite every 5s.
    let svc = match s.store.get_service(&id).await {
        Ok(Some(svc)) => svc,
        _ => return (StatusCode::NOT_FOUND, "service not found").into_response(),
    };

    // Build a synthetic history from the current telemetry
    // (Full time-series storage is a future enhancement)
    let now = chrono::Utc::now().timestamp_millis();
    let history: Vec<serde_json::Value> = (0..60).rev().map(|i| {
        let ts = now - (i as i64) * 5000;
        serde_json::json!({
            "timestamp": ts,
            "cpu": svc.cpu.unwrap_or(0.0),
            "memory_mb": svc.memory.unwrap_or(0.0),
        })
    }).collect();

    Json(json!({ "history": history, "interval_ms": 5000 })).into_response()
}

// ---------- WebSocket ----------

async fn ws_handler(ws: WebSocketUpgrade, State(s): State<AppState>) -> Response {
    ws.on_upgrade(|socket| handle_ws(socket, s))
}

async fn handle_ws(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();

    // Subscribe to the event bus
    let mut rx = state.event_bus.subscribe();

    // Spawn a task to forward events to the client
    let mut send_task = tokio::spawn(async move {
        let mut stream = BroadcastStream::new(rx);
        while let Some(item) = TokioStreamExt::next(&mut stream).await {
            match item {
                Ok(event) => {
                    let json = match serde_json::to_string(&event) {
                        Ok(j) => j,
                        Err(_) => continue,
                    };
                    if sender.send(Message::Text(json)).await.is_err() {
                        break;
                    }
                }
                Err(_lagged) => {
                    // Subscriber lagged — send a notice
                    let _ = sender.send(Message::Text(
                        serde_json::json!({"type": "lagged", "message": "some events were missed"}).to_string()
                    )).await;
                }
            }
        }
    });

    // Receive loop — ignore incoming messages for now (could be subscribe filters)
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = TokioStreamExt::next(&mut receiver).await {
            match msg {
                Message::Close(_) => break,
                Message::Ping(_) | Message::Pong(_) => {}
                Message::Text(t) => {
                    // Could parse WsCommand here — currently no-op
                    let _ = t;
                }
                Message::Binary(_) => {}
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => { recv_task.abort(); }
        _ = &mut recv_task => { send_task.abort(); }
    }
}
