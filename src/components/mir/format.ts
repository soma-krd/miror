// Tiny formatting helpers used across the Mir UI.

export function formatUptime(startedAt?: number): string {
  if (!startedAt) return "—";
  const ms = Date.now() - startedAt;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function formatMemory(mb?: number): string {
  if (mb == null || mb <= 0) return "—";
  if (mb < 1024) return `${mb.toFixed(0)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function formatCpu(cpu?: number): string {
  if (cpu == null) return "—";
  return `${cpu.toFixed(1)}%`;
}

export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }) +
    "." + String(d.getMilliseconds()).padStart(3, "0").slice(0, 3);
}

export function truncatePath(p: string, max = 40): string {
  if (p.length <= max) return p;
  // keep the last 2 segments + leading root
  const parts = p.split("/");
  if (parts.length <= 3) return p;
  return parts.slice(0, 2).join("/") + "/…/" + parts.slice(-2).join("/");
}

// Format cumulative uptime (Feature 5) — total time the service has been running
// across all sessions. Input is milliseconds.
export function formatCumulativeUptime(totalMs?: number): string {
  if (!totalMs || totalMs <= 0) return "—";
  const s = Math.floor(totalMs / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

// Format a duration (Feature 5) — how long a service took to start.
export function formatDuration(ms?: number): string {
  if (ms == null || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}
