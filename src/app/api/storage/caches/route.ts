import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import path from "path";
import fs from "fs";

const execAsync = promisify(exec);

interface CacheEntry {
  name: string;
  path: string;
  size: string;
  sizeBytes: number;
  lastAccessed: string;
  fileCount: number;
  icon: string;
  packageManager: string;
  safeToDelete: boolean;
  reason: string;
}

// Detect all package manager caches
export async function GET() {
  try {
    const home = os.homedir();
    const caches: CacheEntry[] = [];

    const cacheDefs = [
      // Node.js
      { name: "npm cache", dir: path.join(home, ".npm"), pm: "Node.js", icon: "📦", safe: true, reason: "Cache of downloaded npm packages. Safe to delete — packages re-download on demand." },
      { name: "pnpm store", dir: path.join(home, ".local/share/pnpm"), pm: "Node.js", icon: "📦", safe: true, reason: "pnpm content-addressable store. Safe to delete — run `pnpm install` to restore." },
      { name: "Yarn cache", dir: path.join(home, ".cache/yarn"), pm: "Node.js", icon: "📦", safe: true, reason: "Yarn package cache. Safe to delete — packages re-download on demand." },
      { name: "Bun cache", dir: path.join(home, ".bun/install/cache"), pm: "Node.js", icon: "📦", safe: true, reason: "Bun install cache. Safe to delete — packages re-download on demand." },
      // Flutter
      { name: "Pub cache", dir: path.join(home, ".pub-cache"), pm: "Flutter", icon: "🦋", safe: true, reason: "Dart/Flutter package cache. Safe to delete — run `flutter pub get` to restore." },
      // Rust
      { name: "Cargo cache", dir: path.join(home, ".cargo/registry"), pm: "Rust", icon: "🦀", safe: true, reason: "Cargo registry cache. Safe to delete — crates re-download on demand." },
      // Go
      { name: "Go modules", dir: path.join(home, "go/pkg/mod"), pm: "Go", icon: "🐹", safe: true, reason: "Go module cache. Safe to delete — run `go mod download` to restore." },
      // Python
      { name: "pip cache", dir: path.join(home, ".cache/pip"), pm: "Python", icon: "🐍", safe: true, reason: "pip download cache. Safe to delete — packages re-download on demand." },
      { name: "uv cache", dir: path.join(home, ".cache/uv"), pm: "Python", icon: "🐍", safe: true, reason: "uv package cache. Safe to delete — packages re-download on demand." },
      // Java
      { name: "Maven repository", dir: path.join(home, ".m2/repository"), pm: "Java", icon: "☕", safe: true, reason: "Maven local repository. Safe to delete — dependencies re-download on build." },
      { name: "Gradle cache", dir: path.join(home, ".gradle/caches"), pm: "Java", icon: "☕", safe: true, reason: "Gradle build cache. Safe to delete — Gradle re-downloads on next build." },
    ];

    for (const def of cacheDefs) {
      try {
        await fs.promises.access(def.dir);
        // Get size
        let size = "—";
        let sizeBytes = 0;
        try {
          const { stdout } = await execAsync(`du -sh "${def.dir}" 2>/dev/null`, { timeout: 8000 });
          size = stdout.trim().split(/\s+/)[0] || "—";
          const { stdout: bOut } = await execAsync(`du -sb "${def.dir}" 2>/dev/null`, { timeout: 8000 });
          sizeBytes = parseInt(bOut.trim().split(/\s+/)[0] || "0", 10);
        } catch {}

        // Get last accessed
        let lastAccessed = "—";
        try {
          const stat = await fs.promises.stat(def.dir);
          lastAccessed = stat.atime.toISOString().split("T")[0];
        } catch {}

        // Get file count
        let fileCount = 0;
        try {
          const { stdout } = await execAsync(`find "${def.dir}" -type f 2>/dev/null | wc -l`, { timeout: 8000 });
          fileCount = parseInt(stdout.trim(), 10) || 0;
        } catch {}

        caches.push({
          name: def.name,
          path: def.dir,
          size,
          sizeBytes,
          lastAccessed,
          fileCount,
          icon: def.icon,
          packageManager: def.pm,
          safeToDelete: def.safe,
          reason: def.reason,
        });
      } catch {
        // Directory doesn't exist — skip
      }
    }

    // Sort by size descending
    caches.sort((a, b) => b.sizeBytes - a.sizeBytes);

    return NextResponse.json(caches);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
