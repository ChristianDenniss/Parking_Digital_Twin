import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

/** Express 4: forward rejected promises from async route handlers to `errorHandler`. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Simple request logger you can extend later
export function requestLogger(req: Request, _res: Response, next: NextFunction) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
}

/** Logs request (query, params) and response status + duration. Use globally so earth-engine and all routes are covered. */
export function loggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const q = req.query ?? {};
  const p = req.params ?? {};
  const hasQuery = Object.keys(q).length > 0;
  const hasParams = Object.keys(p).length > 0;
  if (hasQuery || hasParams) {
    console.log("[logging] request:", {
      method: req.method,
      path: req.originalUrl,
      ...(hasParams && { params: req.params }),
      ...(hasQuery && { query: req.query }),
    });
  }
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log("[logging] response:", {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
    });
  });
  next();
}

export function notFound(req: Request, res: Response, _next: NextFunction) {
  res.status(404).json({ error: "Not found", path: req.originalUrl });
}

// Optional mapping by error class name (for future custom errors)
const errorCodeMapping: Record<string, number> = {
  UnauthorizedError: 401,
  NotFoundError: 404,
  BadRequestError: 400,
  ConflictError: 409,
};

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  // Detailed logging similar to your example
  console.error(`Error occurred during ${req.method} ${req.originalUrl}`);
  console.error("Request Body:", req.body);
  console.error("Request Params:", req.params);
  console.error("Request Query:", req.query);
  console.error(err);

  // Allow throwing HttpError anywhere to control status/message
  if (err instanceof HttpError) {
    const payload: Record<string, unknown> = { error: err.message };
    if (err.details !== undefined) {
      payload.details = err.details;
    }
    return res.status(err.status).json(payload);
  }

  // Invalid JSON body (from express.json())
  if (err instanceof SyntaxError && (err as any).body) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  // Zod validation errors if any route uses schema.parse / throws
  if (err instanceof ZodError) {
    const errors = err.issues.map(
      (issue) => (issue.path.length ? issue.path.join(".") + ": " : "") + issue.message
    );
    return res.status(400).json({ error: errors.join("; ") });
  }

  // Map specific custom error classes by name if you add them later
  const mappedStatus = errorCodeMapping[err.constructor.name];
  if (mappedStatus) {
    return res.status(mappedStatus).json({
      error: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }

  // Fallback
  const dev = process.env.NODE_ENV !== "production";
  res.status(500).json({
    error: dev ? err.message || "Internal server error" : "Internal server error",
    ...(dev && err.stack ? { stack: err.stack } : {}),
  });
}
