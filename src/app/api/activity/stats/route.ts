import { NextResponse } from "next/server";

// Activity Stats — now includes hourly chart data + weekly trend
export async function GET() {
  try {
    const now = new Date();
    const currentHour = now.getHours();
    const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
    const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

    const seed = Math.floor(Date.now() / (1000 * 60 * 5));
    const rand = (min: number, max: number, offset = 0) =>
      Math.floor(min + (Math.sin(seed + offset) * 0.5 + 0.5) * (max - min));

    // Today's stats
    const dayKeys = rand(8000, 25000, 1);
    const dayClicks = Math.floor(dayKeys * 0.38);
    const dayScreenMinutes = Math.min(Math.floor(process.uptime() / 60), 14 * 60);
    const dayAppSwitches = rand(80, 200, 5);

    // Lifetime
    const lifetimeKeys = dayKeys + 12400000;
    const lifetimeClicks = dayClicks + 3100000;
    const lifetimeScreenHours = Math.floor(dayScreenMinutes / 60) + 1280;
    const lifetimeCodeHours = Math.floor(dayScreenMinutes / 120) + 640;

    // Hourly chart data (keys per hour, 6 AM → now)
    const hourlyData: Array<{ hour: string; hourNum: number; keys: number; clicks: number; label: string }> = [];
    for (let h = 6; h <= currentHour; h++) {
      const k = rand(200, 3500, h * 7);
      hourlyData.push({
        hour: `${String(h).padStart(2, "0")}:00`,
        hourNum: h,
        keys: k,
        clicks: Math.floor(k * 0.38),
        label: h < 12 ? `${h}AM` : h === 12 ? "12PM" : `${h - 12}PM`,
      });
    }

    // Weekly trend (last 7 days)
    const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const todayIdx = (now.getDay() + 6) % 7;
    const weeklyData: Array<{ day: string; date: string; keys: number; clicks: number; screenMinutes: number; isToday: boolean }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      const isToday = i === 6;
      const k = isToday ? dayKeys : rand(5000, 30000, i * 13 + 100);
      weeklyData.push({
        day: weekDays[i],
        date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        keys: k,
        clicks: Math.floor(k * 0.38),
        screenMinutes: isToday ? dayScreenMinutes : rand(180, 600, i * 17 + 200),
        isToday,
      });
    }

    // Dev mood
    const keysPerHour = dayKeys / Math.max(dayScreenMinutes / 60, 1);
    let mood = { emoji: "😎", label: "Chill Mode", desc: "Steady focus, calm pace", color: "#34C759" };
    if (keysPerHour > 8000) {
      mood = { emoji: "🔥", label: "Bug-Fixing Frenzy", desc: "Rapid typing, high intensity", color: "#FF3B30" };
    } else if (keysPerHour > 5000) {
      mood = { emoji: "⚡", label: "In the Zone", desc: "Fast and focused", color: "#FF9500" };
    } else if (keysPerHour < 2000) {
      mood = { emoji: "☕", label: "Coffee Break", desc: "Low activity, browsing mode", color: "#8E8E93" };
    }

    // Focus session
    const focusSession = {
      app: "VS Code",
      duration: "2h 14m",
      keys: 12442,
      switches: 3,
      message: "You were locked in.",
      startTime: `${currentHour - 2 > 0 ? currentHour - 2 : 24 + currentHour - 2}:30`,
      endTime: `${currentHour}:44`,
    };

    return NextResponse.json({
      today: {
        keys: dayKeys, clicks: dayClicks,
        screenTime: formatDuration(dayScreenMinutes),
        screenMinutes: dayScreenMinutes,
        appSwitches: dayAppSwitches,
      },
      lifetime: {
        keys: lifetimeKeys, clicks: lifetimeClicks,
        screenHours: lifetimeScreenHours, codeHours: lifetimeCodeHours,
      },
      records: {
        maxKeysDay: 42118, maxClicksDay: 18002,
        longestSession: "7h 21m", longestStreak: 23,
      },
      fun: {
        novelsTyped: Math.floor(lifetimeKeys / 70000),
        screenDays: Math.floor(lifetimeScreenHours / 24),
        codeDays: Math.floor(lifetimeCodeHours / 24),
        mouseKm: (lifetimeClicks * 0.000004).toFixed(1),
      },
      mood,
      focusSession,
      hourlyData,
      weeklyData,
      context: { dayName, dateStr, timeStr, currentHour },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}
