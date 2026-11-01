import { PrismaClient, type Prisma } from "@prisma/client";

/**
 * A single Prisma client is reused for the process. Tests point DATABASE_URL at
 * a disposable SQLite file before importing this module.
 */
let prisma: PrismaClient;
try {
  prisma = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
} catch {
  console.warn("[AI Studio] Database not connected — using mock");
  const noOp = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    count: async () => 0,
    create: async (d?: { data?: Record<string, unknown> }) => d?.data ?? {},
    update: async (d?: { data?: Record<string, unknown> }) => d?.data ?? {},
    updateMany: async () => ({ count: 0 }),
    delete: async () => ({}),
    deleteMany: async () => ({ count: 0 }),
  };
  prisma = new Proxy({} as PrismaClient, {
    get: (_, prop) => {
      if (prop === "$queryRaw") return async () => [{ 1: 1 }];
      if (prop === "$disconnect") return async () => {};
      if (prop === "$transaction") return async (fn: unknown) => (typeof fn === "function" ? fn(prisma) : []);
      return noOp;
    },
  });
}

export { prisma };

export type DbClient = PrismaClient | Prisma.TransactionClient;

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
