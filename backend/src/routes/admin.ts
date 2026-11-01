import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { AppError, asyncHandler } from "../lib/errors.js";
import { requireRole } from "../auth/middleware.js";
import { audit, notify } from "../lib/audit.js";
import { paginated, paginationFrom } from "../lib/http.js";
import { parseJson } from "../lib/json.js";
import { formatMinorUnits } from "../lib/money.js";
import { serializeUserAdmin } from "../serializers.js";
import { canTransition, transitionTask } from "../services/stateMachine.js";
import { serializePayment } from "../services/payments.js";
import { DEFAULT_MAX_ACTIVE_WORKLOAD } from "../services/matching/rankingService.js";
import { getSkillLevelName } from "../services/skills/assessmentEngine.js";
import {
  discoverSpecialistCandidatesForTask,
  reindexAllApprovedSpecialists,
  syncSpecialistToElasticIndex,
} from "../services/elastic/specialistIndexService.js";

const router = Router();
router.use(requireRole("ADMIN"));

router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip } = paginationFrom(req.query);
    const role = typeof req.query.role === "string" ? req.query.role : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
    const approved = typeof req.query.approved === "string" ? req.query.approved : undefined;

    const where = {
      ...(role ? { role } : {}),
      ...(approved === "true" ? { isReviewerApproved: true } : approved === "false" ? { isReviewerApproved: false } : {}),
      ...(q
        ? {
            OR: [{ name: { contains: q } }, { email: { contains: q } }],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          profile: true,
          skills: true,
          _count: { select: { requestedTasks: true, submissions: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json(paginated(items.map(serializeUserAdmin), total, page, pageSize));
  }),
);

const eligibilitySchema = z.object({
  isReviewerApproved: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

router.patch(
  "/users/:id/eligibility",
  asyncHandler(async (req, res) => {
    const body = eligibilitySchema.parse(req.body);
    if (body.isReviewerApproved === undefined && body.isActive === undefined) {
      throw new AppError(400, "NOTHING_TO_UPDATE", "Provide isReviewerApproved and/or isActive.");
    }
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found.");
    if (user.id === req.user!.id && (body.isActive === false || body.isReviewerApproved === false)) {
      throw new AppError(409, "SELF_MODIFICATION_BLOCKED", "Administrators cannot deactivate or downgrade themselves.");
    }
    if (body.isReviewerApproved !== undefined && user.role !== "REVIEWER") {
      throw new AppError(409, "NOT_A_REVIEWER", "Reviewer approval only applies to reviewer accounts.");
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(body.isReviewerApproved !== undefined ? { isReviewerApproved: body.isReviewerApproved } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      include: { profile: true, skills: true, _count: { select: { requestedTasks: true, submissions: true } } },
    });

    if (updated.role === "REVIEWER") {
      await syncSpecialistToElasticIndex(prisma, updated.id);
    }

    await notify(prisma, {
      userId: user.id,
      title: body.isReviewerApproved === false ? "Reviewer access suspended" : "Reviewer access updated",
      body:
        body.isReviewerApproved === false
          ? "An administrator suspended your reviewer eligibility."
          : "An administrator updated your reviewer account.",
      link: "/app/dashboard",
    });
    await audit(prisma, req, {
      action: "USER_ELIGIBILITY_CHANGED",
      entityType: "User",
      entityId: user.id,
      metadata: body,
    });

    res.json({ user: serializeUserAdmin(updated) });
  }),
);

/**
 * AG Grid View 1: Specialist management (verified skills L1-L3, availability, workload, success rate).
 */
router.get(
  "/specialists",
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip } = paginationFrom({ pageSize: "100", ...req.query });
    const q = typeof req.query.q === "string" ? req.query.q.trim() : undefined;

    const where = {
      role: "REVIEWER",
      ...(q
        ? {
            OR: [{ name: { contains: q } }, { email: { contains: q } }],
          }
        : {}),
    };

    const [reviewers, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          profile: true,
          verifiedSkillLevels: {
            include: { skill: true },
            orderBy: { level: "desc" },
          },
          skills: true,
          assignments: {
            select: {
              id: true,
              status: true,
              acceptedAt: true,
              completedAt: true,
            },
          },
          submissions: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const items = reviewers.map((reviewer) => {
      const verifiedSkills = reviewer.verifiedSkillLevels.map((ul) => ({
        skillId: ul.skillId,
        slug: ul.skill.slug,
        name: ul.skill.name,
        category: ul.skill.category,
        level: ul.level,
        levelName: getSkillLevelName(ul.level),
        score: ul.score,
      }));

      const seenNames = new Set(verifiedSkills.map((s) => s.name.toLowerCase()));
      for (const rs of reviewer.skills) {
        if (!seenNames.has(rs.name.toLowerCase())) {
          const level = Math.max(1, Math.min(3, rs.level));
          verifiedSkills.push({
            skillId: rs.id,
            slug: rs.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            name: rs.name,
            category: "GENERAL",
            level,
            levelName: getSkillLevelName(level),
            score: 80,
          });
        }
      }

      const activeWorkload = reviewer.assignments.filter((a) => a.status === "ACTIVE").length;
      const completedCount = reviewer.assignments.filter((a) => a.status === "COMPLETED").length;
      const acceptedSubmissions = reviewer.submissions.filter((s) => s.status === "ACCEPTED").length;
      const rejectedSubmissions = reviewer.submissions.filter((s) => s.status === "REJECTED").length;
      const gradedTotal = acceptedSubmissions + rejectedSubmissions;
      const successRate = gradedTotal > 0 ? Math.round((acceptedSubmissions / gradedTotal) * 1000) / 10 : 100;

      const completedWithTimes = reviewer.assignments.filter(
        (a) => a.status === "COMPLETED" && a.completedAt && a.acceptedAt,
      );
      let avgTurnaroundMinutes: number | null = null;
      if (completedWithTimes.length > 0) {
        const totalMins = completedWithTimes.reduce((sum, a) => {
          return sum + Math.max(0, a.completedAt!.getTime() - a.acceptedAt.getTime()) / 60_000;
        }, 0);
        avgTurnaroundMinutes = Math.round((totalMins / completedWithTimes.length) * 10) / 10;
      }

      const highestSkillLevel = verifiedSkills.reduce((max, s) => Math.max(max, s.level), 0);
      const availabilityStatus = !reviewer.isActive
        ? "DEACTIVATED"
        : !reviewer.isReviewerApproved
          ? "PENDING_APPROVAL"
          : activeWorkload >= DEFAULT_MAX_ACTIVE_WORKLOAD
            ? "AT_CAPACITY"
            : "AVAILABLE";

      return {
        id: reviewer.id,
        name: reviewer.name,
        email: reviewer.email,
        isActive: reviewer.isActive,
        isReviewerApproved: reviewer.isReviewerApproved,
        availabilityStatus,
        verifiedSkills,
        verifiedSkillsSummary:
          verifiedSkills.length > 0
            ? verifiedSkills.map((s) => `${s.name} (L${s.level})`).join(", ")
            : "No verified skills",
        highestSkillLevel,
        activeWorkload,
        maxWorkload: DEFAULT_MAX_ACTIVE_WORKLOAD,
        completedCount,
        acceptedSubmissions,
        rejectedSubmissions,
        successRate,
        avgTurnaroundMinutes,
        payoutConsent: Boolean(reviewer.profile?.payoutConsent),
        createdAt: reviewer.createdAt,
      };
    });

    res.json(paginated(items, total, page, pageSize));
  }),
);

/**
 * AG Grid View 2: Task & dispatch management (task status, required skills, offers, assigned specialist, deadlines).
 */
router.get(
  "/tasks",
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip } = paginationFrom({ pageSize: "100", ...req.query });
    const status = typeof req.query.status === "string" ? req.query.status : undefined;

    const where = {
      ...(status ? { status } : {}),
    };

    const [tasks, total] = await Promise.all([
      prisma.reviewTask.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          requester: { select: { id: true, name: true, email: true } },
          reward: true,
          assignment: {
            include: {
              reviewer: { select: { id: true, name: true, email: true } },
            },
          },
          offers: {
            select: {
              id: true,
              status: true,
              rank: true,
              score: true,
              expiresAt: true,
            },
          },
        },
      }),
      prisma.reviewTask.count({ where }),
    ]);

    const items = tasks.map((task) => {
      const requiredSkills = parseJson<string[]>(task.requiredSkillsJson, []);
      const pendingOffers = task.offers.filter((o) => o.status === "OFFERED").length;
      const acceptedOffers = task.offers.filter((o) => o.status === "ACCEPTED").length;
      const expiredOffers = task.offers.filter((o) => o.status === "EXPIRED").length;
      const declinedOffers = task.offers.filter((o) => o.status === "DECLINED").length;
      const activeOfferExpiry = task.offers.find((o) => o.status === "OFFERED")?.expiresAt ?? null;

      return {
        id: task.id,
        title: task.title,
        status: task.status,
        category: task.category,
        riskLevel: task.riskLevel,
        requiredSkills,
        requiredSkillsSummary: requiredSkills.length > 0 ? requiredSkills.join(", ") : "General",
        minimumSkillLevel: task.minimumSkillLevel,
        rewardMinor: task.rewardMinor,
        currency: task.currency,
        rewardDisplay: formatMinorUnits(task.rewardMinor, task.currency),
        rewardStatus: task.reward?.status ?? "PENDING",
        requesterName: task.requester.name,
        assignedSpecialistName: task.assignment?.reviewer.name ?? null,
        assignedSpecialistId: task.assignment?.reviewer.id ?? null,
        totalOffers: task.offers.length,
        pendingOffers,
        acceptedOffers,
        expiredOffers,
        declinedOffers,
        expiresAt: activeOfferExpiry,
        createdAt: task.createdAt,
      };
    });

    res.json(paginated(items, total, page, pageSize));
  }),
);

