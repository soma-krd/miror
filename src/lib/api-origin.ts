/** Shared URL helpers for sandbox, web dev, and Tauri desktop. */

import { backendConfig } from "./backend-config";

export const BACKEND_PORT = 3001;

export function isSandboxDev(): boolean {
  return typeof window !== "undefined" && window.location.port === "3000";
}

export function isTauriDesktop(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return !!w.__TAURI__ || !!w.__TAURI_INTERNALS__;
}

/** Gateway origin in sandbox (port 81). Empty in Tauri/desktop static export. */
export function getGatewayOrigin(): string {
  if (typeof window === "undefined") return "";
  if (isSandboxDev()) {
    return `${window.location.protocol}//${window.location.hostname}:81`;
  }
  return "";
}

/** Direct Rust backend origin. Uses the dynamic port from Tauri when available. */
export function getBackendOrigin(): string {
  if (isSandboxDev()) return getGatewayOrigin();
  const cfg = backendConfig();
  const port = cfg ? cfg.port : BACKEND_PORT;
  return `http://127.0.0.1:${port}`;
}

/** Append the auth token as a query param when it is present. */
function withToken(url: string): string {
  const cfg = backendConfig();
  if (!cfg?.token) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${cfg.token}`;
}

/**
 * Resolve an API path to a fetchable URL.
 * - Sandbox: gateway + XTransformPort query param (no token in dev)
 * - Tauri / static export: http://127.0.0.1:<port>/api/...?token=<token>
 * - Next.js dev (non-sandbox): relative /api/... (Next route handlers)
 */
export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;

  if (isSandboxDev()) {
    const origin = getGatewayOrigin();
    const sep = normalized.includes("?") ? "&" : "?";
    return `${origin}${normalized}${sep}XTransformPort=${BACKEND_PORT}`;
  }

  if (isTauriDesktop()) {
    const apiPath = normalized.startsWith("/api") ? normalized : `/api${normalized}`;
    return withToken(`${getBackendOrigin()}${apiPath}`);
  }

  return normalized;
}

export function wsUrl(): string {
  if (isSandboxDev()) {
    const origin = getGatewayOrigin().replace(/^http/, "ws");
    return `${origin}/ws?XTransformPort=${BACKEND_PORT}`;
  }
  const cfg = backendConfig();
  const port = cfg ? cfg.port : BACKEND_PORT;
  const token = cfg?.token ? `?token=${cfg.token}` : "";
  return `ws://127.0.0.1:${port}/ws${token}`;
}
