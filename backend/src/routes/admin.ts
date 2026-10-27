import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { AppError, asyncHandler } from "../lib/errors.js";
import { requireRole } from "../auth/middleware.js";
import { audit, notify } from "../lib/audit.js";
import { paginated, paginationFrom } from "../lib/http.js";
import { serializeUserAdmin } from "../serializers.js";
import { canTransition, transitionTask } from "../services/stateMachine.js";

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
