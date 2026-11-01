import { AppError } from "../lib/errors.js";
import type { DbClient } from "../db.js";
import { recordTaskEvent } from "../lib/audit.js";

/**
 * Explicit task state machine implementing PRD Section 4 decoupled task
 * lifecycle states alongside legacy workflow compatibility states. Every status
 * change goes through assertTransition() so invalid jumps (such as ASSIGNED ->
 * COMPLETED or AWAITING_FUNDING -> PAYMENT_PAID) are rejected.
 */
export const TASK_STATUSES = [
  // PRD Section 4 decoupled task states
  "DRAFT",
  "QUEUED",
  "MATCHING",
  "OFFERED",
  "ASSIGNED",
  "IN_PROGRESS",
  "SUBMITTED",
  "SAFETY_CHECKING",
  "VERIFICATION_RUNNING",
  "VERIFIED",
  "HANDED_OFF",
  "COMPLETED",
  "NO_MATCH",
  "OFFER_EXPIRED",
  "NEEDS_REVISION",
  "SAFETY_BLOCKED",
  "SAFETY_REVIEW_FAILED",
  "VERIFICATION_FAILED",
  "DISPUTED",
  "CANCELLED",
  "FAILED",
  // Existing workflow compatibility states
  "AI_ANALYSIS",
  "ESCALATION_REQUIRED",
  "REVIEW_TASK_CREATED",
  "AWAITING_FUNDING",
  "FUNDING_FAILED",
  "FUNDED",
  "REVIEWER_ASSIGNED",
  "SUBMISSION_RECEIVED",
  "VERIFICATION_PENDING",
  "NEEDS_MANUAL_REVIEW",
  "VERIFICATION_REJECTED",
  "PAYMENT_READY",
  "PAYMENT_PROCESSING",
  "PAYMENT_PAID",
  "PAYOUT_FAILED",
  "ORIGINAL_TASK_RESUMED",
  "AWAITING_INFORMATION",
  "EXPIRED",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  // Decoupled task lifecycle transitions (PRD Section 4)
  DRAFT: ["QUEUED", "MATCHING", "AWAITING_FUNDING", "CANCELLED"],
  QUEUED: ["MATCHING", "OFFERED", "NO_MATCH", "CANCELLED", "FAILED"],
  MATCHING: ["OFFERED", "NO_MATCH", "CANCELLED", "FAILED"],
  OFFERED: ["ASSIGNED", "MATCHING", "OFFER_EXPIRED", "NO_MATCH", "CANCELLED"],
  OFFER_EXPIRED: ["MATCHING", "OFFERED", "NO_MATCH", "CANCELLED"],
  NO_MATCH: ["QUEUED", "MATCHING", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "SUBMITTED", "SUBMISSION_RECEIVED", "DISPUTED", "CANCELLED"],
  IN_PROGRESS: ["SUBMITTED", "SUBMISSION_RECEIVED", "DISPUTED", "CANCELLED"],
  SUBMITTED: ["SAFETY_CHECKING", "VERIFICATION_RUNNING", "VERIFICATION_PENDING", "CANCELLED"],
  SAFETY_CHECKING: ["VERIFICATION_RUNNING", "SAFETY_BLOCKED", "SAFETY_REVIEW_FAILED", "NEEDS_MANUAL_REVIEW"],
  SAFETY_BLOCKED: ["NEEDS_REVISION", "DISPUTED", "CANCELLED", "FAILED"],
  SAFETY_REVIEW_FAILED: ["SAFETY_CHECKING", "NEEDS_MANUAL_REVIEW", "DISPUTED", "CANCELLED", "FAILED"],
  VERIFICATION_RUNNING: ["VERIFIED", "VERIFICATION_FAILED", "NEEDS_REVISION", "NEEDS_MANUAL_REVIEW"],
  VERIFICATION_FAILED: ["NEEDS_REVISION", "ASSIGNED", "IN_PROGRESS", "DISPUTED", "CANCELLED", "FAILED"],
  NEEDS_REVISION: ["IN_PROGRESS", "SUBMITTED", "ASSIGNED", "DISPUTED", "CANCELLED"],
  HANDED_OFF: ["ORIGINAL_TASK_RESUMED", "COMPLETED", "DISPUTED"],
  FAILED: ["CANCELLED"],

  // Shared & compatibility transitions
  AI_ANALYSIS: ["ESCALATION_REQUIRED", "AWAITING_INFORMATION", "CANCELLED"],
  ESCALATION_REQUIRED: ["REVIEW_TASK_CREATED", "DRAFT", "QUEUED", "AWAITING_INFORMATION", "CANCELLED"],
  REVIEW_TASK_CREATED: ["AWAITING_FUNDING", "QUEUED", "MATCHING", "AWAITING_INFORMATION", "CANCELLED"],
  AWAITING_FUNDING: ["FUNDED", "FUNDING_FAILED", "QUEUED", "MATCHING", "CANCELLED"],
  FUNDING_FAILED: ["AWAITING_FUNDING", "CANCELLED"],
  FUNDED: ["REVIEWER_ASSIGNED", "MATCHING", "OFFERED", "ASSIGNED", "CANCELLED", "EXPIRED"],
  REVIEWER_ASSIGNED: ["IN_PROGRESS", "SUBMITTED", "SUBMISSION_RECEIVED", "AWAITING_INFORMATION", "CANCELLED", "EXPIRED", "DISPUTED"],
  SUBMISSION_RECEIVED: ["SAFETY_CHECKING", "VERIFICATION_RUNNING", "VERIFICATION_PENDING", "CANCELLED"],
  VERIFICATION_PENDING: ["VERIFIED", "VERIFICATION_REJECTED", "VERIFICATION_FAILED", "NEEDS_MANUAL_REVIEW"],
  NEEDS_MANUAL_REVIEW: ["VERIFIED", "VERIFICATION_REJECTED", "VERIFICATION_FAILED", "DISPUTED"],
  VERIFICATION_REJECTED: ["REVIEWER_ASSIGNED", "ASSIGNED", "NEEDS_REVISION", "SUBMISSION_RECEIVED", "SUBMITTED", "DISPUTED", "CANCELLED"],
  VERIFIED: ["HANDED_OFF", "PAYMENT_READY", "ORIGINAL_TASK_RESUMED", "COMPLETED"],
  PAYMENT_READY: ["PAYMENT_PROCESSING", "PAYOUT_FAILED", "HANDED_OFF", "ORIGINAL_TASK_RESUMED", "DISPUTED"],
  PAYMENT_PROCESSING: ["PAYMENT_PAID", "PAYOUT_FAILED", "PAYMENT_PROCESSING"],
  PAYMENT_PAID: ["HANDED_OFF", "ORIGINAL_TASK_RESUMED", "COMPLETED", "DISPUTED"],
  PAYOUT_FAILED: ["PAYMENT_PROCESSING", "HANDED_OFF", "ORIGINAL_TASK_RESUMED", "DISPUTED"],
  ORIGINAL_TASK_RESUMED: ["COMPLETED"],
  COMPLETED: [],
  AWAITING_INFORMATION: ["REVIEW_TASK_CREATED", "AWAITING_FUNDING", "QUEUED", "CANCELLED"],
  DISPUTED: ["ASSIGNED", "NEEDS_REVISION", "VERIFIED", "PAYMENT_READY", "PAYMENT_PAID", "VERIFICATION_REJECTED", "CANCELLED"],
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
