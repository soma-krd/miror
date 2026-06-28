import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

// Delete a folder — moves to Trash if possible, otherwise permanently deletes
// ALWAYS requires explicit confirmation (handled by the frontend)
export async function POST(req: NextRequest) {
  try {
    const { folderPath, permanent } = await req.json();
    if (!folderPath) {
      return NextResponse.json({ error: "folderPath required" }, { status: 400 });
    }

    // Safety: verify path exists
    try {
      const stat = await fs.promises.stat(folderPath);
      if (!stat.isDirectory()) {
        return NextResponse.json({ error: "Path is not a directory" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Path does not exist" }, { status: 400 });
    }

    // Safety: never delete protected system paths
    const protectedPaths = [
      "/System", "/Library", "/Applications", "/bin", "/boot", "/dev", "/etc",
      "/lib", "/proc", "/root", "/run", "/sbin", "/sys", "/usr", "/var",
      "C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)", "C:\\System32",
    ];
    for (const p of protectedPaths) {
      if (folderPath.startsWith(p)) {
        return NextResponse.json({ error: "Cannot delete protected system directory" }, { status: 403 });
      }
    }

    // Safety: never delete .git, .env, .ssh, user home, etc.
    const protectedNames = [".git", ".env", ".ssh", "Desktop", "Documents", "Pictures", "Videos", "Music"];
    const folderName = path.basename(folderPath);
    if (protectedNames.includes(folderName)) {
      return NextResponse.json({ error: `Cannot delete protected folder: ${folderName}` }, { status: 403 });
    }

    // Safety: never delete the user's home directory
    if (folderPath === os.homedir()) {
      return NextResponse.json({ error: "Cannot delete home directory" }, { status: 403 });
    }

    const platform = process.platform;

    if (permanent) {
      // Permanent deletion
      if (platform === "darwin" || platform === "linux") {
        await execAsync(`rm -rf "${folderPath}"`, { timeout: 30000 });
      } else {
        await execAsync(`rmdir /s /q "${folderPath}"`, { timeout: 30000 });
      }
      return NextResponse.json({ ok: true, method: "permanent", message: "Folder permanently deleted." });
    } else {
      // Try to move to Trash
      if (platform === "darwin") {
        // macOS: use AppleScript to move to Trash
        await execAsync(
          `osascript -e 'tell application "Finder" to delete POSIX file "${folderPath}"'`,
          { timeout: 15000 }
        );
        return NextResponse.json({ ok: true, method: "trash", message: "Moved to Trash. You can restore it from Finder > Trash." });
      } else if (platform === "linux") {
        // Linux: use trash-cli if available, otherwise permanent
        try {
          await execAsync(`trash-put "${folderPath}"`, { timeout: 15000 });
          return NextResponse.json({ ok: true, method: "trash", message: "Moved to Trash." });
        } catch {
          // trash-cli not available — permanent delete with warning
          await execAsync(`rm -rf "${folderPath}"`, { timeout: 30000 });
          return NextResponse.json({ ok: true, method: "permanent", message: "trash-cli not available. Folder permanently deleted." });
        }
      } else {
        // Windows: permanent delete (Recycle Bin requires PowerShell COM)
        await execAsync(`rmdir /s /q "${folderPath}"`, { timeout: 30000 });
        return NextResponse.json({ ok: true, method: "permanent", message: "Folder permanently deleted." });
      }
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
