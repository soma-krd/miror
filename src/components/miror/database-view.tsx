"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Database, Plus, X, Play, RefreshCw, Table, Trash2, ChevronDown, ChevronRight,
  Key, Save, AlertCircle, Terminal, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDbConnections, type DbConnection, type DatabaseType } from "@/store/db-connections-store";
import { backend } from "@/lib/backend-client";
import { cn } from "@/lib/utils";

// DatabaseView — a full-page database browser with tabbed connections.
// Supports SQLite, PostgreSQL, MySQL, and Redis.
// Each connection opens in a tab. Within a tab:
//   - SQL DBs: table list sidebar + SQL editor + results table
//   - Redis: key scanner + key viewer + command console

interface Tab {
  connectionId: string;
  // For SQL DBs
  selectedTable?: string;
  sql?: string;
  // For Redis
  keyFilter?: string;
}

export function DatabaseView() {
  const { connections, addConnection, deleteConnection } = useDbConnections();
  const [activeConnId, setActiveConnId] = useState<string | null>(null);
  const [tabData, setTabData] = useState<Record<string, Tab>>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteConnTarget, setDeleteConnTarget] = useState<string | null>(null);

  const openConnection = useCallback((conn: DbConnection) => {
    setActiveConnId(conn.id);
    if (!tabData[conn.id]) {
      setTabData(prev => ({
        ...prev,
        [conn.id]: {
          connectionId: conn.id,
          sql: conn.type === "redis" ? "" : "SELECT * FROM ",
          keyFilter: "*",
        },
      }));
    }
  }, [tabData]);

  const activeConn = connections.find(c => c.id === activeConnId);
  const activeTab = activeConnId ? tabData[activeConnId] : null;

  const setActiveTab = useCallback((patch: Partial<Tab>) => {
    if (!activeConnId) return;
    setTabData(prev => ({
      ...prev,
      [activeConnId]: { ...prev[activeConnId], ...patch },
    }));
  }, [activeConnId]);

  return (
    <div className="flex h-full">
      {/* Connection sidebar — same pattern as Git view project sidebar */}
      <div className="w-56 shrink-0 border-r border-border bg-card/30 flex flex-col">
        <div className="border-b border-border px-3 py-2 flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Connections
          </div>
          <Button
            variant="ghost" size="icon"
            className="h-5 w-5 text-muted-foreground/60 hover:text-foreground"
            onClick={() => setAddDialogOpen(true)}
            aria-label="Add connection"
          >
            <Plus className="h-3 w-3" strokeWidth={2} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto miror-scroll p-2">
          {connections.map(conn => {
            const active = activeConnId === conn.id;
            return (
              <div
                key={conn.id}
                className={cn(
                  "group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs mb-0.5 cursor-pointer",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50"
                )}
                onClick={() => openConnection(conn)}
              >
                <DbTypeIcon type={conn.type} />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{conn.name}</div>
                  <div className="font-mono text-[9px] text-muted-foreground/60 truncate">
                    {conn.type === "sqlite" ? conn.connectionString.split("/").pop() : conn.connectionString.slice(0, 30)}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConnTarget(conn.id); }}
                  className="opacity-0 group-hover:opacity-100 hover:text-status-error shrink-0"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
          {connections.length === 0 && (
            <div className="px-2 py-4 text-[10px] text-muted-foreground text-center">
              No connections yet.
              <br />
              <button
                onClick={() => setAddDialogOpen(true)}
                className="mt-1 text-primary hover:underline"
              >
                Add one →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Active connection content */}
      <div className="flex-1 overflow-hidden">
        {activeConn && activeTab ? (
          activeConn.type === "redis" ? (
            <RedisBrowser conn={activeConn} tab={activeTab} setTab={setActiveTab} />
          ) : (
            <SqlBrowser conn={activeConn} tab={activeTab} setTab={setActiveTab} />
          )
        ) : (
          <EmptyState onAdd={() => setAddDialogOpen(true)} />
        )}
      </div>

      {/* Add Connection dialog */}
      <AddConnectionDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdd={(conn) => {
          const id = addConnection(conn);
          const newConn = { ...conn, id, createdAt: Date.now() };
          openConnection(newConn);
          setAddDialogOpen(false);
        }}
      />

      {/* Delete connection confirm */}
      <AlertDialog open={!!deleteConnTarget} onOpenChange={(o) => !o && setDeleteConnTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete connection?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the saved connection. The database itself is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-status-error text-white hover:bg-status-error/90"
              onClick={() => {
                if (deleteConnTarget) {
                  deleteConnection(deleteConnTarget);
                  if (activeConnId === deleteConnTarget) setActiveConnId(null);
                }
                setDeleteConnTarget(null);
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

// --- SQL Browser (SQLite / PostgreSQL / MySQL) ---------------------------

interface SqlBrowserProps {
  conn: DbConnection;
  tab: Tab;
  setTab: (patch: Partial<Tab>) => void;
}

function SqlBrowser({ conn, tab, setTab }: SqlBrowserProps) {
  const [tables, setTables] = useState<Array<{ name: string; row_count: number; schema: string }>>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [result, setResult] = useState<{ columns: string[]; rows: any[][]; row_count: number; truncated: boolean } | null>(null);
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const [editValue, setEditValue] = useState("");

  const loadTables = async () => {
    setLoadingTables(true);
    setError(null);
    try {
      let info;
      if (conn.type === "sqlite") info = await backend.sqliteInfo(conn.connectionString);
      else if (conn.type === "postgres") info = await backend.postgresInfo(conn.connectionString);
      else if (conn.type === "mysql") info = await backend.mysqlInfo(conn.connectionString);
      else throw new Error(`Unsupported type: ${conn.type}`);
      setTables(info.tables ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTables([]);
    } finally {
      setLoadingTables(false);
    }
  };

  const runQuery = async (sqlText?: string) => {
    const sqlToRun = sqlText ?? tab.sql;
    if (!sqlToRun?.trim()) return;
    setLoadingQuery(true);
    setError(null);
    try {
      let res;
      if (conn.type === "sqlite") res = await backend.sqliteQuery(conn.connectionString, sqlToRun);
      else if (conn.type === "postgres") res = await backend.postgresQuery(conn.connectionString, sqlToRun);
      else if (conn.type === "mysql") res = await backend.mysqlQuery(conn.connectionString, sqlToRun);
      else throw new Error(`Unsupported: ${conn.type}`);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoadingQuery(false);
    }
  };

  useEffect(() => {
    loadTables();
  }, [conn.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectTable = (table: string) => {
    setTab({ selectedTable: table, sql: `SELECT * FROM "${table}" LIMIT 50` });
    runQuery(`SELECT * FROM "${table}" LIMIT 50`);
  };

  const startEdit = (rowIdx: number, colIdx: number) => {
    if (!result) return;
    const value = result.rows[rowIdx]?.[colIdx];
    setEditValue(value === null ? "" : String(value));
    setEditingCell({ rowIdx, colIdx });
  };

  const saveEdit = async () => {
    if (!editingCell || !result || !tab.selectedTable) return;
    const { rowIdx, colIdx } = editingCell;
    const column = result.columns[colIdx];
    const row = result.rows[rowIdx];

    // Find the primary key column — assume first column is the id
    // For a real implementation, we'd query the schema for PK
    const pkColumn = result.columns[0];
    const pkValue = row[0];

    const sql = `UPDATE "${tab.selectedTable}" SET "${column}" = '${editValue.replace(/'/g, "''")}' WHERE "${pkColumn}" = '${pkValue}'`;
    try {
      if (conn.type === "sqlite") await backend.sqliteQuery(conn.connectionString, sql);
      else if (conn.type === "postgres") await backend.postgresQuery(conn.connectionString, sql);
      else if (conn.type === "mysql") await backend.mysqlQuery(conn.connectionString, sql);
      // Re-run the original query to refresh
      runQuery();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setEditingCell(null);
  };

  return (
    <div className="flex h-full">
      {/* Tables sidebar */}
      <div className="w-56 shrink-0 border-r border-border overflow-y-auto miror-scroll">
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Tables ({tables.length})
          </span>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={loadTables} disabled={loadingTables}>
            <RefreshCw className={cn("h-3 w-3", loadingTables && "animate-spin")} />
          </Button>
        </div>
        {tables.map(t => (
          <button
            key={t.name}
            onClick={() => selectTable(t.name)}
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-left",
              tab.selectedTable === t.name ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
            )}
          >
            <Table className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="flex-1 truncate">{t.name}</span>
            <span className="font-mono text-[9px] text-muted-foreground">{t.row_count}</span>
          </button>
        ))}
        {tables.length === 0 && !loadingTables && (
          <div className="px-2 py-4 text-[10px] text-muted-foreground text-center">No tables</div>
        )}
      </div>

      {/* Query + results */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* SQL editor */}
        <div className="border-b border-border p-2">
          <textarea
            value={tab.sql ?? ""}
            onChange={e => setTab({ sql: e.target.value })}
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
            <span className="text-[10px] text-muted-foreground">Ctrl+Enter to run</span>
            <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => runQuery()} disabled={loadingQuery}>
              <Play className="h-3 w-3" /> {loadingQuery ? "Running…" : "Run"}
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="m-2 rounded-md border border-status-error/30 bg-status-error/5 p-2 text-xs text-status-error flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="flex-1 font-mono">{error}</span>
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-auto miror-scroll">
          {result && result.rows.length > 0 ? (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card border-b border-border z-10">
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
                      <td
                        key={j}
                        className="px-2 py-1 font-mono text-[11px] border-r border-border/30 last:border-0 max-w-xs truncate cursor-text"
                        onClick={() => tab.selectedTable && startEdit(i, j)}
                        title={cell === null ? "null" : String(cell)}
                      >
                        {editingCell?.rowIdx === i && editingCell?.colIdx === j ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={saveEdit}
                            onKeyDown={e => {
                              if (e.key === "Enter") saveEdit();
                              if (e.key === "Escape") setEditingCell(null);
                            }}
                            className="w-full bg-background border border-primary rounded px-1 py-0 text-[11px] outline-none"
                          />
                        ) : cell === null ? (
                          <span className="text-muted-foreground/50 italic">null</span>
                        ) : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : result ? (
            <div className="flex flex-col items-center justify-center h-full text-xs text-muted-foreground py-8">
              <Table className="h-6 w-6 mb-2 opacity-40" />
              Query returned 0 rows
            </div>
          ) : null}
          {result?.truncated && (
            <div className="px-3 py-1.5 text-[10px] text-status-starting bg-status-starting/5 border-t border-border">
              Results truncated to 500 rows
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="flex h-6 items-center justify-between border-t border-border bg-card/30 px-3 text-[10px] text-muted-foreground font-mono">
          <span>{result?.row_count ?? 0} rows · {conn.type} · {conn.connectionString.slice(0, 50)}</span>
          {tab.selectedTable && <span className="text-status-running">Click a cell to edit</span>}
        </div>
      </div>
    </div>
  );
}

// --- Redis Browser --------------------------------------------------------

function RedisBrowser({ conn, tab, setTab }: SqlBrowserProps) {
  const [keys, setKeys] = useState<Array<{ key: string; key_type: string; size: number; ttl: number }>>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [keyData, setKeyData] = useState<{ key: string; type: string; value: any } | null>(null);
  const [command, setCommand] = useState("");
  const [commandOutput, setCommandOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editingKeyValue, setEditingKeyValue] = useState(false);

  const scanKeys = async () => {
    setLoadingKeys(true);
    setError(null);
    try {
      const result = await backend.redisScan(conn.connectionString, tab.keyFilter ?? "*");
      setKeys(result.keys ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setKeys([]);
    } finally {
      setLoadingKeys(false);
    }
  };

  const viewKey = async (key: string) => {
    setSelectedKey(key);
    setError(null);
    try {
      const data = await backend.redisGetKey(conn.connectionString, key);
      setKeyData(data);
      if (data.type === "string") setEditValue(String(data.value));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteKey = async (key: string) => {
    try {
      await backend.redisDeleteKey(conn.connectionString, key);
      if (selectedKey === key) {
        setSelectedKey(null);
        setKeyData(null);
      }
      scanKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const saveKeyValue = async () => {
    if (!selectedKey) return;
    try {
      await backend.redisSetKey(conn.connectionString, selectedKey, editValue);
      setEditingKeyValue(false);
      viewKey(selectedKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const runCommand = async () => {
    if (!command.trim()) return;
    setError(null);
    try {
      const result = await backend.redisExecute(conn.connectionString, command);
      setCommandOutput(result.output);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    scanKeys();
  }, [conn.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full">
      {/* Keys sidebar */}
      <div className="w-72 shrink-0 border-r border-border flex flex-col">
        <div className="flex items-center gap-1 p-2 border-b border-border">
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          <Input
            value={tab.keyFilter ?? "*"}
            onChange={e => setTab({ keyFilter: e.target.value })}
            placeholder="* pattern"
            className="h-7 font-mono text-xs"
            onKeyDown={e => e.key === "Enter" && scanKeys()}
          />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={scanKeys} disabled={loadingKeys}>
            <RefreshCw className={cn("h-3 w-3", loadingKeys && "animate-spin")} />
          </Button>
        </div>
        <div className="px-2 py-1 text-[10px] text-muted-foreground border-b border-border">
          {keys.length} keys
        </div>
        <div className="flex-1 overflow-y-auto miror-scroll">
          {keys.map(k => (
            <div
              key={k.key}
              className={cn(
                "group flex items-center gap-2 rounded px-2 py-1.5 text-xs cursor-pointer",
                selectedKey === k.key ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
              )}
              onClick={() => viewKey(k.key)}
            >
              <Key className="h-3 w-3 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="truncate font-mono text-[10px]">{k.key}</div>
                <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                  <span className="text-status-running">{k.key_type}</span>
                  <span>size: {k.size}</span>
                  {k.ttl >= 0 && <span className="text-status-starting">ttl: {k.ttl}s</span>}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteKey(k.key); }}
                className="opacity-0 group-hover:opacity-100 hover:text-status-error"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          {keys.length === 0 && !loadingKeys && (
            <div className="px-2 py-4 text-[10px] text-muted-foreground text-center">No keys</div>
          )}
        </div>
      </div>

      {/* Key viewer + command console */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Error */}
        {error && (
          <div className="m-2 rounded-md border border-status-error/30 bg-status-error/5 p-2 text-xs text-status-error flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="flex-1 font-mono">{error}</span>
          </div>
        )}

        {/* Key value viewer */}
        {keyData ? (
          <div className="border-b border-border p-3">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-status-running border-status-running/30 text-[10px] h-4">
                {keyData.type}
              </Badge>
              <span className="font-mono text-xs flex-1 truncate">{keyData.key}</span>
              {keyData.type === "string" && !editingKeyValue && (
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setEditingKeyValue(true)}>
                  <Save className="h-3 w-3" /> Edit
                </Button>
              )}
            </div>
            {keyData.type === "string" ? (
              editingKeyValue ? (
                <div>
                  <textarea
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    className="w-full h-24 rounded-md border border-primary bg-background px-2 py-1 font-mono text-xs resize-none"
                    autoFocus
                  />
                  <div className="flex gap-2 mt-1">
                    <Button size="sm" className="h-7 text-xs" onClick={saveKeyValue}>Save</Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingKeyValue(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <pre className="rounded-md bg-muted/40 p-2 font-mono text-xs overflow-auto max-h-48">
                  {String(keyData.value)}
                </pre>
              )
            ) : (
              <pre className="rounded-md bg-muted/40 p-2 font-mono text-xs overflow-auto max-h-48">
                {JSON.stringify(keyData.value, null, 2)}
              </pre>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 text-xs text-muted-foreground">
            <Key className="h-8 w-8 mb-2 opacity-40" />
            Select a key to view its value
          </div>
        )}

        {/* Command console */}
        <div className="border-t border-border p-2 bg-card/30">
          <div className="flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              value={command}
              onChange={e => setCommand(e.target.value)}
              placeholder="redis command, e.g. KEYS *"
              className="flex-1 bg-transparent font-mono text-xs outline-none"
              onKeyDown={e => e.key === "Enter" && runCommand()}
            />
            <Button size="sm" className="h-7 gap-1 text-xs" onClick={runCommand}>
              <Play className="h-3 w-3" /> Run
            </Button>
          </div>
          {commandOutput && (
            <pre className="mt-2 rounded-md bg-muted/40 p-2 font-mono text-[11px] overflow-auto max-h-32">
              {commandOutput}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Add Connection Dialog ------------------------------------------------

function AddConnectionDialog({
  open, onOpenChange, onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (conn: Omit<DbConnection, "id" | "createdAt">) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<DatabaseType>("postgres");
  const [connectionString, setConnectionString] = useState("");
  const [error, setError] = useState<string | null>(null);

  const placeholders: Record<DatabaseType, string> = {
    sqlite: "/path/to/database.sqlite",
    postgres: "postgresql://user:pass@localhost:5432/mydb",
    mysql: "mysql://user:pass@localhost:3306/mydb",
    redis: "redis://localhost:6379",
  };

  const handleSubmit = () => {
    if (!name.trim() || !connectionString.trim()) {
      setError("Name and connection string are required");
      return;
    }
    onAdd({ name: name.trim(), type, connectionString: connectionString.trim() });
    setName("");
    setConnectionString("");
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Database Connection
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="My Production DB" />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as DatabaseType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="postgres">PostgreSQL</SelectItem>
                <SelectItem value="mysql">MySQL</SelectItem>
                <SelectItem value="sqlite">SQLite</SelectItem>
                <SelectItem value="redis">Redis</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Connection String / Path</Label>
            <Input
              value={connectionString}
              onChange={e => setConnectionString(e.target.value)}
              placeholder={placeholders[type]}
              className="font-mono text-xs"
            />
          </div>
          {error && <p className="text-xs text-status-error">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>Add Connection</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Helpers --------------------------------------------------------------

function DbTypeIcon({ type }: { type: DatabaseType }) {
  const icons: Record<DatabaseType, string> = {
    postgres: "🐘",
    mysql: "🐬",
    sqlite: "📦",
    redis: "⚡",
  };
  return <span className="text-sm">{icons[type]}</span>;
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground mb-4">
        <Database className="h-8 w-8" />
      </div>
      <h3 className="text-lg font-medium">Database Browser</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-md">
        Connect to PostgreSQL, MySQL, SQLite, or Redis databases.
        Browse tables, run queries, edit fields, and manage Redis keys — all in one place.
      </p>
      <Button className="mt-4 gap-1.5" onClick={onAdd}>
        <Plus className="h-4 w-4" /> Add Connection
      </Button>
    </div>
  );
}
