/**
 * Determines whether the app is running in local (SQLite) or production (Postgres) mode.
 *
 * Resolution order:
 *  1. APP_MODE env var ("local" | "production") — explicit override.
 *  2. NODE_ENV === "production" → production mode.
 *  3. Default: local.
 */
export type AppMode = "local" | "production";

export function getAppMode(): AppMode {
  const explicit = process.env.APP_MODE?.trim().toLowerCase();
  if (explicit === "local" || explicit === "production") return explicit;
  return process.env.NODE_ENV === "production" ? "production" : "local";
}

export function isLocalAppMode(): boolean {
  return getAppMode() === "local";
}
