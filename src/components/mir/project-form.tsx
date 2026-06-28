"use client";

import { useState } from "react";
import { Folder, Sparkles, Check } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useMir } from "@/store/mir-store";

// Apple-inspired color palette — macOS system colors
const PROJECT_COLORS = [
  "#FF3B30", // systemRed
  "#FF9500", // systemOrange
  "#FFCC00", // systemYellow
  "#34C759", // systemGreen
  "#5AC8FA", // systemTeal
  "#007AFF", // systemBlue
  "#5856D6", // systemIndigo
  "#AF52DE", // systemPurple
  "#FF2D55", // systemPink
  "#A2845E", // systemBrown
  "#8E8E93", // systemGray
  "#30B0C7", // systemCyan
];

// Apple SF Symbol-style icon names (rendered as emoji for cross-platform)
// These match the visual style of Apple's folder/file SF Symbols
const PROJECT_ICONS = [
  "🗂️",  // folder
  "📦",  // box
  "🚀",  // rocket
  "⚡",  // bolt
  "🔧",  // wrench
  "🎨",  // palette
  "📱",  // phone
  "🌐",  // globe
  "🔥",  // flame
  "💎",  // diamond
  "🧩",  // puzzle
  "🛡️",  // shield
];

// Simulated framework auto-detection — scans the path string for common markers
function detectFramework(rootPath: string): string[] {
  const detected: string[] = [];
  if (/next|\.next/i.test(rootPath)) detected.push("Next.js");
  if (/nest|nestjs/i.test(rootPath)) detected.push("NestJS");
  if (/vite/i.test(rootPath)) detected.push("Vite");
  if (/flutter|dart/i.test(rootPath)) detected.push("Flutter");
  if (/rails/i.test(rootPath)) detected.push("Ruby on Rails");
  if (/django/i.test(rootPath)) detected.push("Django");
  if (/express/i.test(rootPath)) detected.push("Express");
  if (detected.length === 0 && rootPath) detected.push("Node.js project");
  return detected;
}

export function ProjectForm({
  open, onOpenChange, projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
}) {
  // Mount the inner form with a key so it always initializes from the latest
  // projectId prop when the dialog opens — avoids setState-in-effect.
  const formKey = `${projectId ?? "new"}-${open ? "open" : "closed"}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <ProjectFormInner key={formKey} projectId={projectId} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}

function ProjectFormInner({
  projectId, onOpenChange,
}: {
  projectId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { projects, addProject, updateProject } = useMir();
  const editing = projectId ? projects.find((p) => p.id === projectId) : null;

  // Initialize state from props (derived at mount time only — safe pattern)
  const [name, setName] = useState(editing?.name ?? "");
  const [rootPath, setRootPath] = useState(editing?.rootPath ?? "");
  const [icon, setIcon] = useState(editing?.icon ?? PROJECT_ICONS[0]);
  const [color, setColor] = useState(editing?.color ?? PROJECT_COLORS[0]);

  const detected = detectFramework(rootPath);

  const handleSubmit = async () => {
    if (!name.trim() || !rootPath.trim()) return;
    if (editing) {
      await updateProject(editing.id, { name, rootPath, icon, color });
    } else {
      await addProject({ name, rootPath, icon, color });
    }
    onOpenChange(false);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Folder className="h-4 w-4" />
          {editing ? "Edit Project" : "New Project"}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="proj-name">Project Name</Label>
          <Input
            id="proj-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Boto.social"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="proj-path">Root Path</Label>
          <Input
            id="proj-path"
            value={rootPath}
            onChange={(e) => setRootPath(e.target.value)}
            placeholder="/home/user/projects/my-app"
            className="font-mono text-xs"
          />
          {detected.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-status-running">
              <Sparkles className="h-3 w-3" />
              <span>Detected: {detected.join(", ")}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Icon</Label>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROJECT_ICONS.map((i) => (
                  <SelectItem key={i} value={i}>{i}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-1.5">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? "white" : "transparent",
                    boxShadow: color === c ? `0 0 0 2px ${c}` : "none",
                  }}
                  aria-label={`Color ${c}`}
                >
                  {color === c && <Check className="h-3 w-3 text-white mx-auto" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={!name.trim() || !rootPath.trim()}>
          {editing ? "Save Changes" : "Create Project"}
        </Button>
      </DialogFooter>
    </>
  );
}
