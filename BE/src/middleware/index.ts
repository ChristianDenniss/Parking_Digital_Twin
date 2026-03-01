import { Request, Response, NextFunction } from "express";

export function notFound(req: Request, res: Response, _next: NextFunction) {
  res.status(404).json({ error: "Not found", path: req.originalUrl });
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
