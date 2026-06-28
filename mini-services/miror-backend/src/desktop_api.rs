// Docker + storage API routes (ported from Next.js route handlers for Tauri desktop).

use axum::{
    extract::Query,
    http::StatusCode,
    response::{IntoResponse, Json},
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tokio::process::Command;

async fn sh(cmd: &str) -> Result<String, String> {
    let output = Command::new("sh")
        .arg("-c")
        .arg(cmd)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else if !stderr.is_empty() {
        Err(stderr)
    } else if !stdout.is_empty() {
        Ok(stdout)
    } else {
        Err(format!("command failed: {}", cmd))
    }
}

fn home_dir() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/"))
}

pub async fn docker_containers() -> impl IntoResponse {
    match sh(r#"docker ps -a --format "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}\t{{.CreatedAt}}""#).await {
        Ok(stdout) => {
            let containers: Vec<Value> = stdout.lines().filter(|l| !l.is_empty()).map(|line| {
                let parts: Vec<&str> = line.split('\t').collect();
                let status = parts.get(3).unwrap_or(&"").to_string();
                json!({
                    "id": parts.first().unwrap_or(&""),
                    "name": parts.get(1).unwrap_or(&""),
                    "image": parts.get(2).unwrap_or(&""),
                    "status": status,
                    "ports": parts.get(4).unwrap_or(&""),
                    "createdAt": parts.get(5).unwrap_or(&""),
                    "isRunning": status.to_lowercase().contains("up"),
                })
            }).collect();
            Json(containers).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
            "error": if e.contains("docker") { "Docker not available or not running" } else { e.as_str() }
        }))).into_response(),
    }
}

pub async fn docker_images() -> impl IntoResponse {
    match sh(r#"docker images --format "{{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}\t{{.CreatedAt}}""#).await {
        Ok(stdout) => {
            let images: Vec<Value> = stdout.lines().filter(|l| !l.is_empty()).map(|line| {
                let p: Vec<&str> = line.split('\t').collect();
                json!({
                    "repository": p.first().unwrap_or(&""),
                    "tag": p.get(1).unwrap_or(&""),
                    "id": p.get(2).unwrap_or(&""),
                    "size": p.get(3).unwrap_or(&""),
                    "createdAt": p.get(4).unwrap_or(&""),
                })
            }).collect();
            Json(images).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn docker_networks() -> impl IntoResponse {
    match sh(r#"docker network ls --format "{{.ID}}\t{{.Name}}\t{{.Driver}}\t{{.Scope}}""#).await {
        Ok(stdout) => {
            let networks: Vec<Value> = stdout.lines().filter(|l| !l.is_empty()).map(|line| {
                let p: Vec<&str> = line.split('\t').collect();
                json!({
                    "id": p.first().unwrap_or(&""),
                    "name": p.get(1).unwrap_or(&""),
                    "driver": p.get(2).unwrap_or(&""),
                    "scope": p.get(3).unwrap_or(&""),
                })
            }).collect();
            Json(networks).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn docker_volumes() -> impl IntoResponse {
    match sh(r#"docker volume ls --format "{{.Driver}}\t{{.Name}}""#).await {
        Ok(stdout) => {
            let volumes: Vec<Value> = stdout.lines().filter(|l| !l.is_empty()).map(|line| {
                let p: Vec<&str> = line.split('\t').collect();
                json!({ "driver": p.first().unwrap_or(&""), "name": p.get(1).unwrap_or(&"") })
            }).collect();
            Json(volumes).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}

#[derive(Deserialize)]
pub struct DockerActionPayload {
    #[serde(rename = "containerId")]
    container_id: String,
    action: String,
}

pub async fn docker_action(Json(p): Json<DockerActionPayload>) -> impl IntoResponse {
    let valid = ["start", "stop", "restart", "rm"];
    if !valid.contains(&p.action.as_str()) {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "invalid action" }))).into_response();
    }
    let flag = if p.action == "rm" { "-f" } else { "" };
    let cmd = format!("docker {} {} {}", p.action, flag, p.container_id).trim().to_string();
    match sh(&cmd).await {
        Ok(output) => Json(json!({ "ok": true, "output": output })).into_response(),
        Err(e) => Json(json!({ "ok": false, "error": e })).into_response(),
    }
}

#[derive(Deserialize)]
pub struct DockerLogsQuery {
    #[serde(rename = "containerId")]
    container_id: Option<String>,
    tail: Option<String>,
}

pub async fn docker_logs(Query(q): Query<DockerLogsQuery>) -> impl IntoResponse {
    let container_id = match q.container_id {
        Some(id) if !id.is_empty() => id,
        _ => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "containerId required" }))).into_response(),
    };
    let tail = q.tail.unwrap_or_else(|| "100".to_string());
    let cmd = format!("docker logs --tail {} {} 2>&1", tail, container_id);
    match sh(&cmd).await {
        Ok(stdout) => {
            let lines: Vec<&str> = stdout.lines().filter(|l| !l.is_empty()).collect();
            let logs: Vec<Value> = lines.iter().enumerate().map(|(i, line)| {
                json!({
                    "id": format!("docker_log_{}", i),
                    "serviceId": container_id,
                    "timestamp": chrono::Utc::now().timestamp_millis() - (lines.len() as i64 - i as i64) * 100,
                    "type": "stdout",
                    "message": line,
                })
            }).collect();
            Json(json!({ "logs": logs })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}

#[derive(Deserialize)]
pub struct DockerExecPayload {
    #[serde(rename = "containerId")]
    container_id: String,
    command: String,
}

pub async fn docker_exec(Json(p): Json<DockerExecPayload>) -> impl IntoResponse {
    let args: Vec<&str> = p.command.split_whitespace()
        .filter(|a| a.chars().all(|c| c.is_ascii_alphanumeric() || "-_./|>\"'=".contains(c)))
        .collect();
    if args.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "no valid command" }))).into_response();
    }
    let cmd = format!("docker exec {} {}", p.container_id, args.join(" "));
    match sh(&cmd).await {
        Ok(output) => Json(json!({ "ok": true, "output": output })).into_response(),
        Err(e) => Json(json!({ "ok": false, "error": e, "output": "" })).into_response(),
    }
}

