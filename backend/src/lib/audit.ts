import type { Request } from "express";
import { prisma, type DbClient } from "../db.js";
import { safeJson } from "./json.js";
import { AppError } from "./errors.js";

export async function audit(
  db: DbClient,
  req: Request | null,
  input: {
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: unknown;
  },
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: input.actorId ?? req?.user?.id ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadataJson: input.metadata === undefined ? null : safeJson(input.metadata),
      ip: req?.ip ?? null,
      userAgent: req?.get("user-agent")?.slice(0, 250) ?? null,
    },
  });
}

export async function recordTaskEvent(
  db: DbClient,
  input: {
    taskId: string;
    type: string;
    message: string;
    actorId?: string | null;
    metadata?: unknown;
  },
): Promise<void> {
  await db.taskEvent.create({
    data: {
      taskId: input.taskId,
      type: input.type,
      message: input.message,
      actorId: input.actorId ?? null,
      metadataJson: input.metadata === undefined ? null : safeJson(input.metadata),
    },
  });
}

export async function notify(
  db: DbClient,
  input: { userId: string; title: string; body: string; link?: string },
): Promise<void> {
  await db.notification.create({
    data: { userId: input.userId, title: input.title, body: input.body, link: input.link ?? null },
  });
}

export function requireFound<T>(value: T | null | undefined, code: string, message: string): T {
  if (!value) throw new AppError(404, code, message);
  return value;
}

export async function getTaskOrThrow(taskId: string) {
  const task = await prisma.reviewTask.findUnique({
    where: { id: taskId },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      session: true,
      assignment: { include: { reviewer: { select: { id: true, name: true, email: true } } } },
      evidence: true,
      reward: true,
      submissions: { orderBy: { createdAt: "desc" }, take: 1 },
      verificationRuns: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  return requireFound(task, "TASK_NOT_FOUND", "Review task not found.");
}
