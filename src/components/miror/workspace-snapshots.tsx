"use client";

import { useEffect, useState } from "react";
import {
  Camera, Save, Upload, Trash2, Clock, RotateCcw, X, Plus,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useMiror } from "@/store/miror-store";
import { backend } from "@/lib/backend-client";
import { cn } from "@/lib/utils";

// Workspace Snapshots — save the current "workspace state" (which services are
// running, env vars, active project, current view) as a named snapshot.
// Restore later with one click.
//
// Use cases:
//   - "Debug auth flow" → starts Redis + Backend with specific env
//   - "Demo mode" → starts everything with production-like config
//   - "Quick test" → starts only Frontend with mock API
//
// Stored in localStorage (frontend-only). The backend already persists services
// and env vars; snapshots just remember WHICH services to start + the active view.

export interface WorkspaceSnapshot {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  // Which services should be running when restored
  runningServiceIds: string[];
  // The active project + view to navigate to
  activeProjectId: string | null;
  view: "dashboard" | "projects" | "logs" | "settings";
  // Summary for display
  summary: {
    projectCount: number;
    serviceCount: number;
    runningCount: number;
  };
}

const STORAGE_KEY = "miror-snapshots";

function loadSnapshots(): WorkspaceSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSnapshots(snaps: WorkspaceSnapshot[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps));
}

interface WorkspaceSnapshotsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorkspaceSnapshots({ open, onOpenChange }: WorkspaceSnapshotsProps) {
  const { services, projects, activeProjectId, view, startService, stopService,
    setActiveProject, setView } = useMiror();
  const [snapshots, setSnapshots] = useState<WorkspaceSnapshot[]>([]);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    if (open) setSnapshots(loadSnapshots());
  }, [open]);

  const handleSave = () => {
    if (!newName.trim()) return;
    const runningServiceIds = services.filter(s => s.status === "running").map(s => s.id);
    const snapshot: WorkspaceSnapshot = {
      id: `snap_${Date.now().toString(36)}`,
      name: newName.trim(),
      description: newDesc.trim(),
      createdAt: Date.now(),
      runningServiceIds,
      activeProjectId,
      view,
      summary: {
        projectCount: projects.length,
        serviceCount: services.length,
        runningCount: runningServiceIds.length,
      },
    };
    const next = [snapshot, ...snapshots];
    saveSnapshots(next);
    setSnapshots(next);
    setNewName("");
    setNewDesc("");
  };

  const handleRestore = async (snapshot: WorkspaceSnapshot) => {
    setRestoring(snapshot.id);
    try {
      // Stop services that are running but not in the snapshot
      const toStop = services.filter(s =>
        s.status === "running" && !snapshot.runningServiceIds.includes(s.id)
      );
      for (const svc of toStop) {
        await backend.stopService(svc.id).catch(() => {});
      }

      // Start services that should be running but aren't
      const toStart = services.filter(s =>
        snapshot.runningServiceIds.includes(s.id) && s.status !== "running"
      );
      for (const svc of toStart) {
        await backend.startService(svc.id).catch(() => {});
      }

      // Navigate to the saved view
      if (snapshot.activeProjectId) {
        setActiveProject(snapshot.activeProjectId);
      }
      setView(snapshot.view);
      onOpenChange(false);
    } catch (e) {
      alert(`Restore failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRestoring(null);
    }
  };

  const handleDelete = (id: string) => {
    const next = snapshots.filter(s => s.id !== id);
    saveSnapshots(next);
    setSnapshots(next);
    setDeleteTarget(null);
  };

  const handleExport = (snapshot: WorkspaceSnapshot) => {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `miror-snapshot-${snapshot.name.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Workspace Snapshots
          </DialogTitle>
        </DialogHeader>

        {/* Save current state */}
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
          <Label className="text-xs font-medium">Save current workspace state</Label>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Snapshot name (e.g. Debug auth flow)"
              className="h-8 text-xs"
              onKeyDown={e => e.key === "Enter" && handleSave()}
            />
            <Button size="sm" className="h-8 gap-1" onClick={handleSave} disabled={!newName.trim()}>
              <Save className="h-3 w-3" /> Save
            </Button>
          </div>
          <Input
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="Optional description"
            className="h-8 text-xs"
          />
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>Will save:</span>
            <Badge variant="outline" className="text-[10px] h-4">
              {services.filter(s => s.status === "running").length} running
            </Badge>
            <Badge variant="outline" className="text-[10px] h-4">
              {projects.length} projects
            </Badge>
            <Badge variant="outline" className="text-[10px] h-4 capitalize">
              view: {view}
            </Badge>
          </div>
        </div>

        {/* Saved snapshots list */}
        <div className="flex-1 overflow-y-auto miror-scroll">
          {snapshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-xs text-muted-foreground">
              <Camera className="h-8 w-8 mb-2 opacity-40" />
              No snapshots yet.
              <br />
              Name your current state above and click Save.
            </div>
          ) : (
            <div className="space-y-1.5">
              {snapshots.map(snap => (
                <div
                  key={snap.id}
                  className="group rounded-md border border-border p-2.5 hover:border-primary/40"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{snap.name}</span>
                        <Badge variant="outline" className="text-[9px] h-4 font-mono">
                          {snap.summary.runningCount}/{snap.summary.serviceCount} svc
                        </Badge>
                      </div>
                      {snap.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {snap.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        {new Date(snap.createdAt).toLocaleString("en-US", {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                        })}
                        <span>·</span>
                        <span className="capitalize">view: {snap.view}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => handleRestore(snap)}
                        disabled={restoring === snap.id}
                      >
                        {restoring === snap.id ? (
                          <RotateCcw className="h-3 w-3 animate-spin" />
                        ) : (
                          <Upload className="h-3 w-3" />
                        )}
                        Restore
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100"
                        onClick={() => handleExport(snap)}
                        title="Export"
                      >
                        <Plus className="h-3 w-3 rotate-45" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 hover:text-status-error"
                        onClick={() => setDeleteTarget(snap.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="text-[10px] text-muted-foreground">
          Snapshots are stored locally in your browser. Use Export to share with teammates.
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete snapshot?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the snapshot from your local storage. Running services are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-status-error text-white hover:bg-status-error/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
