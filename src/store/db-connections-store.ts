"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// Saved database connections — persisted to localStorage.
// Each connection has a name, type, and connection string/path.

export type DatabaseType = "sqlite" | "postgres" | "mysql" | "redis";

export interface DbConnection {
  id: string;
  name: string;
  type: DatabaseType;
  // For sqlite: file path. For postgres/mysql: connection URL. For redis: redis:// URL.
  connectionString: string;
  createdAt: number;
}

interface DbConnectionsState {
  connections: DbConnection[];
  addConnection: (conn: Omit<DbConnection, "id" | "createdAt">) => string;
  updateConnection: (id: string, patch: Partial<DbConnection>) => void;
  deleteConnection: (id: string) => void;
}

export const useDbConnections = create<DbConnectionsState>()(
  persist(
    (set) => ({
      connections: [
        // Seed with Mir's own SQLite DB
        {
          id: "conn_mir_db",
          name: "Mir Internal DB",
          type: "sqlite" as DatabaseType,
          connectionString: "/home/z/my-project/.mir/mir.db",
          createdAt: Date.now(),
        },
      ],
      addConnection: (conn) => {
        const id = `conn_${Date.now().toString(36)}`;
        const newConn: DbConnection = { ...conn, id, createdAt: Date.now() };
        set((s) => ({ connections: [...s.connections, newConn] }));
        return id;
      },
      updateConnection: (id, patch) =>
        set((s) => ({
          connections: s.connections.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      deleteConnection: (id) =>
        set((s) => ({ connections: s.connections.filter((c) => c.id !== id) })),
    }),
    {
      name: "mir-db-connections",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);
