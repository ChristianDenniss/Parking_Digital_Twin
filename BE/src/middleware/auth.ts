import { Request, Response, NextFunction } from "express";
import * as jwt from "jsonwebtoken";
import * as userService from "../modules/users/user.service";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  role: "staff" | "student" | "phd_candidate";
  resident: boolean;
  disabled: boolean;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Authorization required" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    const user = await userService.findById(payload.sub);
    if (!user) return res.status(401).json({ error: "User not found" });
    (req as Request & { user: AuthUser }).user = {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      role: user.role,
      resident: user.resident,
      disabled: user.disabled,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
