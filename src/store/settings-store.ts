"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// All user-configurable settings. Persisted to localStorage so they survive
// page reloads and (in Tauri) app restarts. Each setting has a clear default
// and a single source of truth here.

export type ThemeMode = "dark" | "light";

export interface MirSettings {
  // General
  autoStartWorkspace: boolean;
  autoRestartOnCrash: boolean;
  maxRestartAttempts: number;
  minimizeToTray: boolean;

  // Notifications
  notifyOnCrash: boolean;
  notifyOnPortConflict: boolean;
  notifyOnBuildFailure: boolean;

  // Appearance
  theme: ThemeMode;               // "dark" or "light" — controls the .light class on <html>
  monospaceLogs: boolean;
  compactDensity: boolean;

  // Behavior
  confirmServiceDelete: boolean;
  autoExpandProjects: boolean;

  // Security (display-only)
  sandboxToProjectPaths: boolean;
  explicitServiceConsent: boolean;
  localOnlyExecution: boolean;

  // Actions
  set: <K extends keyof MirSettings>(key: K, value: MirSettings[K]) => void;
  setTheme: (theme: ThemeMode) => void;
  reset: () => void;
}

const DEFAULTS: Omit<MirSettings, "set" | "setTheme" | "reset"> = {
  autoStartWorkspace: true,
  autoRestartOnCrash: true,
  maxRestartAttempts: 3,
  minimizeToTray: true,

  notifyOnCrash: true,
  notifyOnPortConflict: true,
  notifyOnBuildFailure: false,

  theme: "dark",
  monospaceLogs: true,
  compactDensity: false,

  confirmServiceDelete: true,
  autoExpandProjects: true,

  sandboxToProjectPaths: true,
  explicitServiceConsent: true,
  localOnlyExecution: true,
};

export const useSettings = create<MirSettings>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (key, value) => set({ [key]: value } as Partial<MirSettings>),
      setTheme: (theme) => {
        set({ theme });
        // Apply the theme class immediately
        applyTheme(theme);
      },
      reset: () => {
        set({ ...DEFAULTS });
        applyTheme(DEFAULTS.theme);
      },
    }),
    {
      name: "mir-settings",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      // Apply theme on rehydration
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    }
  )
);

// Apply the theme by adding/removing the .light class on <html>
export function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "light") {
    root.classList.add("light");
  } else {
    root.classList.remove("light");
  }
}

export function shouldNotify(kind: "crash" | "port-conflict" | "build-failed"): boolean {
  const s = useSettings.getState();
  if (kind === "crash") return s.notifyOnCrash;
  if (kind === "port-conflict") return s.notifyOnPortConflict;
  if (kind === "build-failed") return s.notifyOnBuildFailure;
  return false;
}
