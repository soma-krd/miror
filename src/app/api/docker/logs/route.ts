import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Get container logs (last N lines)
export async function GET(req: NextRequest) {
  const containerId = req.nextUrl.searchParams.get("containerId");
  const tail = req.nextUrl.searchParams.get("tail") || "100";

  if (!containerId) {
    return NextResponse.json({ error: "containerId required" }, { status: 400 });
  }

  try {
    const { stdout } = await execAsync(
      `docker logs --tail ${tail} ${containerId} 2>&1`,
      { maxBuffer: 1024 * 1024 * 4 }
    );

    const lines = stdout.split("\n").filter(Boolean).map((line, i) => ({
      id: `docker_log_${i}`,
      serviceId: containerId,
      timestamp: Date.now() - (lines.length - i) * 100,
      type: "stdout" as const,
      message: line,
    }));

    return NextResponse.json({ logs: lines });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Need to declare `lines` outside the map scope
function formatLogs(stdout: string, containerId: string) {
  const lines = stdout.split("\n").filter(Boolean);
  return lines.map((line, i) => ({
    id: `docker_log_${i}`,
    serviceId: containerId,
    timestamp: Date.now() - (lines.length - i) * 100,
    type: "stdout" as const,
    message: line,
  }));
}
