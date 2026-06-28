import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  // Fetch the project root path from the Rust backend
  const backendPort = 3001;
  try {
    const projectRes = await fetch(`http://localhost:${backendPort}/api/projects/${projectId}`);
    const project = await projectRes.json();
    if (!project.root_path) return NextResponse.json({ error: "project not found" }, { status: 404 });

    const { stdout } = await execAsync(
      `git branch -a --format="%(HEAD)%00%(refname:short)%00%(objectname:short)%00%(committerdate:relative)"`,
      { cwd: project.root_path, maxBuffer: 1024 * 1024 }
    );

    const branches = stdout.trim().split("\n").filter(Boolean).map(line => {
      const [head, name, lastCommit, lastCommitDate] = line.split("\0");
      return {
        name: name || "",
        is_current: head === "*",
        is_remote: (name || "").startsWith("remotes/"),
        last_commit: lastCommit || "",
        last_commit_date: lastCommitDate || "",
      };
    });

    return NextResponse.json(branches);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
