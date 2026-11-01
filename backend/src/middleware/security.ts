import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "../config.js";
import { AppError } from "../lib/errors.js";

export function securityHeaders() {
  return helmet({
    // The SPA is served in an iframe in preview environments and Swagger UI needs inline
    // assets. The API itself returns JSON only.
    contentSecurityPolicy: false,
    frameguard: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "no-referrer" },
  });
}

function isAllowedOrigin(origin: string, req?: Request): boolean {
  const allowed = new Set([
    config.frontendUrl,
    config.apiBaseUrl,
    "http://localhost:3000",
    "http://localhost:4000",
    "http://localhost:5173",
    ...(process.env.APP_URL ? [process.env.APP_URL.replace(/\/$/, "")] : []),
    ...(process.env.SHARED_APP_URL ? [process.env.SHARED_APP_URL.replace(/\/$/, "")] : []),
  ]);
  if (allowed.has(origin)) return true;
  try {
    const parsed = new URL(origin);
    if (parsed.hostname.endsWith(".run.app")) return true;
    if (req && req.get("host") && parsed.host === req.get("host")) return true;
  } catch {
    return false;
  }
  return false;
}

export function corsMiddleware() {
  return cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new AppError(403, "CORS_DENIED", "Origin is not allowed by CORS policy."));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Requested-With", "Authorization"],
  });
}

/**
 * Same-site cookies already block most cross-site form posts. This extra check
 * rejects state-changing requests whose Origin does not match the configured
 * frontend/API origin. Requests without an Origin header (server-to-server,
 * tests, curl) are allowed through and still require a valid session cookie.
 */
export function originCheck(req: Request, _res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.path.startsWith("/api/v1/paypal/webhook")) return next();
  const origin = req.get("origin");
  if (origin) {
    if (!isAllowedOrigin(origin, req)) {
      throw new AppError(403, "ORIGIN_MISMATCH", "Request origin does not match this application.");
    }
    return next();
  }

  const referer = req.get("referer");
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!isAllowedOrigin(refererOrigin, req)) {
        throw new AppError(403, "ORIGIN_MISMATCH", "Request referer origin does not match this application.");
      }
    } catch {
      throw new AppError(403, "ORIGIN_MISMATCH", "Invalid request referer header.");
    }
  }
  next();
}

export function globalRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => config.isTest,
    message: { error: { code: "RATE_LIMITED", message: "Too many requests. Try again shortly." } },
  });
}

export function authRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => config.isTest,
    message: {
      error: { code: "AUTH_RATE_LIMITED", message: "Too many authentication attempts. Try again in 15 minutes." },
    },
  });
}

export function paymentRateLimit() {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 40,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => config.isTest,
    message: { error: { code: "PAYMENT_RATE_LIMITED", message: "Too many payment requests. Try again shortly." } },
  });
}

export function requestSizeGuard(req: Request, _res: Response, next: NextFunction): void {
  const length = Number.parseInt(req.get("content-length") ?? "0", 10);
  if (Number.isFinite(length) && length > 1024 * 1024) {
    throw new AppError(413, "PAYLOAD_TOO_LARGE", "Request body must be 1 MB or smaller.");
  }
  next();
}
