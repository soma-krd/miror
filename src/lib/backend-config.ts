/**
 * Backend configuration loader.
 *
 * In the packaged Tauri desktop app, Tauri picks a random loopback port and
 * generates a one-time auth token at launch. The Rust shell stores them in
 * managed state; this module fetches them once via the `get_backend_config`
 * invoke command and caches the result for the lifetime of the page.
 *
 * In sandbox/web-dev mode, Tauri is not present so config stays null and
 * api-origin.ts falls back to the gateway/dev-server paths (no auth).
 */

export interface BackendConfig {
  port: number;
  token: string;
}

let _cached: BackendConfig | null = null;
let _loading: Promise<BackendConfig | null> | null = null;

/**
 * Load (or return cached) backend config from Tauri.
 * Safe to call multiple times — subsequent calls share the in-flight promise.
 */
export async function loadBackendConfig(): Promise<BackendConfig | null> {
  if (_cached) return _cached;
  if (_loading) return _loading;

  _loading = (async () => {
    if (typeof window === "undefined") return null;

    const w = window as Window & {
      __TAURI__?: { core?: { invoke?: (cmd: string) => Promise<unknown> } };
      __TAURI_INTERNALS__?: unknown;
    };

    const invoke = w.__TAURI__?.core?.invoke;
    if (!invoke) return null;

    try {
      const cfg = await invoke("get_backend_config");
      if (cfg && typeof cfg === "object") {
        const { port, token } = cfg as { port: number; token: string };
        if (typeof port === "number" && typeof token === "string") {
          _cached = { port, token };
          return _cached;
        }
      }
    } catch (e) {
      console.warn("[miror] get_backend_config failed:", e);
    }
    return null;
  })();

  return _loading;
}

/** Synchronous getter — returns the cached config or null if not yet loaded. */
export function backendConfig(): BackendConfig | null {
  return _cached;
}
