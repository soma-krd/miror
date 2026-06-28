"use client";

import { useMemo } from "react";
import {
  AlertCircle, Braces, Clock, FileWarning, ArrowUpRight, X, ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { LogEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

// Log Intelligence — scans the log buffer in real-time and surfaces:
//   - Errors (stderr + "Error:" pattern)
//   - Stack traces (multi-line "at ..." patterns)
//   - Slow operations (duration > threshold)
//   - File:line references (clickable to open in editor)
//
// This is computed client-side from the in-memory log buffer. For large log
// volumes, the detection is capped at the most recent N entries.

export interface LogIssue {
  id: string;
  type: "error" | "stack-trace" | "slow" | "file-ref" | "warning";
  severity: "critical" | "warning" | "info";
  serviceId: string;
  serviceName: string;
  timestamp: number;
  message: string;
  // For file references — the file:line to open in editor
  fileRef?: { file: string; line: number };
  // For stack traces — the grouped line IDs
  traceLines?: string[];
}

interface LogIntelligenceProps {
  logs: LogEntry[];
  serviceNameMap: Map<string, string>;
  onIssueClick: (issue: LogIssue) => void;
  className?: string;
}

const SLOW_THRESHOLD_MS = 1000;
const MAX_SCAN = 500; // scan only the most recent N logs for performance

export function LogIntelligence({ logs, serviceNameMap, onIssueClick, className }: LogIntelligenceProps) {
  const issues = useMemo<LogIssue[]>(() => {
    const recent = logs.slice(-MAX_SCAN);
    const found: LogIssue[] = [];
    let i = 0;
    while (i < recent.length) {
      const log = recent[i];
      const msg = log.message;

      // Error detection
      if (log.type === "stderr" || /\b(error|err|fatal|panic|crash|exception)\b/i.test(msg)) {
        // Check if this is the start of a stack trace
        const isStackTrace = i + 1 < recent.length &&
          /^\s+at\s+/.test(recent[i + 1].message) ||
          /^\s+at\s+/.test(msg);

        if (isStackTrace) {
          // Collect the full trace
          const traceLines: string[] = [log.id];
          let j = i + 1;
          while (j < recent.length && /^\s+(at\s+|\.\.\.\s|\})/.test(recent[j].message)) {
            traceLines.push(recent[j].id);
            j++;
          }
          found.push({
            id: `issue_${log.id}`,
            type: "stack-trace",
            severity: "critical",
            serviceId: log.serviceId,
            serviceName: serviceNameMap.get(log.serviceId) ?? "—",
            timestamp: log.timestamp,
            message: msg.slice(0, 120),
            traceLines,
          });
          i = j;
          continue;
        }

        // Regular error
        found.push({
          id: `issue_${log.id}`,
          type: "error",
          severity: log.type === "stderr" ? "critical" : "warning",
          serviceId: log.serviceId,
          serviceName: serviceNameMap.get(log.serviceId) ?? "—",
          timestamp: log.timestamp,
          message: msg.slice(0, 120),
        });
      }

      // Slow operation detection — e.g., "GET /api 200 1234ms" or "took 5.2s"
      const slowMatch = msg.match(/(\d+(?:\.\d+)?)\s*(ms|s)\b/i);
      if (slowMatch) {
        const value = parseFloat(slowMatch[1]);
        const unit = slowMatch[2].toLowerCase();
        const ms = unit === "s" ? value * 1000 : value;
        if (ms >= SLOW_THRESHOLD_MS) {
          found.push({
            id: `issue_slow_${log.id}`,
            type: "slow",
            severity: "warning",
            serviceId: log.serviceId,
            serviceName: serviceNameMap.get(log.serviceId) ?? "—",
            timestamp: log.timestamp,
            message: msg.slice(0, 120),
          });
        }
      }

      // File:line reference detection — e.g., "src/index.ts:42:15" or "at /foo/bar.js:10"
      const fileMatch = msg.match(/([\w./_-]+\.(ts|tsx|js|jsx|py|rs|go|java)):(\d+)/);
      if (fileMatch) {
        found.push({
          id: `issue_file_${log.id}`,
          type: "file-ref",
          severity: "info",
          serviceId: log.serviceId,
          serviceName: serviceNameMap.get(log.serviceId) ?? "—",
          timestamp: log.timestamp,
          message: msg.slice(0, 120),
          fileRef: { file: fileMatch[1], line: parseInt(fileMatch[3], 10) },
        });
      }

      // Warning detection
      if (/\b(warn|deprecat|deprecated)\b/i.test(msg) && log.type !== "stderr") {
        found.push({
          id: `issue_warn_${log.id}`,
          type: "warning",
          severity: "info",
          serviceId: log.serviceId,
          serviceName: serviceNameMap.get(log.serviceId) ?? "—",
          timestamp: log.timestamp,
          message: msg.slice(0, 120),
        });
      }

      i++;
    }

    // Sort by severity (critical first) then timestamp (newest first)
    const severityRank = { critical: 0, warning: 1, info: 2 };
    found.sort((a, b) => {
      const sr = severityRank[a.severity] - severityRank[b.severity];
      if (sr !== 0) return sr;
      return b.timestamp - a.timestamp;
    });

    return found.slice(0, 50); // cap at 50 issues
  }, [logs, serviceNameMap]);

  const criticalCount = issues.filter(i => i.severity === "critical").length;
  const warningCount = issues.filter(i => i.severity === "warning").length;

  if (issues.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-8 px-4 text-center", className)}>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-running/10 text-status-running mb-2">
          <AlertCircle className="h-5 w-5" />
        </div>
        <p className="text-xs font-medium">No issues detected</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Errors, stack traces, and slow operations appear here.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Summary header */}
      <div className="flex items-center gap-3 border-b border-border px-3 py-2">
        <span className="text-xs font-medium">Log Intelligence</span>
        <div className="flex items-center gap-2 ml-auto">
          {criticalCount > 0 && (
            <Badge variant="outline" className="text-status-error border-status-error/30 text-[10px] h-4">
              {criticalCount} critical
            </Badge>
          )}
          {warningCount > 0 && (
            <Badge variant="outline" className="text-status-starting border-status-starting/30 text-[10px] h-4">
              {warningCount} warning{warningCount > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </div>

      {/* Issues list */}
      <div className="flex-1 overflow-y-auto miror-scroll">
        {issues.map(issue => (
          <button
            key={issue.id}
            onClick={() => onIssueClick(issue)}
            className="group flex w-full items-start gap-2 border-b border-border px-3 py-2 text-left hover:bg-muted/40"
          >
            <IssueIcon type={issue.type} severity={issue.severity} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium truncate">{issue.serviceName}</span>
                <span className="font-mono text-[9px] text-muted-foreground">
                  {new Date(issue.timestamp).toLocaleTimeString("en-US", { hour12: false })}
                </span>
                <IssueTypeBadge type={issue.type} />
              </div>
              <p className={cn(
                "text-[11px] mt-0.5 font-mono truncate",
                issue.severity === "critical" ? "text-status-error" : "text-muted-foreground"
              )}>
                {issue.message}
              </p>
              {issue.fileRef && (
                <div className="flex items-center gap-1 mt-0.5 text-[10px] text-status-running">
                  <ArrowUpRight className="h-2.5 w-2.5" />
                  <span className="font-mono">{issue.fileRef.file}:{issue.fileRef.line}</span>
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function IssueIcon({ type, severity }: { type: LogIssue["type"]; severity: LogIssue["severity"] }) {
  const className = cn(
    "h-3.5 w-3.5 shrink-0 mt-0.5",
    severity === "critical" ? "text-status-error" :
    severity === "warning" ? "text-status-starting" :
    "text-muted-foreground"
  );
  if (type === "stack-trace") return <Braces className={className} />;
  if (type === "slow") return <Clock className={className} />;
  if (type === "file-ref") return <FileWarning className={className} />;
  return <AlertCircle className={className} />;
}

function IssueTypeBadge({ type }: { type: LogIssue["type"] }) {
  const labels: Record<LogIssue["type"], string> = {
    "error": "ERROR",
    "stack-trace": "TRACE",
    "slow": "SLOW",
    "file-ref": "FILE",
    "warning": "WARN",
  };
  return (
    <span className={cn(
      "font-mono text-[9px] px-1 rounded",
      type === "error" || type === "stack-trace" ? "bg-status-error/15 text-status-error" :
      type === "slow" ? "bg-status-starting/15 text-status-starting" :
      type === "file-ref" ? "bg-primary/15 text-primary" :
      "bg-muted text-muted-foreground"
    )}>
      {labels[type]}
    </span>
  );
}
