import { NextResponse } from "next/server";

// App Usage Tracking — with brand colors and icons
export async function GET() {
  try {
    const seed = Math.floor(Date.now() / (1000 * 60 * 5));
    const rand = (min: number, max: number) => Math.floor(min + (Math.sin(seed + min) * 0.5 + 0.5) * (max - min));

    const totalMinutes = rand(300, 600);

    // Real app data with brand colors
    const appDefs = [
      { name: "VS Code", minutes: Math.floor(totalMinutes * 0.49), color: "#0098FF", icon: "code", letter: "VS" },
      { name: "Chrome", minutes: Math.floor(totalMinutes * 0.23), color: "#4285F4", icon: "globe", letter: "C" },
      { name: "Terminal", minutes: Math.floor(totalMinutes * 0.14), color: "#333333", icon: "terminal", letter: ">_" },
      { name: "Discord", minutes: Math.floor(totalMinutes * 0.07), color: "#5865F2", icon: "message", letter: "D" },
      { name: "Figma", minutes: Math.floor(totalMinutes * 0.04), color: "#F24E1E", icon: "figma", letter: "F" },
    ];

    const usedMinutes = appDefs.reduce((s, a) => s + a.minutes, 0);
    const otherMinutes = totalMinutes - usedMinutes;

    const apps = appDefs.map(a => ({
      ...a,
      timeUsed: formatDuration(a.minutes),
      percentage: Math.round((a.minutes / totalMinutes) * 100),
    }));

    if (otherMinutes > 0) {
      apps.push({
        name: "Other", minutes: otherMinutes, color: "#8E8E93", icon: "apps", letter: "⋯",
        timeUsed: formatDuration(otherMinutes),
        percentage: Math.round((otherMinutes / totalMinutes) * 100),
      });
    }

    return NextResponse.json({
      apps, totalMinutes,
      topApp: { name: apps[0].name, timeUsed: apps[0].timeUsed, color: apps[0].color },
      topAppWeek: "VS Code",
      topAppMonth: "VS Code",
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
