import { Request, Response, NextFunction } from "express";
import { cacheService, CacheOptions } from "../utils/cache";

export interface CacheMiddlewareOptions extends CacheOptions {
  key?: string | ((req: Request) => string);
  condition?: (req: Request) => boolean;
}

function generateCacheKey(req: Request): string {
  const { method, path } = req;
  const query = req.query ?? {};
  const queryString =
    Object.keys(query).length > 0
      ? "?" + new URLSearchParams(query as Record<string, string>).toString()
      : "";
  return `${method}:${path}${queryString}`;
}

export function cacheMiddleware(options: CacheMiddlewareOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.method !== "GET") {
      return next();
    }

    if (options.condition && !options.condition(req)) {
      return next();
    }

    const cacheKey =
      typeof options.key === "function" ? options.key(req) : options.key || generateCacheKey(req);

    try {
      const cached = await cacheService.get(cacheKey, options.prefix);
      if (cached) {
        res.json(cached);
        return;
      }

      const originalSend = res.send.bind(res);
      res.send = (data: any) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const jsonData = typeof data === "string" ? JSON.parse(data) : data;
            cacheService.set(cacheKey, jsonData, options).catch((err) => {
              console.error("Failed to cache response:", err);
            });
          } catch (error) {
            console.error("Failed to cache response:", error);
          }
        }
        return originalSend(data);
      };

      next();
    } catch (error) {
      console.error("Cache middleware error:", error);
      next();
    }
  };
}

export function invalidateCacheMiddleware(entityType: string) {
  return async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    const originalSend = res.send.bind(res);

    res.send = (data: any) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cacheService.invalidateEntity(entityType).catch((error) => {
          console.error(`Failed to invalidate cache for ${entityType}:`, error);
        });
      }
      return originalSend(data);
    };

    next();
  };
}

export async function invalidateCache(entityType: string): Promise<void> {
  await cacheService.invalidateEntity(entityType);
}

export async function cacheHealthCheck(req: Request, res: Response): Promise<void> {
  try {
    const isHealthy = await cacheService.healthCheck();
    const stats = await cacheService.getStats();
    res.json({
      healthy: isHealthy,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      healthy: false,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
}

