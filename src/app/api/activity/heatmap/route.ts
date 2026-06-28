import { NextResponse } from "next/server";

// Keyboard Heatmap — shows which keys are used most
// IMPORTANT: Only counts key presses, NEVER records actual typed text
export async function GET() {
  try {
    const seed = Math.floor(Date.now() / (1000 * 60 * 30));

    // Simulated key frequency data (in a real Tauri app, comes from OS input hooks)
    // These are realistic frequencies for a developer
    const keyData: Array<{ key: string; count: number; label: string }> = [
      { key: "Space", count: 2114882, label: "␣" },
      { key: "E", count: 1203551, label: "E" },
      { key: "Backspace", count: 842110, label: "⌫" },
      { key: "A", count: 980432, label: "A" },
      { key: "T", count: 890234, label: "T" },
      { key: "O", count: 820100, label: "O" },
      { key: "I", count: 780551, label: "I" },
      { key: "N", count: 750220, label: "N" },
      { key: "S", count: 720891, label: "S" },
      { key: "R", count: 680004, label: "R" },
      { key: "Ctrl", count: 620004, label: "⌃" },
      { key: "Shift", count: 580000, label: "⇧" },
      { key: "Enter", count: 540000, label: "⏎" },
      { key: "H", count: 510000, label: "H" },
      { key: "L", count: 490000, label: "L" },
      { key: "D", count: 470000, label: "D" },
      { key: "C", count: 450000, label: "C" },
      { key: "U", count: 420000, label: "U" },
      { key: "P", count: 390000, label: "P" },
      { key: "M", count: 370000, label: "M" },
      { key: "Tab", count: 340000, label: "⇥" },
      { key: "V", count: 320000, label: "V" },
      { key: "W", count: 300000, label: "W" },
      { key: "F", count: 280000, label: "F" },
      { key: "G", count: 260000, label: "G" },
      { key: "Y", count: 240000, label: "Y" },
      { key: "B", count: 220000, label: "B" },
      { key: "Cmd", count: 200000, label: "⌘" },
      { key: "Esc", count: 180000, label: "Esc" },
      { key: "Arrow", count: 160000, label: "←→↑↓" },
    ];

    // Sort by count descending
    keyData.sort((a, b) => b.count - a.count);

    // Calculate fun combos
    const combos = [
      { combo: "Ctrl+C", label: "Copy", count: 420000, fun: "You copied enough to fill 7 novels" },
      { combo: "Ctrl+V", label: "Paste", count: 380000, fun: "You pasted enough to wallpaper a house" },
      { combo: "Ctrl+Z", label: "Undo", count: 290000, fun: "You undid more than a politician" },
      { combo: "Ctrl+S", label: "Save", count: 510000, fun: "You saved more than a firefighter" },
      { combo: "Ctrl+S+S+S", label: "Save Save Save", count: 180000, fun: "Paranoid saver detected" },
    ];

    return NextResponse.json({ keys: keyData, combos });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
