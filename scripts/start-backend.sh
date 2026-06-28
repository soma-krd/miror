#!/bin/bash
# Start the Miror Rust backend in a robust, detached way.

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT/mini-services/miror-backend"
DATA_DIR="${MIROR_DATA_DIR:-$ROOT/.miror}"
LOG_FILE="$DATA_DIR/backend.log"
PID_FILE="$DATA_DIR/backend.pid"

mkdir -p "$DATA_DIR"

if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Miror backend already running (pid=$OLD_PID)"
        exit 0
    fi
    rm -f "$PID_FILE"
fi

cd "$BACKEND_DIR"

# In the sandbox/dev environment the gateway proxy runs on the host and needs
# to reach the backend, so we bind to all interfaces here.
# No auth token is set — auth is disabled in dev mode.
MIROR_PORT=3001 \
MIROR_BIND_ADDR=0.0.0.0 \
MIROR_DATA_DIR="$DATA_DIR" \
RUST_LOG=info \
setsid ./target/release/miror-backend > "$LOG_FILE" 2>&1 < /dev/null &

NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"
sleep 1

if ! kill -0 "$NEW_PID" 2>/dev/null; then
    echo "ERROR: backend failed to start"
    cat "$LOG_FILE"
    exit 1
fi

echo "Miror backend started (pid=$NEW_PID, port=3001)"
