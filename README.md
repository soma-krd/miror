# Miror — Local Dev Workspace Manager

A cross-platform desktop control tower for managing multiple projects and their services (frontend, backend, workers, databases, docker stacks) from a single unified panel.

## Architecture

Miror is built as **two cooperating processes**:

```
┌──────────────────────┐         HTTP/WS          ┌─────────────────────────┐
│   Frontend (UI)      │  ◄───────────────────►   │   Backend (Rust)        │
│                      │                           │                         │
│   Next.js 16         │   /api/projects           │   axum + tokio          │
│   TailwindCSS 4      │   /api/services           │   tokio::process::Cmd   │
│   shadcn/ui          │   /api/services/:id/start │   SQLite (rusqlite)     │
│   Zustand            │   /ws (log streaming)     │   WebSocket (axum::ws)  │
│   xterm-style logs   │                           │                         │
└──────────────────────┘                           └─────────────────────────┘
        WebView                                              Child processes
                                                          (Node, Docker, CLI…)
```

This is **exactly the Tauri architecture** — the only difference is that in
production, the Rust backend is bundled as a sidecar binary and the Next.js
frontend is statically exported, then both are wrapped in a native window.

### In the sandbox

- The Rust backend runs on port **3001** (`mini-services/Miror-backend/`)
- The Next.js dev server runs on port **3000**
- The Caddy gateway on port **81** routes between them via `?XTransformPort=3001`
- The browser loads `http://localhost:3000` and the frontend calls the gateway at `:81`

### As a desktop app (locally)

- The Rust backend runs as a Tauri sidecar on `localhost:3001`
- The Next.js frontend is statically exported (`next build && next export`)
- Tauri opens a native window pointing at the static files
- The frontend talks to `http://localhost:3001` directly

## Project Structure

```
my-project/
├── mini-services/
│   └── Miror-backend/          ← Rust backend (axum + tokio + rusqlite)
│       ├── Cargo.toml
│       └── src/
│           ├── main.rs            ← entry point
│           ├── models.rs          ← shared data types
│           ├── store.rs           ← SQLite persistence
│           ├── process_manager.rs ← real tokio::process::Command logic
│           ├── event_bus.rs       ← broadcast channel for WS events
│           ├── services.rs        ← Docker compose, .env, editor, Miror.json
│           └── routes.rs          ← HTTP + WebSocket routes
│
├── src/                            ← Next.js frontend
│   ├── app/
│   │   ├── page.tsx               ← Miror app entry
│   │   ├── layout.tsx
│   │   └── globals.css            ← dark control-tower theme
│   ├── components/
│   │   └── Miror/              ← 14 UI components
│   ├── lib/
│   │   ├── types.ts               ← shared types (mirror of models.rs)
│   │   └── backend-client.ts      ← HTTP + WebSocket client
│   └── store/
│       └── Miror-store.ts      ← Zustand store
│
├── src-tauri/                     ← Tauri desktop wrapper (for local packaging)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   └── src/
│       ├── main.rs
│       └── lib.rs                 ← spawns backend sidecar + opens window
│
├── scripts/
│   └── start-backend.sh           ← launches the Rust backend in background
│
└── test-projects/                 ← sample projects for testing
    ├── boto/                      ← Boto.social stack (Redis, API, Web, Worker)
    └── atlas/                     ← Atlas Analytics stack (PG, Rust API, Dashboard)
```

## Running in the Sandbox

1. **Build the Rust backend** (first time only — takes ~3-5 minutes):
   ```bash
   . $HOME/.cargo/env
   cd mini-services/Miror-backend
   cargo build --release
   ```

2. **Start the backend**:
   ```bash
   ./scripts/start-backend.sh
   ```

3. **The Next.js dev server is already running** on port 3000.

4. **Open the preview** — the frontend will connect to the backend automatically.

## Building as a Desktop App (locally)

