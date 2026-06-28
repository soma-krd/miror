"use client";

import {
  Plus, FolderPlus, Trash2, Edit3, ExternalLink, Code2, ArrowRight,
} from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useMir } from "@/store/mir-store";
import { StatusDot } from "./status-badge";
import { truncatePath } from "./format";
import { ProjectForm } from "./project-form";

export function ProjectsView() {
  const {
    projects, services, activeProjectId, setActiveProject,
    addProject, updateProject, deleteProject,
  } = useMir();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Projects</h1>
          <p className="text-xs text-muted-foreground">
            Register workspace folders and manage their services.
          </p>
        </div>
        <Button
          onClick={() => { setEditingProject(null); setIsFormOpen(true); }}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" /> New Project
        </Button>
      </div>

      {/* Project grid */}
      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <FolderPlus className="h-7 w-7" />
            </div>
            <h3 className="mt-3 font-medium">No projects yet</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm text-center">
              Register your first workspace folder to start managing its services.
            </p>
            <Button className="mt-4 gap-1.5" onClick={() => { setEditingProject(null); setIsFormOpen(true); }}>
              <Plus className="h-4 w-4" /> Add Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((proj) => {
            const projServices = services.filter((s) => s.projectId === proj.id);
            const running = projServices.filter((s) => s.status === "running").length;
            const errored = projServices.filter((s) => s.status === "error").length;
            const isActive = activeProjectId === proj.id;

            return (
              <Card
                key={proj.id}
                className={`group relative cursor-pointer transition-all hover:border-primary/40 ${
                  isActive ? "border-primary ring-1 ring-primary/30" : ""
                }`}
                onClick={() => setActiveProject(proj.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-xl">
                      {proj.icon ?? "📁"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{proj.name}</CardTitle>
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground truncate">
                        {truncatePath(proj.rootPath, 32)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); setEditingProject(proj.id); setIsFormOpen(true); }}
                        title="Edit"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 hover:text-status-error"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(proj.id); }}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <StatusDot status={errored > 0 ? "error" : running > 0 ? "running" : "idle"} />
                      <span className="text-muted-foreground">
                        {running}/{projServices.length} running
                      </span>
                    </div>
                    {errored > 0 && (
                      <Badge variant="outline" className="text-status-error border-status-error/30 text-[10px] h-4">
                        {errored} error{errored > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>

                  {/* Services preview */}
                  <div className="mt-3 space-y-1">
                    {projServices.slice(0, 4).map((svc) => (
                      <div key={svc.id} className="flex items-center gap-2 text-xs">
                        <StatusDot status={svc.status} className="h-1.5 w-1.5" />
                        <span className="flex-1 truncate text-muted-foreground">{svc.name}</span>
                        {svc.port && (
                          <span className="font-mono text-[10px] text-muted-foreground/70">:{svc.port}</span>
                        )}
                      </div>
                    ))}
                    {projServices.length === 0 && (
                      <div className="text-[10px] italic text-muted-foreground">No services configured</div>
                    )}
                    {projServices.length > 4 && (
                      <div className="text-[10px] text-muted-foreground">+{projServices.length - 4} more…</div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
                    <Button
                      variant="ghost" size="sm" className="h-7 gap-1 text-xs"
                      onClick={(e) => { e.stopPropagation(); /* mock "open in editor" */ }}
                    >
                      <Code2 className="h-3 w-3" /> VS Code
                      <ExternalLink className="h-2.5 w-2.5" />
                    </Button>
                    <Button
                      variant="ghost" size="sm" className="h-7 gap-1 text-xs"
                      onClick={(e) => { e.stopPropagation(); setActiveProject(proj.id); }}
                    >
                      Manage <ArrowRight className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit form */}
      <ProjectForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        projectId={editingProject}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the project and all its service configurations. Logs will be cleared.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-status-error text-white hover:bg-status-error/90"
              onClick={() => {
                if (deleteTarget) deleteProject(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
