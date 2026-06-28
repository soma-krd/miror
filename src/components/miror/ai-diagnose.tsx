"use client";

import { useEffect, useState } from "react";
import {
  Brain, RefreshCw, AlertCircle, Lightbulb, Wrench, ChevronDown, ChevronRight, X,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LogEntry, Service } from "@/lib/types";

// AI Crash Diagnostics — when a service crashes, this panel fetches an
// LLM-powered diagnosis of the crash logs. Shows the likely cause,
// suggested fixes, severity, and category.

interface AIDiagnoseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: Service | null;
  crashLogs: LogEntry[];
}

interface Diagnosis {
  diagnosis: string;
  likely_cause: string;
  suggested_fixes: string[];
  severity: "low" | "medium" | "high" | "critical" | "unknown";
  category: string;
}

export function AIDiagnose({ open, onOpenChange, service, crashLogs }: AIDiagnoseProps) {
  const [loading, setLoading] = useState(false);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedFixes, setExpandedFixes] = useState(true);

  const fetchDiagnosis = async () => {
    if (!service || crashLogs.length === 0) return;
    setLoading(true);
    setError(null);
    setDiagnosis(null);
    try {
      const errorMessage = crashLogs.find(l => l.type === "stderr")?.message
        ?? crashLogs[crashLogs.length - 1]?.message
        ?? "Service exited unexpectedly";

      const res = await fetch("/api/ai-diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceName: service.name,
          command: service.command,
          logs: crashLogs.slice(-30).map(l => ({
            type: l.type,
            message: l.message,
            timestamp: l.timestamp,
          })),
          errorMessage,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.ok) {
        setDiagnosis(data.diagnosis);
      } else {
        setError(data.error ?? "Failed to get diagnosis");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch when opened
  useEffect(() => {
    if (open && service && crashLogs.length > 0) {
      fetchDiagnosis();
    }
  }, [open, service?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const severityColor = {
    critical: "text-status-error bg-status-error/10",
    high: "text-status-error bg-status-error/10",
    medium: "text-status-starting bg-status-starting/10",
    low: "text-status-running bg-status-running/10",
    unknown: "text-muted-foreground bg-muted",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            AI Crash Diagnostics
            {service && (
              <span className="text-xs font-normal text-muted-foreground ml-1">
                — {service.name}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto miror-scroll space-y-3">
          {/* Crash context */}
          {service && (
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="text-xs font-medium mb-1">Crash context</div>
              <div className="font-mono text-[10px] text-muted-foreground space-y-0.5">
                <div>Command: <span className="text-foreground/80">{service.command}</span></div>
                <div>Exit code: <span className="text-status-error">{service.exitCode ?? "—"}</span></div>
                <div>Logs analyzed: <span className="text-foreground/80">{Math.min(crashLogs.length, 30)} of {crashLogs.length}</span></div>
              </div>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Brain className="h-8 w-8 text-primary animate-pulse mb-3" />
              <p className="text-sm font-medium">Analyzing crash logs…</p>
              <p className="text-xs text-muted-foreground mt-1">
                The AI is reading {Math.min(crashLogs.length, 30)} log lines to diagnose the issue.
              </p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="rounded-md border border-status-error/30 bg-status-error/5 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-status-error mb-1">
                <AlertCircle className="h-3.5 w-3.5" />
                Diagnosis failed
              </div>
              <p className="text-[11px] text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" className="mt-2 h-7 gap-1 text-xs" onClick={fetchDiagnosis}>
                <RefreshCw className="h-3 w-3" /> Retry
              </Button>
            </div>
          )}

          {/* Diagnosis */}
          {diagnosis && !loading && (
            <>
              {/* Severity + category badges */}
              <div className="flex items-center gap-2">
                <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium capitalize", severityColor[diagnosis.severity])}>
                  {diagnosis.severity}
                </span>
                <Badge variant="outline" className="text-[10px] h-4 capitalize">
                  {diagnosis.category.replace(/-/g, " ")}
                </Badge>
              </div>

              {/* Diagnosis text */}
              <div className="rounded-md border border-border p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium mb-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-status-starting" />
                  What happened
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{diagnosis.diagnosis}</p>
              </div>

              {/* Likely cause */}
              {diagnosis.likely_cause && (
                <div className="rounded-md border border-status-starting/30 bg-status-starting/5 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium mb-1.5">
                    <Lightbulb className="h-3.5 w-3.5 text-status-starting" />
                    Likely cause
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed">{diagnosis.likely_cause}</p>
                </div>
              )}

              {/* Suggested fixes */}
              {diagnosis.suggested_fixes?.length > 0 && (
                <div className="rounded-md border border-border p-3">
                  <button
                    onClick={() => setExpandedFixes(!expandedFixes)}
                    className="flex items-center gap-1.5 text-xs font-medium mb-1.5 w-full"
                  >
                    {expandedFixes ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <Wrench className="h-3.5 w-3.5 text-status-running" />
                    Suggested fixes ({diagnosis.suggested_fixes.length})
                  </button>
                  {expandedFixes && (
                    <ol className="space-y-1.5 mt-2">
                      {diagnosis.suggested_fixes.map((fix, i) => (
                        <li key={i} className="flex gap-2 text-xs">
                          <span className="font-mono text-[10px] text-muted-foreground shrink-0 mt-0.5">{i + 1}.</span>
                          <span className="text-foreground/80 leading-relaxed">{fix}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </>
          )}

          {/* No logs */}
          {!loading && !error && !diagnosis && crashLogs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-xs text-muted-foreground">
              <Brain className="h-8 w-8 mb-2 opacity-40" />
              No crash logs available to analyze.
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-[10px] text-muted-foreground">
            Powered by AI — always verify suggestions before applying
          </span>
          <div className="flex gap-2">
            {diagnosis && !loading && (
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={fetchDiagnosis}>
                <RefreshCw className="h-3 w-3" /> Re-analyze
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
