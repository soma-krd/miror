"use client";

import { MirApp } from "@/components/mir/mir-app";
import { TrayPopup } from "@/components/mir/tray-popup";

// Detect on first client render whether we're in the tray popup window.
// Tauri loads "/?tray=1" for the popup, "/" for the main window.
// We read window.location.search synchronously at module init — no effect needed.
const isTrayPopup =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("tray") === "1";

export default function Home() {
  if (isTrayPopup) {
    return <TrayPopup />;
  }
  return <MirApp />;
}
