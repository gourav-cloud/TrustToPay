import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { AppError, asyncHandler } from "../lib/errors.js";
import { audit, notify, recordTaskEvent } from "../lib/audit.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { canTransition, transitionTask } from "../services/stateMachine.js";
import { verifySubmission, type VerificationResult } from "../services/verification.js";
import { formatMinorUnits } from "../lib/money.js";
import { normalizeCategory } from "../lib/categories.js";
import { paginated, paginationFrom } from "../lib/http.js";
import { parseJson } from "../lib/json.js";
import { serializeTaskDetail, serializeTaskSummary, serializeVerificationRun } from "../serializers.js";
import type { AnalysisOutput } from "../services/ai/schema.js";
import type { DbClient } from "../db.js";

const router = Router();
router.use(requireAuth);

const taskInclude = {
  requester: { select: { id: true, name: true, email: true } },
  session: {
    include: {
      analysisRuns: { orderBy: { createdAt: "desc" as const }, take: 1 },
      evidence: true,
    },
  },
  assignment: {
    include: {
      reviewer: {
        include: {
          profile: true,
          skills: true,
        },
      },
    },
  },
  evidence: { orderBy: { createdAt: "asc" as const } },
  reward: true,
  submissions: {
    orderBy: { createdAt: "desc" as const },
    include: { verificationRuns: { orderBy: { createdAt: "desc" as const } } },
  },
  verificationRuns: { orderBy: { createdAt: "desc" as const } },
  payments: { orderBy: { createdAt: "desc" as const } },
  events: { orderBy: { createdAt: "asc" as const } },
  disputes: { orderBy: { createdAt: "desc" as const } },
};

async function loadTaskFull(taskId: string) {
  const task = await prisma.reviewTask.findUnique({ where: { id: taskId }, include: taskInclude });
  if (!task) throw new AppError(404, "TASK_NOT_FOUND", "Review task not found.");
  return task;
}

function canViewTask(
  task: Awaited<ReturnType<typeof loadTaskFull>>,
  viewer: { id: string; role: string },
): boolean {
  if (viewer.role === "ADMIN") return true;
  if (task.requesterId === viewer.id) return true;
  if (task.assignment?.reviewerId === viewer.id) return true;
  if (viewer.role === "REVIEWER" && task.status === "FUNDED" && !task.assignment) return true;
  return false;
}

const createTaskSchema = z.object({
  sessionId: z.string().trim().min(1).max(100),
  acceptanceCriteria: z.string().trim().min(20).max(4000),
  requiredSkills: z.array(z.string().trim().min(1).max(120)).min(1).max(10).optional(),
  rewardMinor: z.number().int().min(1).max(1_000_000),
  rewardApproved: z.literal(true, {
    errorMap: () => ({ message: "Explicitly approve the reward before creating a funded review task." }),
  }),
  riskLevel: z.enum(["STANDARD", "HIGH"]).default("STANDARD"),
  category: z.string().trim().min(2).max(80).optional(),
});

