import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { AppError, asyncHandler } from "../lib/errors.js";
import { audit, notify, recordTaskEvent } from "../lib/audit.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { canTransition, transitionTask } from "../services/stateMachine.js";
import { verifySubmissionWithSecurityGate, type VerificationResult } from "../services/verification.js";
import { formatMinorUnits } from "../lib/money.js";
import { normalizeCategory } from "../lib/categories.js";
import { paginated, paginationFrom } from "../lib/http.js";
import { parseJson } from "../lib/json.js";
import { serializeTaskDetail, serializeTaskSummary, serializeVerificationRun } from "../serializers.js";
import { rankSpecialistsForTask } from "../services/matching/rankingService.js";
import { syncSpecialistToElasticIndex } from "../services/elastic/specialistIndexService.js";
import {
  acceptTaskOfferAtomically,
  declineTaskOffer,
  dispatchTopOffers,
  expireStaleOffersForTask,
  serializeTaskOffer,
} from "../services/matching/offerDispatcher.js";
import {
  serializeSubmissionArtifact,
  validateAndCanonicalizeArtifact,
  type CanonicalArtifactFile,
} from "../lib/artifacts.js";
import {
  buildVerifiedAgentHandback,
  dispatchSignedAgentCallback,
  signAgentHandbackPayload,
} from "../services/agentCallback.js";
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
  offers: {
    include: {
      specialist: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ batchNumber: "desc" as const }, { rank: "asc" as const }],
  },
  evidence: { orderBy: { createdAt: "asc" as const } },
  reward: true,
  submissions: {
    orderBy: [{ version: "desc" as const }, { createdAt: "desc" as const }],
    include: {
      artifact: true,
      verificationRuns: { orderBy: { createdAt: "desc" as const } },
    },
  },
  artifacts: { orderBy: { version: "desc" as const } },
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
  if (viewer.role === "REVIEWER" && task.offers.some((offer) => offer.specialistId === viewer.id)) return true;
  if (viewer.role === "REVIEWER" && (task.status === "FUNDED" || task.status === "OFFERED") && !task.assignment) {
    return true;
  }
  return false;
}

