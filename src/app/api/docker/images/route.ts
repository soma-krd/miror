import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function GET() {
  try {
    const { stdout } = await execAsync(
      `docker images --format "{{.Repository}}\\t{{.Tag}}\\t{{.ID}}\\t{{.Size}}\\t{{.CreatedAt}}"`,
      { maxBuffer: 1024 * 1024 }
    );

    const images = stdout.trim().split("\n").filter(Boolean).map(line => {
      const [repository, tag, id, size, createdAt] = line.split("\t");
      return {
        repository: repository || "",
        tag: tag || "",
        id: id || "",
        size: size || "",
        createdAt: createdAt || "",
      };
    });

    return NextResponse.json(images);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
