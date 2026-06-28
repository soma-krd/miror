#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT/src/app/api"
API_BACKUP="$ROOT/src/app/_api_desktop_backup"

cleanup() {
  if [[ -d "$API_BACKUP" ]]; then
    rm -rf "$API_DIR"
    mv "$API_BACKUP" "$API_DIR"
  fi
}

trap cleanup EXIT

if [[ -d "$API_DIR" ]]; then
  mv "$API_DIR" "$API_BACKUP"
fi

cd "$ROOT"
next build
