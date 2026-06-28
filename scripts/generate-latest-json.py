#!/usr/bin/env python3
"""
Generate latest.json for Tauri auto-updates.

Usage:
    python3 scripts/generate-latest-json.py <artifacts-dir> > latest.json

Expects a directory structure like:
    artifacts/
      devpilot-macos-latest/
        bundle/
          macos/
            DevPilot_1.0.0_aarch64.app.tar.gz
            DevPilot_1.0.0_aarch64.app.tar.gz.sig
            DevPilot_1.0.0_x64.app.tar.gz
            DevPilot_1.0.0_x64.app.tar.gz.sig
      devpilot-ubuntu-22.04/
        bundle/
          appimage/
            DevPilot_1.0.0_amd64.AppImage.tar.gz
            DevPilot_1.0.0_amd64.AppImage.tar.gz.sig
      devpilot-windows-latest/
        bundle/
          nsis/
            DevPilot_1.0.0_x64-setup.nsis.zip
            DevPilot_1.0.0_x64-setup.nsis.zip.sig

Reads the version from the first .tar.gz filename, infers the GitHub release URL,
and prints a JSON manifest to stdout.
"""

import json
import os
import re
import sys
from pathlib import Path


GITHUB_REPO = os.environ.get("GITHUB_REPO", "yourusername/devpilot")
RELEASE_BASE = f"https://github.com/{GITHUB_REPO}/releases/download"


def find_artifacts(root: Path):
    """Walk the artifacts dir and return a list of (platform, file_path, sig_path) tuples."""
    results = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue

        name = path.name
        sig_path = path.with_suffix(path.suffix + ".sig")
        if not sig_path.exists():
            continue

        # Map filename patterns to Tauri platform identifiers
        if "aarch64.app.tar.gz" in name:
            platform = "darwin-aarch64"
        elif "x64.app.tar.gz" in name:
            platform = "darwin-x86_64"
        elif "amd64.AppImage.tar.gz" in name or "x64.AppImage.tar.gz" in name:
            platform = "linux-x86_64"
        elif "x64-setup.nsis.zip" in name:
            platform = "windows-x86_64"
        else:
            continue

        results.append((platform, path, sig_path))
    return results


def extract_version(filename: str) -> str:
    """Pull the version string (e.g. '1.0.0') from a filename like DevPilot_1.0.0_aarch64.app.tar.gz"""
    m = re.search(r"(\d+\.\d+\.\d+)", filename)
    return m.group(1) if m else "0.0.0"


def main():
    if len(sys.argv) != 2:
        print("Usage: generate-latest-json.py <artifacts-dir>", file=sys.stderr)
        sys.exit(1)

    root = Path(sys.argv[1])
    if not root.exists():
        print(f"Error: {root} does not exist", file=sys.stderr)
        sys.exit(1)

    artifacts = find_artifacts(root)
    if not artifacts:
        print("Error: no signed artifacts found", file=sys.stderr)
        sys.exit(1)

    version = extract_version(artifacts[0][1].name)
    tag = f"v{version}"

    platforms = {}
    for platform, file_path, sig_path in artifacts:
        # The GitHub release URL is tag/filename
        url = f"{RELEASE_BASE}/{tag}/{file_path.name}"
        signature = sig_path.read_text().strip()
        platforms[platform] = {
            "signature": signature,
            "url": url,
        }

    manifest = {
        "version": version,
        "notes": f"DevPilot {version}",
        "pub_date": __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": platforms,
    }

    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
