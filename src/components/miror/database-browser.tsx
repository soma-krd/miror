"use client";

import { useEffect, useState } from "react";
import {
  Database, Table, Play, RefreshCw, ChevronDown, ChevronRight, X, FileText,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { backend } from "@/lib/backend-client";
import { cn } from "@/lib/utils";

// Database Browser — connect to SQLite/PostgreSQL databases running in your
// services. Browse tables, view row counts, run SQL queries inline.
// For SQLite: pass a file path. For PostgreSQL: pass a connection string.

interface DatabaseBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPath?: string;  // e.g., the Miror DB path or a service's DB
}

interface TableInfo {
  name: string;
  row_count: number;
  schema: string;
}

interface QueryResult {
  columns: string[];
  rows: any[][];
  row_count: number;
  truncated: boolean;
}

export function DatabaseBrowser({ open, onOpenChange, defaultPath }: DatabaseBrowserProps) {
  const [dbPath, setDbPath] = useState(defaultPath ?? "/home/z/my-project/.miror/miror.db");
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [sql, setSql] = useState("SELECT * FROM projects LIMIT 10");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTables, setExpandedTables] = useState(true);

  const loadTables = async () => {
    if (!dbPath) return;
    setLoadingTables(true);
    setError(null);
    try {
      // Try SQLite first (file path)
      const res = await fetch(
        `${getGatewayOrigin()}/api/database/sqlite/info?path=${encodeURIComponent(dbPath)}&XTransformPort=3001`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTables(data.tables ?? []);
      if (data.tables?.length > 0 && !selectedTable) {
        setSelectedTable(data.tables[0].name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTables([]);
    } finally {
      setLoadingTables(false);
    }
  };

  const runQuery = async () => {
    if (!sql.trim()) return;
    setLoadingQuery(true);
    setError(null);
    try {
      const res = await fetch(`${getGatewayOrigin()}/api/database/sqlite/query?XTransformPort=3001`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: dbPath, sql }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoadingQuery(false);
    }
  };

  const selectTable = (table: string) => {
    setSelectedTable(table);
    setSql(`SELECT * FROM "${table}" LIMIT 50`);
    runQueryWith(`SELECT * FROM "${table}" LIMIT 50`);
  };

  const runQueryWith = async (sqlText: string) => {
    setLoadingQuery(true);
    setError(null);
    try {
      const res = await fetch(`${getGatewayOrigin()}/api/database/sqlite/query?XTransformPort=3001`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: dbPath, sql: sqlText }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoadingQuery(false);
    }
  };

  useEffect(() => {
    if (open && tables.length === 0) loadTables();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            Database Browser
          </DialogTitle>
        </DialogHeader>

        {/* Connection bar */}
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <Input
            value={dbPath}
            onChange={e => setDbPath(e.target.value)}
            placeholder="/path/to/database.sqlite or postgresql://user:pass@host/db"
            className="h-8 font-mono text-xs flex-1"
            onKeyDown={e => e.key === "Enter" && loadTables()}
          />
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={loadTables} disabled={loadingTables}>
            <RefreshCw className={cn("h-3 w-3", loadingTables && "animate-spin")} /> Connect
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md border border-status-error/30 bg-status-error/5 p-2 text-xs text-status-error">
            {error}
          </div>
        )}

        {/* Main layout: sidebar + query panel */}
        <div className="flex flex-1 min-h-0 gap-2">
          {/* Tables sidebar */}
          <div className="w-56 shrink-0 border-r border-border overflow-y-auto miror-scroll">
            <div className="flex items-center justify-between px-2 py-1.5">
              <button
                onClick={() => setExpandedTables(!expandedTables)}
                className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {expandedTables ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Tables ({tables.length})
              </button>
            </div>
            {expandedTables && tables.map(t => (
              <button
                key={t.name}
                onClick={() => selectTable(t.name)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-left",
                  selectedTable === t.name ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
                )}
              >
                <Table className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{t.name}</span>
                <span className="font-mono text-[9px] text-muted-foreground">{t.row_count}</span>
              </button>
            ))}
            {tables.length === 0 && !loadingTables && (
              <div className="px-2 py-4 text-[10px] text-muted-foreground text-center">
                No tables. Connect to a database.
              </div>
            )}
          </div>

          {/* Query panel */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* SQL editor */}
            <div className="border-b border-border pb-2">
              <textarea
                value={sql}
                onChange={e => setSql(e.target.value)}
                placeholder="SELECT * FROM ..."
                className="w-full h-20 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs resize-none focus:outline-none focus:border-primary"
                onKeyDown={e => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    runQuery();
                  }
                }}
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">
                  Ctrl+Enter to run · {result?.row_count ?? 0} rows
                </span>
                <Button size="sm" className="h-7 gap-1 text-xs" onClick={runQuery} disabled={loadingQuery}>
                  <Play className="h-3 w-3" /> {loadingQuery ? "Running…" : "Run"}
                </Button>
              </div>
            </div>

            {/* Results table */}
            <div className="flex-1 overflow-auto miror-scroll">
              {result && result.rows.length > 0 ? (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card border-b border-border">
                    <tr>
                      {result.columns.map((col, i) => (
                        <th key={i} className="text-left px-2 py-1.5 font-mono text-[10px] font-medium text-muted-foreground border-r border-border last:border-0">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                        {row.map((cell, j) => (
                          <td key={j} className="px-2 py-1 font-mono text-[11px] border-r border-border/30 last:border-0 max-w-xs truncate">
                            {cell === null ? <span className="text-muted-foreground/50 italic">null</span> : String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : result ? (
                <div className="flex flex-col items-center justify-center h-full text-xs text-muted-foreground py-8">
                  <FileText className="h-6 w-6 mb-2 opacity-40" />
                  Query returned 0 rows
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-xs text-muted-foreground py-8">
                  <Database className="h-6 w-6 mb-2 opacity-40" />
                  Run a query to see results
                </div>
              )}
              {result?.truncated && (
                <div className="px-3 py-1.5 text-[10px] text-status-starting bg-status-starting/5 border-t border-border">
                  Results truncated to 500 rows
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getGatewayOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.port === "3000"
    ? `${window.location.protocol}//${window.location.hostname}:81`
    : "";
}