const listQuerySchema = z.object({
  scope: z.enum(["all", "available", "assigned", "requested"]).optional(),
  status: z.string().trim().max(50).optional(),
  category: z.string().trim().max(80).optional(),
  skill: z.string().trim().max(120).optional(),
  q: z.string().trim().max(200).optional(),
  minReward: z.coerce.number().int().min(0).optional(),
  maxReward: z.coerce.number().int().min(0).optional(),
  sort: z.enum(["newest", "reward_desc", "reward_asc"]).default("newest"),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createTaskSchema.parse(req.body);
    if (req.user!.role !== "REQUESTER" && req.user!.role !== "ADMIN") {
      throw new AppError(403, "FORBIDDEN", "Only a requester can create a review task.");
    }
    if (body.rewardMinor < config.rewardMinMinor || body.rewardMinor > config.rewardMaxMinor) {
      throw new AppError(
        400,
        "REWARD_OUT_OF_RANGE",
        `Reward must be between ${formatMinorUnits(config.rewardMinMinor)} and ${formatMinorUnits(config.rewardMaxMinor)}.`,
        { minMinor: config.rewardMinMinor, maxMinor: config.rewardMaxMinor },
      );
    }

    const session = await prisma.agentSession.findUnique({
      where: { id: body.sessionId },
      include: {
        analysisRuns: { orderBy: { createdAt: "desc" }, take: 1 },
        evidence: true,
        tasks: { where: { status: { not: "CANCELLED" } } },
      },
    });
    if (!session) throw new AppError(404, "SESSION_NOT_FOUND", "Agent session not found.");
    if (session.userId !== req.user!.id) {
      throw new AppError(403, "FORBIDDEN", "You can only create tasks from your own agent sessions.");
    }
    if (session.tasks.length > 0) {
      throw new AppError(409, "TASK_ALREADY_EXISTS", "This session already has a review task.");
    }

    const analysisRun = session.analysisRuns[0];
    if (!analysisRun) {
      throw new AppError(409, "ANALYSIS_REQUIRED", "Run the AI analysis before creating a review task.");
    }
    const analysis = parseJson<AnalysisOutput | null>(analysisRun.outputJson, null);
    if (!analysis) throw new AppError(409, "ANALYSIS_INVALID", "Stored analysis output is unreadable.");
    if (analysis.recommendedAction !== "ESCALATE_TO_HUMAN") {
      throw new AppError(
        409,
        "ESCALATION_NOT_RECOMMENDED",
        `The AI recommended ${analysis.recommendedAction}; a human review task is only created after escalation.`,
      );
    }

    const requiredSkills =
      body.requiredSkills && body.requiredSkills.length > 0
        ? body.requiredSkills
        : analysis.suggestedReviewerSkills;

    const task = await prisma.$transaction(async (db) => {
      const created = await db.reviewTask.create({
        data: {
          sessionId: session.id,
          requesterId: req.user!.id,
          title: session.title,
          question: session.question,
          category: normalizeCategory(body.category ?? session.category),
          acceptanceCriteria: body.acceptanceCriteria,
          requiredSkillsJson: JSON.stringify(requiredSkills),
          status: "REVIEW_TASK_CREATED",
          rewardMinor: body.rewardMinor,
          currency: config.paypalCurrency,
          riskLevel: body.riskLevel,
          reward: {
            create: {
              amountMinor: body.rewardMinor,
              currency: config.paypalCurrency,
              status: "PENDING",
              approvedById: req.user!.id,
              approvedAt: new Date(),
            },
          },
          evidence: {
            create: session.evidence.map((evidence) => ({
              title: evidence.title,
              url: evidence.url,
              publisher: evidence.publisher,
              sourceType: evidence.sourceType,
              content: evidence.content,
              isSeed: evidence.isSeed,
            })),
          },
        },
      });

      await recordTaskEvent(db, {
        taskId: created.id,
        type: "TASK_CREATED",
        message: `Review task created from AI escalation with an approved reward of ${formatMinorUnits(body.rewardMinor)}.`,
        actorId: req.user!.id,
        metadata: { rewardMinor: body.rewardMinor, skills: requiredSkills },
      });

      await transitionTask(db, created.id, "AWAITING_FUNDING", {
        type: "AWAITING_FUNDING",
        message: "The requester must fund the reward before a reviewer can accept.",
        actorId: req.user!.id,
      });

      return created;
    });

    await audit(prisma, req, {
      action: "TASK_CREATED",
      entityType: "ReviewTask",
      entityId: task.id,
      metadata: { sessionId: session.id, rewardMinor: body.rewardMinor, currency: config.paypalCurrency },
    });

    const full = await loadTaskFull(task.id);
    res.status(201).json({ task: serializeTaskDetail(full, req.user!) });
  }),
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    const { page, pageSize, skip } = paginationFrom(req.query);

    const role = req.user!.role;
    const scopes = new Set<string>();
    if (role === "ADMIN") {
      scopes.add("all");
    } else if (role === "REVIEWER") {
      scopes.add("available");
      scopes.add("assigned");
    } else {
      scopes.add("requested");
    }
    const scope = query.scope ?? (role === "REVIEWER" ? "available" : role === "ADMIN" ? "all" : "requested");
    if (!scopes.has(scope)) {
      throw new AppError(403, "SCOPE_FORBIDDEN", `Scope "${scope}" is not available to your role.`);
    }

    const base: Prisma.ReviewTaskWhereInput = {};
    if (scope === "available") {
      base.status = "FUNDED";
      base.assignment = { is: null };
    } else if (scope === "assigned") {
      base.assignment = { is: { reviewerId: req.user!.id } };
    } else if (scope === "requested") {
      base.requesterId = req.user!.id;
    } else if (role !== "ADMIN") {
      throw new AppError(403, "SCOPE_FORBIDDEN", "Only administrators can list every task.");
    }

    if (query.status && scope !== "available") {
      base.status = query.status;
    }
    if (query.skill) {
      base.requiredSkillsJson = { contains: query.skill };
    }
    if (query.category) {
      base.category = normalizeCategory(query.category);
    }
    if (query.minReward !== undefined || query.maxReward !== undefined) {
      base.rewardMinor = {
        ...(query.minReward !== undefined ? { gte: query.minReward } : {}),
        ...(query.maxReward !== undefined ? { lte: query.maxReward } : {}),
      };
    }
    if (query.q) {
      base.OR = [
        { title: { contains: query.q } },
        { question: { contains: query.q } },
        { acceptanceCriteria: { contains: query.q } },
      ];
    }

    const orderBy =
      query.sort === "reward_desc"
        ? { rewardMinor: "desc" as const }
        : query.sort === "reward_asc"
          ? { rewardMinor: "asc" as const }
          : { createdAt: "desc" as const };

    const [items, total] = await Promise.all([
      prisma.reviewTask.findMany({
        where: base,
        orderBy,
        skip,
        take: pageSize,
        include: {
          reward: true,
          requester: { select: { id: true, name: true } },
          assignment: { include: { reviewer: { select: { id: true, name: true } } } },
          _count: { select: { submissions: true } },
        },
      }),
      prisma.reviewTask.count({ where: base }),
    ]);

    res.json(paginated(items.map((task) => serializeTaskSummary(task, req.user!)), total, page, pageSize));
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const task = await loadTaskFull(req.params.id);
    if (!canViewTask(task, req.user!)) {
      throw new AppError(403, "FORBIDDEN", "You do not have access to this review task.");
    }
    res.json({ task: serializeTaskDetail(task, req.user!) });
  }),
);

