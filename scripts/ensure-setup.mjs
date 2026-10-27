#!/usr/bin/env node
/**
 * Fast pre-flight check used by `npm run dev`.
 *
 * If the environment file, Prisma client, or SQLite database is missing, it
 * runs the full setup script once. Otherwise it exits immediately so watch
 * mode starts without repeated work.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const dbPath = path.join(root, "backend", "prisma", "dev.db");
const prismaClientPath = path.join(root, "node_modules", ".prisma", "client", "index.js");

const missing = [];
if (!fs.existsSync(envPath)) missing.push(".env");
if (!fs.existsSync(dbPath)) missing.push("backend/prisma/dev.db");
if (!fs.existsSync(prismaClientPath)) missing.push("generated Prisma client");

if (missing.length === 0) {
  process.exit(0);
}

console.log(`TrustToPay is not initialized yet (missing: ${missing.join(", ")}).`);
console.log("Running setup once. This can take a few minutes on the first run...\n");

const result = spawnSync(
  process.execPath,
  [path.join(root, "scripts", "setup.mjs")],
  { cwd: root, stdio: "inherit" },
);

process.exit(result.status ?? 1);
