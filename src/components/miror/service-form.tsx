"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Service, Shell } from "@/lib/types";
import { useMiror } from "@/store/miror-store";

const SHELLS: Shell[] = ["bash", "zsh", "powershell", "cmd"];

export function ServiceForm({
  open, onOpenChange, projectId, serviceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  serviceId?: string | null;
}) {
  // Mount the inner form with a key so it always initializes from the latest
  // serviceId prop when the dialog opens — avoids setState-in-effect.
  const formKey = `${serviceId ?? "new"}-${open ? "open" : "closed"}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <ServiceFormInner
          key={formKey}
          projectId={projectId}
          serviceId={serviceId}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function ServiceFormInner({
  projectId, serviceId, onOpenChange,
}: {
  projectId: string;
  serviceId?: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { services, addService, updateService } = useMiror();
  const editing = serviceId ? services.find((s) => s.id === serviceId) : null;

  // Initialize state from props (derived at mount time only — safe pattern)
  const initialEnv = editing
    ? Object.entries(editing.env).map(([k, v]) => ({ key: k, value: v }))
    : [{ key: "", value: "" }];

  const [name, setName] = useState(editing?.name ?? "");
  const [cwd, setCwd] = useState(editing?.cwd ?? ".");
  const [command, setCommand] = useState(editing?.command ?? "");
  const [shell, setShell] = useState<Shell>(editing?.shell ?? "bash");
  const [autoStart, setAutoStart] = useState(editing?.autoStart ?? false);
  const [envPairs, setEnvPairs] = useState<{ key: string; value: string }[]>(
    initialEnv.length > 0 ? initialEnv : [{ key: "", value: "" }]
  );
  const [dependsOn, setDependsOn] = useState<string[]>(editing?.dependsOn ?? []);

  // candidate dependencies — same-project services, excluding self
  const candidateDeps = services.filter(
    (s) => s.projectId === projectId && s.id !== serviceId
  );

  const handleSubmit = async () => {
    if (!name.trim() || !command.trim()) return;
    const env: Record<string, string> = {};
    for (const { key, value } of envPairs) {
      if (key.trim()) env[key.trim()] = value;
    }

    if (editing) {
      await updateService(editing.id, {
        name, cwd, command, shell, autoStart, env, dependsOn,
      });
    } else {
      await addService({
        projectId, name, cwd, command, shell, autoStart, env, dependsOn,
      } as Omit<Service, "id" | "status">);
    }
    onOpenChange(false);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? "Edit Service" : "Add Service"}</DialogTitle>
      </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto miror-scroll space-y-4 py-2 pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="svc-name">Name</Label>
              <Input id="svc-name" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Backend API" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="svc-shell">Shell</Label>
              <Select value={shell} onValueChange={(v) => setShell(v as Shell)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHELLS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="svc-cwd">Working Directory</Label>
            <Input id="svc-cwd" value={cwd} onChange={(e) => setCwd(e.target.value)}
              placeholder="apps/api or ." className="font-mono text-xs" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="svc-cmd">Command</Label>
            <Input id="svc-cmd" value={command} onChange={(e) => setCommand(e.target.value)}
              placeholder="pnpm start:dev" className="font-mono text-xs" />
          </div>

          {/* Environment Variables */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Environment Variables</Label>
              <Button
                variant="ghost" size="sm" className="h-6 gap-1 text-xs"
                onClick={() => setEnvPairs([...envPairs, { key: "", value: "" }])}
              >
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
            <div className="space-y-1.5">
              {envPairs.map((pair, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    value={pair.key}
                    onChange={(e) => {
                      const next = [...envPairs];
                      next[i] = { ...pair, key: e.target.value };
                      setEnvPairs(next);
                    }}
                    placeholder="KEY"
                    className="font-mono text-xs h-8 flex-1"
                  />
                  <span className="text-muted-foreground">=</span>
                  <Input
                    value={pair.value}
                    onChange={(e) => {
                      const next = [...envPairs];
                      next[i] = { ...pair, value: e.target.value };
                      setEnvPairs(next);
                    }}
                    placeholder="value"
                    className="font-mono text-xs h-8 flex-1"
                  />
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 hover:text-status-error"
                    onClick={() => setEnvPairs(envPairs.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Dependencies */}
          {candidateDeps.length > 0 && (
            <div className="space-y-2">
              <Label>Depends On</Label>
              <p className="text-xs text-muted-foreground">
                Selected services will be started before this one.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {candidateDeps.map((dep) => {
                  const selected = dependsOn.includes(dep.id);
                  return (
                    <button
                      key={dep.id}
                      type="button"
                      onClick={() => {
                        setDependsOn(selected
                          ? dependsOn.filter((d) => d !== dep.id)
                          : [...dependsOn, dep.id]);
                      }}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {selected && "✓ "}{dep.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Auto-start */}
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <Label htmlFor="svc-autostart" className="cursor-pointer">Auto-start</Label>
              <p className="text-xs text-muted-foreground">Start this service when its project is launched.</p>
            </div>
            <Switch id="svc-autostart" checked={autoStart} onCheckedChange={setAutoStart} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || !command.trim()}>
            {editing ? "Save Changes" : "Add Service"}
          </Button>
        </DialogFooter>
    </>
  );
}
