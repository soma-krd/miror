# Miror — Desktop App Build & Publish Guide

This guide walks you through turning Miror into a signed, distributable desktop app for **macOS**, **Windows**, and **Linux**, with system tray integration and native OS notifications, and publishing it so users can install it with one click.

---

## System Tray / Menu Bar Integration

Miror includes a full system tray integration that works across all three platforms:

| Platform | Location | Behavior |
|----------|----------|----------|
| **macOS** | Menu bar (top-right) | Template icon (adapts to light/dark mode). Left-click → popup window. Right-click → native menu. |
| **Linux** | System tray (GNOME needs AppIndicator extension, KDE/XFCE built-in) | Left-click → popup window. Right-click → native menu. |
| **Windows** | System tray (bottom-right) | Left-click → popup window. Right-click → native context menu. |

### What the tray does

1. **Left-click the tray icon** → a 380×520 popup window appears anchored near the cursor, showing:
   - Header with running/starting/error counts
   - Collapsible list of all projects and their services
   - Each service row: status dot, name, port, PID, uptime
   - Hover reveals quick action buttons: Start / Stop / Restart
   - Click a service name → opens the main window focused on that service's logs
   - Click outside the popup → hides it
2. **Right-click the tray icon** → native menu with "Open Miror" and "Quit Miror" (Cmd+Q)
3. **Bell icon in the popup header** → shows recent crash notifications
4. **Close the main window** → hides to tray instead of quitting (like Slack/Discord)
5. **Service crashes** → native OS notification fires automatically:
   - macOS: Notification Center banner
   - Linux: libnotify (notify-send)
   - Windows: toast notification

### Tray icon assets

Generated at `src-tauri/icons/`:
- `tray-icon-16.png` — 16×16 (Windows small)
- `tray-icon-22.png` — 22×22 (macOS menu bar standard)
- `tray-icon-32.png` — 32×32 (Windows large)
- `tray-icon-48.png`, `tray-icon-64.png` — high-DPI variants
- `tray-icon-template.png` — white-on-transparent template image for macOS

To regenerate with a custom design:
```bash
python3 scripts/generate-tray-icons.py
# Or provide your own 1024×1024 PNG:
cargo tauri icon src-tauri/icons/app-icon-1024.png
```

### Linux tray requirements

