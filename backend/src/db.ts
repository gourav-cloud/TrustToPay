import { PrismaClient, type Prisma } from "@prisma/client";

/**
 * A single Prisma client is reused for the process. Tests point DATABASE_URL at
 * a disposable SQLite file before importing this module.
 */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

export type DbClient = PrismaClient | Prisma.TransactionClient;

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
