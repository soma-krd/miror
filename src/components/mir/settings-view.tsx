"use client";

import {
  Settings, Keyboard, Bell, Palette, Cpu, Shield, Info, RotateCcw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useSettings } from "@/store/settings-store";

const KEYBOARD_SHORTCUTS = [
  { keys: "Ctrl+R",       desc: "Restart active service" },
  { keys: "Ctrl+Shift+R", desc: "Restart all services in project" },
  { keys: "Ctrl+L",       desc: "Focus logs / log search" },
  { keys: "Ctrl+K",       desc: "Focus global search" },
  { keys: "Ctrl+N",       desc: "New project" },
  { keys: "G D",          desc: "Go to Dashboard" },
  { keys: "G P",          desc: "Go to Projects" },
  { keys: "G L",          desc: "Go to Logs" },
  { keys: "G S",          desc: "Go to Settings" },
];

export function SettingsView() {
  const settings = useSettings();

  return (
    <div className="space-y-4 p-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Settings className="h-5 w-5" /> Settings
          </h1>
          <p className="text-xs text-muted-foreground">
            Configure Mir behavior, integrations, and keyboard shortcuts.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <RotateCcw className="h-3 w-3" /> Reset to defaults
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset all settings?</AlertDialogTitle>
              <AlertDialogDescription>
                This restores every setting to its default value. Your projects
                and services are not affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => settings.reset()}>
                Reset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* General */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Cpu className="h-4 w-4" /> General
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SettingRow
            title="Auto-start workspace on launch"
            description="Restore previously running services when Mir starts."
            checked={settings.autoStartWorkspace}
            onChange={(v) => settings.set("autoStartWorkspace", v)}
          />
          <Separator />
          <SettingRow
            title="Auto-restart on crash"
            description={`Retry up to ${settings.maxRestartAttempts} times if a service exits with non-zero code.`}
            checked={settings.autoRestartOnCrash}
            onChange={(v) => settings.set("autoRestartOnCrash", v)}
          />
          <Separator />
          <SettingRow
            title="Minimize to system tray"
            description="Keep Mir running in the menu bar when the window is closed."
            checked={settings.minimizeToTray}
            onChange={(v) => settings.set("minimizeToTray", v)}
          />
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Bell className="h-4 w-4" /> Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SettingRow
            title="Service crashes"
            description="OS-level notification when a service exits unexpectedly."
            checked={settings.notifyOnCrash}
            onChange={(v) => settings.set("notifyOnCrash", v)}
          />
          <Separator />
          <SettingRow
            title="Port conflicts"
            description="Alert when a service cannot bind to its configured port."
            checked={settings.notifyOnPortConflict}
            onChange={(v) => settings.set("notifyOnPortConflict", v)}
          />
          <Separator />
          <SettingRow
            title="Build failures"
            description="Alert on TypeScript or build errors detected in logs."
            checked={settings.notifyOnBuildFailure}
            onChange={(v) => settings.set("notifyOnBuildFailure", v)}
          />
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Palette className="h-4 w-4" /> Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Theme selector — Apple-style segmented control */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium">Theme</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Choose between dark and light appearance.
              </div>
            </div>
            <div className="flex rounded-lg bg-muted/50 p-0.5">
              <button
                onClick={() => settings.setTheme("dark")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-all mir-press ${
                  settings.theme === "dark"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Dark
              </button>
              <button
                onClick={() => settings.setTheme("light")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-all mir-press ${
                  settings.theme === "light"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Light
              </button>
            </div>
          </div>
          <Separator />
          <SettingRow
            title="Monospace logs"
            description="Use SF Mono for all log output and process metadata."
            checked={settings.monospaceLogs}
            onChange={(v) => settings.set("monospaceLogs", v)}
          />
          <Separator />
          <SettingRow
            title="Compact density"
            description="Tighter spacing in service cards and list rows."
            checked={settings.compactDensity}
            onChange={(v) => settings.set("compactDensity", v)}
          />
        </CardContent>
      </Card>

      {/* Behavior */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Settings className="h-4 w-4" /> Behavior
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SettingRow
            title="Confirm before deleting services"
            description="Show a confirmation dialog when deleting a service."
            checked={settings.confirmServiceDelete}
            onChange={(v) => settings.set("confirmServiceDelete", v)}
          />
          <Separator />
          <SettingRow
            title="Auto-expand projects with running services"
            description="In the sidebar, automatically expand projects that have running services."
            checked={settings.autoExpandProjects}
            onChange={(v) => settings.set("autoExpandProjects", v)}
          />
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4" /> Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SettingRow
            title="Sandbox to project paths"
            description="Process execution is restricted to user-defined project directories."
            checked={settings.sandboxToProjectPaths}
            onChange={(v) => settings.set("sandboxToProjectPaths", v)}
          />
          <Separator />
          <SettingRow
            title="Explicit service consent"
            description="Require manual confirmation before auto-added services run."
            checked={settings.explicitServiceConsent}
            onChange={(v) => settings.set("explicitServiceConsent", v)}
          />
          <Separator />
          <SettingRow
            title="Local-only execution"
            description="No remote telemetry or command execution. All operations stay on-device."
            checked={settings.localOnlyExecution}
            onChange={(v) => settings.set("localOnlyExecution", v)}
          />
        </CardContent>
      </Card>

      {/* Keyboard shortcuts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Keyboard className="h-4 w-4" /> Keyboard Shortcuts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {KEYBOARD_SHORTCUTS.map((s) => (
              <div key={s.keys} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <span className="text-xs text-muted-foreground">{s.desc}</span>
                <kbd className="font-mono text-[10px] rounded border border-border bg-muted px-1.5 py-0.5">
                  {s.keys}
                </kbd>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4" /> About
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Version</span>
            <Badge variant="outline" className="font-mono">1.0.0</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>Backend</span>
            <Badge variant="outline" className="font-mono text-status-running border-status-running/30">
              rust · tokio · axum
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>Tauri target</span>
            <Badge variant="outline" className="font-mono">v2 · Rust · Tokio</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>UI layer</span>
            <Badge variant="outline" className="font-mono">Next.js 16 · Tailwind 4 · shadcn/ui</Badge>
          </div>
          <p className="pt-2 text-[11px] italic">
            Mir runs a real Rust backend (tokio::process::Command + axum + SQLite)
            that spawns actual child processes. In the Tauri build, the backend
            ships as a sidecar binary alongside the Next.js webview.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingRow({
  title, description, checked, onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