router.post(
  "/:id/accept",
  requireRole("REVIEWER"),
  asyncHandler(async (req, res) => {
    if (!req.user!.isReviewerApproved) {
      throw new AppError(
        403,
        "REVIEWER_NOT_APPROVED",
        "An administrator must approve your reviewer account before you can accept tasks.",
      );
    }

    let assignmentId: string;
    try {
      assignmentId = await prisma.$transaction(async (db) => {
        const task = await db.reviewTask.findUnique({
          where: { id: req.params.id },
          include: { assignment: true },
        });
        if (!task) throw new AppError(404, "TASK_NOT_FOUND", "Review task not found.");
        if (task.requesterId === req.user!.id) {
          throw new AppError(409, "SELF_ASSIGNMENT", "You cannot accept your own review task.");
        }
        if (task.status !== "FUNDED" || task.assignment) {
          throw new AppError(409, "TASK_NOT_AVAILABLE", "This task is no longer available to accept.");
        }

        // Conditional update is the concurrency guard. Only one transaction can
        // change FUNDED -> REVIEWER_ASSIGNED; the unique taskId on TaskAssignment
        // provides a second line of defence.
        const claimed = await db.reviewTask.updateMany({
          where: { id: task.id, status: "FUNDED" },
          data: { status: "REVIEWER_ASSIGNED" },
        });
        if (claimed.count === 0) {
          throw new AppError(409, "TASK_ALREADY_ASSIGNED", "Another reviewer accepted this task first.");
        }

        const assignment = await db.taskAssignment.create({
          data: { taskId: task.id, reviewerId: req.user!.id, status: "ACTIVE" },
        });

        await recordTaskEvent(db, {
          taskId: task.id,
          type: "TASK_ACCEPTED",
          message: "A qualified reviewer accepted the task.",
          actorId: req.user!.id,
          metadata: { assignmentId: assignment.id },
        });
        return assignment.id;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(409, "TASK_ALREADY_ASSIGNED", "Another reviewer accepted this task first.");
      }
      throw error;
    }

    const task = await loadTaskFull(req.params.id);
    await notify(prisma, {
      userId: task.requesterId,
      title: "Reviewer assigned",
      body: `${req.user!.name} accepted "${task.title}".`,
      link: `/app/tasks/${task.id}`,
    });
    await audit(prisma, req, {
      action: "TASK_ACCEPTED",
      entityType: "ReviewTask",
      entityId: task.id,
      metadata: { assignmentId },
    });

    res.json({ task: serializeTaskDetail(task, req.user!), message: "Task accepted." });
  }),
);

const submitSchema = z.object({
  answer: z.string().trim().min(20).max(6000),
  explanation: z.string().trim().min(20).max(6000),
  confidenceScore: z.number().int().min(0).max(100),
  sourceUrl: z.string().trim().max(1000).url("Enter a valid URL.").optional().or(z.literal("")),
  evidenceNotes: z.string().trim().max(4000).optional(),
});

async function buildVerificationResult(task: Awaited<ReturnType<typeof loadTaskFull>>, submissionId: string): Promise<{
  result: VerificationResult;
  submission: NonNullable<Awaited<ReturnType<typeof prisma.reviewSubmission.findUnique>>>;
}> {
  const submission = await prisma.reviewSubmission.findUnique({ where: { id: submissionId } });
  if (!submission) throw new AppError(404, "SUBMISSION_NOT_FOUND", "Submission not found.");

  const analysisRun = task.session.analysisRuns[0];
  const analysis = analysisRun ? parseJson<AnalysisOutput | null>(analysisRun.outputJson, null) : null;

  const result = verifySubmission({
    question: task.question,
    acceptanceCriteria: task.acceptanceCriteria,
    category: task.category,
    rewardMinor: task.rewardMinor,
    currency: task.currency,
    riskLevel: task.riskLevel,
    requesterId: task.requesterId,
    reviewerId: submission.reviewerId,
    submission: {
      answer: submission.answer,
      explanation: submission.explanation,
      confidenceScore: submission.confidenceScore,
      sourceUrl: submission.sourceUrl,
      evidenceNotes: submission.evidenceNotes,
    },
    suppliedEvidence: task.evidence.map((evidence) => ({
      title: evidence.title,
      url: evidence.url,
      sourceType: evidence.sourceType,
    })),
    analysis,
  });
  return { result, submission };
}

async function persistAutomatedVerification(
  taskId: string,
  submissionId: string,
  result: VerificationResult,
  actorId: string | null,
) {
  return prisma.$transaction(async (db) => {
    const task = await db.reviewTask.findUnique({ where: { id: taskId } });
    if (!task) throw new AppError(404, "TASK_NOT_FOUND", "Review task not found.");

    const run = await db.verificationRun.create({
      data: {
        taskId,
        submissionId,
        status: result.verificationStatus,
        decisionReason: result.decisionReason,
        checksPassedJson: JSON.stringify(result.checksPassed),
        checksFailedJson: JSON.stringify(result.checksFailed),
        evidenceReferencesJson: JSON.stringify(result.evidenceReferences),
        requiresAdminReview: result.requiresAdminReview,
        engine: "AUTOMATED",
      },
    });

    await db.reviewSubmission.update({
      where: { id: submissionId },
      data: {
        status:
          result.verificationStatus === "PASSED"
            ? "ACCEPTED"
            : result.verificationStatus === "REJECTED"
              ? "REJECTED"
              : "SUBMITTED",
      },
    });

    if (result.verificationStatus === "PASSED") {
      if (task.status === "VERIFICATION_PENDING" || task.status === "NEEDS_MANUAL_REVIEW") {
        await transitionTask(db, taskId, "VERIFIED", {
          type: "VERIFIED",
          message: "Independent verification passed.",
          actorId,
          extraData: { verifiedAt: new Date() },
          metadata: { verificationRunId: run.id },
        });
      }
      await db.reward.updateMany({
        where: { taskId, status: { in: ["PENDING", "FUNDED"] } },
        data: { status: "AUTHORIZED", approvedById: task.requesterId, approvedAt: new Date() },
      });
      const fresh = await db.reviewTask.findUnique({ where: { id: taskId } });
      if (fresh?.status === "VERIFIED") {
        await transitionTask(db, taskId, "PAYMENT_READY", {
          type: "PAYMENT_READY",
          message: "Reward authorized after verification. Payment is separate from verification.",
          actorId,
        });
      }
    } else if (result.verificationStatus === "REJECTED") {
      if (task.status === "VERIFICATION_PENDING" || task.status === "NEEDS_MANUAL_REVIEW") {
        await transitionTask(db, taskId, "VERIFICATION_REJECTED", {
          type: "VERIFICATION_REJECTED",
          message: "Independent verification rejected the submission. No reward was authorized.",
          actorId,
          metadata: { verificationRunId: run.id },
        });
      }
    } else if (result.verificationStatus === "NEEDS_MANUAL_REVIEW") {
      if (task.status === "VERIFICATION_PENDING") {
        await transitionTask(db, taskId, "NEEDS_MANUAL_REVIEW", {
          type: "NEEDS_MANUAL_REVIEW",
          message: "Automated checks require an administrator decision.",
          actorId,
          metadata: { verificationRunId: run.id },
        });
      }
    }

    return run;
  });
}

async function persistManualVerification(
  taskId: string,
  submissionId: string,
  result: VerificationResult,
  adminId: string,
  note: string,
) {
  return prisma.$transaction(async (db: DbClient) => {
    const task = await db.reviewTask.findUnique({ where: { id: taskId } });
    if (!task) throw new AppError(404, "TASK_NOT_FOUND", "Review task not found.");
    if (task.status !== "NEEDS_MANUAL_REVIEW") {
      throw new AppError(
        409,
        "MANUAL_REVIEW_NOT_AVAILABLE",
        `Manual verification requires NEEDS_MANUAL_REVIEW status; this task is ${task.status}.`,
      );
    }

    const run = await db.verificationRun.create({
      data: {
        taskId,
        submissionId,
        status: result.verificationStatus,
        decisionReason: `${note} ${result.decisionReason}`.slice(0, 2000),
        checksPassedJson: JSON.stringify(result.checksPassed),
        checksFailedJson: JSON.stringify(result.checksFailed),
        evidenceReferencesJson: JSON.stringify(result.evidenceReferences),
        requiresAdminReview: false,
        engine: "MANUAL",
        verifierId: adminId,
      },
    });

    await db.reviewSubmission.update({
      where: { id: submissionId },
      data: { status: result.verificationStatus === "PASSED" ? "ACCEPTED" : "REJECTED" },
    });

    if (result.verificationStatus === "PASSED") {
      await transitionTask(db, taskId, "VERIFIED", {
        type: "MANUAL_VERIFICATION_PASSED",
        message: "An administrator manually approved the submission after review.",
        actorId: adminId,
        extraData: { verifiedAt: new Date() },
        metadata: { verificationRunId: run.id },
      });
      await db.reward.updateMany({
        where: { taskId, status: { in: ["PENDING", "FUNDED"] } },
        data: { status: "AUTHORIZED", approvedById: task.requesterId, approvedAt: new Date() },
      });
      await transitionTask(db, taskId, "PAYMENT_READY", {
        type: "PAYMENT_READY",
        message: "Reward authorized after manual verification.",
        actorId: adminId,
      });
    } else {
      await transitionTask(db, taskId, "VERIFICATION_REJECTED", {
        type: "MANUAL_VERIFICATION_REJECTED",
        message: "An administrator rejected the submission after manual review.",
        actorId: adminId,
        metadata: { verificationRunId: run.id },
      });
    }
    return run;
  });
}

router.post(
  "/:id/submit",
  requireRole("REVIEWER"),
  asyncHandler(async (req, res) => {
    const body = submitSchema.parse(req.body);
    const task = await loadTaskFull(req.params.id);

    if (task.assignment?.reviewerId !== req.user!.id) {
      throw new AppError(403, "NOT_ASSIGNED", "Only the assigned reviewer can submit this task.");
    }
    if (!["REVIEWER_ASSIGNED", "VERIFICATION_REJECTED"].includes(task.status)) {
      throw new AppError(409, "TASK_NOT_SUBMITTABLE", `The task is ${task.status}; submission is not allowed.`);
    }

    const submission = await prisma.$transaction(async (db) => {
      const fresh = await db.reviewTask.findUnique({ where: { id: task.id } });
      if (!fresh) throw new AppError(404, "TASK_NOT_FOUND", "Review task not found.");
      if (fresh.status === "VERIFICATION_REJECTED") {
        await transitionTask(db, fresh.id, "REVIEWER_ASSIGNED", {
          type: "REVIEW_REOPENED",
          message: "Reviewer reopened the task to submit a corrected answer.",
          actorId: req.user!.id,
        });
      }

      const created = await db.reviewSubmission.create({
        data: {
          taskId: task.id,
          reviewerId: req.user!.id,
          answer: body.answer,
          explanation: body.explanation,
          confidenceScore: body.confidenceScore,
          sourceUrl: body.sourceUrl || null,
          evidenceNotes: body.evidenceNotes || null,
        },
      });

      await transitionTask(db, task.id, "SUBMISSION_RECEIVED", {
        type: "SUBMISSION_RECEIVED",
        message: "Reviewer submitted an evidence-backed answer.",
        actorId: req.user!.id,
        metadata: { submissionId: created.id },
      });
      await transitionTask(db, task.id, "VERIFICATION_PENDING", {
        type: "VERIFICATION_PENDING",
        message: "Independent verification started.",
        actorId: null,
      });
      return created;
    });

    const { result } = await buildVerificationResult(task, submission.id);
    const run = await persistAutomatedVerification(task.id, submission.id, result, null);

    const refreshedTask = await loadTaskFull(task.id);
    await notify(prisma, {
      userId: task.requesterId,
      title:
        result.verificationStatus === "PASSED"
          ? "Submission verified"
          : result.verificationStatus === "NEEDS_MANUAL_REVIEW"
            ? "Submission needs manual review"
            : "Submission rejected",
      body: result.decisionReason,
      link: `/app/tasks/${task.id}/verification`,
    });
    await notify(prisma, {
      userId: req.user!.id,
      title:
        result.verificationStatus === "PASSED"
          ? "Your submission passed verification"
          : result.verificationStatus === "NEEDS_MANUAL_REVIEW"
            ? "Your submission needs manual review"
            : "Your submission was rejected",
      body: result.decisionReason,
      link: `/app/tasks/${task.id}`,
    });
    await audit(prisma, req, {
      action: "VERIFICATION_COMPLETED",
      entityType: "VerificationRun",
      entityId: run.id,
      metadata: {
        status: result.verificationStatus,
        submissionId: submission.id,
        taskId: task.id,
      },
    });

    res.status(201).json({
      submission: { ...submission, verification: serializeVerificationRun(run) },
      verification: serializeVerificationRun(run),
      task: serializeTaskDetail(refreshedTask, req.user!),
      message: result.decisionReason,
    });
  }),
);

const verifySchema = z.object({
  decision: z.enum(["PASS", "REJECT"]).optional(),
  note: z.string().trim().min(10).max(2000).optional(),
});

router.post(
  "/:id/verify",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = verifySchema.parse(req.body);
    const task = await loadTaskFull(req.params.id);
    const submission = task.submissions[0];
    if (!submission) throw new AppError(409, "NO_SUBMISSION", "This task has no submission to verify.");
    if (submission.reviewerId === req.user!.id) {
      throw new AppError(
        403,
        "SELF_VERIFICATION_NOT_ALLOWED",
        "A reviewer cannot independently verify their own submission.",
      );
    }

    const { result } = await buildVerificationResult(task, submission.id);

    if (body.decision) {
      if (!body.note) {
        throw new AppError(400, "NOTE_REQUIRED", "A decision note is required for a manual verification decision.");
      }
      const manualResult: VerificationResult = {
        ...result,
        verificationStatus: body.decision === "PASS" ? "PASSED" : "REJECTED",
        requiresAdminReview: false,
        decisionReason:
          body.decision === "PASS"
            ? "Administrator decision: manual pass after reviewing the evidence and checks."
            : "Administrator decision: manual rejection after reviewing the evidence and checks.",
      };
      const run = await persistManualVerification(task.id, submission.id, manualResult, req.user!.id, body.note);
      await audit(prisma, req, {
        action: "ADMIN_VERIFICATION_OVERRIDE",
        entityType: "VerificationRun",
        entityId: run.id,
        metadata: { decision: body.decision, taskId: task.id, note: body.note },
      });
      const refreshed = await loadTaskFull(task.id);
      res.json({ verification: serializeVerificationRun(run), task: serializeTaskDetail(refreshed, req.user!) });
      return;
    }

    if (!["VERIFICATION_PENDING", "NEEDS_MANUAL_REVIEW"].includes(task.status)) {
      throw new AppError(409, "VERIFICATION_NOT_AVAILABLE", `The task is ${task.status}; re-verification is not allowed.`);
    }
    const run = await persistAutomatedVerification(task.id, submission.id, result, req.user!.id);
    const refreshed = await loadTaskFull(task.id);
    await audit(prisma, req, {
      action: "VERIFICATION_RERUN",
      entityType: "VerificationRun",
      entityId: run.id,
      metadata: { status: result.verificationStatus, taskId: task.id },
    });
    res.json({ verification: serializeVerificationRun(run), task: serializeTaskDetail(refreshed, req.user!) });
  }),
);

