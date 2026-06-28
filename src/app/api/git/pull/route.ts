import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  const { projectId } = await req.json();
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  try {
    const projectRes = await fetch(`http://localhost:3001/api/projects/${projectId}`);
    const project = await projectRes.json();
    if (!project.root_path) return NextResponse.json({ error: "project not found" }, { status: 404 });

    const { stdout, stderr } = await execAsync("git pull", {
      cwd: project.root_path, maxBuffer: 1024 * 1024,
    });
    return NextResponse.json({ ok: true, output: stdout + stderr });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    return NextResponse.json({ ok: false, error: err.stderr || err.message, output: err.stdout || "" });
  }
}
