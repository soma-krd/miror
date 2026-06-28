import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function GET() {
  try {
    const { stdout } = await execAsync(
      `docker volume ls --format "{{.Driver}}\\t{{.Name}}"`,
      { maxBuffer: 1024 * 1024 }
    );

    const volumes = stdout.trim().split("\n").filter(Boolean).map(line => {
      const [driver, name] = line.split("\t");
      return { driver: driver || "", name: name || "" };
    });

    return NextResponse.json(volumes);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
