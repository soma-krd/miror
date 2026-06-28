"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Folder, Server, FileText, ArrowRight, CornerDownLeft,
} from "lucide-react";
import { useMiror } from "@/store/miror-store";
import type { Project, Service } from "@/lib/types";
import { StatusDot } from "./status-badge";
import { cn } from "@/lib/utils";

// A search result — either a project, a service, or a "view log" action.
type SearchResult =
  | { type: "project"; item: Project }
  | { type: "service"; item: Service; projectName: string }
  | { type: "action"; label: string; view: "dashboard" | "projects" | "logs" | "settings" };

interface GlobalSearchProps {
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
}

export function GlobalSearch({ query, onQueryChange, onClose }: GlobalSearchProps) {
  const { projects, services, setActiveProject, setActiveService, setView } = useMiror();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus the input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Build the results list — fuse projects, services, and quick actions
  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    const out: SearchResult[] = [];

    // Always include quick actions when query is empty or matches
    const actions: SearchResult[] = [
      { type: "action", label: "Go to Dashboard", view: "dashboard" },
      { type: "action", label: "Go to Projects", view: "projects" },
      { type: "action", label: "Go to Logs", view: "logs" },
      { type: "action", label: "Go to Settings", view: "settings" },
    ];
    if (!q) {
      out.push(...actions);
    } else {
      const matchingActions = actions.filter(a => a.label.toLowerCase().includes(q));
      out.push(...matchingActions);
    }

    if (q) {
      // Matching projects
      for (const p of projects) {
        if (
          p.name.toLowerCase().includes(q) ||
          p.rootPath.toLowerCase().includes(q)
        ) {
          out.push({ type: "project", item: p });
        }
      }
      // Matching services
      for (const s of services) {
        if (
          s.name.toLowerCase().includes(q) ||
          s.command.toLowerCase().includes(q) ||
          (s.port?.toString() ?? "").includes(q)
        ) {
          const project = projects.find(p => p.id === s.projectId);
          out.push({
            type: "service",
            item: s,
            projectName: project?.name ?? "—",
          });
        }
      }
    }

    return out.slice(0, 12); // cap at 12 for performance
  }, [query, projects, services]);

  // Clamp selectedIndex to valid range — derived during render, no effect needed.
  // When the results list shrinks (e.g. user types more), we may need to reset.
  const effectiveSelectedIndex = Math.min(selectedIndex, Math.max(0, results.length - 1));

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const result = results[effectiveSelectedIndex];
      if (result) {
        activateResult(result);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onQueryChange("");
      onClose();
    }
  };

  const activateResult = (result: SearchResult) => {
    switch (result.type) {
      case "project":
        setActiveProject(result.item.id);
        setView("projects");
        break;
      case "service":
        setActiveProject(result.item.projectId);
        setActiveService(result.item.id);
        setView("logs");
        break;
      case "action":
        setView(result.view);
        if (result.view === "projects") {
          setActiveProject(null);
        }
        break;
    }
    onQueryChange("");
    onClose();
  };

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${effectiveSelectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [effectiveSelectedIndex]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Search panel */}
      <div
        className="relative w-full max-w-xl rounded-xl border border-border bg-card shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search projects, services, commands…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="font-mono text-[10px] rounded border border-border bg-muted px-1.5 py-0.5 text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto miror-scroll p-2">
          {results.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              No results for "{query}"
            </div>
          ) : (
            results.map((result, idx) => (
              <button
                key={idx}
                data-idx={idx}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => activateResult(result)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  idx === effectiveSelectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
                )}
              >
                <ResultIcon result={result} />
                <div className="flex-1 min-w-0">
                  <ResultLabel result={result} />
                </div>
                {idx === effectiveSelectedIndex && (
                  <CornerDownLeft className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="font-mono rounded border border-border bg-muted px-1">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="font-mono rounded border border-border bg-muted px-1">↵</kbd>
              open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="font-mono rounded border border-border bg-muted px-1">esc</kbd>
              close
            </span>
          </div>
          <span className="font-mono">{results.length} results</span>
        </div>
      </div>
    </div>
  );
}

function ResultIcon({ result }: { result: SearchResult }) {
  if (result.type === "project") {
    return <Folder className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
  if (result.type === "service") {
    return <StatusDot status={result.item.status} className="shrink-0" />;
  }
  return <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />;
}

function ResultLabel({ result }: { result: SearchResult }) {
  if (result.type === "project") {
    return (
      <div className="flex items-center gap-2">
        <span>{result.item.icon}</span>
        <span className="font-medium truncate">{result.item.name}</span>
        <span className="font-mono text-[10px] text-muted-foreground truncate">
          {result.item.rootPath}
        </span>
      </div>
    );
  }
  if (result.type === "service") {
    return (
      <div className="flex items-center gap-2">
        <span className="font-medium truncate">{result.item.name}</span>
        {result.item.port && (
          <span className="font-mono text-[10px] text-muted-foreground">:{result.item.port}</span>
        )}
        <span className="text-[10px] text-muted-foreground">·</span>
        <span className="text-xs text-muted-foreground">{result.projectName}</span>
        <span className="text-[10px] text-muted-foreground/70 truncate font-mono">
          $ {result.item.command}
        </span>
      </div>
    );
  }
  // action
  return <span className="font-medium">{result.label}</span>;
}
