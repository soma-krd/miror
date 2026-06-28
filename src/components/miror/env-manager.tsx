"use client";

import { useState } from "react";
import {
  Plus, Trash2, Save, KeyRound, FileText, RefreshCw, Check, AlertCircle,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Service } from "@/lib/types";
import { useMiror } from "@/store/miror-store";
import { backend } from "@/lib/backend-client";
import { cn } from "@/lib/utils";

interface EnvManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: Service | null;
}

export function EnvManager({ open, onOpenChange, service }: EnvManagerProps) {
  // Mount the inner form with a key derived from service.id + open state.
  // This avoids setState-in-effect: the inner component initializes its state
  // from props at mount time, and remounts cleanly when the service changes.
  const formKey = `${service?.id ?? "none"}-${open ? "open" : "closed"}`;
  return (
    <EnvManagerInner
      key={formKey}
      open={open}
      onOpenChange={onOpenChange}
      service={service}
    />
  );
}

interface EnvRow {
  key: string;
  value: string;
  dirty?: boolean;
}

function EnvManagerInner({ open, onOpenChange, service }: EnvManagerProps) {
  const { updateService } = useMiror();

  // Initialize state from props at mount time only (safe pattern, no effect needed)
  const initialRows: EnvRow[] = service
    ? Object.entries(service.env).map(([k, v]) => ({ key: k, value: v }))
    : [];
  if (initialRows.length === 0) initialRows.push({ key: "", value: "" });

  const [rows, setRows] = useState<EnvRow[]>(initialRows);
  const [syncToEnvFile, setSyncToEnvFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);

  if (!service) return null;

  const updateRow = (idx: number, patch: Partial<EnvRow>) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch, dirty: true } : r));
    setSavedAt(null);
  };

  const addRow = () => {
    setRows(prev => [...prev, { key: "", value: "", dirty: true }]);
    setSavedAt(null);
  };

  const removeRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
    setSavedAt(null);
    setDeleteIdx(null);
  };

  const handleSave = async () => {
    if (!service) return;
    setSaving(true);
    setError(null);
    try {
      // Build the env map — skip rows with empty keys
      const env: Record<string, string> = {};
      let hasDuplicate = false;
      const seenKeys = new Set<string>();
      for (const row of rows) {
        const key = row.key.trim();
        if (!key) continue;
        if (seenKeys.has(key)) {
          hasDuplicate = true;
          setError(`Duplicate key: "${key}". Each key must be unique.`);
          setSaving(false);
          return;
        }
        seenKeys.add(key);
        env[key] = row.value;
      }

      // Update the service via backend
      await updateService(service.id, { env });

      // Optionally write to .env file on disk
      if (syncToEnvFile) {
        // Compute the .env path: project root + service cwd + ".env"
        // We need the project root — fetch it
        try {
          const project = await backend.getProject(service.projectId);
          if (project) {
            const cwd = service.cwd === "." || service.cwd === ""
              ? project.root_path
              : service.cwd.startsWith("/")
                ? service.cwd
                : `${project.root_path.replace(/\/$/, "")}/${service.cwd}`;
            const envPath = `${cwd}/.env`;
            await backend.writeEnvFile(envPath, env);
          }
        } catch (e) {
          setError(`Service env saved, but .env file write failed: ${e instanceof Error ? e.message : String(e)}`);
          setSaving(false);
          return;
        }
      }

      setSaving(false);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const hasChanges = rows.some(r => r.dirty) || rows.length !== Object.keys(service.env).length;
  const validRows = rows.filter(r => r.key.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Environment Variables — {service.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto miror-scroll pr-1">
          {/* Rows */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                {validRows.length} variable{validRows.length !== 1 ? "s" : ""}
              </Label>
              <Button
                variant="ghost" size="sm" className="h-6 gap-1 text-xs"
                onClick={addRow}
              >
                <Plus className="h-3 w-3" /> Add variable
              </Button>
            </div>

            {rows.map((row, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <Input
                  value={row.key}
                  onChange={e => updateRow(idx, { key: e.target.value })}
                  placeholder="KEY"
                  className={cn(
                    "font-mono text-xs h-8 flex-1",
                    row.dirty && "border-status-starting/50",
                  )}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
                <span className="text-muted-foreground text-xs">=</span>
                <Input
                  value={row.value}
                  onChange={e => updateRow(idx, { value: e.target.value })}
                  placeholder="value"
                  className={cn(
                    "font-mono text-xs h-8 flex-1",
                    row.dirty && "border-status-starting/50",
                  )}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
                <Button
                  variant="ghost" size="icon" className="h-8 w-8 hover:text-status-error"
                  onClick={() => setDeleteIdx(idx)}
                  aria-label="Remove"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}

            {rows.length === 0 && (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                No environment variables. Click "Add variable" to create one.
              </div>
            )}
          </div>

          {/* .env file sync */}
          <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/30 p-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-3.5 w-3.5" />
                Write to <code className="font-mono text-xs">.env</code> file
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Also write these variables to <code className="font-mono text-[10px]">{service.cwd}/.env</code> on disk,
                overwriting the existing file. The service's in-memory env is always updated.
              </p>
            </div>
            <Switch checked={syncToEnvFile} onCheckedChange={setSyncToEnvFile} />
          </div>

          {/* Status messages */}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-status-error/30 bg-status-error/5 p-2.5 text-xs text-status-error">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
            </div>
          )}
          {savedAt && !error && (
            <div className="flex items-center gap-2 rounded-md border border-status-running/30 bg-status-running/5 p-2.5 text-xs text-status-running">
              <Check className="h-3.5 w-3.5" />
              <span>Saved{syncToEnvFile ? " and written to .env file" : ""}. Restart the service for changes to take effect.</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <div className="mr-auto flex items-center gap-2 text-[10px] text-muted-foreground">
            {hasChanges && (
              <Badge variant="outline" className="text-status-starting border-status-starting/30 text-[10px] h-4">
                unsaved changes
              </Badge>
            )}
            {service.port && (
              <Badge variant="outline" className="font-mono text-[10px] h-4">PORT detected: {service.port}</Badge>
            )}
          </div>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="gap-1.5"
          >
            {saving ? (
              <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving…</>
            ) : savedAt ? (
              <><Check className="h-3.5 w-3.5" /> Saved</>
            ) : (
              <><Save className="h-3.5 w-3.5" /> Save changes</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Delete confirm */}
      <AlertDialog open={deleteIdx !== null} onOpenChange={(o) => !o && setDeleteIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove variable?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteIdx !== null && rows[deleteIdx]?.key
                ? `This removes "${rows[deleteIdx].key}" from the service's environment.`
                : "This removes the empty row."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteIdx !== null && removeRow(deleteIdx)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
