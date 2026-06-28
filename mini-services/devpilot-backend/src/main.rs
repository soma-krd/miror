// Miror backend — real Rust process management service.
//
// Architecture mirrors what Tauri would provide:
//   - HTTP API (axum) for CRUD + process control
//   - WebSocket for real-time log streaming, status, telemetry
//   - tokio::process::Command with kill_on_drop for actual process spawning
//   - SQLite persistence (rusqlite)
//   - Per-project devpilot.json config files
//   - Docker compose detection
//   - .env file parsing / writing
//   - Editor integration (VS Code, Cursor, file manager)
//
// When packaged as Tauri, this binary runs alongside the WebView and the
// Next.js frontend connects to it via the same HTTP/WS interface.

use std::path::PathBuf;
use std::sync::Arc;
use anyhow::Result;
use tracing_subscriber::EnvFilter;

mod models;
mod store;
mod process_manager;
mod event_bus;
mod services;
mod routes;
mod git_integration;
mod database_browser;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with_target(false)
        .init();

    let port: u16 = std::env::var("DEVPILOT_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(3001);

    // Data dir — persist SQLite DB here
    let data_dir = std::env::var("MIR_DATA_DIR")
        .or_else(|_| std::env::var("DEVPILOT_DATA_DIR"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            dirs_data_dir().unwrap_or_else(|| PathBuf::from("./.miror"))
        });
    std::fs::create_dir_all(&data_dir)?;
    let db_path = data_dir.join("miror.db");

    tracing::info!("Miror backend starting");
    tracing::info!("  port: {}", port);
    tracing::info!("  db:   {}", db_path.display());

    // Initialize store + seed if empty
    let store = Arc::new(store::Store::new(&db_path)?);
    store.seed_if_empty().await?;

    // Initialize event bus + process manager
    let event_bus = Arc::new(event_bus::EventBus::new(2048));
    let pm = Arc::new(process_manager::ProcessManager::new(store.clone(), event_bus.clone()));

    let state = routes::AppState { store, pm, event_bus };
    let app = routes::router(state);

    let addr = format!("0.0.0.0:{}", port);
    tracing::info!("  listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

fn dirs_data_dir() -> Option<PathBuf> {
    if cfg!(target_os = "macos") {
        std::env::var("HOME").ok().map(|h| PathBuf::from(h).join("Library/Application Support/Miror"))
    } else if cfg!(target_os = "windows") {
        std::env::var("LOCALAPPDATA").ok().map(|h| PathBuf::from(h).join("Miror"))
    } else {
        std::env::var("XDG_DATA_HOME").ok()
            .map(PathBuf::from)
            .or_else(|| std::env::var("HOME").ok().map(|h| PathBuf::from(h).join(".local/share")))
            .map(|p| p.join("miror"))
    }
}