/**
 * AG Grid View 3: Security & verification (artifact hash, deterministic scanner verdict, Gemini verdict, risk, test results).
 * Never exposes raw private code or confidential reviewer notes.
 */
router.get(
  "/verifications",
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip } = paginationFrom({ pageSize: "100", ...req.query });
    const status = typeof req.query.status === "string" ? req.query.status : undefined;

    const where = {
      ...(status ? { status } : {}),
    };

    const [runs, total] = await Promise.all([
      prisma.verificationRun.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          task: {
            select: {
              id: true,
              title: true,
              status: true,
              category: true,
              riskLevel: true,
            },
          },
          submission: {
            select: {
              id: true,
              version: true,
              sha256Digest: true,
              reviewer: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.verificationRun.count({ where }),
    ]);

    const items = runs.map((run) => {
      const securityReview = parseJson<{
        verdict?: string;
        riskLevel?: string;
        engine?: string;
        summary?: string;
        deterministicScanner?: { passed?: boolean; findingCount?: number };
      } | null>(run.securityReviewJson, null);

      const executionSummary = parseJson<{
        runnerMode?: string;
        passed?: boolean;
        exitCode?: number;
        durationMs?: number;
        command?: string;
      } | null>(run.executionSummaryJson, null);

      const deterministicVerdict =
        securityReview?.deterministicScanner?.passed === false
          ? "BLOCK"
          : securityReview?.deterministicScanner?.passed === true
            ? "PASS"
            : run.securityVerdict === "BLOCK"
              ? "BLOCK"
              : "PASS";

      const geminiVerdict = run.securityVerdict ?? securityReview?.verdict ?? "PASS";
      const riskLevel = securityReview?.riskLevel ?? run.task.riskLevel ?? "LOW";

      return {
        id: run.id,
        taskId: run.taskId,
        taskTitle: run.task.title,
        taskStatus: run.task.status,
        submissionId: run.submissionId,
        reviewerName: run.submission?.reviewer?.name ?? "Reviewer",
        artifactVersion: run.artifactVersion ?? run.submission?.version ?? 1,
        artifactSha256: run.artifactSha256 ?? run.submission?.sha256Digest ?? null,
        deterministicVerdict,
        deterministicFindingCount: securityReview?.deterministicScanner?.findingCount ?? 0,
        geminiVerdict,
        securityEngine: securityReview?.engine ?? "LOCAL_FALLBACK",
        riskLevel,
        testRunnerMode: executionSummary?.runnerMode ?? "FIXTURE_LABELLED",
        testPassed: executionSummary?.passed ?? (run.status === "PASSED"),
        testExitCode: executionSummary?.exitCode ?? (run.status === "PASSED" ? 0 : 1),
        testDurationMs: executionSummary?.durationMs ?? 0,
        verificationStatus: run.status,
        engine: run.engine,
        requiresAdminReview: run.requiresAdminReview,
        decisionReason: run.decisionReason,
        createdAt: run.createdAt,
      };
    });

    res.json(paginated(items, total, page, pageSize));
  }),
);

