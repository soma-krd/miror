// Service helpers — Docker compose detection, .env parsing, editor launching,
// devpilot.json read/write. These implement the remaining PRD features that
// don't fit into the core process_manager.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use anyhow::{Result, anyhow};
use tokio::process::Command;
use serde::{Deserialize, Serialize};

use crate::models::*;

// --- Docker Compose detection ---------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DockerStackInfo {
    pub path: String,
    pub services: Vec<String>,
    pub exists: bool,
}

/// Detect docker-compose.yml / docker-compose.yaml / compose.yml in project root
pub async fn detect_docker_compose(project_root: &str) -> Option<PathBuf> {
    let candidates = [
        "docker-compose.yml",
        "docker-compose.yaml",
        "compose.yml",
        "compose.yaml",
    ];
    for name in &candidates {
        let p = Path::new(project_root).join(name);
        if p.exists() {
            return Some(p);
        }
    }
    None
}

/// List services defined in docker-compose.yml
pub async fn list_docker_compose_services(project_root: &str) -> Result<DockerStackInfo> {
    let compose_path = match detect_docker_compose(project_root).await {
        Some(p) => p,
        None => return Ok(DockerStackInfo { path: String::new(), services: vec![], exists: false }),
    };

    // Try `docker compose config --services` first (accurate)
    let output = Command::new("docker")
        .args(["compose", "-f", compose_path.to_str().unwrap(), "config", "--services"])
        .output().await;

    let services = match output {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            stdout.lines().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()
        }
        _ => {
            // Fallback: parse YAML naively — find `services:` block, list top-level keys
            parse_compose_services_naive(&compose_path).await.unwrap_or_default()
        }
    };

    Ok(DockerStackInfo {
        path: compose_path.to_string_lossy().to_string(),
        services,
        exists: true,
    })
}

async fn parse_compose_services_naive(path: &Path) -> Result<Vec<String>> {
    let content = tokio::fs::read_to_string(path).await?;
    let mut services = Vec::new();
    let mut in_services = false;
    for line in content.lines() {
        if line.starts_with("services:") {
            in_services = true;
            continue;
        }
        if in_services {
            // End of services block when we hit a top-level key (no leading whitespace)
            if !line.starts_with(' ') && !line.starts_with('\t') && !line.is_empty() && !line.starts_with('#') {
                break;
            }
            // Lines like "  redis:" are service names
            let trimmed = line.trim_start();
            if let Some(colon_pos) = trimmed.find(':') {
                let name = trimmed[..colon_pos].trim();
                if !name.is_empty() && !name.starts_with('#') {
                    services.push(name.to_string());
                }
            }
        }
    }
    Ok(services)
}

// --- .env file parsing -----------------------------------------------------

/// Parse a .env file into a HashMap. Supports:
///   - KEY=value
///   - KEY="quoted value"
///   - KEY='single quoted'
///   - export KEY=value
///   - # comments
///   - blank lines
pub fn parse_env_file(content: &str) -> Result<HashMap<String, String>> {
    let mut map = HashMap::new();
    for (line_no, line) in content.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') { continue; }
        let line = line.strip_prefix("export ").unwrap_or(line);

        // Find the = separator
        let eq_pos = match line.find('=') {
            Some(p) => p,
            None => continue,
        };

        let key = line[..eq_pos].trim().to_string();
        let mut value = line[eq_pos + 1..].trim().to_string();

        // Strip surrounding quotes (single pass)
        if (value.starts_with('"') && value.ends_with('"') && value.len() >= 2)
            || (value.starts_with('\'') && value.ends_with('\'') && value.len() >= 2)
        {
            value = value[1..value.len()-1].to_string();
        }

        if key.is_empty() {
            return Err(anyhow!("line {}: empty key", line_no + 1));
        }
        map.insert(key, value);
    }
    Ok(map)
}

/// Serialize a HashMap to .env format
pub fn serialize_env_file(map: &HashMap<String, String>) -> String {
    let mut out = String::new();
    // Sort keys for deterministic output
    let mut keys: Vec<&String> = map.keys().collect();
    keys.sort();
    for k in keys {
        let v = &map[k];
        // Quote if value contains spaces or special chars
        if v.contains(' ') || v.contains('"') || v.contains('\'') || v.contains('#') {
            out.push_str(&format!("{}=\"{}\"\n", k, v.replace('\\', "\\\\").replace('"', "\\\"")));
        } else {
            out.push_str(&format!("{}={}\n", k, v));
        }
    }
    out
}