const rewardSchema = z.object({
  rewardMinor: z.number().int().min(1).max(1_000_000),
  rewardApproved: z.literal(true),
});

router.patch(
  "/:id/reward",
  asyncHandler(async (req, res) => {
    const body = rewardSchema.parse(req.body);
    const task = await loadTaskFull(req.params.id);
    if (task.requesterId !== req.user!.id && req.user!.role !== "ADMIN") {
      throw new AppError(403, "FORBIDDEN", "Only the requester can change the reward.");
    }
    if (!["AWAITING_FUNDING", "FUNDING_FAILED"].includes(task.status)) {
      throw new AppError(409, "REWARD_LOCKED", "The reward can only change before funding is captured.");
    }
    if (body.rewardMinor < config.rewardMinMinor || body.rewardMinor > config.rewardMaxMinor) {
      throw new AppError(
        400,
        "REWARD_OUT_OF_RANGE",
        `Reward must be between ${formatMinorUnits(config.rewardMinMinor)} and ${formatMinorUnits(config.rewardMaxMinor)}.`,
      );
    }

    await prisma.$transaction(async (db) => {
      await db.reviewTask.update({
        where: { id: task.id },
        data: { rewardMinor: body.rewardMinor, currency: config.paypalCurrency },
      });
      await db.reward.update({
        where: { taskId: task.id },
        data: {
          amountMinor: body.rewardMinor,
          currency: config.paypalCurrency,
          approvedById: req.user!.id,
          approvedAt: new Date(),
        },
      });
      await recordTaskEvent(db, {
        taskId: task.id,
        type: "REWARD_UPDATED",
        message: `Reward approved at ${formatMinorUnits(body.rewardMinor)} before funding.`,
        actorId: req.user!.id,
      });
    });

    await audit(prisma, req, {
      action: "REWARD_UPDATED",
      entityType: "ReviewTask",
      entityId: task.id,
      metadata: { rewardMinor: body.rewardMinor, currency: config.paypalCurrency },
    });
    const refreshed = await loadTaskFull(task.id);
    res.json({ task: serializeTaskDetail(refreshed, req.user!) });
  }),
);