/**
 * AG Grid View 4: Payment ledger (PayPal order IDs, amounts, currencies and transaction statuses — strictly read-only).
 */
router.get(
  "/payments",
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip } = paginationFrom({ pageSize: "100", ...req.query });
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;

    const where = {
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
    };

    const [transactions, total] = await Promise.all([
      prisma.paymentTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          task: {
            select: {
              id: true,
              title: true,
              status: true,
              requester: { select: { id: true, name: true } },
              assignment: { select: { reviewer: { select: { id: true, name: true } } } },
            },
          },
        },
      }),
      prisma.paymentTransaction.count({ where }),
    ]);

    const items = transactions.map((tx) => {
      const serialized = serializePayment(tx);
      return {
        id: serialized.id,
        taskId: serialized.taskId,
        taskTitle: tx.task.title,
        taskStatus: tx.task.status,
        requesterName: tx.task.requester.name,
        reviewerName: tx.task.assignment?.reviewer.name ?? null,
        type: serialized.type,
        mode: serialized.mode,
        provider: serialized.provider,
        orderId: serialized.orderId ?? null,
        captureId: serialized.captureId ?? null,
        payoutBatchId: serialized.payoutBatchId ?? null,
        amountMinor: serialized.amountMinor,
        amountDisplay: serialized.amountDisplay,
        currency: serialized.currency,
        status: serialized.status,
        payoutAvailability: serialized.payoutAvailability,
        failureCode: serialized.failureCode ?? null,
        failureMessage: serialized.failureMessage ?? null,
        createdAt: serialized.createdAt,
        capturedAt: serialized.capturedAt,
        paidAt: serialized.paidAt,
      };
    });

    res.json(paginated(items, total, page, pageSize));
  }),
);

