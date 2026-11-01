import { config, configErrors, configIssues } from "./config.js";
import { prisma } from "./db.js";
import { createApp } from "./app.js";

const app = createApp();

const issues = configIssues();
for (const issue of issues) {
  const prefix = issue.level === "error" ? "[config:error]" : issue.level === "warning" ? "[config:warn]" : "[config]";
  console.log(`${prefix} ${issue.code}: ${issue.message}${issue.hint ? ` — ${issue.hint}` : ""}`);
}

if (config.isProduction && configErrors().length > 0) {
  console.error("[startup] Refusing to start in production with invalid configuration.");
  process.exit(1);
}

async function verifyDatabase(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error("[startup] Database is not initialized.");
    console.error("Run `npm run setup` from the project root to create the SQLite database, apply migrations, and seed demo data.");
    console.error(error instanceof Error ? error.message : error);
  }
}

await verifyDatabase();

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log("");
  console.log("  TrustToPay API");
  console.log(`  → http://0.0.0.0:${config.port}`);
  console.log(`  → http://0.0.0.0:${config.port}/api-docs`);
  console.log(`  → http://0.0.0.0:${config.port}/health`);
  console.log("");
  console.log(`  Frontend:      ${config.frontendUrl}`);
  console.log(`  AI engine:     ${config.aiConfigured ? `provider (${config.aiProvider} / ${config.aiModel})` : "Demo AI Mode (deterministic)"}`);
  console.log(`  Payments:      ${config.paymentsMode}${config.paymentsMode === "SIMULATED" ? " — clearly labelled simulated payments" : " — genuine PayPal Sandbox API calls"}`);
  console.log(`  Payouts:       ${config.paymentsMode === "SIMULATED" ? "simulated" : config.paypalPayoutsEnabled ? "enabled" : "not enabled"}`);
  console.log(`  Demo login:    ${config.demoUsersEnabled ? "enabled" : "disabled"}`);
  console.log("");
});

function shutdown(signal: string) {
  console.log(`\n[shutdown] ${signal} received, closing server...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