router.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const task = await loadTaskFull(req.params.id);
    if (task.requesterId !== req.user!.id && req.user!.role !== "ADMIN") {
      throw new AppError(403, "FORBIDDEN", "Only the requester or an administrator can cancel this task.");
    }
    if (["PAYMENT_PROCESSING", "PAYMENT_PAID", "COMPLETED", "CANCELLED", "DISPUTED"].includes(task.status)) {
      throw new AppError(409, "TASK_NOT_CANCELLABLE", `The task is ${task.status} and cannot be cancelled.`);
    }
    if (!canTransition(task.status, "CANCELLED")) {
      throw new AppError(409, "INVALID_STATE_TRANSITION", `Cancellation is not allowed from ${task.status}.`);
    }

    await prisma.$transaction(async (db) => {
      await transitionTask(db, task.id, "CANCELLED", {
        type: "TASK_CANCELLED",
        message:
          task.status === "FUNDED" || task.status === "REVIEWER_ASSIGNED"
            ? "Task cancelled. Captured funding is not automatically refunded by this application."
            : "Task cancelled.",
        actorId: req.user!.id,
      });
      await db.reward.updateMany({
        where: { taskId: task.id, status: { not: "PAID" } },
        data: { status: "CANCELLED" },
      });
    });

    if (task.assignment) {
      await notify(prisma, {
        userId: task.assignment.reviewerId,
        title: "Task cancelled",
        body: `"${task.title}" was cancelled by the requester.`,
        link: "/app/marketplace",
      });
    }
    await audit(prisma, req, {
      action: "TASK_CANCELLED",
      entityType: "ReviewTask",
      entityId: task.id,
      metadata: { previousStatus: task.status },
    });

    const refreshed = await loadTaskFull(task.id);
    res.json({ task: serializeTaskDetail(refreshed, req.user!) });
  }),
);

