import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import path from "path";
import fs from "fs";

const execAsync = promisify(exec);

// Storage Overview — disk usage summary + largest directories
export async function GET() {
  try {
    const homeDir = os.homedir();
    const platform = process.platform;

    // Get disk usage
    let diskInfo: { total: string; used: string; free: string; totalBytes: number; usedBytes: number; freeBytes: number };
    try {
      if (platform === "linux" || platform === "darwin") {
        const { stdout } = await execAsync(`df -h "${homeDir}" | tail -1`);
        const parts = stdout.trim().split(/\s+/);
        diskInfo = {
          total: parts[1] || "—",
          used: parts[2] || "—",
          free: parts[3] || "—",
          totalBytes: 0, usedBytes: 0, freeBytes: 0,
        };
      } else {
        diskInfo = { total: "—", used: "—", free: "—", totalBytes: 0, usedBytes: 0, freeBytes: 0 };
      }
    } catch { diskInfo = { total: "—", used: "—", free: "—", totalBytes: 0, usedBytes: 0, freeBytes: 0 }; }

    // Get sizes of common large directories (non-blocking, with timeout)
    const categories: Array<{ name: string; path: string; size: string; sizeBytes: number; icon: string }> = [];

    const dirsToCheck = [
      { name: "Projects", path: path.join(homeDir, "projects"), icon: "📁" },
      { name: "Downloads", path: path.join(homeDir, "Downloads"), icon: "⬇️" },
      { name: "Docker", path: "/var/lib/docker", icon: "🐳" },
      { name: "npm cache", path: path.join(homeDir, ".npm"), icon: "📦" },
      { name: "pnpm store", path: path.join(homeDir, ".local/share/pnpm"), icon: "📦" },
      { name: "Yarn cache", path: path.join(homeDir, ".cache/yarn"), icon: "📦" },
      { name: "Cargo cache", path: path.join(homeDir, ".cargo"), icon: "🦀" },
      { name: "Go modules", path: path.join(homeDir, "go"), icon: "🐹" },
      { name: "pip cache", path: path.join(homeDir, ".cache/pip"), icon: "🐍" },
      { name: "Pub cache", path: path.join(homeDir, ".pub-cache"), icon: "🦋" },
      { name: "Maven repo", path: path.join(homeDir, ".m2"), icon: "☕" },
      { name: "Gradle cache", path: path.join(homeDir, ".gradle"), icon: "☕" },
      { name: "Trash", path: path.join(homeDir, ".local/share/Trash"), icon: "🗑️" },
      { name: "IDE Cache (VS Code)", path: path.join(homeDir, ".vscode"), icon: "💻" },
      { name: "IDE Cache (JetBrains)", path: path.join(homeDir, ".local/share/JetBrains"), icon: "💻" },
    ];

    for (const dir of dirsToCheck) {
      try {
        await fs.promises.access(dir.path);
        const { stdout } = await execAsync(`du -sh "${dir.path}" 2>/dev/null`, { timeout: 5000 });
        const size = stdout.trim().split(/\s+/)[0] || "—";
        let sizeBytes = 0;
        try {
          const { stdout: bytesOut } = await execAsync(`du -sb "${dir.path}" 2>/dev/null`, { timeout: 5000 });
          sizeBytes = parseInt(bytesOut.trim().split(/\s+/)[0] || "0", 10);
        } catch {}
        categories.push({ ...dir, size, sizeBytes });
      } catch {
        // Directory doesn't exist or not accessible — skip
      }
    }

    // Sort by size descending
    categories.sort((a, b) => b.sizeBytes - a.sizeBytes);

    return NextResponse.json({
      disk: diskInfo,
      categories,
      homeDir,
      platform,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
