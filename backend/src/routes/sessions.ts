import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { AppError, asyncHandler } from "../lib/errors.js";
import { audit, notify, recordTaskEvent } from "../lib/audit.js";
import { requireAuth } from "../auth/middleware.js";
import { analyzeTask } from "../services/ai/index.js";
import { analysisInputSchema, type AnalysisOutput } from "../services/ai/schema.js";
import { detectCategory, normalizeCategory } from "../lib/categories.js";
import { parseJson } from "../lib/json.js";
import { paginated, paginationFrom } from "../lib/http.js";
import { serializeAnalysisRun, serializeSession, serializeTaskSummary } from "../serializers.js";
import type { DbClient } from "../db.js";
import { transitionTask } from "../services/stateMachine.js";

const router = Router();
router.use(requireAuth);

const documentSchema = z.object({
  title: z.string().trim().min(2).max(250),
  url: z.string().trim().max(1000).optional().nullable(),
  publisher: z.string().trim().max(200).optional().nullable(),
  sourceType: z.enum(["MANUFACTURER", "RETAILER", "MARKETPLACE", "FORUM", "DOCUMENT"]).default("DOCUMENT"),
  content: z.string().trim().min(5).max(20000),
});

const createSessionSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  category: z.string().trim().max(80).optional(),
  question: z.string().trim().min(10).max(4000),
  productModels: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  specifications: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  documents: z.array(documentSchema).max(20).default([]),
});

const listQuerySchema = z.object({
  status: z.string().trim().max(50).optional(),
  q: z.string().trim().max(200).optional(),
});

const analysisInclude = {
  analysisRuns: { orderBy: { createdAt: "desc" as const }, take: 5 },
  evidence: { orderBy: { createdAt: "asc" as const } },
  tasks: {
    orderBy: { createdAt: "desc" as const },
    include: {
      reward: true,
      assignment: { include: { reviewer: { include: { profile: true } } } },
      submissions: { orderBy: { createdAt: "desc" as const }, take: 3 },
      verificationRuns: { orderBy: { createdAt: "desc" as const }, take: 1 },
    },
  },
};

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createSessionSchema.parse(req.body);
    const title = body.title || body.question.slice(0, 90);
    const category = normalizeCategory(
      body.category ??
        detectCategory({
          question: body.question,
          productModels: body.productModels,
          specifications: body.specifications,
          documents: body.documents,
        }),
    );

    const session = await prisma.agentSession.create({
      data: {
        userId: req.user!.id,
        title,
        category,
        question: body.question,
        productModelsJson: JSON.stringify(body.productModels),
        specificationsJson: JSON.stringify(body.specifications),
        status: "DRAFT",
        evidence: {
          create: body.documents.map((document) => ({
            title: document.title,
            url: document.url || null,
            publisher: document.publisher || null,
            sourceType: document.sourceType,
            content: document.content,
          })),
        },
      },
      include: analysisInclude,
    });

    await audit(prisma, req, {
      action: "SESSION_CREATED",
      entityType: "AgentSession",
      entityId: session.id,
      metadata: { documents: body.documents.length },
    });

    res.status(201).json({ session: serializeSession(session) });
  }),
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    const { page, pageSize, skip } = paginationFrom(req.query);
    const where = {
      ...(req.user!.role === "ADMIN" ? {} : { userId: req.user!.id }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q } },
              { question: { contains: query.q } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.agentSession.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          _count: { select: { tasks: true, evidence: true } },
          analysisRuns: { orderBy: { createdAt: "desc" }, take: 1 },
          tasks: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { reward: true },
          },
        },
      }),
      prisma.agentSession.count({ where }),
    ]);

    res.json(
      paginated(
        items.map((session) => ({
          ...serializeSession(session),
          latestAnalysis: session.analysisRuns[0]
            ? serializeAnalysisRun(session.analysisRuns[0])
            : null,
          latestTask: session.tasks[0]
            ? serializeTaskSummary({ ...session.tasks[0], _count: undefined }, req.user!)
            : null,
        })),
        total,
        page,
        pageSize,
      ),
    );
  }),
);

