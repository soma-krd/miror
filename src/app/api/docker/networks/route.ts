import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function GET() {
  try {
    const { stdout } = await execAsync(
      `docker network ls --format "{{.ID}}\\t{{.Name}}\\t{{.Driver}}\\t{{.Scope}}"`,
      { maxBuffer: 1024 * 1024 }
    );

    const networks = stdout.trim().split("\n").filter(Boolean).map(line => {
      const [id, name, driver, scope] = line.split("\t");
      return { id: id || "", name: name || "", driver: driver || "", scope: scope || "" };
    });

    return NextResponse.json(networks);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