async fn dir_size(path: &Path) -> (String, i64) {
    let path_str = path.to_string_lossy();
    let human = sh(&format!(r#"du -sh "{}" 2>/dev/null"#, path_str)).await.unwrap_or_else(|_| "—".to_string());
    let size = human.split_whitespace().next().unwrap_or("—").to_string();
    let bytes = sh(&format!(r#"du -sb "{}" 2>/dev/null"#, path_str)).await
        .ok()
        .and_then(|o| o.split_whitespace().next()?.parse().ok())
        .unwrap_or(0);
    (size, bytes)
}

pub async fn storage_overview() -> impl IntoResponse {
    let home = home_dir();
    let disk = match sh(&format!(r#"df -h "{}" | tail -1"#, home.display())).await {
        Ok(stdout) => {
            let parts: Vec<&str> = stdout.split_whitespace().collect();
            json!({
                "total": parts.get(1).unwrap_or(&"—"),
                "used": parts.get(2).unwrap_or(&"—"),
                "free": parts.get(3).unwrap_or(&"—"),
                "totalBytes": 0, "usedBytes": 0, "freeBytes": 0,
            })
        }
        Err(_) => json!({ "total": "—", "used": "—", "free": "—", "totalBytes": 0, "usedBytes": 0, "freeBytes": 0 }),
    };

    let dirs = [
        ("Projects", home.join("projects"), "📁"),
        ("Downloads", home.join("Downloads"), "⬇️"),
        ("Docker", PathBuf::from("/var/lib/docker"), "🐳"),
        ("npm cache", home.join(".npm"), "📦"),
        ("Cargo cache", home.join(".cargo"), "🦀"),
        ("Go modules", home.join("go"), "🐹"),
        ("pip cache", home.join(".cache/pip"), "🐍"),
    ];

    let mut categories = Vec::new();
    for (name, path, icon) in dirs {
        if path.exists() {
            let (size, size_bytes) = dir_size(&path).await;
            categories.push(json!({ "name": name, "path": path.to_string_lossy(), "size": size, "sizeBytes": size_bytes, "icon": icon }));
        }
    }
    categories.sort_by(|a, b| b["sizeBytes"].as_i64().unwrap_or(0).cmp(&a["sizeBytes"].as_i64().unwrap_or(0)));

    Json(json!({ "disk": disk, "categories": categories, "homeDir": home.to_string_lossy(), "platform": std::env::consts::OS })).into_response()
}

pub async fn storage_caches() -> impl IntoResponse {
    let home = home_dir();
    let defs: [(&str, PathBuf, &str, &str); 8] = [
        ("npm cache", home.join(".npm"), "Node.js", "📦"),
        ("pnpm store", home.join(".local/share/pnpm"), "Node.js", "📦"),
        ("Yarn cache", home.join(".cache/yarn"), "Node.js", "📦"),
        ("Cargo cache", home.join(".cargo/registry"), "Rust", "🦀"),
        ("Go modules", home.join("go/pkg/mod"), "Go", "🐹"),
        ("pip cache", home.join(".cache/pip"), "Python", "🐍"),
        ("uv cache", home.join(".cache/uv"), "Python", "🐍"),
        ("Gradle cache", home.join(".gradle/caches"), "Java", "☕"),
    ];

    let mut caches = Vec::new();
    for (name, dir, pm, icon) in defs {
        if !dir.exists() { continue; }
        let (size, size_bytes) = dir_size(&dir).await;
        caches.push(json!({
            "name": name, "path": dir.to_string_lossy(), "size": size, "sizeBytes": size_bytes,
            "lastAccessed": "—", "fileCount": 0, "icon": icon, "packageManager": pm,
            "safeToDelete": true, "reason": "Safe to delete — will be re-downloaded on next install/build.",
        }));
    }
    caches.sort_by(|a, b| b["sizeBytes"].as_i64().unwrap_or(0).cmp(&a["sizeBytes"].as_i64().unwrap_or(0)));
    Json(caches).into_response()
}

#[derive(Deserialize)]
pub struct StorageDeletePayload {
    #[serde(rename = "folderPath")]
    folder_path: String,
    permanent: Option<bool>,
}

pub async fn storage_delete(Json(p): Json<StorageDeletePayload>) -> impl IntoResponse {
    let path = PathBuf::from(&p.folder_path);
    if !path.exists() || !path.is_dir() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Path does not exist" }))).into_response();
    }
    let permanent = p.permanent.unwrap_or(false);
    let result = if permanent {
        sh(&format!(r#"rm -rf "{}""#, p.folder_path)).await
            .map(|_| json!({ "ok": true, "method": "permanent", "message": "Folder permanently deleted." }))
    } else {
        match sh(&format!(r#"trash-put "{}""#, p.folder_path)).await {
            Ok(_) => Ok(json!({ "ok": true, "method": "trash", "message": "Moved to Trash." })),
            Err(_) => sh(&format!(r#"rm -rf "{}""#, p.folder_path)).await
                .map(|_| json!({ "ok": true, "method": "permanent", "message": "trash-cli not available. Folder permanently deleted." })),
        }
    };
    match result {
        Ok(v) => Json(v).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}

#[derive(Deserialize)]
pub struct StorageProjectsPayload {
    #[serde(rename = "scanPath")]
    scan_path: String,
}

pub async fn storage_projects(Json(p): Json<StorageProjectsPayload>) -> impl IntoResponse {
    let scan_path = PathBuf::from(&p.scan_path);
    if !scan_path.exists() || !scan_path.is_dir() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Path does not exist" }))).into_response();
    }
    let markers = [("package.json", "Node.js"), ("Cargo.toml", "Rust"), ("pyproject.toml", "Python")];
    let safe_dirs = [("node_modules", "green"), ("target", "green"), ("dist", "green"), (".next", "green")];
    let mut projects = Vec::new();

    for (marker, project_type) in markers {
        let find_cmd = format!(
            r#"find "{}" -maxdepth 3 -name "{}" -not -path "*/node_modules/*" 2>/dev/null"#,
            scan_path.display(), marker
        );
        if let Ok(stdout) = sh(&find_cmd).await {
            for file in stdout.lines().filter(|l| !l.is_empty()) {
                let project_dir = PathBuf::from(file).parent().unwrap_or(Path::new("")).to_path_buf();
                let project_path = project_dir.to_string_lossy().to_string();
                if projects.iter().any(|p: &Value| p["path"].as_str() == Some(project_path.as_str())) { continue; }
                let (total_size, total_bytes) = dir_size(&project_dir).await;
                let mut breakdown = Vec::new();
                for (dir_name, safe_level) in safe_dirs {
                    let dir_path = project_dir.join(dir_name);
                    if dir_path.exists() {
                        let (size, size_bytes) = dir_size(&dir_path).await;
                        if size_bytes > 0 {
                            breakdown.push(json!({
                                "name": dir_name, "path": dir_path.to_string_lossy(),
                                "size": size, "sizeBytes": size_bytes,
                                "safeLevel": safe_level, "reason": "Build/cache directory.",
                            }));
                        }
                    }
                }
                projects.push(json!({
                    "name": project_dir.file_name().and_then(|n| n.to_str()).unwrap_or(""),
                    "path": project_dir.to_string_lossy(),
                    "totalSize": total_size, "totalSizeBytes": total_bytes,
                    "type": project_type, "breakdown": breakdown,
                }));
            }
        }
    }
    projects.sort_by(|a, b| b["totalSizeBytes"].as_i64().unwrap_or(0).cmp(&a["totalSizeBytes"].as_i64().unwrap_or(0)));
    Json(json!({ "projects": projects })).into_response()
}
