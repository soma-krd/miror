import { NextResponse } from "next/server";

// Achievements system
export async function GET() {
  try {
    const seed = Math.floor(Date.now() / (1000 * 60 * 30));
    const unlocked = (threshold: number, current: number) => current >= threshold;

    // In a real app, these come from the SQLite history
    const lifetimeKeys = 12400000 + Math.floor(Math.sin(seed) * 500000);
    const lifetimeClicks = 3100000 + Math.floor(Math.sin(seed + 1) * 100000);
    const codeHours = 640;
    const nightOwl = true; // simulated
    const storageDeleted = 100; // GB
    const nodeModulesDeleted = 287;
    const focusStreak = 5;

    const achievements = [
      { id: "keyboard_warrior", icon: "⌨️", name: "Keyboard Warrior", desc: "100,000 key presses", unlocked: unlocked(100000, lifetimeKeys), progress: Math.min(lifetimeKeys / 100000, 1) },
      { id: "click_master", icon: "🖱️", name: "Click Master", desc: "50,000 clicks", unlocked: unlocked(50000, lifetimeClicks), progress: Math.min(lifetimeClicks / 50000, 1) },
      { id: "code_monk", icon: "💻", name: "Code Monk", desc: "10 hours in VS Code", unlocked: codeHours >= 10, progress: Math.min(codeHours / 10, 1) },
      { id: "night_owl", icon: "🌙", name: "Night Owl", desc: "Use PC after 1 AM", unlocked: nightOwl, progress: nightOwl ? 1 : 0 },
      { id: "build_machine", icon: "🚀", name: "Build Machine", desc: "Delete 100 GB of build files", unlocked: storageDeleted >= 100, progress: Math.min(storageDeleted / 100, 1) },
      { id: "dep_destroyer", icon: "📦", name: "Dependency Destroyer", desc: "Remove 1,000 node_modules folders", unlocked: false, progress: nodeModulesDeleted / 1000 },
      { id: "focus_streak", icon: "🔥", name: "Focus Streak", desc: "5 days with 4h+ coding", unlocked: focusStreak >= 5, progress: Math.min(focusStreak / 5, 1) },
      { id: "million_club", icon: "🏆", name: "Million Club", desc: "1,000,000 key presses", unlocked: unlocked(1000000, lifetimeKeys), progress: Math.min(lifetimeKeys / 1000000, 1) },
    ];

    const unlockedCount = achievements.filter(a => a.unlocked).length;

    return NextResponse.json({ achievements, unlockedCount, totalCount: achievements.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
