const trimmedRemote = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

/**
 * Returns the API base URL to prepend to all fetch paths.
 * - In production: always uses VITE_API_URL (the deployed backend origin).
 * - In dev with VITE_DEV_REMOTE_API=true: also uses VITE_API_URL (point at a remote dev server).
 * - In dev otherwise: returns "" so requests go to the Vite dev-server proxy (same origin).
 */
export function getApiBase(): string {
  if (import.meta.env.PROD) return trimmedRemote;
  if (import.meta.env.VITE_DEV_REMOTE_API === "true") return trimmedRemote;
  return "";
}
