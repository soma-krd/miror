import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Container actions: start, stop, restart, remove
export async function POST(req: NextRequest) {
  const { containerId, action } = await req.json();
  if (!containerId || !action) {
    return NextResponse.json({ error: "containerId and action required" }, { status: 400 });
  }

  const validActions = ["start", "stop", "restart", "rm"];
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  try {
    const flag = action === "rm" ? "-f" : "";
    const cmd = `docker ${action} ${flag} ${containerId}`.trim();
    const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 1024 * 1024 });
    return NextResponse.json({ ok: true, output: stdout + stderr });
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    return NextResponse.json({ ok: false, error: err.stderr || err.message });
  }
}
