import { NextResponse } from "next/server";

// Timeline / replay — a visual "day replay" showing app switches over time
export async function GET() {
  try {
    const seed = Math.floor(Date.now() / (1000 * 60 * 5));
    const rand = (min: number, max: number) => Math.floor(min + (Math.sin(seed + min) * 0.5 + 0.5) * (max - min));

    // Generate a realistic day timeline (8 AM to now)
    const events: Array<{ time: string; app: string; icon: string; duration: string }> = [];
    const apps = [
      { name: "VS Code", icon: "💻", weight: 0.45 },
      { name: "Chrome", icon: "🌐", weight: 0.20 },
      { name: "Terminal", icon: "⬛", weight: 0.15 },
      { name: "Discord", icon: "💬", weight: 0.08 },
      { name: "File Manager", icon: "📁", weight: 0.05 },
    ];

    let hour = 8;
    let minute = 0;
    const now = new Date();
    const endHour = now.getHours();

    while (hour < endHour || (hour === endHour && minute < now.getMinutes())) {
      // Pick a weighted random app
      const r = Math.random();
      let cumulative = 0;
      let selected = apps[0];
      for (const app of apps) {
        cumulative += app.weight;
        if (r < cumulative) { selected = app; break; }
      }

      // Duration between 15-90 minutes
      const durMinutes = rand(15, 90);
      const durH = Math.floor(durMinutes / 60);
      const durM = durMinutes % 60;
      const duration = durH > 0 ? `${durH}h ${durM}m` : `${durM}m`;

      events.push({
        time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        app: selected.name,
        icon: selected.icon,
        duration,
      });

      // Advance time
      minute += durMinutes;
      while (minute >= 60) { hour++; minute -= 60; }
    }

    return NextResponse.json({ events, date: now.toISOString().split("T")[0] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
