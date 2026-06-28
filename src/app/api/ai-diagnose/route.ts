import { NextRequest, NextResponse } from "next/server";

// AI Crash Diagnostics — when a service crashes, send the last N log lines
// to the LLM and get back a diagnosis + suggested fix.
//
// This route runs server-side (Next.js API route) and calls the z-ai-web-dev-sdk.
// The Rust backend doesn't need to know about LLMs — separation of concerns.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { serviceName, command, logs, errorMessage } = body as {
      serviceName: string;
      command: string;
      logs: Array<{ type: string; message: string; timestamp: number }>;
      errorMessage: string;
    };

    if (!serviceName || !logs) {
      return NextResponse.json({ error: "serviceName and logs are required" }, { status: 400 });
    }

    // Build the prompt — last 30 log lines + the crash message
    const recentLogs = logs.slice(-30).map(l =>
      `[${l.type.toUpperCase()}] ${l.message}`
    ).join("\n");

    const prompt = `You are a senior DevOps engineer analyzing a service crash. Diagnose the issue and suggest a fix.

Service: ${serviceName}
Command: ${command}
Error: ${errorMessage}

Recent logs (oldest first):
${recentLogs}

Respond in this exact JSON format (no markdown, no code fences):
{
  "diagnosis": "One-paragraph explanation of what likely went wrong",
  "likely_cause": "The most probable root cause in one sentence",
  "suggested_fixes": ["Fix 1", "Fix 2", "Fix 3"],
  "severity": "low" | "medium" | "high" | "critical",
  "category": "port-conflict" | "missing-dependency" | "config-error" | "code-bug" | "resource-limit" | "unknown"
}`;

    // Dynamic import to avoid Turbopack caching issues
    const ZAIModule = await import("z-ai-web-dev-sdk");
    const ZAI = (ZAIModule as any).default ?? ZAIModule;
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: "You are a helpful DevOps assistant. Always respond with valid JSON only, no markdown." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 800,
    });

    const content = completion.choices?.[0]?.message?.content ?? "{}";

    // Parse the JSON response — handle the case where the LLM wraps it in code fences
    let diagnosis;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      diagnosis = JSON.parse(cleaned);
    } catch {
      // If JSON parsing fails, return the raw text as the diagnosis
      diagnosis = {
        diagnosis: content,
        likely_cause: "Unable to parse structured response",
        suggested_fixes: [],
        severity: "unknown",
        category: "unknown",
      };
    }

    return NextResponse.json({ ok: true, diagnosis });
  } catch (error) {
    console.error("AI diagnose error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