const createTaskSchema = z.object({
  sessionId: z.string().trim().min(1).max(100).optional(),
  title: z.string().trim().min(3).max(200).optional(),
  question: z.string().trim().min(10).max(4000).optional(),
  acceptanceCriteria: z.string().trim().min(20).max(4000),
  requiredSkills: z.array(z.string().trim().min(1).max(120)).min(1).max(10).optional(),
  requiredSkillId: z.string().trim().min(1).max(80).optional(),
  minimumSkillLevel: z.number().int().min(1).max(3).default(1),
  rewardMinor: z.number().int().min(1).max(1_000_000),
  rewardApproved: z.literal(true, {
    errorMap: () => ({ message: "Explicitly approve the reward before creating a funded review task." }),
  }),
  riskLevel: z.enum(["STANDARD", "HIGH"]).default("STANDARD"),
  category: z.string().trim().min(2).max(80).optional(),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
  callbackUrl: z.string().trim().url("Enter a valid callback URL.").max(1000).optional(),
  callbackSecret: z.string().trim().min(8).max(256).optional(),
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

    const headerKey = req.get("Idempotency-Key") ?? req.get("X-Idempotency-Key");
    const idempotencyKey = (headerKey ?? body.idempotencyKey ?? "").trim() || null;
    if (idempotencyKey && idempotencyKey.length > 128) {
      throw new AppError(400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be 128 characters or fewer.");
    }

    if (idempotencyKey) {
      const existing = await prisma.reviewTask.findUnique({
        where: {
          requesterId_idempotencyKey: {
            requesterId: req.user!.id,
            idempotencyKey,
          },
        },
      });
      if (existing) {
        const full = await loadTaskFull(existing.id);
        res.status(200).json({ task: serializeTaskDetail(full, req.user!), idempotentReplay: true });
        return;
      }
    }

    let session = body.sessionId
      ? await prisma.agentSession.findUnique({
          where: { id: body.sessionId },
          include: {
            analysisRuns: { orderBy: { createdAt: "desc" }, take: 1 },
            evidence: true,
            tasks: { where: { status: { not: "CANCELLED" } } },
          },
        })
      : null;

    if (body.sessionId && !session) {
      throw new AppError(404, "SESSION_NOT_FOUND", "Agent session not found.");
    }

    let requiredSkills: string[] =
      body.requiredSkills ?? (body.requiredSkillId ? [body.requiredSkillId] : ["TypeScript", "Software Engineering"]);

    if (session) {
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

      requiredSkills =
        body.requiredSkills && body.requiredSkills.length > 0
          ? body.requiredSkills
          : body.requiredSkillId
            ? [body.requiredSkillId]
            : analysis.suggestedReviewerSkills;
    } else if (!body.question) {
      throw new AppError(400, "VALIDATION_ERROR", "Either sessionId or question is required to create a task.");
    }

    let taskId: string;
    let replayed = false;

    try {
      const result = await prisma.$transaction(async (db) => {
        if (idempotencyKey) {
          const concurrent = await db.reviewTask.findUnique({
            where: {
              requesterId_idempotencyKey: {
                requesterId: req.user!.id,
                idempotencyKey,
              },
            },
          });
          if (concurrent) {
            return { id: concurrent.id, replayed: true };
          }
        }

        const activeSession =
          session ??
          (await db.agentSession.create({
            data: {
              userId: req.user!.id,
              title: body.title ?? body.question!.slice(0, 90),
              question: body.question!,
              category: normalizeCategory(body.category ?? "PROGRAMMING"),
              status: "ESCALATION_REQUIRED",
            },
            include: {
              evidence: true,
            },
          }));

        const created = await db.reviewTask.create({
          data: {
            sessionId: activeSession.id,
            requesterId: req.user!.id,
            title: body.title ?? activeSession.title,
            question: body.question ?? activeSession.question,
            category: normalizeCategory(body.category ?? activeSession.category),
            acceptanceCriteria: body.acceptanceCriteria,
            requiredSkillsJson: JSON.stringify(requiredSkills),
            requiredSkillId: body.requiredSkillId ?? null,
            minimumSkillLevel: body.minimumSkillLevel ?? 1,
            status: "REVIEW_TASK_CREATED",
            rewardMinor: body.rewardMinor,
            currency: config.paypalCurrency,
            riskLevel: body.riskLevel,
            idempotencyKey,
            callbackUrl: body.callbackUrl ?? null,
            callbackSecret: body.callbackSecret ?? null,
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
              create: activeSession.evidence.map((evidence) => ({
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
          metadata: {
            rewardMinor: body.rewardMinor,
            skills: requiredSkills,
            requiredSkillId: body.requiredSkillId ?? null,
            minimumSkillLevel: body.minimumSkillLevel ?? 1,
            idempotencyKey,
          },
        });

        await transitionTask(db, created.id, "AWAITING_FUNDING", {
          type: "AWAITING_FUNDING",
          message: "The requester must fund the reward before a reviewer can accept.",
          actorId: req.user!.id,
        });

        return { id: created.id, replayed: false };
      });
      taskId = result.id;
      replayed = result.replayed;
    } catch (error) {
      if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await prisma.reviewTask.findUnique({
          where: {
            requesterId_idempotencyKey: {
              requesterId: req.user!.id,
              idempotencyKey,
            },
          },
        });
        if (existing) {
          const full = await loadTaskFull(existing.id);
          res.status(200).json({ task: serializeTaskDetail(full, req.user!), idempotentReplay: true });
          return;
        }
      }
      throw error;
    }

    if (!replayed) {
      await audit(prisma, req, {
        action: "TASK_CREATED",
        entityType: "ReviewTask",
        entityId: taskId,
        metadata: {
          sessionId: session?.id ?? null,
          rewardMinor: body.rewardMinor,
          currency: config.paypalCurrency,
          idempotencyKey,
        },
      });
    }

    const full = await loadTaskFull(taskId);
    res.status(replayed ? 200 : 201).json({
      task: serializeTaskDetail(full, req.user!),
      ...(replayed ? { idempotentReplay: true } : {}),
    });
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

    const andConditions: Prisma.ReviewTaskWhereInput[] = [];
    const base: Prisma.ReviewTaskWhereInput = {};
    if (scope === "available") {
      base.assignment = { is: null };
      andConditions.push({
        OR: [
          { status: "FUNDED" },
          {
            status: "OFFERED",
            offers: {
              some: {
                specialistId: req.user!.id,
                status: "PENDING",
                expiresAt: { gt: new Date() },
              },
            },
          },
        ],
      });
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
      andConditions.push({
        OR: [
          { title: { contains: query.q } },
          { question: { contains: query.q } },
          { acceptanceCriteria: { contains: query.q } },
        ],
      });
    }
    if (andConditions.length > 0) {
      base.AND = andConditions;
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
          offers: {
            where: { specialistId: req.user!.id },
            include: { specialist: { select: { id: true, name: true, email: true } } },
          },
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

router.get(
  "/:id/offers",
  asyncHandler(async (req, res) => {
    const task = await loadTaskFull(req.params.id);
    const isAdminOrRequester = req.user!.role === "ADMIN" || task.requesterId === req.user!.id;
    if (!isAdminOrRequester && req.user!.role !== "REVIEWER") {
      throw new AppError(403, "FORBIDDEN", "You do not have access to offers for this task.");
    }

    if (isAdminOrRequester) {
      const ranking = await rankSpecialistsForTask(prisma, task.id, { excludeAlreadyOffered: false });
      res.json({
        offers: task.offers.map(serializeTaskOffer),
        ranking,
      });
      return;
    }

    const myOffers = task.offers
      .filter((offer) => offer.specialistId === req.user!.id)
      .map(serializeTaskOffer);
    res.json({ offers: myOffers });
  }),
);

const dispatchOffersSchema = z.object({
  forceNextBatch: z.boolean().optional(),
  ttlMinutes: z.number().int().min(1).max(1440).optional(),
});

router.post(
  "/:id/offers/dispatch",
  asyncHandler(async (req, res) => {
    const body = dispatchOffersSchema.parse(req.body ?? {});
    const task = await loadTaskFull(req.params.id);
    if (task.requesterId !== req.user!.id && req.user!.role !== "ADMIN") {
      throw new AppError(403, "FORBIDDEN", "Only the requester or an administrator can dispatch specialist offers.");
    }

    const dispatched = await prisma.$transaction((db) =>
      dispatchTopOffers(db, task.id, {
        actorId: req.user!.id,
        forceNextBatch: body.forceNextBatch,
        ttlMs: body.ttlMinutes ? body.ttlMinutes * 60 * 1000 : undefined,
      }),
    );

    await audit(prisma, req, {
      action: "TASK_OFFERS_DISPATCHED",
      entityType: "ReviewTask",
      entityId: task.id,
      metadata: {
        batchNumber: dispatched.batchNumber,
        dispatchedCount: dispatched.dispatchedCount,
        status: dispatched.status,
      },
    });

    const refreshed = await loadTaskFull(task.id);
    res.status(201).json({
      ...dispatched,
      task: serializeTaskDetail(refreshed, req.user!),
    });
  }),
);

router.post(
  "/:id/offers/decline",
  requireRole("REVIEWER"),
  asyncHandler(async (req, res) => {
    const result = await prisma.$transaction((db) =>
      declineTaskOffer(db, {
        taskId: req.params.id,
        specialistId: req.user!.id,
      }),
    );

    await audit(prisma, req, {
      action: "TASK_OFFER_DECLINED",
      entityType: "ReviewTask",
      entityId: req.params.id,
      metadata: {
        offerId: result.offer.id,
        remainingPending: result.remainingPending,
      },
    });

    const refreshed = await loadTaskFull(req.params.id);
    res.json({
      ...result,
      task: serializeTaskDetail(refreshed, req.user!),
    });
  }),
);

router.post(
  "/:id/offers/expire",
  asyncHandler(async (req, res) => {
    const task = await loadTaskFull(req.params.id);
    if (task.requesterId !== req.user!.id && req.user!.role !== "ADMIN") {
      throw new AppError(403, "FORBIDDEN", "Only the requester or an administrator can expire task offers.");
    }

    const result = await prisma.$transaction((db) =>
      expireStaleOffersForTask(db, task.id, {
        actorId: req.user!.id,
        autoDispatchNextBatch: req.body?.autoDispatchNextBatch !== false,
      }),
    );

    await audit(prisma, req, {
      action: "TASK_OFFERS_EXPIRED",
      entityType: "ReviewTask",
      entityId: task.id,
      metadata: {
        expiredCount: result.expiredCount,
        remainingPending: result.remainingPending,
      },
    });

    const refreshed = await loadTaskFull(task.id);
    res.json({
      ...result,
      task: serializeTaskDetail(refreshed, req.user!),
    });
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

    const { assignmentId, offerId } = await acceptTaskOfferAtomically(prisma, {
      taskId: req.params.id,
      specialistId: req.user!.id,
    });

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
      metadata: { assignmentId, offerId },
    });

    res.json({ task: serializeTaskDetail(task, req.user!), message: "Task accepted." });
  }),
);

const artifactFileInputSchema = z.object({
  path: z.string(),
  content: z.string(),
  encoding: z.enum(["utf8", "base64"]).optional(),
  isSymlink: z.boolean().optional(),
});

const submitSchema = z.object({
  answer: z.string().trim().min(1).max(6000).optional(),
  explanation: z.string().trim().min(20).max(6000),
  confidenceScore: z.number().int().min(0).max(100),
  sourceUrl: z.string().trim().max(1000).url("Enter a valid URL.").optional().or(z.literal("")),
  evidenceNotes: z.string().trim().max(4000).optional(),
  files: z.array(artifactFileInputSchema).optional(),
  patchText: z.string().max(6_000_000).optional(),
  archiveUrl: z.string().trim().max(1000).url("Enter a valid archive URL.").optional().or(z.literal("")),
  artifact: z
    .object({
      files: z.array(artifactFileInputSchema).optional(),
      patchText: z.string().max(6_000_000).optional(),
      archiveUrl: z.string().trim().max(1000).url("Enter a valid archive URL.").optional().or(z.literal("")),
    })
    .optional(),
});

async function buildVerificationResult(task: Awaited<ReturnType<typeof loadTaskFull>>, submissionId: string): Promise<{
  result: VerificationResult;
  submission: NonNullable<Awaited<ReturnType<typeof prisma.reviewSubmission.findUnique>>>;
}> {
  const submission = await prisma.reviewSubmission.findUnique({
    where: { id: submissionId },
    include: { artifact: true },
  });
  if (!submission) throw new AppError(404, "SUBMISSION_NOT_FOUND", "Submission not found.");

  const analysisRun = task.session.analysisRuns[0];
  const analysis = analysisRun ? parseJson<AnalysisOutput | null>(analysisRun.outputJson, null) : null;

  const artifactFiles = submission.artifact
    ? parseJson<CanonicalArtifactFile[]>(submission.artifact.filesJson, []).map((f) => ({
        path: f.path,
        content: f.content,
      }))
    : undefined;

  const result = await verifySubmissionWithSecurityGate({
    title: task.title,
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
    artifact: submission.artifact
      ? {
          version: submission.artifact.version,
          sha256Digest: submission.artifact.sha256Digest,
          files: artifactFiles,
          patchText: submission.artifact.patchText,
        }
      : {
          version: submission.version,
          sha256Digest: submission.sha256Digest,
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
  artifactBinding?: { version: number; sha256Digest: string },
) {
  return prisma.$transaction(async (db) => {
    const task = await db.reviewTask.findUnique({ where: { id: taskId } });
    if (!task) throw new AppError(404, "TASK_NOT_FOUND", "Review task not found.");

    const submissionRecord = artifactBinding
      ? null
      : await db.reviewSubmission.findUnique({
          where: { id: submissionId },
          select: { version: true, sha256Digest: true },
        });
    const resolvedVersion = artifactBinding?.version ?? submissionRecord?.version ?? null;
    const resolvedSha256 = artifactBinding?.sha256Digest ?? submissionRecord?.sha256Digest ?? null;

    const run = await db.verificationRun.create({
      data: {
        taskId,
        submissionId,
        artifactVersion: resolvedVersion,
        artifactSha256: resolvedSha256,
        status: result.verificationStatus,
        decisionReason: result.decisionReason,
        checksPassedJson: JSON.stringify(result.checksPassed),
        checksFailedJson: JSON.stringify(result.checksFailed),
        evidenceReferencesJson: JSON.stringify(result.evidenceReferences),
        securityVerdict: result.securityVerdict ?? null,
        securityReviewJson: result.securityReview ? JSON.stringify(result.securityReview) : null,
        executionSummaryJson: result.executionSummary ? JSON.stringify(result.executionSummary) : null,
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
          metadata: {
            verificationRunId: run.id,
            artifactVersion: resolvedVersion,
            artifactSha256: resolvedSha256,
          },
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
          metadata: {
            verificationRunId: run.id,
            artifactVersion: resolvedVersion,
            artifactSha256: resolvedSha256,
          },
        });
      }
    } else if (result.verificationStatus === "NEEDS_MANUAL_REVIEW") {
      if (task.status === "VERIFICATION_PENDING") {
        await transitionTask(db, taskId, "NEEDS_MANUAL_REVIEW", {
          type: "NEEDS_MANUAL_REVIEW",
          message: "Automated checks require an administrator decision.",
          actorId,
          metadata: {
            verificationRunId: run.id,
            artifactVersion: resolvedVersion,
            artifactSha256: resolvedSha256,
          },
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

    const submissionRecord = await db.reviewSubmission.findUnique({
      where: { id: submissionId },
      select: { version: true, sha256Digest: true },
    });

    const run = await db.verificationRun.create({
      data: {
        taskId,
        submissionId,
        artifactVersion: submissionRecord?.version ?? null,
        artifactSha256: submissionRecord?.sha256Digest ?? null,
        status: result.verificationStatus,
        decisionReason: `${note} ${result.decisionReason}`.slice(0, 2000),
        checksPassedJson: JSON.stringify(result.checksPassed),
        checksFailedJson: JSON.stringify(result.checksFailed),
        evidenceReferencesJson: JSON.stringify(result.evidenceReferences),
        securityVerdict: result.securityVerdict ?? null,
        securityReviewJson: result.securityReview ? JSON.stringify(result.securityReview) : null,
        executionSummaryJson: result.executionSummary ? JSON.stringify(result.executionSummary) : null,
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
        metadata: {
          verificationRunId: run.id,
          artifactVersion: submissionRecord?.version ?? null,
          artifactSha256: submissionRecord?.sha256Digest ?? null,
        },
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
        metadata: {
          verificationRunId: run.id,
          artifactVersion: submissionRecord?.version ?? null,
          artifactSha256: submissionRecord?.sha256Digest ?? null,
        },
      });
    }
    return run;
  });
}

router.get(
  "/:id/artifacts",
  asyncHandler(async (req, res) => {
    const task = await loadTaskFull(req.params.id);
    const isAdmin = req.user!.role === "ADMIN";
    const isRequester = task.requesterId === req.user!.id;
    const isAssignedReviewer = task.assignment?.reviewerId === req.user!.id;
    if (!isAdmin && !isRequester && !isAssignedReviewer) {
      throw new AppError(403, "FORBIDDEN", "Only the requester, assigned reviewer, or an administrator can view task artifacts.");
    }

    res.json({
      artifacts: (task.artifacts ?? []).map(serializeSubmissionArtifact),
    });
  }),
);

router.get(
  "/:id/handback",
  asyncHandler(async (req, res) => {
    const task = await loadTaskFull(req.params.id);
    const isAdmin = req.user!.role === "ADMIN";
    const isRequester = task.requesterId === req.user!.id;
    if (!isAdmin && !isRequester) {
      throw new AppError(403, "FORBIDDEN", "Only the requesting agent or an administrator can retrieve the verified artifact handback.");
    }

    const handback = buildVerifiedAgentHandback(task);
    const alreadyHandedOff =
      Boolean(task.handedOffAt) && task.handedOffArtifactSha256 === handback.artifact.sha256Digest;

    if (!alreadyHandedOff) {
      const now = new Date();
      await prisma.$transaction(async (db) => {
        if (task.status === "VERIFIED" || task.status === "PAYMENT_READY") {
          await transitionTask(db, task.id, "HANDED_OFF", {
            type: "ARTIFACT_HANDED_BACK",
            message: `Verified artifact v${handback.artifact.version} (SHA-256: ${handback.artifact.sha256Digest.slice(0, 12)}…) handed back to requesting agent.`,
            actorId: req.user!.id,
            extraData: {
              handedOffAt: now,
              handedOffArtifactSha256: handback.artifact.sha256Digest,
            },
            metadata: {
              artifactVersion: handback.artifact.version,
              artifactSha256: handback.artifact.sha256Digest,
              handoffIdempotencyKey: handback.handoffIdempotencyKey,
            },
          });
          handback.taskStatus = "HANDED_OFF";
        } else {
          await db.reviewTask.update({
            where: { id: task.id },
            data: {
              handedOffAt: now,
              handedOffArtifactSha256: handback.artifact.sha256Digest,
            },
          });
          await recordTaskEvent(db, {
            taskId: task.id,
            type: "ARTIFACT_HANDED_BACK",
            message: `Verified artifact v${handback.artifact.version} (SHA-256: ${handback.artifact.sha256Digest.slice(0, 12)}…) handed back to requesting agent.`,
            actorId: req.user!.id,
            metadata: {
              artifactVersion: handback.artifact.version,
              artifactSha256: handback.artifact.sha256Digest,
              handoffIdempotencyKey: handback.handoffIdempotencyKey,
            },
          });
        }
      });

      await audit(prisma, req, {
        action: "ARTIFACT_HANDED_BACK",
        entityType: "ReviewTask",
        entityId: task.id,
        metadata: {
          artifactVersion: handback.artifact.version,
          artifactSha256: handback.artifact.sha256Digest,
          handoffIdempotencyKey: handback.handoffIdempotencyKey,
        },
      });
    }

    const signingSecret = task.callbackSecret || config.sessionSecret;
    const signed = signAgentHandbackPayload(handback, signingSecret);

    res.setHeader("X-TrustToPay-Signature", signed.signatureHeader);
    res.setHeader("X-TrustToPay-Timestamp", signed.timestamp);
    res.setHeader("X-TrustToPay-Artifact-Sha256", handback.artifact.sha256Digest);

    res.json({
      handback,
      signature: {
        header: signed.signatureHeader,
        timestamp: signed.timestamp,
        algorithm: "HMAC-SHA256",
      },
      idempotentReplay: alreadyHandedOff,
    });
  }),
);

const callbackDispatchSchema = z.object({
  callbackUrl: z.string().trim().url().max(1000).optional(),
  callbackSecret: z.string().trim().min(8).max(256).optional(),
});

router.post(
  "/:id/handback/callback",
  asyncHandler(async (req, res) => {
    const body = callbackDispatchSchema.parse(req.body ?? {});
    const task = await loadTaskFull(req.params.id);
    const isAdmin = req.user!.role === "ADMIN";
    const isRequester = task.requesterId === req.user!.id;
    if (!isAdmin && !isRequester) {
      throw new AppError(403, "FORBIDDEN", "Only the requesting agent or an administrator can dispatch the handback callback.");
    }

    const handback = buildVerifiedAgentHandback(task);
    const targetUrl = body.callbackUrl ?? task.callbackUrl;
    if (!targetUrl) {
      throw new AppError(400, "CALLBACK_URL_REQUIRED", "No callbackUrl is configured for this task.");
    }
    const secret = body.callbackSecret ?? task.callbackSecret ?? config.sessionSecret;

    const delivery = await dispatchSignedAgentCallback({
      callbackUrl: targetUrl,
      callbackSecret: secret,
      payload: handback,
    });

    await audit(prisma, req, {
      action: "AGENT_CALLBACK_DISPATCHED",
      entityType: "ReviewTask",
      entityId: task.id,
      metadata: {
        callbackUrl: targetUrl,
        delivered: delivery.delivered,
        statusCode: delivery.statusCode,
        artifactSha256: handback.artifact.sha256Digest,
        idempotencyKey: delivery.idempotencyKey,
      },
    });

    res.json({
      delivery,
      handback,
    });
  }),
);

router.post(
  "/:id/submit",
  requireRole("REVIEWER"),
  asyncHandler(async (req, res) => {
    const body = submitSchema.parse(req.body);
    const task = await loadTaskFull(req.params.id);

    if (task.assignment?.reviewerId !== req.user!.id) {
      throw new AppError(403, "NOT_ASSIGNED", "Only the assigned reviewer can submit this task.");
    }
    if (!["REVIEWER_ASSIGNED", "ASSIGNED", "IN_PROGRESS", "VERIFICATION_REJECTED", "NEEDS_REVISION"].includes(task.status)) {
      throw new AppError(409, "TASK_NOT_SUBMITTABLE", `The task is ${task.status}; submission is not allowed.`);
    }

    const inputFiles = body.artifact?.files ?? body.files;
    const inputPatchText = body.artifact?.patchText ?? body.patchText ?? null;
    const inputArchiveUrl = (body.artifact?.archiveUrl ?? body.archiveUrl) || null;
    const hasExplicitCodeDeliverable = Boolean((inputFiles && inputFiles.length > 0) || (inputPatchText && inputPatchText.trim().length > 0));

    if (!hasExplicitCodeDeliverable && (!body.answer || body.answer.trim().length < 20)) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Answer must be at least 20 characters when no code files or unified diff patch are attached.",
      );
    }

    let bundle;
    try {
      bundle = validateAndCanonicalizeArtifact({
        files: inputFiles,
        patchText: inputPatchText,
        archiveUrl: inputArchiveUrl,
        fallbackAnswerText: body.answer,
      });
    } catch (error) {
      if (error instanceof AppError) {
        await audit(prisma, req, {
          action: "ARTIFACT_QUARANTINED",
          entityType: "ReviewTask",
          entityId: task.id,
          metadata: {
            code: error.code,
            message: error.message,
            details: error.details ?? null,
          },
        });
      }
      throw error;
    }

    const resolvedAnswer =
      body.answer && body.answer.trim().length >= 20
        ? body.answer.trim()
        : [
            body.answer?.trim(),
            inputPatchText?.trim(),
            ...(bundle.files.map((file) => `// File: ${file.path}\n${file.content}`)),
          ]
            .filter(Boolean)
            .join("\n\n")
            .slice(0, 6000);

    const { submission, artifact, nextVersion } = await prisma.$transaction(async (db) => {
      const fresh = await db.reviewTask.findUnique({ where: { id: task.id } });
      if (!fresh) throw new AppError(404, "TASK_NOT_FOUND", "Review task not found.");
      if (fresh.status === "VERIFICATION_REJECTED" || fresh.status === "NEEDS_REVISION") {
        await transitionTask(db, fresh.id, "REVIEWER_ASSIGNED", {
          type: "REVIEW_REOPENED",
          message: "Reviewer reopened the task to submit a corrected answer.",
          actorId: req.user!.id,
        });
      }

      const latestSubmission = await db.reviewSubmission.findFirst({
        where: { taskId: task.id },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const version = (latestSubmission?.version ?? 0) + 1;
      const now = new Date();

      if (version > 1) {
        await db.submissionArtifact.updateMany({
          where: { taskId: task.id, invalidatedAt: null },
          data: { invalidatedAt: now },
        });
        await db.verificationRun.updateMany({
          where: { taskId: task.id, invalidatedAt: null },
          data: { invalidatedAt: now },
        });
        await db.reviewSubmission.updateMany({
          where: { taskId: task.id, status: "SUBMITTED" },
          data: { status: "SUPERSEDED" },
        });
      }

      const created = await db.reviewSubmission.create({
        data: {
          taskId: task.id,
          reviewerId: req.user!.id,
          version,
          sha256Digest: bundle.sha256Digest,
          answer: resolvedAnswer,
          explanation: body.explanation,
          confidenceScore: body.confidenceScore,
          sourceUrl: body.sourceUrl || null,
          evidenceNotes: body.evidenceNotes || null,
          artifact: {
            create: {
              taskId: task.id,
              version,
              sha256Digest: bundle.sha256Digest,
              fileManifestJson: JSON.stringify(bundle.manifest),
              filesJson: JSON.stringify(bundle.files),
              patchText: bundle.patchText,
              archiveUrl: bundle.archiveUrl,
              totalSizeBytes: bundle.totalSizeBytes,
              fileCount: bundle.fileCount,
              isQuarantined: false,
            },
          },
        },
        include: {
          artifact: true,
        },
      });

      await transitionTask(db, task.id, "SUBMISSION_RECEIVED", {
        type: "SUBMISSION_RECEIVED",
        message: `Reviewer submitted deliverable v${version} (SHA-256: ${bundle.sha256Digest.slice(0, 12)}…).`,
        actorId: req.user!.id,
        metadata: {
          submissionId: created.id,
          version,
          sha256Digest: bundle.sha256Digest,
          fileCount: bundle.fileCount,
          totalSizeBytes: bundle.totalSizeBytes,
        },
      });
      await transitionTask(db, task.id, "VERIFICATION_PENDING", {
        type: "VERIFICATION_PENDING",
        message: "Independent verification started.",
        actorId: null,
        metadata: {
          submissionId: created.id,
          version,
          sha256Digest: bundle.sha256Digest,
        },
      });
      return { submission: created, artifact: created.artifact!, nextVersion: version };
    });

    const { result } = await buildVerificationResult(task, submission.id);
    const run = await persistAutomatedVerification(task.id, submission.id, result, null, {
      version: nextVersion,
      sha256Digest: bundle.sha256Digest,
    });
    await syncSpecialistToElasticIndex(prisma, req.user!.id);

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
        version: nextVersion,
        sha256Digest: bundle.sha256Digest,
      },
    });

    res.status(201).json({
      submission: {
        ...submission,
        artifact: serializeSubmissionArtifact(artifact),
        verification: serializeVerificationRun(run),
      },
      artifact: serializeSubmissionArtifact(artifact),
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
      await syncSpecialistToElasticIndex(prisma, submission.reviewerId);
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
