import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const count = req.nextUrl.searchParams.get("count") || "50";
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  try {
    const projectRes = await fetch(`http://localhost:3001/api/projects/${projectId}`);
    const project = await projectRes.json();
    if (!project.root_path) return NextResponse.json({ error: "project not found" }, { status: 404 });

    const format = "%H\x1f%h\x1f%s\x1f%an\x1f%cr\x1f%P";
    const { stdout } = await execAsync(
      `git log --pretty=format:"${format}" -${count}`,
      { cwd: project.root_path, maxBuffer: 1024 * 1024 }
    );

    const entries = stdout.trim().split("\n").filter(Boolean).map(line => {
      const parts = line.split("\x1f");
      const parents = (parts[5] || "").split(/\s+/).filter(Boolean);
      return {
        hash: parts[0] || "",
        short_hash: parts[1] || "",
        message: parts[2] || "",
        author: parts[3] || "",
        date: parts[4] || "",
        parents,
        is_merge: parents.length > 1,
      };
    });

    return NextResponse.json(entries);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
