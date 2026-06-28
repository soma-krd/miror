"use client";

import { useEffect, useState, useCallback } from "react";
import {
  HardDrive, Package, FolderSearch, Sparkles, RefreshCw, FolderOpen, Copy,
  Trash2, ChevronDown, ChevronRight, AlertCircle, Loader2, Search, CheckCircle2,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api-origin";

type Tab = "overview" | "caches" | "projects" | "suggestions";

interface DiskInfo {
  total: string; used: string; free: string;
}
interface CategoryInfo {
  name: string; path: string; size: string; sizeBytes: number; icon: string;
}
interface OverviewData {
  disk: DiskInfo;
  categories: CategoryInfo[];
  homeDir: string;
  platform: string;
}
interface CacheEntry {
  name: string; path: string; size: string; sizeBytes: number;
  lastAccessed: string; fileCount: number; icon: string;
  packageManager: string; safeToDelete: boolean; reason: string;
}
interface ProjectDir {
  name: string; path: string; size: string; sizeBytes: number;
  safeLevel: "green" | "yellow" | "red"; reason: string;
}
interface ProjectInfo {
  name: string; path: string; totalSize: string; totalSizeBytes: number;
  type: string; breakdown: ProjectDir[];
}

const SAFETY_COLORS = {
  green: { dot: "bg-status-running", text: "text-status-running", bg: "bg-status-running/10", label: "Safe to delete" },
  yellow: { dot: "bg-status-starting", text: "text-status-starting", bg: "bg-status-starting/10", label: "Review first" },
  red: { dot: "bg-status-error", text: "text-status-error", bg: "bg-status-error/10", label: "Never delete" },
};

export function StorageView() {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [caches, setCaches] = useState<CacheEntry[]>([]);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanPath, setScanPath] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string; size: string; reason: string } | null>(null);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(apiUrl("/api/storage/overview"));
      const data = await res.json();
      if (res.ok) { setOverview(data); setScanPath(data.homeDir || ""); }
      else setError(data.error);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  const fetchCaches = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(apiUrl("/api/storage/caches"));
      const data = await res.json();
      if (res.ok) setCaches(data);
      else setError(data.error);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  const scanProjects = useCallback(async () => {
    if (!scanPath.trim()) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(apiUrl("/api/storage/projects"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanPath: scanPath.trim() }),
      });
      const data = await res.json();
      if (res.ok) setProjects(data.projects || []);
      else setError(data.error);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [scanPath]);

  useEffect(() => { if (tab === "overview") fetchOverview(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === "caches") fetchCaches(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === "projects" && scanPath) scanProjects(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Suggestions: aggregate all green/yellow items from projects
  const allSuggestions: Array<{ project: string; dir: ProjectDir }> = [];
  for (const p of projects) {
    for (const d of p.breakdown) {
      if (d.safeLevel === "green" || d.safeLevel === "yellow") {
        allSuggestions.push({ project: p.name, dir: d });
      }
    }
  }
  allSuggestions.sort((a, b) => b.dir.sizeBytes - a.dir.sizeBytes);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(apiUrl("/api/storage/delete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderPath: deleteTarget.path, permanent: false }),
      });
      const data = await res.json();
      setDeleteResult(data.ok ? data.message : data.error);
      if (data.ok) {
        // Refresh data
        if (tab === "caches") fetchCaches();
        else if (tab === "projects") scanProjects();
        else if (tab === "suggestions") scanProjects();
      }
    } catch (e) {
      setDeleteResult((e as Error).message);
    }
    setDeleteTarget(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPath(text);
    setTimeout(() => setCopiedPath(null), 1500);
  };

  const TABS: { id: Tab; label: string; icon: typeof HardDrive; count?: number }[] = [
    { id: "overview", label: "Overview", icon: HardDrive },
    { id: "caches", label: "Caches", icon: Package, count: caches.length },
    { id: "projects", label: "Projects", icon: FolderSearch, count: projects.length },
    { id: "suggestions", label: "Suggestions", icon: Sparkles, count: allSuggestions.length },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/50">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all miror-press",
              tab === t.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="font-mono text-[10px] text-muted-foreground/60">{t.count}</span>
            )}
          </button>
        ))}
        <Button
          variant="ghost" size="icon" className="h-7 w-7 ml-auto"
          onClick={() => {
            if (tab === "overview") fetchOverview();
            else if (tab === "caches") fetchCaches();
            else if (tab === "projects") scanProjects();
          }}
          disabled={loading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} strokeWidth={1.75} />
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="m-3 rounded-lg border border-status-error/30 bg-status-error/5 p-3 text-xs text-status-error flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Result toast */}
      {deleteResult && (
        <div className="m-3 rounded-lg border border-status-running/30 bg-status-running/5 p-3 text-xs text-status-running flex items-start gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div className="flex-1">{deleteResult}</div>
          <button onClick={() => setDeleteResult(null)} className="text-muted-foreground hover:text-foreground">×</button>
        </div>
      )}

      <div className="flex-1 overflow-auto miror-scroll">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">Scanning…</span>
          </div>
        )}

        {/* Overview tab */}
        {!loading && tab === "overview" && overview && (
          <div className="p-4 space-y-4">
            {/* Disk usage card */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Total Disk" value={overview.disk.total} icon={HardDrive} />
              <StatCard label="Used" value={overview.disk.used} icon={HardDrive} />
              <StatCard label="Free" value={overview.disk.free} icon={HardDrive} />
            </div>

            {/* Usage bar */}
            <Card className="miror-card">
              <CardContent className="p-4">
                <div className="text-[11px] font-medium text-muted-foreground mb-2">Storage by Category</div>
                <div className="space-y-1.5">
                  {overview.categories.map(cat => (
                    <div key={cat.path} className="flex items-center gap-2 text-[12px]">
                      <span className="text-sm shrink-0">{cat.icon}</span>
                      <span className="flex-1 truncate">{cat.name}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{cat.size}</span>
                      <button onClick={() => copyToClipboard(cat.path)} className="opacity-50 hover:opacity-100 shrink-0">
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Caches tab */}
        {!loading && tab === "caches" && (
          <div className="p-4 space-y-2">
            {caches.map(cache => (
              <div key={cache.path} className="rounded-xl border border-border/50 miror-card p-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg shrink-0">{cache.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium">{cache.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground/60 truncate">{cache.path}</div>
                  </div>
                  <Badge variant="outline" className="text-[11px] h-5 font-mono">{cache.size}</Badge>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground/60">
                  <span>📦 {cache.packageManager}</span>
                  <span>· {cache.fileCount.toLocaleString()} files</span>
                  <span>· Last accessed: {cache.lastAccessed}</span>
                </div>
                <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/30">
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", SAFETY_COLORS.green.bg, SAFETY_COLORS.green.text)}>
                    🟢 {SAFETY_COLORS.green.label}
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 gap-1 text-[11px] ml-auto miror-press"
                    onClick={() => copyToClipboard(cache.path)}>
                    <Copy className="h-3 w-3" /> {copiedPath === cache.path ? "Copied!" : "Copy path"}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 gap-1 text-[11px] miror-press"
                    onClick={() => setDeleteTarget({ path: cache.path, name: cache.name, size: cache.size, reason: cache.reason })}>
                    <Trash2 className="h-3 w-3" /> Clear
                  </Button>
                </div>
              </div>
            ))}
            {caches.length === 0 && !loading && (
              <EmptyState icon={Package} title="No caches found" description="No package manager caches detected." />
            )}
          </div>
        )}

        {/* Projects tab */}
        {!loading && tab === "projects" && (
          <div className="p-4 space-y-3">
            {/* Scan path input */}
            <div className="flex items-center gap-2">
              <Input
                value={scanPath}
                onChange={e => setScanPath(e.target.value)}
                placeholder="/path/to/scan"
                className="h-8 font-mono text-xs"
                onKeyDown={e => e.key === "Enter" && scanProjects()}
              />
              <Button size="sm" className="h-8 gap-1 text-xs miror-press" onClick={scanProjects} disabled={loading}>
                <Search className="h-3 w-3" /> Scan
              </Button>
            </div>

            {projects.map(proj => (
              <div key={proj.path} className="rounded-xl border border-border/50 miror-card p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-[10px] h-4">{proj.type}</Badge>
                  <span className="text-[13px] font-medium flex-1 truncate">{proj.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{proj.totalSize}</span>
                </div>
                <div className="font-mono text-[10px] text-muted-foreground/50 mb-2 truncate">{proj.path}</div>

                {proj.breakdown.length > 0 && (
                  <div className="space-y-1">
                    {proj.breakdown.map(dir => {
                      const safety = SAFETY_COLORS[dir.safeLevel];
                      return (
                        <div key={dir.path} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/30">
                          <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", safety.dot)} />
                          <span className="font-mono text-[11px] flex-1 truncate">{dir.name}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{dir.size}</span>
                          <button onClick={() => copyToClipboard(dir.path)} className="opacity-0 group-hover:opacity-100 shrink-0">
                            <Copy className="h-3 w-3" />
                          </button>
                          {(dir.safeLevel === "green" || dir.safeLevel === "yellow") && (
                            <button
                              onClick={() => setDeleteTarget({ path: dir.path, name: dir.name, size: dir.size, reason: dir.reason })}
                              className="opacity-0 group-hover:opacity-100 hover:text-status-error shrink-0"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {proj.breakdown.length === 0 && (
                  <div className="text-[10px] text-muted-foreground/50 italic">No reclaimable directories found</div>
                )}
              </div>
            ))}
            {projects.length === 0 && !loading && (
              <EmptyState icon={FolderSearch} title="No projects found" description="Enter a path above and click Scan to find projects." />
            )}
          </div>
        )}

        {/* Suggestions tab */}
        {!loading && tab === "suggestions" && (
          <div className="p-4 space-y-2">
            <div className="text-[11px] text-muted-foreground mb-3">
              {allSuggestions.length > 0
                ? `${allSuggestions.length} folders can be reclaimed. Total: ${formatTotalSize(allSuggestions)}`
                : "Scan a folder in the Projects tab to see suggestions."}
            </div>
            {allSuggestions.map((s, i) => {
              const safety = SAFETY_COLORS[s.dir.safeLevel];
              return (
                <div key={i} className="group rounded-xl border border-border/50 miror-card p-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", safety.dot)} />
                    <span className="font-mono text-[12px] font-medium flex-1 truncate">{s.dir.name}</span>
                    <Badge variant="outline" className="font-mono text-[11px] h-5">{s.dir.size}</Badge>
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground/60">
                    📁 {s.project} · <span className={safety.text}>{safety.label}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground/80">{s.dir.reason}</div>
                  <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/30">
                    <Button variant="ghost" size="sm" className="h-6 gap-1 text-[11px] miror-press"
                      onClick={() => copyToClipboard(s.dir.path)}>
                      <Copy className="h-3 w-3" /> Copy path
                    </Button>
                    <Button variant="ghost" size="sm"
                      className="h-6 gap-1 text-[11px] miror-press ml-auto hover:text-status-error"
                      onClick={() => setDeleteTarget({ path: s.dir.path, name: s.dir.name, size: s.dir.size, reason: s.dir.reason })}>
                      <Trash2 className="h-3 w-3" /> Delete
                    </Button>
                  </div>
                </div>
              );
            })}
            {allSuggestions.length === 0 && !loading && (
              <EmptyState icon={Sparkles} title="No suggestions yet" description="Scan projects in the Projects tab to see cleanup suggestions." />
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className={cn("inline-block h-2 w-2 rounded-full", SAFETY_COLORS.green.dot)} />
              Delete {deleteTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-2 mt-2">
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="text-muted-foreground">Folder:</span>
                  <span className="font-mono text-[11px]">{deleteTarget?.name}</span>
                </div>
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="text-muted-foreground">Size:</span>
                  <span className="font-mono">{deleteTarget?.size}</span>
                </div>
                <div className="text-[12px] text-muted-foreground">
                  <span className="font-medium text-status-running">Why it's safe:</span> {deleteTarget?.reason}
                </div>
                <div className="rounded-lg bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
                  ⚠️ This will move the folder to Trash (if available) or permanently delete it. The folder can be regenerated when needed.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-status-error text-white hover:bg-status-error/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof HardDrive }) {
  return (
    <Card className="miror-card">
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Icon className="h-3 w-3" strokeWidth={1.75} />
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof HardDrive; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/30 mb-3" strokeWidth={1.5} />
      <h3 className="text-[14px] font-medium">{title}</h3>
      <p className="mt-1 text-[12px] text-muted-foreground">{description}</p>
    </div>
  );
}

function formatTotalSize(suggestions: Array<{ dir: ProjectDir }>): string {
  const total = suggestions.reduce((sum, s) => sum + s.dir.sizeBytes, 0);
  if (total === 0) return "—";
  if (total < 1024 * 1024) return `${(total / 1024).toFixed(1)} KB`;
  if (total < 1024 * 1024 * 1024) return `${(total / (1024 * 1024)).toFixed(1)} MB`;
  return `${(total / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