/// Read a .env file from disk
pub async fn read_env_file(path: &str) -> Result<HashMap<String, String>> {
    let content = tokio::fs::read_to_string(path).await
        .map_err(|e| anyhow!("failed to read {}: {}", path, e))?;
    parse_env_file(&content)
}

/// Write a .env file to disk (atomic — write to temp then rename)
pub async fn write_env_file(path: &str, map: &HashMap<String, String>) -> Result<()> {
    let content = serialize_env_file(map);
    let tmp = format!("{}.tmp.{}", path, uuid::Uuid::new_v4().simple());
    tokio::fs::write(&tmp, &content).await
        .map_err(|e| anyhow!("failed to write temp file: {}", e))?;
    tokio::fs::rename(&tmp, path).await
        .map_err(|e| anyhow!("failed to rename: {}", e))?;
    Ok(())
}

// --- devpilot.json read/write ----------------------------------------------

/// Read a devpilot.json from a project root
pub async fn read_devpilot_json(project_root: &str) -> Result<DevPilotConfig> {
    let path = Path::new(project_root).join("devpilot.json");
    let content = tokio::fs::read_to_string(&path).await
        .map_err(|e| anyhow!("failed to read {}: {}", path.display(), e))?;
    let config: DevPilotConfig = serde_json::from_str(&content)
        .map_err(|e| anyhow!("failed to parse {}: {}", path.display(), e))?;
    Ok(config)
}

/// Write a devpilot.json to a project root
pub async fn write_devpilot_json(project_root: &str, config: &DevPilotConfig) -> Result<()> {
    let path = Path::new(project_root).join("devpilot.json");
    let content = serde_json::to_string_pretty(config)?;
    tokio::fs::write(&path, content).await?;
    Ok(())
}

/// Convert a list of services (from DB) into a devpilot.json config
pub fn services_to_devpilot_config(project: &Project, services: &[Service]) -> DevPilotConfig {
    DevPilotConfig {
        version: "1.0".to_string(),
        project: DevPilotConfigProject {
            name: project.name.clone(),
            root_path: project.root_path.clone(),
            services: services.iter().map(|s| DevPilotConfigService {
                id: s.id.clone(),
                name: s.name.clone(),
                cwd: s.cwd.clone(),
                command: s.command.clone(),
                shell: s.shell.clone(),
                env: s.env.clone(),
                auto_start: s.auto_start,
                depends_on: s.depends_on.clone(),
            }).collect(),
        },
    }
}

// --- editor launching ------------------------------------------------------

/// Launch VS Code at a given path. Uses `code` command.
pub async fn open_in_vscode(path: &str) -> Result<()> {
    let status = Command::new("code").arg(path).status().await
        .map_err(|e| anyhow!("failed to launch VS Code: {}. Is `code` on PATH?", e))?;
    if !status.success() {
        return Err(anyhow!("VS Code exited with status {}", status));
    }
    Ok(())
}

/// Launch Cursor editor at a given path.
pub async fn open_in_cursor(path: &str) -> Result<()> {
    let status = Command::new("cursor").arg(path).status().await
        .map_err(|e| anyhow!("failed to launch Cursor: {}. Is `cursor` on PATH?", e))?;
    if !status.success() {
        return Err(anyhow!("Cursor exited with status {}", status));
    }
    Ok(())
}

/// Reveal a path in the file manager (Finder on macOS, Explorer on Windows, xdg-open on Linux)
pub async fn reveal_in_file_manager(path: &str) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open").arg(path).status().await;
    }
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("explorer").arg(path).status().await;
    }
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("xdg-open").arg(path).status().await;
    }
    Ok(())
}

// --- environment profile swapping ------------------------------------------

/// Swap the active .env file based on the profile.
/// E.g., profile=Testing → reads `.env.testing`, writes it to `.env`
pub async fn apply_env_profile(project_root: &str, profile: &EnvironmentProfile) -> Result<()> {
    let suffix = match profile {
        EnvironmentProfile::Development => ".env",
        EnvironmentProfile::Testing => ".env.testing",
        EnvironmentProfile::Staging => ".env.staging",
        EnvironmentProfile::Custom => return Ok(()), // no-op
    };
    let source = Path::new(project_root).join(suffix);
    let target = Path::new(project_root).join(".env");
    if source.exists() && source != target {
        tokio::fs::copy(&source, &target).await?;
    }
    Ok(())
}

