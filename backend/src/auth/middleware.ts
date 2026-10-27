import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { AppError } from "../lib/errors.js";
import { verifySessionToken } from "./service.js";

export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[config.sessionCookieName];
    if (!token) return next();

    const payload = verifySessionToken(String(token));
    if (!payload) return next();

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (user && user.isActive) {
      req.user = user;
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
  }
  next();
}

export function requireRole(...roles: string[]) {
  return function roleGuard(req: Request, _res: Response, next: NextFunction): void {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
    if (!roles.includes(req.user.role)) {
      throw new AppError(403, "FORBIDDEN", "Your role is not allowed to perform this action.");
    }
    next();
  };
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  requireRole("ADMIN")(req, _res, next);
}

export function isAdmin(req: Request): boolean {
  return req.user?.role === "ADMIN";
}