/**
 * AG Grid View 5: Skill assessments (candidates, assessment levels, scores and results).
 */
router.get(
  "/assessments",
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip } = paginationFrom({ pageSize: "100", ...req.query });

    const [attempts, total] = await Promise.all([
      prisma.skillAssessmentAttempt.findMany({
        orderBy: { startedAt: "desc" },
        skip,
        take: pageSize,
        include: {
          user: { select: { id: true, name: true, email: true, role: true, isReviewerApproved: true } },
          skill: { select: { id: true, slug: true, name: true, category: true } },
          stage: { select: { id: true, level: true, title: true, passingScore: true, version: true } },
        },
      }),
      prisma.skillAssessmentAttempt.count(),
    ]);

    const items = attempts.map((attempt) => ({
      id: attempt.id,
      candidateId: attempt.userId,
      candidateName: attempt.user.name,
      candidateEmail: attempt.user.email,
      isReviewerApproved: attempt.user.isReviewerApproved,
      skillId: attempt.skillId,
      skillSlug: attempt.skill.slug,
      skillName: attempt.skill.name,
      category: attempt.skill.category,
      level: attempt.level,
      levelName: getSkillLevelName(attempt.level),
      stageTitle: attempt.stage.title,
      version: attempt.version,
      status: attempt.status,
      score: attempt.score ?? 0,
      passingScore: attempt.stage.passingScore,
      passed: attempt.status === "PASSED",
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
    }));

    res.json(paginated(items, total, page, pageSize));
  }),
);

/**
 * Elastic Intelligent Specialist Discovery Admin Operations
 */
router.get(
  "/elastic/status",
  asyncHandler(async (_req, res) => {
    res.json({
      elastic: {
        enabled: config.elasticEnabled,
        configured: config.elasticConfigured,
        indexName: config.elasticIndexSpecialists,
        jinaConfigured: config.jinaConfigured,
        embeddingModel: config.jinaEmbeddingModel,
        mode: config.elasticConfigured ? "HYBRID_ELASTIC" : "DATABASE_FALLBACK",
      },
    });
  }),
);

router.post(
  "/elastic/reindex",
  asyncHandler(async (req, res) => {
    const result = await reindexAllApprovedSpecialists(prisma);
    await audit(prisma, req, {
      action: "ELASTIC_SPECIALISTS_REINDEXED",
      entityType: "ElasticIndex",
      entityId: result.indexName,
      metadata: {
        elasticConfigured: result.elasticConfigured,
        indexedCount: result.indexedCount,
        removedCount: result.removedCount,
        errorCount: result.errors.length,
      },
    });
    res.json(result);
  }),
);

const elasticSearchSchema = z.object({
  query: z.string().trim().min(2).max(500),
  requiredSkills: z.array(z.string().trim().min(1).max(80)).default([]),
  minimumSkillLevel: z.coerce.number().int().min(1).max(3).default(1),
});

