"use client";

import { useEffect } from "react";
import { useMir } from "@/store/mir-store";

// Global keyboard shortcuts handler.
// - Ctrl/Cmd+R        → restart active service
// - Ctrl/Cmd+Shift+R  → restart all in active project
// - Ctrl/Cmd+L        → focus logs (handled in Topbar)
// - Ctrl/Cmd+K        → focus global search (handled in Topbar)
// - Ctrl/Cmd+N        → new project (jumps to projects view, opens form)
// - G then D/P/L/S    → go to Dashboard / Projects / Logs / Settings
export function KeyboardShortcuts() {
  const {
    view, setView, activeServiceId, restartService, restartAllInProject,
    activeProjectId, projects,
  } = useMir();

  useEffect(() => {
    let gPressed = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // "G" prefix for navigation — only when not typing
      if (!isTyping && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "g") {
        gPressed = true;
        if (gTimer) clearTimeout(gTimer);
        gTimer = setTimeout(() => { gPressed = false; }, 800);
        return;
      }

      if (gPressed && !isTyping) {
        gPressed = false;
        if (gTimer) clearTimeout(gTimer);
        switch (e.key.toLowerCase()) {
          case "d": e.preventDefault(); setView("dashboard"); return;
          case "p": e.preventDefault(); setView("projects"); return;
          case "l": e.preventDefault(); setView("logs"); return;
          case "b": e.preventDefault(); setView("database"); return;
          case "g": e.preventDefault(); setView("git"); return;
          case "o": e.preventDefault(); setView("docker"); return;
          case "t": e.preventDefault(); setView("storage"); return;
          case "a": e.preventDefault(); setView("activity"); return;
          case "s": e.preventDefault(); setView("settings"); return;
        }
      }

      // Ctrl+R — restart active service (only when not in inputs to avoid breaking reload in devtools)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        if (activeProjectId) {
          restartAllInProject(activeProjectId);
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "r") {
        // Only intercept if a service is active AND we're not in code editor
        if (activeServiceId && !isTyping) {
          e.preventDefault();
          restartService(activeServiceId);
        }
        // else: let browser do its thing
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        if (!isTyping) {
          e.preventDefault();
          setView("projects");
          // The ProjectsView has a "New Project" button — we just navigate there
        }
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, activeServiceId, activeProjectId, restartService, restartAllInProject, setView, projects]);

  return null;
}