// --- port availability check -----------------------------------------------

/// Check if a TCP port is currently in use on localhost
pub async fn is_port_in_use(port: u16) -> bool {
    tokio::net::TcpListener::bind(("127.0.0.1", port)).await.is_err()
}

// --- Port Conflict Radar (Feature 1) ---------------------------------------
// Scans /proc/net/tcp + /proc/net/udp on Linux to build a map of all listening
// ports → owning processes. Cross-references with Miror's running services to
// detect conflicts (2+ processes on the same port) and identify "orphan"
// processes holding ports that Miror services need.

#[cfg(target_os = "linux")]
pub async fn scan_ports() -> Result<Vec<crate::models::PortMapping>> {
    use crate::models::PortMapping;
    use std::collections::HashMap;

    let mut mappings: Vec<PortMapping> = Vec::new();

    // Parse /proc/net/tcp and /proc/net/udp
    for (protocol, path) in [("tcp", "/proc/net/tcp"), ("udp", "/proc/net/udp")] {
        let content = match tokio::fs::read_to_string(path).await {
            Ok(c) => c,
            Err(_) => continue,
        };

        for (i, line) in content.lines().enumerate() {
            if i == 0 { continue; } // skip header
            let fields: Vec<&str> = line.split_whitespace().collect();
            if fields.len() < 10 { continue; }

            // fields[1] = local_address (hex: "0100007F:1F90")
            // fields[2] = remote_address
            // fields[3] = state (hex: 0A = LISTEN for TCP)
            let local = fields[1];
            let state_hex = fields[3];

            let port = match local.split(':').nth(1).and_then(|h| u16::from_str_radix(h, 16).ok()) {
                Some(p) => p,
                None => continue,
            };
            if port == 0 { continue; }

            let state = match state_hex {
                "0A" => "LISTEN".to_string(),
                "06" => "TIME_WAIT".to_string(),
                "01" => "ESTABLISHED".to_string(),
                "08" => "CLOSE_WAIT".to_string(),
                _ => format!("STATE_{}", state_hex),
            };

            // Only show LISTEN for TCP (filter out established connections — too noisy)
            if protocol == "tcp" && state != "LISTEN" { continue; }

            // Parse local address (little-endian hex: "0100007F" = 127.0.0.1)
            let local_addr_hex = local.split(':').next().unwrap_or("00000000");
            let local_address = parse_hex_ipv4(local_addr_hex);

            // /proc/net/tcp doesn't directly give the PID. We need to scan
            // /proc/[pid]/fd for inodes matching the socket. The inode is in fields[9].
            let inode = fields[9];

            // Find the PID owning this socket inode
            let (pid, process_name, process_cmd) = find_pid_for_inode(inode).await.unwrap_or((0, "unknown".to_string(), String::new()));

            if pid == 0 { continue; } // kernel socket or permission denied

            mappings.push(PortMapping {
                port,
                protocol: protocol.to_string(),
                state,
                pid,
                process_name,
                process_cmd,
                service_id: None,    // filled in by caller
                service_name: None,
                local_address,
            });
        }
    }

    // Dedupe by (port, protocol, pid) — /proc can list the same socket twice
    let mut seen: HashMap<(u16, String, u32), bool> = HashMap::new();
    mappings.retain(|m| {
        let key = (m.port, m.protocol.clone(), m.pid);
        if seen.get(&key).is_some() {
            false
        } else {
            seen.insert(key, true);
            true
        }
    });

    mappings.sort_by_key(|m| m.port);
    Ok(mappings)
}

#[cfg(not(target_os = "linux"))]
pub async fn scan_ports() -> Result<Vec<crate::models::PortMapping>> {
    // Non-Linux: return empty (could use `netstat` or `lsof` as fallback)
    Ok(vec![])
}