async function findSession(id: string, userId: string, role: string) {
  const session = await prisma.agentSession.findUnique({
    where: { id },
    include: {
      ...analysisInclude,
      tasks: {
        orderBy: { createdAt: "desc" },
        include: {
          reward: true,
          assignment: { include: { reviewer: { include: { profile: true } } } },
          submissions: { orderBy: { createdAt: "desc" } },
          verificationRuns: { orderBy: { createdAt: "desc" } },
          events: { orderBy: { createdAt: "asc" } },
          payments: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  if (!session) throw new AppError(404, "SESSION_NOT_FOUND", "Agent session not found.");
  if (role !== "ADMIN" && session.userId !== userId) {
    throw new AppError(403, "FORBIDDEN", "You do not have access to this session.");
  }
  return session;
}

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const session = await findSession(req.params.id, req.user!.id, req.user!.role);
    res.json({
      session: {
        ...serializeSession(session),
        tasks: session.tasks.map((task) => serializeTaskSummary(task, req.user!)),
      },
    });
  }),
);

router.post(
  "/:id/analyze",
  asyncHandler(async (req, res) => {
    const session = await findSession(req.params.id, req.user!.id, req.user!.role);
    if (session.tasks.some((task) => task.status !== "CANCELLED")) {
      throw new AppError(
        409,
        "SESSION_ALREADY_ESCALATED",
        "A review task already exists for this session, so the analysis is locked.",
      );
    }

    const input = analysisInputSchema.parse({
      category: normalizeCategory(session.category),
      question: session.question,
      productModels: parseJson<string[]>(session.productModelsJson, []),
      specifications: parseJson<string[]>(session.specificationsJson, []),
      documents: session.evidence.map((evidence) => ({
        title: evidence.title,
        url: evidence.url,
        publisher: evidence.publisher,
        sourceType: evidence.sourceType as "MANUFACTURER" | "RETAILER" | "MARKETPLACE" | "FORUM" | "DOCUMENT",
        content: evidence.content,
      })),
    });

    const result = await analyzeTask(input);

    const run = await prisma.$transaction(async (db) => {
      const created = await db.analysisRun.create({
        data: {
          sessionId: session.id,
          engine: result.engine,
          provider: result.provider,
          model: result.model,
          threshold: result.threshold,
          outputJson: JSON.stringify(result.output),
          recommendedAction: result.output.recommendedAction,
          confidenceScore: result.output.confidenceScore,
          durationMs: result.durationMs,
        },
      });

      const nextStatus =
        result.output.recommendedAction === "ESCALATE_TO_HUMAN"
          ? "ESCALATION_REQUIRED"
          : result.output.recommendedAction === "REQUEST_MORE_INFORMATION"
            ? "AWAITING_INFORMATION"
            : "ANALYSIS_COMPLETE";

      if (["DRAFT", "ANALYSIS_COMPLETE", "ESCALATION_REQUIRED", "AWAITING_INFORMATION"].includes(session.status)) {
        await db.agentSession.update({
          where: { id: session.id },
          data: { status: nextStatus },
        });
      }
      return created;
    });

    await audit(prisma, req, {
      action: "ANALYSIS_RUN",
      entityType: "AnalysisRun",
      entityId: run.id,
      metadata: {
        engine: result.engine,
        action: result.output.recommendedAction,
        confidence: result.output.confidenceScore,
        threshold: result.threshold,
      },
    });

    res.status(201).json({
      analysis: serializeAnalysisRun(run),
      sessionStatus:
        result.output.recommendedAction === "ESCALATE_TO_HUMAN"
          ? "ESCALATION_REQUIRED"
          : result.output.recommendedAction === "REQUEST_MORE_INFORMATION"
            ? "AWAITING_INFORMATION"
            : "ANALYSIS_COMPLETE",
      mode: result.engine === "demo" ? "DEMO_AI" : "PROVIDER_AI",
      threshold: result.threshold,
    });
  }),
);

const RESUME_ALLOWED = new Set([
  "VERIFIED",
  "PAYMENT_READY",
  "HANDED_OFF",
  "PAYMENT_PAID",
  "PAYOUT_FAILED",
  "ORIGINAL_TASK_RESUMED",
]);

router.post(
  "/:id/resume",
  asyncHandler(async (req, res) => {
    const session = await findSession(req.params.id, req.user!.id, req.user!.role);
    const task = session.tasks[0];
    if (!task) throw new AppError(409, "NO_REVIEW_TASK", "This session has no review task to resume from.");

    if (session.status === "RESOLVED") {
      res.json({
        session: serializeSession(session),
        finalAnswer: session.finalAnswer,
        message: "Session was already resumed with the verified answer.",
      });
      return;
    }

    if (task.status === "PAYMENT_PROCESSING") {
      throw new AppError(
        409,
        "PAYOUT_PROCESSING",
        "The verified answer is preserved, but the payout is still processing. Reconcile the payout before resuming.",
      );
    }
    if (!RESUME_ALLOWED.has(task.status)) {
      throw new AppError(
        409,
        "TASK_NOT_VERIFIED",
        `The verified answer is not available while the task is ${task.status}.`,
      );
    }

    const latestVerification = await prisma.verificationRun.findFirst({
      where: { taskId: task.id, status: "PASSED" },
      orderBy: { createdAt: "desc" },
    });
    if (!latestVerification) {
      throw new AppError(409, "VERIFICATION_REQUIRED", "No passing verification exists for this task.");
    }

    const submission = await prisma.reviewSubmission.findFirst({
      where: { taskId: task.id, status: "ACCEPTED" },
      orderBy: { createdAt: "desc" },
    });
    const finalAnswer = submission?.answer ?? task.finalAnswer;
    if (!finalAnswer) throw new AppError(409, "ANSWER_MISSING", "The verified answer is missing.");

    const updated = await prisma.$transaction(async (db: DbClient) => {
      const fresh = await db.reviewTask.findUnique({ where: { id: task.id } });
      if (fresh && fresh.status !== "ORIGINAL_TASK_RESUMED" && fresh.status !== "COMPLETED") {
        await transitionTask(db, task.id, "ORIGINAL_TASK_RESUMED", {
          type: "ORIGINAL_TASK_RESUMED",
          message: "The original AI session resumed with the verified human answer.",
          actorId: req.user!.id,
        });
        await transitionTask(db, task.id, "COMPLETED", {
          type: "COMPLETED",
          message: "Verified answer delivered to the original AI session.",
          actorId: req.user!.id,
        });
      } else if (fresh?.status === "ORIGINAL_TASK_RESUMED") {
        await transitionTask(db, task.id, "COMPLETED", {
          type: "COMPLETED",
          message: "Verified answer delivered to the original AI session.",
          actorId: req.user!.id,
        });
      }

      await db.reviewTask.update({
        where: { id: task.id },
        data: { finalAnswer, completedAt: new Date() },
      });

      const updatedSession = await db.agentSession.update({
        where: { id: session.id },
        data: { status: "RESOLVED", finalAnswer, resolvedAt: new Date() },
        include: analysisInclude,
      });

      await recordTaskEvent(db, {
        taskId: task.id,
        type: "ANSWER_DELIVERED",
        message: "Verified answer stored on the original agent session.",
        actorId: req.user!.id,
      });

      return updatedSession;
    });

    if (task.assignment) {
      await notify(prisma, {
        userId: task.assignment.reviewerId,
        title: "Review completed",
        body: `The requester resumed their AI session with your verified answer for "${task.title}".`,
        link: `/app/tasks/${task.id}`,
      });
    }
    await audit(prisma, req, {
      action: "SESSION_RESUMED",
      entityType: "AgentSession",
      entityId: session.id,
      metadata: { taskId: task.id, taskStatus: "COMPLETED" },
    });

    res.json({
      session: serializeSession(updated),
      finalAnswer,
      message: "Original AI session resumed with the verified answer.",
    });
  }),
);

export default router;
