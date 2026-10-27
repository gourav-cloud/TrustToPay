import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class PayPalError extends AppError {
  retryable: boolean;
  providerStatus?: number;
  providerCode?: string;

  constructor(args: {
    status?: number;
    code: string;
    message: string;
    retryable?: boolean;
    providerStatus?: number;
    providerCode?: string;
  }) {
    super(args.status ?? 502, args.code, args.message);
    this.retryable = args.retryable ?? false;
    this.providerStatus = args.providerStatus;
    this.providerCode = args.providerCode;
  }
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return function wrapped(req: Request, res: Response, next: NextFunction) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } });
}

/** Consistent error envelope. Provider secrets and raw headers are never returned. */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    if (err.status >= 500) {
      console.error(`[error] ${req.method} ${req.path} -> ${err.code}: ${err.message}`);
    }
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "The request payload is invalid.",
        details: err.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      error: { code: "INVALID_JSON", message: "Request body is not valid JSON." },
    });
    return;
  }

  console.error(`[error] ${req.method} ${req.path} -> unhandled`, err);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected server error occurred. No payment was marked successful.",
    },
  });
}

export function assert(condition: unknown, message: string, status = 400, code = "BAD_REQUEST"): asserts condition {
  if (!condition) throw new AppError(status, code, message);
}