const disputeSchema = z.object({
  reason: z.string().trim().min(20).max(2000),
});

router.post(
  "/:id/disputes",
  asyncHandler(async (req, res) => {
    const body = disputeSchema.parse(req.body);
    const task = await loadTaskFull(req.params.id);
    const isRequester = task.requesterId === req.user!.id;
    const isReviewer = task.assignment?.reviewerId === req.user!.id;
    if (!isRequester && !isReviewer && req.user!.role !== "ADMIN") {
      throw new AppError(403, "FORBIDDEN", "Only the requester, assigned reviewer, or an administrator can open a dispute.");
    }
    if (!canTransition(task.status, "DISPUTED")) {
      throw new AppError(409, "DISPUTE_NOT_ALLOWED", `A dispute cannot be opened while the task is ${task.status}.`);
    }
    if (task.disputes.some((dispute) => dispute.status === "OPEN")) {
      throw new AppError(409, "DISPUTE_EXISTS", "An open dispute already exists for this task.");
    }

    const dispute = await prisma.$transaction(async (db) => {
      const created = await db.dispute.create({
        data: { taskId: task.id, openedById: req.user!.id, reason: body.reason },
      });
      await transitionTask(db, task.id, "DISPUTED", {
        type: "DISPUTE_OPENED",
        message: "A dispute was opened. Payment and verification changes are paused pending administrator review.",
        actorId: req.user!.id,
        metadata: { disputeId: created.id },
      });
      return created;
    });

    await audit(prisma, req, {
      action: "DISPUTE_OPENED",
      entityType: "Dispute",
      entityId: dispute.id,
      metadata: { taskId: task.id },
    });

    const refreshed = await loadTaskFull(task.id);
    res.status(201).json({ dispute, task: serializeTaskDetail(refreshed, req.user!) });
  }),
);

export default router;
