import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

interface ProjectDir {
  name: string;
  path: string;
  size: string;
  sizeBytes: number;
  safeLevel: "green" | "yellow" | "red";
  reason: string;
}

interface ProjectInfo {
  name: string;
  path: string;
  totalSize: string;
  totalSizeBytes: number;
  type: string;
  breakdown: ProjectDir[];
}

const PROJECT_MARKERS: Array<{ file: string; type: string }> = [
  { file: "package.json", type: "Node.js" },
  { file: "pubspec.yaml", type: "Flutter" },
  { file: "Cargo.toml", type: "Rust" },
  { file: "pyproject.toml", type: "Python" },
  { file: "requirements.txt", type: "Python" },
  { file: "pom.xml", type: "Java" },
  { file: "build.gradle", type: "Java" },
  { file: "*.csproj", type: ".NET" },
];

const SAFE_DIRS = [
  { name: "node_modules", safeLevel: "green" as const, reason: "Can be regenerated with npm install / pnpm install." },
  { name: "dist", safeLevel: "green" as const, reason: "Compiled output — regenerated on build." },
  { name: "build", safeLevel: "green" as const, reason: "Generated build artifacts." },
  { name: "target", safeLevel: "green" as const, reason: "Rust/Cargo build output — regenerated on build." },
  { name: ".next", safeLevel: "green" as const, reason: "Next.js build cache — regenerated on build." },
  { name: ".nuxt", safeLevel: "green" as const, reason: "Nuxt build cache — regenerated on build." },
  { name: ".dart_tool", safeLevel: "green" as const, reason: "Flutter/Dart build cache — regenerated on build." },
  { name: ".gradle", safeLevel: "green" as const, reason: "Gradle build cache — regenerated on build." },
  { name: "coverage", safeLevel: "green" as const, reason: "Test coverage reports — regenerated on test run." },
  { name: "__pycache__", safeLevel: "green" as const, reason: "Python bytecode cache — auto-generated." },
  { name: ".turbo", safeLevel: "green" as const, reason: "Turborepo cache — regenerated on build." },
  { name: "logs", safeLevel: "yellow" as const, reason: "Log files. Review before deleting." },
  { name: "tmp", safeLevel: "yellow" as const, reason: "Temporary files. Review before deleting." },
  { name: ".cache", safeLevel: "yellow" as const, reason: "Cache directory. Review before deleting." },
];

const PROTECTED_PATTERNS = [
  ".git", ".env", ".ssh", "node_modules/.cache",
];

export async function POST(req: NextRequest) {
  try {
    const { scanPath } = await req.json();
    if (!scanPath) {
      return NextResponse.json({ error: "scanPath required" }, { status: 400 });
    }

    // Verify the path exists and is a directory
    try {
      const stat = await fs.promises.stat(scanPath);
      if (!stat.isDirectory()) {
        return NextResponse.json({ error: "Path is not a directory" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Path does not exist" }, { status: 400 });
    }

    // Safety: never scan protected system directories
    const protectedPaths = ["/System", "/Library", "/Applications", "/bin", "/boot", "/dev", "/etc", "/lib", "/proc", "/root", "/run", "/sbin", "/sys", "/usr", "/var", "C:\\Windows", "C:\\Program Files"];
    for (const p of protectedPaths) {
      if (scanPath.startsWith(p)) {
        return NextResponse.json({ error: "Cannot scan protected system directory" }, { status: 403 });
      }
    }

    const projects: ProjectInfo[] = [];

    // Find project directories (max depth 3)
    for (const marker of PROJECT_MARKERS) {
      try {
        const findCmd = marker.file.includes("*")
          ? `find "${scanPath}" -maxdepth 3 -name "${marker.file}" -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null`
          : `find "${scanPath}" -maxdepth 3 -name "${marker.file}" -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null`;
        const { stdout } = await execAsync(findCmd, { timeout: 15000 });
        const files = stdout.trim().split("\n").filter(Boolean);

        for (const file of files) {
          const projectDir = path.dirname(file);
          const projectName = path.basename(projectDir);

          // Skip if already found
          if (projects.find(p => p.path === projectDir)) continue;

          // Get total size
          let totalSize = "—";
          let totalSizeBytes = 0;
          try {
            const { stdout: sOut } = await execAsync(`du -sh "${projectDir}" 2>/dev/null`, { timeout: 10000 });
            totalSize = sOut.trim().split(/\s+/)[0] || "—";
            const { stdout: bOut } = await execAsync(`du -sb "${projectDir}" 2>/dev/null`, { timeout: 10000 });
            totalSizeBytes = parseInt(bOut.trim().split(/\s+/)[0] || "0", 10);
          } catch {}

          // Scan for breakdown directories
          const breakdown: ProjectDir[] = [];
          for (const safeDir of SAFE_DIRS) {
            const dirPath = path.join(projectDir, safeDir.name);
            try {
              await fs.promises.access(dirPath);
              let size = "—";
              let sizeBytes = 0;
              try {
                const { stdout } = await execAsync(`du -sh "${dirPath}" 2>/dev/null`, { timeout: 5000 });
                size = stdout.trim().split(/\s+/)[0] || "—";
                const { stdout: bOut } = await execAsync(`du -sb "${dirPath}" 2>/dev/null`, { timeout: 5000 });
                sizeBytes = parseInt(bOut.trim().split(/\s+/)[0] || "0", 10);
              } catch {}
              if (sizeBytes > 0) {
                breakdown.push({
                  name: safeDir.name,
                  path: dirPath,
                  size,
                  sizeBytes,
                  safeLevel: safeDir.safeLevel,
                  reason: safeDir.reason,
                });
              }
            } catch {}
          }

          // Sort breakdown by size
          breakdown.sort((a, b) => b.sizeBytes - a.sizeBytes);

          projects.push({
            name: projectName,
            path: projectDir,
            totalSize,
            totalSizeBytes,
            type: marker.type,
            breakdown,
          });
        }
      } catch {}
    }

    // Sort projects by total size
    projects.sort((a, b) => b.totalSizeBytes - a.totalSizeBytes);

    return NextResponse.json({ projects });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
