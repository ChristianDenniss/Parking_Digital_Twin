export type AppMode = "local" | "production";

/**
 * - APP_MODE=local  → SQLite only, permissive CORS (any browser origin).
 * - APP_MODE=production → Postgres if DATABASE_* set; CORS from CORS_ALLOWED_ORIGINS.
 * If APP_MODE is unset: production when NODE_ENV=production, otherwise local (npm run dev).
 */
export function getAppMode(): AppMode {
  const explicit = process.env.APP_MODE?.trim().toLowerCase();
  if (explicit === "local" || explicit === "production") return explicit;
  return process.env.NODE_ENV === "production" ? "production" : "local";
}

export function isLocalAppMode(): boolean {
  return getAppMode() === "local";
}
