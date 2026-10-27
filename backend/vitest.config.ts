import { defineConfig } from "vitest/config";

/**
 * Backend test configuration.
 *
 * Tests run against a disposable SQLite file (backend/prisma/test.db) that is
 * created in global-setup and emptied before every test by the helpers. The
 * environment mirrors local demo mode so no PayPal or AI credentials are
 * required and rate limiting is disabled.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    globalSetup: ["./src/test/global-setup.ts"],
    setupFiles: ["./src/test/setup.ts"],
    // SQLite is a single writer: run files one at a time and in one fork so the
    // Prisma client and database file are never shared across workers.
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DEMO_MODE: "true",
      DEMO_USERS_ENABLED: "true",
      DATABASE_URL: "file:./test.db",
      SESSION_SECRET: "test-session-secret-0123456789abcdef0123456789abcdef",
      FRONTEND_URL: "http://localhost:5173",
      API_BASE_URL: "http://localhost:4000",
      AI_PROVIDER: "demo",
      AI_ESCALATION_THRESHOLD: "0.75",
      PAYPAL_ENV: "sandbox",
      PAYPAL_CURRENCY: "USD",
      PAYPAL_PAYOUTS_ENABLED: "false",
      REWARD_MIN_MINOR: "500",
      REWARD_MAX_MINOR: "10000",
    },
  },
});
