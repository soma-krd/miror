import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Execute a command inside a container
export async function POST(req: NextRequest) {
  const { containerId, command } = await req.json();
  if (!containerId || !command) {
    return NextResponse.json({ error: "containerId and command required" }, { status: 400 });
  }

  // Safety: split command into args, filter dangerous characters
  const args = command.split(/\s+/).filter(a => /^[a-zA-Z0-9_\-./|>"'= ]+$/.test(a));
  if (args.length === 0) {
    return NextResponse.json({ error: "no valid command" }, { status: 400 });
  }

  try {
    const { stdout, stderr } = await execAsync(
      `docker exec ${containerId} ${args.join(" ")}`,
      { maxBuffer: 1024 * 1024, timeout: 10000 }
    );
    return NextResponse.json({ ok: true, output: stdout + (stderr ? "\n" + stderr : "") });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    return NextResponse.json({
      ok: false,
      error: err.stderr || err.message,
      output: err.stdout || "",
    });
  }
}
