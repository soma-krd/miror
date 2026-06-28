import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// List all containers (running + stopped) with stats
export async function GET() {
  try {
    const { stdout } = await execAsync(
      `docker ps -a --format "{{.ID}}\\t{{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}\\t{{.CreatedAt}}"`,
      { maxBuffer: 1024 * 1024 }
    );

    const containers = stdout.trim().split("\n").filter(Boolean).map(line => {
      const [id, name, image, status, ports, createdAt] = line.split("\t");
      const isRunning = status.toLowerCase().includes("up");
      return {
        id: id || "",
        name: name || "",
        image: image || "",
        status: status || "",
        ports: ports || "",
        createdAt: createdAt || "",
        isRunning,
      };
    });

    return NextResponse.json(containers);
  } catch (e) {
    const err = e as Error;
    return NextResponse.json(
      { error: err.message.includes("docker") ? "Docker not available or not running" : err.message },
      { status: 500 }
    );
  }
}