GNOME (default Ubuntu) removed the system tray by default. Users need one of:
- **AppIndicator extension**: `sudo apt install gnome-shell-extension-appindicator && gnome-extensions enable appindicatorsupport@rgcjonas.gmail.com`
- Or use KStatusNotifierItem/AppIndicator via the AppIndicator3 library (Miror's `.deb` package declares `libappindicator3-1` as a dependency)

KDE Plasma, XFCE, and Cinnamon have the tray built-in — no setup needed.

The `.deb` bundle in `tauri.conf.json` already declares these dependencies:
```json
"linux": {
  "deb": {
    "depends": ["libappindicator3-1", "libnotify4"]
  }
}
```

### macOS template icon

The `iconAsTemplate: true` setting in `tauri.conf.json` makes the tray icon adapt to macOS appearance — it renders as black in light mode and white in dark mode, matching Apple's Human Interface Guidelines for menu bar icons.

---

## Table of Contents

1. [How the architecture works](#1-how-the-architecture-works)
2. [Prerequisites](#2-prerequisites)
3. [Step 1 — Build the Rust backend as a sidecar](#step-1--build-the-rust-backend-as-a-sidecar)
4. [Step 2 — Configure Next.js for static export](#step-2--configure-nextjs-for-static-export)
5. [Step 3 — Generate app icons](#step-3--generate-app-icons)
6. [Step 4 — Update tauri.conf.json](#step-4--update-tauriconfjson)
7. [Step 5 — Build the desktop app](#step-5--build-the-desktop-app)
8. [Step 6 — Code signing (required for distribution)](#step-6--code-signing-required-for-distribution)
9. [Step 7 — Set up auto-updates](#step-7--set-up-auto-updates)
10. [Step 8 — Publish to GitHub Releases](#step-8--publish-to-github-releases)
11. [Step 9 — Optional: publish to app stores](#step-9--optional-publish-to-app-stores)
12. [CI/CD — automated multi-platform builds](#cicd--automated-multi-platform-builds)
13. [Troubleshooting](#troubleshooting)

---

## 1. How the architecture works

Miror is **two binaries** bundled into one installer:

```
┌─────────────────────────────────────────────────────────┐
│  Miror.app / Miror.exe / Miror.AppImage        │
│                                                         │
│  ┌──────────────────┐    ┌──────────────────────────┐   │
│  │  Tauri runtime   │    │  miror-backend        │   │
│  │  (webview shell) │    │  (your Rust binary)      │   │
│  │                  │    │  port 3001               │   │
│  │  Loads:          │◄───┤  spawns child processes  │   │
│  │  /index.html     │    │  streams logs over WS    │   │
│  │  (Next.js export)│    │  persists to SQLite      │   │
│  └──────────────────┘    └──────────────────────────┘   │
│                                                         │
│  WebView ←→ http://localhost:3001 ←→ Real OS processes  │
└─────────────────────────────────────────────────────────┘
```

On launch:
1. Tauri opens a native window
2. Tauri spawns `miror-backend` as a **sidecar process** (managed lifetime)
3. The WebView loads the bundled Next.js static files from `out/`
4. The frontend talks to `http://localhost:3001` (the sidecar)
5. The sidecar spawns real child processes (Node, Docker, etc.) via `tokio::process::Command`

This is exactly the architecture you've been testing in the sandbox — just packaged.

---

## 2. Prerequisites

### On macOS (builds `.dmg` + `.app`)

```bash
# Install Xcode command-line tools
xcode-select --install

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Node.js 20+ and Bun
brew install node bun

# Install Tauri CLI v2
cargo install tauri-cli --version "^2.0" --locked

# Install frontend deps
cd /path/to/miror
bun install
```

### On Windows (builds `.msi` + `.exe`)

```powershell
# Install Visual Studio Build Tools (C++ workload)
winget install Microsoft.VisualStudio.2022.BuildTools

# Install Rust
winget install Rustlang.Rustup

# Install Node.js 20+ and Bun
winget install OpenJS.NodeJS
npm install -g bun

# Install Tauri CLI
cargo install tauri-cli --version "^2.0" --locked

# Install WebView2 runtime (Tauri dependency)
winget install Microsoft.EdgeWebView2Runtime
```

### On Linux (builds `.AppImage` + `.deb` + `.rpm`)

```bash
# Install system dependencies (Tauri needs these)
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev libappindicator3-dev \
  librsvg2-dev patchelf libssl-dev \
  build-essential curl wget file

# Install Rust, Node, Bun, Tauri CLI (same as macOS)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
curl -fsSL https://bun.sh/install | bash
cargo install tauri-cli --version "^2.0" --locked
```

> **Cross-compilation note:** Tauri cannot cross-compile between macOS/Windows/Linux from a single machine. To produce installers for all three platforms, you need **one machine per OS** — or use the CI/CD setup in section 11 below.

---

## Step 1 — Build the Rust backend as a sidecar

Tauri's "sidecar" feature bundles an external binary inside the app and spawns it on launch. The binary must be named with the **target triple** so Tauri can find the right one per platform.

### Find your target triple

```bash
rustc -vV | grep host
# Example output: host: x86_64-unknown-linux-gnu
#                 host: aarch64-apple-darwin (Apple Silicon Mac)
#                 host: x86_64-pc-windows-msvc
```

### Build and rename the binary

```bash
cd mini-services/miror-backend

# Build for your current platform
cargo build --release

# Create the sidecar directory in src-tauri
mkdir -p ../src-tauri/binaries

# Get your target triple
TARGET=$(rustc -vV | grep host | awk '{print $2}')

# Copy + rename — the suffix MUST match the target triple exactly
cp target/release/miror-backend \
   ../src-tauri/binaries/miror-backend-$TARGET

# On Windows, add .exe:
# cp target/release/miror-backend.exe ../src-tauri/binaries/miror-backend-x86_64-pc-windows-msvc.exe
```

### For multi-platform builds

Repeat for each target platform. Either build natively on each OS, or use `cross`:

```bash
cargo install cross
cross build --release --target x86_64-pc-windows-msvc
cross build --release --target aarch64-apple-darwin
```

Then place each binary in `src-tauri/binaries/` with its target-triple suffix.

---

## Step 2 — Configure Next.js for static export

Tauri loads the frontend from static files via a custom protocol. Next.js must be configured to **export** rather than run as a server.

Your `next.config.ts` should look like this:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",              // produces `out/` directory
  images: { unoptimized: true }, // required for static export
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: false,
};

export default nextConfig;
```

Build the frontend:

```bash
bun run build
# This creates out/ with index.html, _next/static/, etc.
```

---

## Step 3 — Generate app icons

Tauri needs platform-specific icons. You provide one source PNG (1024×1024) and Tauri generates all formats.

```bash
# Place your source icon at src-tauri/icons/icon.png (1024×1024 PNG)
# Then run Tauri's icon generator:
cd src-tauri
cargo tauri icon ../path/to/your-logo-1024.png
```

This generates:
- `icons/32x32.png`
- `icons/128x128.png`
- `icons/128x128@2x.png`
- `icons/icon.icns` (macOS)
- `icons/icon.ico` (Windows)
- `icons/Square*Logo.png` (Windows store)

If you skip this step, Tauri uses a default icon — fine for testing, ugly for release.

---

## Step 4 — Update tauri.conf.json

Your `src-tauri/tauri.conf.json` is mostly ready. Two things to add for production: **sidecar config** and **bundle settings**.

Here's the complete production-ready config:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Miror",
  "version": "1.0.0",
  "identifier": "com.miror.app",
  "build": {
    "beforeDevCommand": "bun run dev",
    "beforeBuildCommand": "bun run build",
    "devUrl": "http://localhost:3000",
    "frontendDist": "../out"
  },
  "app": {
    "windows": [
      {
        "title": "Miror — Local Dev Workspace Manager",
        "width": 1440,
        "height": 900,
        "minWidth": 1024,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false,
        "decorations": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "resources": [
      "binaries/miror-backend-*"
    ],
    "externalBin": [
      "binaries/miror-backend"
    ],
    "publisher": "Your Name",
    "category": "DeveloperTool",
    "shortDescription": "Control tower for local dev environments",
    "longDescription": "Miror manages multiple projects and their services from a single unified panel.",
    "copyright": "© 2026 Your Name"
  },
  "plugins": {
    "shell": {
      "sidecar": true,
      "scope": [
        {
          "name": "binaries/miror-backend",
          "cmd": "miror-backend",
          "args": true
        }
      ]
    },
    "updater": {
      "active": true,
      "endpoints": [
        "https://github.com/yourusername/miror/releases/latest/download/latest.json"
      ],
      "pubkey": "YOUR_PUBLIC_KEY_HERE"
    }
  }
}
```

The key additions:
- **`externalBin`** — tells Tauri to bundle the sidecar binary
- **`plugins.shell.sidecar: true`** — enables sidecar spawning
- **`plugins.shell.scope`** — whitelists which binaries can be spawned
- **`plugins.updater`** — enables auto-updates (see Step 7)

---

## Step 5 — Build the desktop app

### Development mode (hot reload)

```bash
cd src-tauri
cargo tauri dev
```

This will:
1. Run `bun run dev` (Next.js dev server)
2. Open a native window pointing at `http://localhost:3000`
3. Hot-reload on file changes
4. Spawn the miror-backend sidecar

### Production build

```bash
cd src-tauri
cargo tauri build
```

This will:
1. Run `bun run build` (static export to `out/`)
2. Compile the Rust Tauri shell in release mode
3. Bundle the sidecar binary
4. Generate installers for your current platform

Output appears at:

| Platform | Output location | Artifacts |
|----------|----------------|-----------|
| macOS | `src-tauri/target/release/bundle/` | `.app`, `.dmg` |
| Windows | `src-tauri/target/release/bundle/` | `.msi`, `.exe` (NSIS) |
| Linux | `src-tauri/target/release/bundle/` | `.AppImage`, `.deb`, `.rpm` |

Test the installer on a clean machine before publishing.

---

## Step 6 — Code signing (required for distribution)

Unsigned installers trigger scary warnings on macOS (Gatekeeper) and Windows (SmartScreen). To distribute widely, you **must** sign.

### macOS — Developer ID + notarization

1. **Join Apple Developer Program** ($99/year): https://developer.apple.com/programs/
2. **Create a Developer ID Application certificate** in https://developer.apple.com/account/resources/certificates/list
3. **Set environment variables** for Tauri's signing:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="you@email.com"
export APPLE_PASSWORD="app-specific-password"  # see https://appleid.apple.com → app-specific passwords
export APPLE_TEAM_ID="TEAMID"
```

4. Build with signing + notarization:

```bash
cargo tauri build
# Tauri automatically signs + notarizes when env vars are set
```

The output `.dmg` will pass Gatekeeper without warnings.

### Windows — Authenticode certificate

1. **Buy a code signing certificate** (~$200/year from DigiCert, Sectigo, or use Azure Trusted Signing ~$10/month)
2. **For EV certificates** (recommended — instant SmartScreen reputation): stored on a hardware token
3. **Set environment variables**:

```powershell
# For a .pfx file certificate:
$env:TAURI_SIGNING_PRIVATE_KEY = "C:\path\to\cert.pfx"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "your-password"

# For Azure Trusted Signing (cheaper, no hardware token):
# Follow https://tauri.app/distribute/sign-windows/
```

4. Build:

```powershell
cargo tauri build
```

> **SmartScreen warning:** New certificates start with zero reputation. Users will see a blue "Windows protected your PC" warning for the first ~100 downloads. After that, reputation builds and the warning disappears. EV certificates skip this entirely.

### Linux — no signing required

Linux has no equivalent of Gatekeeper/SmartScreen. AppImage, `.deb`, and `.rpm` work out of the box. Optionally sign your AppImage with GPG for verification:

```bash
gpg --armor --detach-sign Miror_1.0.0_amd64.AppImage
# Produces Miror_1.0.0_amd64.AppImage.asc
```

---

## Step 7 — Set up auto-updates

Tauri's updater checks a JSON endpoint for new versions and patches the app in-place (differential updates, no full re-download).

### Generate a keypair

```bash
cargo install tauri-cli --version "^2.0" --locked
cargo tauri signer generate -w ~/.tauri/miror.key
# Saves private key to ~/.tauri/miror.key
# Prints public key — put this in tauri.conf.json → plugins.updater.pubkey
```

**Never commit the private key.** Add it to your CI as a secret.

### Update the config

The `plugins.updater` block in tauri.conf.json (already shown in Step 4) tells the app where to check for updates:

```json
"endpoints": [
  "https://github.com/yourusername/miror/releases/latest/download/latest.json"
]
```

### Build signed updates

When you build with the private key set, Tauri generates a `.sig` file alongside each installer:

```bash
export TAURI_PRIVATE_KEY=$(cat ~/.tauri/miror.key)
cargo tauri build
# Produces:
#   bundle/macos/Miror.app.tar.gz
#   bundle/macos/Miror.app.tar.gz.sig  ← signature
```

### Publish the `latest.json` manifest

Create a `latest.json` file and upload it to your release:

```json
{
  "version": "1.0.1",
  "notes": "Fixed crash on startup",
  "pub_date": "2026-06-27T10:00:00Z",
  "platforms": {
    "darwin-x86_64": {
      "signature": "contents of Miror.app.tar.gz.sig",
      "url": "https://github.com/yourusername/miror/releases/download/v1.0.1/Miror_1.0.1_x64.app.tar.gz"
    },
    "darwin-aarch64": {
      "signature": "...",
      "url": "https://github.com/yourusername/miror/releases/download/v1.0.1/Miror_1.0.1_aarch64.app.tar.gz"
    },
    "linux-x86_64": {
      "signature": "...",
      "url": "https://github.com/yourusername/miror/releases/download/v1.0.1/Miror_1.0.1_amd64.AppImage.tar.gz"
    },
    "windows-x86_64": {
      "signature": "...",
      "url": "https://github.com/yourusername/miror/releases/download/v1.0.1/Miror_1.0.1_x64-setup.nsis.zip"
    }
  }
}
```

The app fetches this on launch and prompts the user to update if `version` is newer than the installed version.

---

## Step 8 — Publish to GitHub Releases

This is the simplest, free distribution channel.

### Manual publish

1. **Tag a release:**

```bash
git tag v1.0.0
git push origin v1.0.0
```

2. **Create a release on GitHub:** https://github.com/yourusername/miror/releases/new

3. **Upload these artifacts** (from all three platforms):
   - `Miror_1.0.0_x64.dmg` (macOS Intel)
   - `Miror_1.0.0_aarch64.dmg` (macOS Apple Silicon)
   - `Miror_1.0.0_x64-setup.exe` (Windows)
   - `Miror_1.0.0_x64-setup.nsis.zip` + `.sig` (Windows updater)
   - `Miror_1.0.0_amd64.AppImage` (Linux)
   - `Miror_1.0.0_amd64.AppImage.tar.gz` + `.sig` (Linux updater)
   - `Miror_1.0.0_x64.app.tar.gz` + `.sig` (macOS updater)
   - `latest.json` (updater manifest)

4. **Publish the release.**

### Create a download page

Point users to:

```
https://github.com/yourusername/miror/releases/latest
```

GitHub auto-redirects this to the newest release. Users pick their platform and download.

### Optional: landing page

Use GitHub Pages (free) to host a simple landing page at `https://yourusername.github.io/miror/` with download buttons that link to the release artifacts.

---

## Step 9 — Optional: publish to app stores

### Mac App Store

Tauri supports MAS publishing. Requirements:
- Apple Developer Program membership
- App Store certificates (different from Developer ID)
- App must sandbox — Miror may need entitlements for `process spawning`, which the MAS rejects. **Likely rejection reason:** MAS apps cannot spawn arbitrary child processes.

Miror probably **can't** go on the MAS because of its core feature (spawning dev servers). Stick with direct distribution via `.dmg` + auto-update.

### Microsoft Store

Tauri can produce MSIX packages for the Microsoft Store:

```bash
# In tauri.conf.json, add to bundle.targets:
# "targets": ["msi", "nsis", "app", "appinstaller", "msix"]
cargo tauri build
```

Then upload the `.msix` to https://partner.microsoft.com/dashboard. The store takes ~24-48 hours for review. Cost: one-time $19 developer account.

Miror can go on the Microsoft Store — its process-spawning is allowed.

### Snap Store (Linux)

```bash
# Install snapcraft
sudo snap install snapcraft --classic

# Create snap/snapcraft.yaml (Tauri can generate this)
cargo tauri build --target snap

# Push to Snap Store
snapcraft login
snapcraft upload miror_1.0.0_amd64.snap
snapcraft release miror 1 stable
```

Free for open-source apps. Reaches Ubuntu users directly via `snap install miror`.

### Flathub (Linux)

Submit your AppImage to https://flathub.org — reaches all Linux distros with Flatpak support. Requires writing a `flatpak-builder` manifest. Free.

---

## CI/CD — automated multi-platform builds

You can't cross-compile Tauri from one machine, so use GitHub Actions with a **matrix build** — one runner per OS.

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos-latest
            args: --target aarch64-apple-darwin
          - platform: macos-latest
            args: --target x86_64-apple-darwin
          - platform: ubuntu-22.04
            args: ''
          - platform: windows-latest
            args: ''

    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform == 'macos-latest' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}

      - name: Install Linux deps
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt update
          sudo apt install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf

      - name: Install frontend deps
        run: bun install

      - name: Build Rust backend sidecar
        working-directory: mini-services/miror-backend
        run: |
          cargo build --release
          mkdir -p ../../src-tauri/binaries
          TARGET=$(rustc -vV | grep host | awk '{print $2}')
          cp target/release/miror-backend \
             ../../src-tauri/binaries/miror-backend-$TARGET${{ matrix.platform == 'windows-latest' && '.exe' || '' }}

      - name: Sign macOS build
        if: matrix.platform == 'macos-latest'
        env:
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: cargo tauri build ${{ matrix.args }}

      - name: Build (non-macOS)
        if: matrix.platform != 'macos-latest'
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_PRIVATE_KEY }}
        run: cargo tauri build ${{ matrix.args }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: miror-${{ matrix.platform }}
          path: |
            src-tauri/target/release/bundle/**/*.dmg
            src-tauri/target/release/bundle/**/*.app
            src-tauri/target/release/bundle/**/*.exe
            src-tauri/target/release/bundle/**/*.msi
            src-tauri/target/release/bundle/**/*.AppImage
            src-tauri/target/release/bundle/**/*.deb
            src-tauri/target/release/bundle/**/*.rpm
            src-tauri/target/release/bundle/**/*.sig
            src-tauri/target/release/bundle/**/*.tar.gz

  release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts

      - name: Generate latest.json
        run: |
          # Script to assemble latest.json from all .sig files
          # See https://tauri.app/distribute/updater/ for the format
          python3 scripts/generate-latest-json.py artifacts > latest.json

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            artifacts/**/*.dmg
            artifacts/**/*.exe
            artifacts/**/*.msi
            artifacts/**/*.AppImage
            artifacts/**/*.deb
            artifacts/**/*.rpm
            artifacts/**/*.sig
            artifacts/**/*.tar.gz
            latest.json
          draft: true
          generate_release_notes: true
```

Now every time you push a `v*` tag, GitHub builds installers for all 4 platforms (macOS Intel, macOS ARM, Windows, Linux), signs them, and creates a draft release. You review and publish.

### Required GitHub secrets

Add these at https://github.com/yourusername/miror/settings/secrets/actions:

| Secret | Purpose |
|--------|---------|
| `APPLE_SIGNING_IDENTITY` | "Developer ID Application: Your Name (TEAMID)" |
| `APPLE_ID` | your Apple ID email |
| `APPLE_PASSWORD` | app-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | your Apple team ID |
| `TAURI_PRIVATE_KEY` | contents of `~/.tauri/miror.key` |

---

## Troubleshooting

### "Sidecar binary not found"

The binary name must match `miror-backend-<target-triple>` **exactly**. Verify:

```bash
rustc -vV | grep host
ls src-tauri/binaries/
# Must contain: miror-backend-x86_64-unknown-linux-gnu
```

On Windows, add `.exe`: `miror-backend-x86_64-pc-windows-msvc.exe`.

### Next.js "out/" not found

Make sure `next.config.ts` has `output: "export"` and run `bun run build` — this creates `out/`.

### Blank window on launch

Check the WebView is loading the right path. In `tauri.conf.json`, `frontendDist: "../out"` means relative to `src-tauri/`. Verify:

```bash
ls src-tauri/../out/index.html  # should exist
```

### Sidecar won't start on macOS

macOS Gatekeeper quarantines unsigned sidecar binaries. Either:
1. Sign the whole app bundle (Step 6), OR
2. Remove the quarantine attribute manually for testing: `xattr -cr /Applications/Miror.app`

### "EADDRINUSE: port 3001 already in use"

The backend port conflicts with another service. Change it in `scripts/start-backend.sh` and `src/lib/backend-client.ts` (look for `BACKEND_PORT = 3001`).

### Auto-update signature mismatch

The signature in `latest.json` must exactly match the `.sig` file contents. Don't truncate or modify the signature string. Make sure `TAURI_PRIVATE_KEY` is the same key used to build.

### App rejected by Apple notarization

Common reasons:
- Hardened runtime not enabled (Tauri does this automatically)
- Sidecar binary not signed (Tauri handles this if env vars are set)
- App uses private APIs (Miror shouldn't)

Run the notarization log to see details:

```bash
xcrun notarytool history --apple-id "you@email.com" --password "app-specific-password"
xcrun notarytool log <submission-id> --apple-id "you@email.com" --password "app-specific-password"
```

---

## Quick start checklist

For a fast path from code to published installer:

- [ ] Install prerequisites (Rust, Node, Bun, Tauri CLI)
- [ ] Build backend: `cd mini-services/miror-backend && cargo build --release`
- [ ] Copy binary to sidecar location with target-triple suffix
- [ ] Verify `next.config.ts` has `output: "export"`
- [ ] Generate icons: `cargo tauri icon <source-1024.png>`
- [ ] Local test: `cargo tauri dev`
- [ ] Production build: `cargo tauri build`
- [ ] Test installer on a clean machine
- [ ] Get signing certificates (Apple Developer ID, Windows Authenticode)
- [ ] Set up GitHub Actions with the release workflow
- [ ] Generate Tauri signing keypair for auto-updates
- [ ] Add secrets to GitHub repo
- [ ] Tag `v1.0.0` and push → CI builds + signs + uploads
- [ ] Review draft release → publish
- [ ] Share `https://github.com/yourusername/miror/releases/latest`

You now have a published desktop app that auto-updates itself. 🎉
