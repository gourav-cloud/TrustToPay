import { AppError } from "../lib/errors.js";
import type { DbClient } from "../db.js";
import { recordTaskEvent } from "../lib/audit.js";

/**
 * Explicit task state machine. Every status change in the application goes
 * through assertTransition() so invalid jumps (for example AWAITING_FUNDING ->
 * PAYMENT_PAID) are impossible from the API.
 */
export const TASK_STATUSES = [
  "AI_ANALYSIS",
  "ESCALATION_REQUIRED",
  "REVIEW_TASK_CREATED",
  "AWAITING_FUNDING",
  "FUNDING_FAILED",
  "FUNDED",
  "REVIEWER_ASSIGNED",
  "SUBMISSION_RECEIVED",
  "VERIFICATION_PENDING",
  "VERIFIED",
  "NEEDS_MANUAL_REVIEW",
  "VERIFICATION_REJECTED",
  "PAYMENT_READY",
  "PAYMENT_PROCESSING",
  "PAYMENT_PAID",
  "PAYOUT_FAILED",
  "ORIGINAL_TASK_RESUMED",
  "COMPLETED",
  "AWAITING_INFORMATION",
  "DISPUTED",
  "CANCELLED",
  "EXPIRED",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  AI_ANALYSIS: ["ESCALATION_REQUIRED", "AWAITING_INFORMATION", "CANCELLED"],
  ESCALATION_REQUIRED: ["REVIEW_TASK_CREATED", "AWAITING_INFORMATION", "CANCELLED"],
  REVIEW_TASK_CREATED: ["AWAITING_FUNDING", "AWAITING_INFORMATION", "CANCELLED"],
  AWAITING_FUNDING: ["FUNDED", "FUNDING_FAILED", "CANCELLED"],
  FUNDING_FAILED: ["AWAITING_FUNDING", "CANCELLED"],
  FUNDED: ["REVIEWER_ASSIGNED", "CANCELLED", "EXPIRED"],
  REVIEWER_ASSIGNED: ["SUBMISSION_RECEIVED", "AWAITING_INFORMATION", "CANCELLED", "EXPIRED", "DISPUTED"],
  SUBMISSION_RECEIVED: ["VERIFICATION_PENDING", "CANCELLED"],
  VERIFICATION_PENDING: ["VERIFIED", "VERIFICATION_REJECTED", "NEEDS_MANUAL_REVIEW"],
  NEEDS_MANUAL_REVIEW: ["VERIFIED", "VERIFICATION_REJECTED", "DISPUTED"],
  VERIFICATION_REJECTED: ["REVIEWER_ASSIGNED", "SUBMISSION_RECEIVED", "DISPUTED", "CANCELLED"],
  VERIFIED: ["PAYMENT_READY", "ORIGINAL_TASK_RESUMED"],
  PAYMENT_READY: ["PAYMENT_PROCESSING", "PAYOUT_FAILED", "ORIGINAL_TASK_RESUMED", "DISPUTED"],
  PAYMENT_PROCESSING: ["PAYMENT_PAID", "PAYOUT_FAILED", "PAYMENT_PROCESSING"],
  PAYMENT_PAID: ["ORIGINAL_TASK_RESUMED", "DISPUTED"],
  PAYOUT_FAILED: ["PAYMENT_PROCESSING", "ORIGINAL_TASK_RESUMED", "DISPUTED"],
  ORIGINAL_TASK_RESUMED: ["COMPLETED"],
  COMPLETED: [],
  AWAITING_INFORMATION: ["REVIEW_TASK_CREATED", "AWAITING_FUNDING", "CANCELLED"],
  DISPUTED: ["PAYMENT_READY", "PAYMENT_PAID", "VERIFICATION_REJECTED", "CANCELLED"],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransition(from: string, to: string): boolean {
  return Boolean(TRANSITIONS[from as TaskStatus]?.includes(to as TaskStatus));
}

export function assertTransition(from: string, to: string): void {
  if (!canTransition(from, to)) {
    throw new AppError(
      409,
      "INVALID_STATE_TRANSITION",
      `Cannot move a review task from ${from} to ${to}.`,
      { from, to, allowed: TRANSITIONS[from as TaskStatus] ?? [] },
    );
  }
}

export async function transitionTask(
  db: DbClient,
  taskId: string,
  to: TaskStatus,
  input: { type: string; message: string; actorId?: string | null; metadata?: unknown; extraData?: Record<string, unknown> },
): Promise<void> {
  const task = await db.reviewTask.findUnique({ where: { id: taskId }, select: { status: true } });
  if (!task) throw new AppError(404, "TASK_NOT_FOUND", "Review task not found.");
  assertTransition(task.status, to);

  await db.reviewTask.update({
    where: { id: taskId },
    data: { status: to, ...(input.extraData ?? {}) },
  });
  await recordTaskEvent(db, {
    taskId,
    type: input.type,
    message: input.message,
    actorId: input.actorId ?? null,
    metadata: { from: task.status, to, ...(input.metadata as object | undefined) },
  });
}

export function nextActionsFor(status: string): string[] {
  return TRANSITIONS[status as TaskStatus] ?? [];
}
