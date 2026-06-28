"use client";

import { useEffect, useState } from "react";
import {
  GitBranch, GitCommit, RefreshCw, AlertCircle, CheckCircle2, ArrowUp, ArrowDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { backend } from "@/lib/backend-client";
import { cn } from "@/lib/utils";

// Git Integration Panel — shows per-project git status: branch, dirty/clean,
// ahead/behind, staged/unstaged/untracked counts, recent commits.

interface GitStatus {
  is_repo: boolean;
  branch: string;
  is_dirty: boolean;
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
  untracked: number;
  recent_commits: Array<{
    hash: string;
    message: string;
    author: string;
    date: string;
  }>;
}

export function GitPanel({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await backend.getGitStatus(projectId);
      setStatus(data);
    } catch (e) {
      console.warn("git status failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!status) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Loading git status…
        </CardContent>
      </Card>
    );
  }

  if (!status.is_repo) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5" />
          Not a git repository
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <GitBranch className="h-4 w-4" />
          Git
          <Button
            variant="ghost" size="icon" className="h-5 w-5 ml-auto"
            onClick={refresh} disabled={loading}
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Branch + status badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="font-mono text-[10px] h-4 gap-1">
            <GitBranch className="h-2.5 w-2.5" />
            {status.branch}
          </Badge>
          {status.is_dirty ? (
            <Badge variant="outline" className="text-status-starting border-status-starting/30 text-[10px] h-4">
              dirty
            </Badge>
          ) : (
            <Badge variant="outline" className="text-status-running border-status-running/30 text-[10px] h-4 gap-0.5">
              <CheckCircle2 className="h-2.5 w-2.5" /> clean
            </Badge>
          )}
          {status.ahead > 0 && (
            <Badge variant="outline" className="text-[10px] h-4 gap-0.5">
              <ArrowUp className="h-2.5 w-2.5" /> {status.ahead}
            </Badge>
          )}
          {status.behind > 0 && (
            <Badge variant="outline" className="text-[10px] h-4 gap-0.5">
              <ArrowDown className="h-2.5 w-2.5" /> {status.behind}
            </Badge>
          )}
        </div>

        {/* Change counts */}
        {(status.staged > 0 || status.unstaged > 0 || status.untracked > 0) && (
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {status.staged > 0 && (
              <span className="text-status-running">{status.staged} staged</span>
            )}
            {status.unstaged > 0 && (
              <span className="text-status-starting">{status.unstaged} modified</span>
            )}
            {status.untracked > 0 && (
              <span>{status.untracked} untracked</span>
            )}
          </div>
        )}

        {/* Recent commits */}
        <div className="space-y-0.5 max-h-32 overflow-y-auto miror-scroll">
          {status.recent_commits.slice(0, 5).map((commit, i) => (
            <div key={i} className="flex items-start gap-2 text-[10px] py-0.5">
              <GitCommit className="h-2.5 w-2.5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="truncate text-foreground/80">{commit.message}</div>
                <div className="text-muted-foreground/60 font-mono">
                  {commit.hash.slice(0, 7)} · {commit.author} · {commit.date}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
