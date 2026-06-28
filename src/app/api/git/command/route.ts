import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  const { projectId, args } = await req.json();
  if (!projectId || !args) return NextResponse.json({ error: "projectId and args required" }, { status: 400 });

  // Safety: only allow git subcommands, no shell injection
  const argArray = Array.isArray(args) ? args : String(args).split(/\s+/);
  const safeArgs = argArray.filter(a => /^[a-zA-Z0-9_\-./]+$/.test(a));
  if (safeArgs.length === 0) return NextResponse.json({ error: "no valid args" }, { status: 400 });

  try {
    const projectRes = await fetch(`http://localhost:3001/api/projects/${projectId}`);
    const project = await projectRes.json();
    if (!project.root_path) return NextResponse.json({ error: "project not found" }, { status: 404 });

    const cmd = `git ${safeArgs.join(" ")}`;
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: project.root_path, maxBuffer: 1024 * 1024,
    });
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