Miror uses Tauri v2 for desktop packaging. On your local machine:

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) 20+
- [Bun](https://bun.sh/)
- [Tauri v2 prerequisites](https://tauri.app/start/prerequisites/)

### Steps

1. **Clone and install**:
   ```bash
   git clone <your-repo>
   cd Miror
   bun install
   ```

2. **Build the Rust backend as a sidecar**:
   ```bash
   cd mini-services/Miror-backend
   cargo build --release
   # Copy the binary to where Tauri expects sidecars
   cp target/release/Miror-backend ../../src-tauri/binaries/Miror-backend-x86_64-unknown-linux-gnu
   # (rename to match your target triple — see `rustc -vV` for HOST triple)
   ```

3. **Build the Next.js frontend for static export**:
   ```bash
   # In next.config.ts, add: output: 'export'
   bun run build
   ```

4. **Build the Tauri app**:
   ```bash
   cd src-tauri
   cargo install tauri-cli --version "^2.0"
   cargo tauri build
   ```

5. **The installer** will be in `src-tauri/target/release/bundle/` — `.dmg` for macOS, `.msi`/`.exe` for Windows, `.AppImage`/`.deb` for Linux.

### Development mode

For hot-reload development:
```bash
cd src-tauri
cargo tauri dev
```

This will:
1. Start the Next.js dev server
2. Spawn the backend sidecar
3. Open a native window pointing at the dev server

## Features

### Implemented (all backed by the real Rust backend)

- ✅ **Project & service registration** — SQLite-persisted
- ✅ **Real process spawning** via `tokio::process::Command` with `kill_on_drop`
- ✅ **Live log streaming** — bounded mpsc + 32ms batcher + WebSocket broadcast
- ✅ **Dependency resolution** — topological sort with `Box::pin` recursion
- ✅ **Graceful stop** — SIGTERM → 3s timeout → SIGKILL fallback
- ✅ **CPU/memory telemetry** — reads `/proc/[pid]/stat` every 1s (Linux)
- ✅ **Crash detection** — non-zero exit → notification + status=error
- ✅ **Virtualized log viewer** — @tanstack/react-virtual, 22px rows, 4000-line cap
- ✅ **Filter by stdout/stderr/system** + full-text search
- ✅ **Docker Compose detection** — `docker compose config --services`
- ✅ **Miror.json read/write** — sync config with project root
- ✅ **.env file parsing/writing** — handles `export`, comments, quotes
- ✅ **Environment profiles** — swap `.env` from `.env.testing` / `.env.staging`
- ✅ **Editor integration** — VS Code, Cursor, file manager (real shell commands)
- ✅ **System tray** — floating widget with running/error counts + quick actions
- ✅ **Keyboard shortcuts** — Ctrl+R, Ctrl+Shift+R, Ctrl+L, Ctrl+K, G+D/P/L/S
- ✅ **Notifications** — crash alerts with OS-level popups (via Notification API in browser)
- ✅ **Dark "control tower" theme** — slate + emerald, terminal-inspired

### Tauri-side additions needed for production

- Native OS notifications (instead of browser Notification API)
- System tray icon (Tauri's tray API)
- Auto-start on login (Tauri's autostart plugin)
- Single-instance lock (Tauri's single-instance plugin)

## API Reference

### HTTP

| Method | Path                              | Description                        |
|--------|-----------------------------------|------------------------------------|
| GET    | `/api/health`                     | Backend health check               |
| GET    | `/api/projects`                   | List all projects                  |
| POST   | `/api/projects`                   | Create a project                   |
| GET    | `/api/projects/:id`               | Get a project                      |
| PUT    | `/api/projects/:id`               | Update a project                   |
| DELETE | `/api/projects/:id`               | Delete a project + its services    |
| GET    | `/api/projects/:id/Miror.json` | Export config to Miror.json     |
| POST   | `/api/projects/:id/Miror.json` | Import config from Miror.json   |
| GET    | `/api/projects/:id/docker`        | Detect docker-compose + services   |
| POST   | `/api/projects/:id/env-profile`   | Swap .env from profile             |
| POST   | `/api/projects/:id/start-all`     | Start all autoStart services       |
| POST   | `/api/projects/:id/stop-all`      | Stop all running services          |
| POST   | `/api/projects/:id/restart-all`   | Restart all services               |
| GET    | `/api/services`                   | List all services                  |
| POST   | `/api/services`                   | Create a service                   |
| GET    | `/api/services/:id`               | Get a service                      |
| PUT    | `/api/services/:id`               | Update a service                   |
| DELETE | `/api/services/:id`               | Delete a service                   |
| POST   | `/api/services/:id/start`         | Start (resolves dependsOn first)   |
| POST   | `/api/services/:id/stop`          | Graceful stop (SIGTERM → SIGKILL)  |
| POST   | `/api/services/:id/kill`          | Force kill (SIGKILL)               |
| POST   | `/api/services/:id/restart`       | Stop + start                       |
| GET    | `/api/services/:id/status`        | Get current status                 |
| POST   | `/api/services/:id/editor/:ed`    | Open in vscode/cursor/files        |
| GET    | `/api/logs?service_id=&limit=`    | List logs (optional filter)        |
| DELETE | `/api/logs?service_id=`           | Clear logs                         |
| GET    | `/api/env-file?path=`             | Parse a .env file                  |
| POST   | `/api/env-file`                   | Write a .env file                  |

### WebSocket

Connect to `/ws` and receive JSON events:

```json
{ "type": "log_batch",     "service_id": "...", "logs": [...] }
{ "type": "status_change", "service_id": "...", "status": "running", "pid": 12345 }
{ "type": "telemetry",     "service_id": "...", "cpu": 1.5, "memory_mb": 32.4 }
{ "type": "notification",  "notification": { "kind": "crash", "message": "..." } }
{ "type": "lagged",        "message": "some events were missed" }
```

## Tech Stack

| Layer            | Tech                                          |
|------------------|-----------------------------------------------|
| Frontend         | Next.js 16, TypeScript 5, TailwindCSS 4       |
| UI components    | shadcn/ui (New York), Lucide icons            |
| State            | Zustand                                       |
| Log virtualization | @tanstack/react-virtual                     |
| Backend          | Rust 1.96, axum 0.7, tokio 1                  |
| Persistence      | SQLite via rusqlite (bundled)                 |
| WebSocket        | axum::ws + tokio::sync::broadcast             |
| Desktop wrapper  | Tauri v2 (configured, ready to build)         |

## License

MIT
