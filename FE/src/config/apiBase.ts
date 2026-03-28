const trimmedRemote = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

/**
 * In dev, use same-origin `/api/...` so Vite proxies to the local BE (no CORS).
 * Set VITE_DEV_REMOTE_API=true to use VITE_API_URL from dev (e.g. hit Fly/staging).
 * Production builds always use VITE_API_URL (your deployed API).
 */
export function getApiBase(): string {
  if (import.meta.env.PROD) return trimmedRemote;
  if (import.meta.env.VITE_DEV_REMOTE_API === "true") return trimmedRemote;
  return "";
}
