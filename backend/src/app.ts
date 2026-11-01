import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { prisma } from "./db.js";
import { config, configIssues } from "./config.js";
import { corsMiddleware, globalRateLimit, originCheck, requestSizeGuard, securityHeaders } from "./middleware/security.js";
import { attachUser } from "./auth/middleware.js";
import { errorHandler, notFound } from "./lib/errors.js";
import authRoutes from "./routes/auth.js";
import sessionRoutes from "./routes/sessions.js";
import taskRoutes from "./routes/tasks.js";
import paymentRoutes from "./routes/payments.js";
import webhookRoutes from "./routes/webhooks.js";
import dashboardRoutes from "./routes/dashboards.js";
import adminRoutes from "./routes/admin.js";
import userRoutes from "./routes/users.js";
import integrationRoutes from "./routes/integrations.js";
import skillRoutes from "./routes/skills.js";
import { openApiSpec } from "./openapi.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(here, "../../frontend/dist");

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);

  app.use(securityHeaders());
  app.use(corsMiddleware());
  app.use(globalRateLimit());
  app.use(requestSizeGuard);
  app.use(
    express.json({
      limit: "1mb",
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(cookieParser());
  app.use(originCheck);
  app.use(attachUser);

  app.get(
    "/health",
    asyncHandlerHealth(async (_req, res) => {
      let databaseOk = false;
      let databaseError: string | null = null;
      try {
        await prisma.$queryRaw`SELECT 1`;
        databaseOk = true;
      } catch {
        databaseError = "Database connection failed. Run `npm run setup`.";
      }
      const issues = configIssues();
      const errors = issues.filter((issue) => issue.level === "error");
      res.status(databaseOk ? 200 : 503).json({
        status: !databaseOk ? "error" : errors.length > 0 ? "degraded" : "ok",
        service: "trusttopay-api",
        version: "1.0.0",
        uptimeSeconds: Math.round(process.uptime()),
        database: { provider: "sqlite", ok: databaseOk, error: databaseError },
        ai: {
          mode: config.aiConfigured ? "provider" : "demo",
          provider: config.aiProvider,
          threshold: config.aiEscalationThreshold,
        },
        payments: {
          mode: config.paymentsMode,
          simulated: config.paymentsMode === "SIMULATED",
          paypalConfigured: config.paypalConfigured,
          payoutsEnabled: config.paypalPayoutsEnabled,
          webhookConfigured: Boolean(config.paypalWebhookId),
        },
        configIssues: issues.map((issue) => ({
          level: issue.level,
          code: issue.code,
          message: issue.message,
        })),
      });
    }),
  );

  app.get("/api-docs/openapi.json", (_req, res) => {
    res.json(openApiSpec);
  });
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: "TrustToPay API" }));

  app.use("/api/v1/auth", authRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/v1/sessions", sessionRoutes);
  app.use("/api/v1/tasks", taskRoutes);
  app.use("/api/tasks", taskRoutes);
  app.use("/api/v1/payments", paymentRoutes);
  app.use("/api/v1/paypal", webhookRoutes);
  app.use("/api/v1/dashboards", dashboardRoutes);
  app.use("/api/v1/dashboard", dashboardRoutes);
  app.use("/api/v1/admin", adminRoutes);
  app.use("/api/v1/users", userRoutes);
  app.use("/api/v1/integrations", integrationRoutes);
  app.use("/api/v1/skills", skillRoutes);
  app.use("/api/skills", skillRoutes);

  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist, { index: false, maxAge: "1h" }));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api") || req.path === "/health" || req.path.startsWith("/api-docs")) {
        return next();
      }
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  }

  app.use("/api", notFound);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

// Local helper so /health can be async without importing the shared wrapper
// (keeps the middleware import list focused).
function asyncHandlerHealth(
  handler: (req: express.Request, res: express.Response) => Promise<void>,
) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    handler(req, res).catch(next);
  };
}
