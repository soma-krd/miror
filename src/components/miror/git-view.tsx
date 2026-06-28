"use client";

import { useEffect, useState, useCallback } from "react";
import {
  GitBranch, GitCommit, GitGraph, Terminal, RefreshCw, ArrowUp, ArrowDown,
  ChevronDown, ChevronRight, Check, AlertCircle, Play, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useMiror } from "@/store/miror-store";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api-origin";

type Tab = "status" | "branches" | "log" | "tree" | "terminal";

interface GitBranchInfo {
  name: string;
  is_current: boolean;
  is_remote: boolean;
  last_commit: string;
  last_commit_date: string;
}

interface GitLogEntry {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  email: string;
  date: string;
  refs: string;
}

interface GitTreeEntry {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  date: string;
  parents: string[];
  is_merge: boolean;
}

interface GitStatus {
  is_repo: boolean;
  branch: string;
  is_dirty: boolean;
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
  untracked: number;
  recent_commits: Array<{ hash: string; message: string; author: string; date: string }>;
}

export function GitView() {
  const { projects, activeProjectId, setActiveProject } = useMiror();
  const [tab, setTab] = useState<Tab>("status");
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [log, setLog] = useState<GitLogEntry[]>([]);
  const [tree, setTree] = useState<GitTreeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [terminalInput, setTerminalInput] = useState("");
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [projectPickerPos, setProjectPickerPos] = useState({ top: 0, left: 0 });
  const [terminalHistory, setTerminalHistory] = useState<Array<{ cmd: string; output: string }>>([]);

  const project = projects.find(p => p.id === activeProjectId);

  const fetchStatus = useCallback(async () => {
    if (!activeProjectId) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/projects/${activeProjectId}/git`));
      if (res.ok) setStatus(await res.json());
    } catch (e) { console.warn("git status failed:", e); }
    finally { setLoading(false); }
  }, [activeProjectId]);

  const fetchBranches = useCallback(async () => {
    if (!activeProjectId) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/projects/${activeProjectId}/git/branches`));
      if (res.ok) setBranches(await res.json());
    } catch (e) { console.warn("git branches failed:", e); }
    finally { setLoading(false); }
  }, [activeProjectId]);

  const fetchLog = useCallback(async () => {
    if (!activeProjectId) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/projects/${activeProjectId}/git/log?count=50`));
      if (res.ok) setLog(await res.json());
    } catch (e) { console.warn("git log failed:", e); }
    finally { setLoading(false); }
  }, [activeProjectId]);

  const fetchTree = useCallback(async () => {
    if (!activeProjectId) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/projects/${activeProjectId}/git/tree?count=50`));
      if (res.ok) setTree(await res.json());
    } catch (e) { console.warn("git tree failed:", e); }
    finally { setLoading(false); }
  }, [activeProjectId]);

  useEffect(() => {
    if (activeProjectId) {
      fetchStatus();
      if (tab === "branches") fetchBranches();
      else if (tab === "log") fetchLog();
      else if (tab === "tree") fetchTree();
    }
  }, [activeProjectId, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePush = async () => {
    if (!activeProjectId) return;
    setActionLoading(true);
    setActionResult(null);
    try {
      const res = await fetch(apiUrl(`/api/projects/${activeProjectId}/git/push`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setActionResult(data.ok ? data.output : data.error);
    } catch (e) {
      setActionResult(String(e));
    } finally { setActionLoading(false); }
  };

  const handlePull = async () => {
    if (!activeProjectId) return;
    setActionLoading(true);
    setActionResult(null);
    try {
      const res = await fetch(apiUrl(`/api/projects/${activeProjectId}/git/pull`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setActionResult(data.ok ? data.output : data.error);
    } catch (e) {
      setActionResult(String(e));
    } finally { setActionLoading(false); }
  };

  const handleCheckout = async (branch: string) => {
    if (!activeProjectId) return;
    setActionLoading(true);
    setActionResult(null);
    try {
      const res = await fetch(apiUrl(`/api/projects/${activeProjectId}/git/checkout`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch }),
      });
      const data = await res.json();
      setActionResult(data.output || data.error);
      fetchBranches();
      fetchStatus();
    } catch (e) {
      setActionResult(String(e));
    } finally { setActionLoading(false); }
  };

  const handleTerminalCommand = async () => {
    if (!terminalInput.trim() || !activeProjectId) return;
    const cmd = terminalInput.trim();
    const args = cmd.split(/\s+/);
    setTerminalInput("");
    setTerminalHistory(prev => [...prev, { cmd, output: "" }]);
    try {
      const res = await fetch(apiUrl(`/api/projects/${activeProjectId}/git/command`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ args }),
      });
      const data = await res.json();
      const output = data.output || data.error || "(no output)";
      setTerminalHistory(prev => {
        const next = [...prev];
        next[next.length - 1].output = output;
        return next;
      });
    } catch (e) {
      setTerminalHistory(prev => {
        const next = [...prev];
        next[next.length - 1].output = String(e);
        return next;
      });
    }
  };

  if (!project) {
    return (
      <div className="flex h-full">
        <ProjectSidebar
          projects={projects}
          activeProjectId={activeProjectId}
          onSelect={setActiveProject}
        />
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <GitBranch className="h-10 w-10 text-muted-foreground/30 mb-3" strokeWidth={1.5} />
          <h3 className="text-base font-medium">Select a project</h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Choose a project from the sidebar to view its git status.
          </p>
        </div>
      </div>
    );
  }

  if (status && !status.is_repo && project) {
    // Show sidebar + error panel
    return (
      <div className="flex h-full">
        <ProjectSidebar
          projects={projects}
          activeProjectId={activeProjectId}
          onSelect={setActiveProject}
        />
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground/30 mb-3" strokeWidth={1.5} />
          <h3 className="text-base font-medium">Not a git repository</h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {project.name} doesn't have a .git directory.
          </p>
        </div>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; icon: typeof GitBranch }[] = [
    { id: "status", label: "Status", icon: GitBranch },
    { id: "branches", label: "Branches", icon: GitBranch },
    { id: "log", label: "Log", icon: GitCommit },
    { id: "tree", label: "Tree", icon: GitGraph },
    { id: "terminal", label: "Terminal", icon: Terminal },
  ];

  return (
    <div className="flex h-full">
      {/* Project sidebar — same pattern as Logs view service picker */}
      <ProjectSidebar
        projects={projects}
        activeProjectId={activeProjectId}
        onSelect={setActiveProject}
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
      {/* Header with project selector + push/pull */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50">
        {/* Project switcher dropdown */}
        <div className="relative">
          <button
            onClick={(e) => {
              if (!showProjectPicker) {
                const rect = e.currentTarget.getBoundingClientRect();
                setProjectPickerPos({ top: rect.bottom + 4, left: rect.left });
              }
              setShowProjectPicker(!showProjectPicker);
            }}
            className="flex items-center gap-1.5 rounded-lg hover:bg-muted/50 px-2 py-1 transition-colors"
          >
            <span className="text-[13px] font-medium">{project.icon} {project.name}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" strokeWidth={2} />
          </button>
          {showProjectPicker && (
            <>
              <div className="fixed inset-0 z-[9998]" onClick={() => setShowProjectPicker(false)} />
              <div className="fixed z-[9999] w-64 rounded-lg border border-border/50 miror-frosted shadow-2xl p-1"
                   style={{
                     top: projectPickerPos.top,
                     left: projectPickerPos.left,
                   }}>
                <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  Switch Project
                </div>
                {projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setActiveProject(p.id); setShowProjectPicker(false); }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors",
                      p.id === activeProjectId ? "bg-accent/60" : "hover:bg-muted/50"
                    )}
                  >
                    <span className="text-base">{p.icon ?? "📁"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium truncate">{p.name}</div>
                      <div className="font-mono text-[9px] text-muted-foreground/60 truncate">{p.rootPath}</div>
                    </div>
                    {p.id === activeProjectId && <Check className="h-3.5 w-3.5 text-primary shrink-0" strokeWidth={2} />}
                  </button>
                ))}
                <div className="border-t border-border/50 mt-1 pt-1">
                  <button
                    onClick={() => { setActiveProject(null); setShowProjectPicker(false); }}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[12px] text-muted-foreground hover:bg-muted/50"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                    Show all projects
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        {status && (
          <>
            <Badge variant="outline" className="font-mono text-[11px] h-5 gap-1">
              <GitBranch className="h-2.5 w-2.5" />
              {status.branch}
            </Badge>
            {status.is_dirty && (
              <Badge variant="outline" className="text-status-starting border-status-starting/30 text-[10px] h-5">
                dirty
              </Badge>
            )}
            {status.ahead > 0 && (
              <Badge variant="outline" className="text-[10px] h-5 gap-0.5">
                <ArrowUp className="h-2.5 w-2.5" /> {status.ahead}
              </Badge>
            )}
            {status.behind > 0 && (
              <Badge variant="outline" className="text-[10px] h-5 gap-0.5">
                <ArrowDown className="h-2.5 w-2.5" /> {status.behind}
              </Badge>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[12px] miror-press" onClick={handlePull} disabled={actionLoading}>
            <ArrowDown className="h-3 w-3" /> Pull
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[12px] miror-press" onClick={handlePush} disabled={actionLoading}>
            <ArrowUp className="h-3 w-3" /> Push
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchStatus} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border/50 bg-muted/20">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all miror-press",
              tab === t.id
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Action result banner */}
      {actionResult && (
        <div className="mx-4 mt-2 rounded-lg border border-border/50 bg-muted/30 p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-muted-foreground">Command output</span>
            <button onClick={() => setActionResult(null)} className="text-muted-foreground hover:text-foreground text-xs">×</button>
          </div>
          <pre className="font-mono text-[11px] text-foreground/80 overflow-auto max-h-32">{actionResult}</pre>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto miror-scroll">
        {tab === "status" && status && (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Staged" value={status.staged} tone="running" />
              <StatCard label="Modified" value={status.unstaged} tone="starting" />
              <StatCard label="Untracked" value={status.untracked} tone="idle" />
            </div>
            <Card className="miror-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-[13px]">Recent Commits</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {status.recent_commits.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px] py-0.5">
                    <GitCommit className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.75} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-foreground/80">{c.message}</div>
                      <div className="font-mono text-[10px] text-muted-foreground/60">
                        {c.hash.slice(0, 7)} · {c.author} · {c.date}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "branches" && (
          <div className="p-4 space-y-1">
            {branches.map(b => (
              <div
                key={b.name}
                className={cn(
                  "group flex items-center gap-2.5 rounded-lg px-3 py-2 cursor-pointer transition-colors",
                  b.is_current ? "bg-primary/10" : "hover:bg-muted/40"
                )}
                onClick={() => !b.is_current && handleCheckout(b.name.replace("remotes/", ""))}
              >
                {b.is_current ? (
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" strokeWidth={2} />
                ) : (
                  <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
                )}
                <div className="flex-1 min-w-0">
                  <span className={cn("text-[12px] font-medium", b.is_current && "text-primary")}>
                    {b.name}
                  </span>
                  {b.is_remote && (
                    <Badge variant="outline" className="ml-2 text-[9px] h-3.5">remote</Badge>
                  )}
                </div>
                <span className="font-mono text-[10px] text-muted-foreground/60">
                  {b.last_commit} · {b.last_commit_date}
                </span>
              </div>
            ))}
            {branches.length === 0 && !loading && (
              <div className="text-center py-8 text-[12px] text-muted-foreground">No branches found</div>
            )}
          </div>
        )}

        {tab === "log" && (
          <div className="p-4 space-y-1">
            {log.map((entry, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-lg px-3 py-2 hover:bg-muted/30">
                <div className="flex flex-col items-center shrink-0">
                  <div className="h-2 w-2 rounded-full bg-primary/60" />
                  {i < log.length - 1 && <div className="w-px h-6 bg-border/50 mt-0.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-primary/80">{entry.short_hash}</span>
                    {entry.refs && (
                      <Badge variant="outline" className="text-[9px] h-3.5 text-primary border-primary/30">
                        {entry.refs.replace(/[()]/g, "")}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[12px] text-foreground/80 truncate">{entry.message}</div>
                  <div className="font-mono text-[10px] text-muted-foreground/60">
                    {entry.author} · {entry.date}
                  </div>
                </div>
              </div>
            ))}
            {log.length === 0 && !loading && (
              <div className="text-center py-8 text-[12px] text-muted-foreground">No commits found</div>
            )}
          </div>
        )}

        {tab === "tree" && (
          <div className="p-4 space-y-0.5">
            {tree.map((entry, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-lg px-3 py-1.5 hover:bg-muted/30">
                <div className="flex flex-col items-center shrink-0">
                  <div className={cn(
                    "h-2 w-2 rounded-full",
                    entry.is_merge ? "bg-status-starting" : "bg-primary/60"
                  )} />
                  {i < tree.length - 1 && <div className="w-px h-4 bg-border/50 mt-0.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">{entry.short_hash}</span>
                    <span className="text-[12px] text-foreground/80 truncate">{entry.message}</span>
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground/50">
                    {entry.author} · {entry.date}{entry.is_merge && " · merge"}
                  </div>
                </div>
              </div>
            ))}
            {tree.length === 0 && !loading && (
              <div className="text-center py-8 text-[12px] text-muted-foreground">No commits found</div>
            )}
          </div>
        )}

        {tab === "terminal" && (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-auto miror-scroll p-4 space-y-2">
              <div className="text-[11px] text-muted-foreground/60 font-mono mb-2">
                Git terminal — type any git command (e.g. "status", "diff --staged", "stash list")
              </div>
              {terminalHistory.map((h, i) => (
                <div key={i} className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    <span className="text-primary">$</span>
                    <span className="text-foreground/80">git {h.cmd}</span>
                  </div>
                  {h.output && (
                    <pre className="font-mono text-[11px] text-muted-foreground/80 whitespace-pre-wrap pl-4">
                      {h.output}
                    </pre>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-border/50 px-4 py-2.5 bg-muted/20">
              <span className="font-mono text-[12px] text-primary">$ git</span>
              <input
                value={terminalInput}
                onChange={e => setTerminalInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleTerminalCommand()}
                placeholder="status"
                className="flex-1 bg-transparent font-mono text-[12px] outline-none placeholder:text-muted-foreground/40"
                autoFocus
              />
              <Button size="sm" className="h-7 gap-1 text-[12px] miror-press" onClick={handleTerminalCommand}>
                <Play className="h-3 w-3" /> Run
              </Button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "running" | "starting" | "idle" }) {
  const colors = {
    running: "text-status-running",
    starting: "text-status-starting",
    idle: "text-muted-foreground",
  };
  return (
    <Card className="miror-card">
      <CardContent className="p-3">
        <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
        <div className={cn("mt-1 text-2xl font-semibold tabular-nums", colors[tone])}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

// --- Project Sidebar — same pattern as Logs view service picker -------------

function ProjectSidebar({
  projects,
  activeProjectId,
  onSelect,
}: {
  projects: Array<{ id: string; name: string; rootPath: string; icon?: string; color?: string }>;
  activeProjectId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="w-56 shrink-0 border-r border-border bg-card/30">
      <div className="border-b border-border px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Git Source
        </div>
      </div>
      <div className="overflow-y-auto miror-scroll p-2">
        {projects.map(p => {
          const active = activeProjectId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs mb-0.5",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              )}
            >
              <span className="text-sm leading-none shrink-0">{p.icon ?? "📁"}</span>
              <div className="flex-1 min-w-0 text-left">
                <div className="truncate font-medium">{p.name}</div>
                <div className="font-mono text-[9px] text-muted-foreground/60 truncate">
                  {p.rootPath.split("/").pop()}
                </div>
              </div>
              {active && <Check className="h-3 w-3 text-primary shrink-0" strokeWidth={2} />}
            </button>
          );
        })}
        {projects.length === 0 && (
          <div className="px-2 py-4 text-[10px] text-muted-foreground text-center">
            No projects yet
          </div>
        )}
      </div>
    </div>
  );
}
