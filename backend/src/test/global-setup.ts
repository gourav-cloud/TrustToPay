import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, "../..");
const prismaDir = path.join(backendDir, "prisma");
const testDbPath = path.join(prismaDir, "test.db");

/**
 * Global setup: rebuild a clean test database from the Prisma schema.
 *
 * DATABASE_URL is forced to the test file and guarded so a misconfiguration can
 * never reset the developer database. `prisma db push` is used instead of
 * migrations so the schema and the disposable database cannot drift.
 */
export default function setup(): void {
  const databaseUrl = "file:./test.db";
  if (!databaseUrl.includes("test")) {
    throw new Error("Refusing to run backend tests without a dedicated test database.");
  }

  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = databaseUrl;

  for (const file of [testDbPath, `${testDbPath}-journal`, `${testDbPath}-wal`, `${testDbPath}-shm`]) {
    if (fs.existsSync(file)) fs.rmSync(file);
  }

  const require = createRequire(import.meta.url);
  const prismaEntry = path.join(path.dirname(require.resolve("prisma/package.json")), "build", "index.js");

  execFileSync(
    process.execPath,
    [prismaEntry, "db", "push", "--skip-generate", "--force-reset", "--schema", "prisma/schema.prisma"],
    { cwd: backendDir, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" },
  );
}