router.post(
  "/elastic/search",
  asyncHandler(async (req, res) => {
    const body = elasticSearchSchema.parse(req.body ?? {});
    const discovery = await discoverSpecialistCandidatesForTask({
      id: "admin-discovery-preview",
      title: body.query,
      question: body.query,
      acceptanceCriteria: body.query,
      category: "PROGRAMMING",
      requiredSkills: body.requiredSkills,
      minimumSkillLevel: body.minimumSkillLevel,
    });
    res.json({ discovery });
  }),
);

router.get(
  "/audit",
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip } = paginationFrom(req.query);
    const action = typeof req.query.action === "string" ? req.query.action : undefined;
    const where = action ? { action } : {};
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: { actor: { select: { id: true, name: true, email: true, role: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    res.json(
      paginated(
        items.map((item) => {
          const { metadataJson, ...rest } = item;
          return { ...rest, metadata: metadataJson ? JSON.parse(metadataJson) : null };
        }),
        total,
        page,
        pageSize,
      ),
    );
  }),
);

router.get(
  "/disputes",
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip } = paginationFrom(req.query);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const where = status ? { status } : {};
    const [items, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          openedBy: { select: { id: true, name: true, email: true, role: true } },
          task: {
            include: {
              reward: true,
              requester: { select: { id: true, name: true, email: true } },
              assignment: { include: { reviewer: { select: { id: true, name: true } } } },
            },
          },
        },
      }),
      prisma.dispute.count({ where }),
    ]);
    res.json(paginated(items, total, page, pageSize));
  }),
);

const resolveDisputeSchema = z.object({
  status: z.enum(["RESOLVED", "REJECTED"]),
  resolution: z.string().trim().min(10).max(2000),
  restoreTo: z.enum(["PAYMENT_READY", "PAYMENT_PAID", "VERIFICATION_REJECTED"]).optional(),
});

router.post(
  "/disputes/:id/resolve",
  asyncHandler(async (req, res) => {
    const body = resolveDisputeSchema.parse(req.body);
    const dispute = await prisma.dispute.findUnique({
      where: { id: req.params.id },
      include: {
        task: {
          include: {
            reward: true,
            assignment: { include: { reviewer: true } },
            requester: true,
            verificationRuns: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
    });
    if (!dispute) throw new AppError(404, "DISPUTE_NOT_FOUND", "Dispute not found.");
    if (dispute.status !== "OPEN") throw new AppError(409, "DISPUTE_CLOSED", "This dispute is already closed.");
    if (dispute.task.status !== "DISPUTED") {
      throw new AppError(409, "TASK_NOT_DISPUTED", `The task is ${dispute.task.status}, not DISPUTED.`);
    }

    const target =
      body.restoreTo ??
      (dispute.task.reward?.status === "PAID"
        ? "PAYMENT_PAID"
        : dispute.task.reward?.status === "AUTHORIZED"
          ? "PAYMENT_READY"
          : dispute.task.verificationRuns[0]?.status === "PASSED"
            ? "PAYMENT_READY"
            : "VERIFICATION_REJECTED");

    if (!canTransition("DISPUTED", target)) {
      throw new AppError(409, "INVALID_STATE_TRANSITION", `Cannot restore the task to ${target}.`);
    }

    const updated = await prisma.$transaction(async (db) => {
      const resolved = await db.dispute.update({
        where: { id: dispute.id },
        data: {
          status: body.status,
          resolution: body.resolution,
          resolvedAt: new Date(),
        },
      });
      await transitionTask(db, dispute.task.id, target, {
        type: "DISPUTE_RESOLVED",
        message: `Administrator resolved the dispute as ${body.status} and restored the task to ${target}.`,
        actorId: req.user!.id,
        metadata: { disputeId: dispute.id, resolution: body.resolution },
      });
      return resolved;
    });

    const recipients = new Set<string>([dispute.task.requesterId]);
    if (dispute.task.assignment?.reviewerId) recipients.add(dispute.task.assignment.reviewerId);
    for (const userId of recipients) {
      await notify(prisma, {
        userId,
        title: "Dispute resolved",
        body: body.resolution,
        link: `/app/tasks/${dispute.task.id}`,
      });
    }
    await audit(prisma, req, {
      action: "DISPUTE_RESOLVED",
      entityType: "Dispute",
      entityId: dispute.id,
      metadata: { status: body.status, restoreTo: target, resolution: body.resolution },
    });

    res.json({ dispute: updated });
  }),
);

export default router;