#[cfg(target_os = "linux")]
async fn find_pid_for_inode(inode: &str) -> Option<(u32, String, String)> {
    use std::fs;
    // Scan /proc/[pid]/fd/* for sockets matching the inode
    let entries = fs::read_dir("/proc").ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        let pid: u32 = match name_str.parse() {
            Ok(p) => p,
            Err(_) => continue,
        };
        let fd_dir = format!("/proc/{}/fd", pid);
        if let Ok(fd_entries) = fs::read_dir(&fd_dir) {
            for fd in fd_entries.flatten() {
                if let Ok(link) = fs::read_link(fd.path()) {
                    let link_str = link.to_string_lossy().to_string();
                    if link_str.contains(&format!("socket:[{}]", inode)) {
                        // Found the PID — read /proc/[pid]/comm for name, /proc/[pid]/cmdline for cmd
                        let name = fs::read_to_string(format!("/proc/{}/comm", pid))
                            .unwrap_or_default()
                            .trim()
                            .to_string();
                        let cmd = fs::read(format!("/proc/{}/cmdline", pid))
                            .unwrap_or_default()
                            .split(|&b| b == 0)
                            .filter(|s| !s.is_empty())
                            .map(|s| String::from_utf8_lossy(s).to_string())
                            .collect::<Vec<_>>()
                            .join(" ");
                        return Some((pid, name, cmd));
                    }
                }
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn parse_hex_ipv4(hex: &str) -> String {
    // /proc/net/tcp uses little-endian hex: "0100007F" = 127.0.0.1
    if hex.len() != 8 {
        return "0.0.0.0".to_string();
    }
    let bytes = (0..4)
        .map(|i| u8::from_str_radix(&hex[i*2..i*2+2], 16).unwrap_or(0))
        .collect::<Vec<_>>();
    // Little-endian: bytes[0] is the high octet
    format!("{}.{}.{}.{}", bytes[3], bytes[2], bytes[1], bytes[0])
}

// --- Health check probes (Feature 2) ---------------------------------------

/// Run a health check probe against a service. Returns Ok(true) if ready.
pub async fn run_health_probe(
    probe: &crate::models::HealthProbe,
    service_port: Option<u16>,
    service_id: &str,
) -> Result<bool> {
    use crate::models::HealthProbe;
    use std::time::Duration;

    match probe {
        HealthProbe::None => Ok(true),
        HealthProbe::Tcp { port } => {
            let p = port.or(service_port).ok_or_else(|| anyhow::anyhow!("no port configured"))?;
            // Try to connect — if it succeeds, the service is accepting connections
            match tokio::time::timeout(
                Duration::from_millis(2000),
                tokio::net::TcpStream::connect(("127.0.0.1", p)),
            ).await {
                Ok(Ok(_stream)) => Ok(true),
                _ => Ok(false),
            }
        }
        HealthProbe::Http { path, port, expected_status, timeout_ms } => {
            let p = port.or(service_port).ok_or_else(|| anyhow::anyhow!("no port configured"))?;
            let url = format!("http://127.0.0.1:{}{}", p, path);
            let expected = expected_status.unwrap_or(200);
            let timeout = Duration::from_millis(timeout_ms.unwrap_or(3000));

            // We use a raw TCP connection + manual HTTP request to avoid pulling in reqwest
            let result = tokio::time::timeout(timeout, async {
                use tokio::io::{AsyncReadExt, AsyncWriteExt};
                let mut stream = tokio::net::TcpStream::connect(("127.0.0.1", p)).await?;
                let req = format!("GET {} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n", path, p);
                stream.write_all(req.as_bytes()).await?;
                let mut buf = [0u8; 256];
                let n = stream.read(&mut buf).await?;
                let resp = String::from_utf8_lossy(&buf[..n]);
                // Parse "HTTP/1.1 200 OK"
                if let Some(status_line) = resp.lines().next() {
                    if let Some(code_str) = status_line.split_whitespace().nth(1) {
                        if let Ok(code) = code_str.parse::<u16>() {
                            return Ok::<bool, anyhow::Error>(code == expected || (expected == 200 && (200..300).contains(&code)));
                        }
                    }
                }
                Ok(false)
            }).await;

            match result {
                Ok(Ok(ready)) => Ok(ready),
                _ => Ok(false),
            }
        }
        HealthProbe::Log { pattern: _, log_type: _ } => {
            // Log probes are evaluated inline by the process manager when logs arrive.
            // This function is not called for Log probes — the PM handles them directly.
            // We return true here as a fallback (the PM should have already set ready=true
            // if the pattern matched, or this probe type shouldn't reach this function).
            let _ = service_id;
            Ok(true)
        }
    }
}

/// Check if a log line matches a Log-type health probe pattern.
/// Returns true if the pattern matches (service becomes ready).
pub fn log_matches_probe(message: &str, pattern: &str) -> bool {
    // Simple substring match for now — could use regex crate if needed
    // Common patterns: "Listening on", "Ready in", "Server started", "ready for connections"
    message.to_lowercase().contains(&pattern.to_lowercase())
}
