import { Router } from "express";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { asyncHandler } from "../lib/errors.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { formatMinorUnits } from "../lib/money.js";
import { parseJson } from "../lib/json.js";
import { serializeTaskSummary } from "../serializers.js";

const router = Router();
router.use(requireAuth);

function money(minor: number, currency = config.paypalCurrency) {
  return { minor, display: formatMinorUnits(minor, currency), currency };
}

router.get(
  "/agent",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const [sessions, tasks, funding, rewards, recentTasks, recentSessions] = await Promise.all([
      prisma.agentSession.groupBy({
        by: ["status"],
        where: req.user!.role === "ADMIN" ? {} : { userId },
        _count: { _all: true },
      }),
      prisma.reviewTask.groupBy({
        by: ["status"],
        where: { requesterId: userId },
        _count: { _all: true },
      }),
      prisma.paymentTransaction.aggregate({
        where: { type: "FUNDING", status: "COMPLETED", task: { requesterId: userId } },
        _sum: { amountMinor: true },
        _count: { _all: true },
      }),
      prisma.reward.aggregate({
        where: {
          task: { requesterId: userId },
          status: { in: ["AUTHORIZED", "PROCESSING", "PAID"] },
        },
        _sum: { amountMinor: true },
        _count: { _all: true },
      }),
      prisma.reviewTask.findMany({
        where: { requesterId: userId },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          reward: true,
          assignment: { include: { reviewer: { select: { id: true, name: true } } } },
          _count: { select: { submissions: true } },
        },
      }),
      prisma.agentSession.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { analysisRuns: { orderBy: { createdAt: "desc" }, take: 1 } },
      }),
    ]);

    const sessionsByStatus = sessions.map((row) => ({ status: row.status, count: row._count._all }));
    const tasksByStatus = tasks.map((row) => ({ status: row.status, count: row._count._all }));

    res.json({
      sessions: {
        total: sessionsByStatus.reduce((sum, row) => sum + row.count, 0),
        byStatus: sessionsByStatus,
      },
      tasks: {
        total: tasksByStatus.reduce((sum, row) => sum + row.count, 0),
        byStatus: tasksByStatus,
        awaitingFunding: tasksByStatus.find((row) => row.status === "AWAITING_FUNDING")?.count ?? 0,
        active: tasksByStatus
          .filter((row) => !["COMPLETED", "CANCELLED", "EXPIRED"].includes(row.status))
          .reduce((sum, row) => sum + row.count, 0),
      },
      funding: money(funding._sum.amountMinor ?? 0),
      fundingCount: funding._count._all,
      approvedRewards: money(rewards._sum.amountMinor ?? 0),
      approvedRewardCount: rewards._count._all,
      recentTasks: recentTasks.map((task) => serializeTaskSummary(task, req.user!)),
      recentSessions: recentSessions.map((session) => ({
        id: session.id,
        title: session.title,
        status: session.status,
        createdAt: session.createdAt,
        confidence: session.analysisRuns[0]?.confidenceScore ?? null,
        action: session.analysisRuns[0]?.recommendedAction ?? null,
      })),
    });
  }),
);

router.get(
  "/reviewer",
  requireRole("REVIEWER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const assignmentFilter = { assignment: { is: { reviewerId: userId } } };
    const [available, assignments, earnings, pendingRewards, submissions, availableTasks, recentPayouts, profile] =
      await Promise.all([
        prisma.reviewTask.count({ where: { status: "FUNDED", assignment: { is: null } } }),
        prisma.reviewTask.groupBy({
          by: ["status"],
          where: assignmentFilter,
          _count: { _all: true },
        }),
        prisma.paymentTransaction.aggregate({
          where: {
            type: "PAYOUT",
            status: "COMPLETED",
            task: { assignment: { is: { reviewerId: userId } } },
          },
          _sum: { amountMinor: true },
          _count: { _all: true },
        }),
        prisma.reward.aggregate({
          where: {
            task: { assignment: { is: { reviewerId: userId } } },
            status: { in: ["AUTHORIZED", "PROCESSING"] },
          },
          _sum: { amountMinor: true },
          _count: { _all: true },
        }),
        prisma.reviewSubmission.count({ where: { reviewerId: userId } }),
        prisma.reviewTask.findMany({
          where: { status: "FUNDED", assignment: { is: null } },
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            reward: true,
            requester: { select: { id: true, name: true } },
            assignment: { include: { reviewer: { select: { id: true, name: true } } } },
            _count: { select: { submissions: true } },
          },
        }),
        prisma.reviewTask.findMany({
          where: { ...assignmentFilter, status: { in: ["PAYMENT_READY", "PAYMENT_PROCESSING", "PAYMENT_PAID", "PAYOUT_FAILED"] } },
          orderBy: { updatedAt: "desc" },
          take: 5,
          include: {
            reward: true,
            assignment: { include: { reviewer: { select: { id: true, name: true } } } },
            payments: { where: { type: "PAYOUT" }, orderBy: { createdAt: "desc" } },
          },
        }),
        prisma.userProfile.findUnique({ where: { userId } }),
      ]);

    const assignmentsByStatus = assignments.map((row) => ({ status: row.status, count: row._count._all }));

    res.json({
      approval: {
        approved: req.user!.isReviewerApproved,
        role: req.user!.role,
      },
      availableCount: available,
      assignments: {
        total: assignmentsByStatus.reduce((sum, row) => sum + row.count, 0),
        byStatus: assignmentsByStatus,
        active: assignmentsByStatus
          .filter((row) => !["COMPLETED", "CANCELLED", "EXPIRED"].includes(row.status))
          .reduce((sum, row) => sum + row.count, 0),
        completed: assignmentsByStatus
          .filter((row) => ["COMPLETED", "PAYMENT_PAID"].includes(row.status))
          .reduce((sum, row) => sum + row.count, 0),
      },
      earnings: money(earnings._sum.amountMinor ?? 0),
      completedPayoutCount: earnings._count._all,
      pendingRewards: money(pendingRewards._sum.amountMinor ?? 0),
      pendingRewardCount: pendingRewards._count._all,
      submissionCount: submissions,
      availableTasks: availableTasks.map((task) => serializeTaskSummary(task, req.user!)),
      recentPayouts: recentPayouts.map((task) => ({
        taskId: task.id,
        title: task.title,
        status: task.status,
        reward: task.reward
          ? { ...task.reward, amountDisplay: formatMinorUnits(task.reward.amountMinor, task.reward.currency) }
          : null,
        payouts: task.payments.map((payment) => ({
          id: payment.id,
          status: payment.status,
          mode: payment.mode,
          amountDisplay: formatMinorUnits(payment.amountMinor, payment.currency),
          paidAt: payment.paidAt,
          createdAt: payment.createdAt,
        })),
      })),
      payoutProfile: profile
        ? {
            email: profile.payoutEmail,
            consent: profile.payoutConsent,
            provider: profile.payoutProvider,
          }
        : null,
      skills: parseJson<string[]>(
        JSON.stringify(
          (
            await prisma.reviewerSkill.findMany({ where: { userId } })
          ).map((skill) => skill.name),
        ),
        [],
      ),
    });
  }),
);

router.get(
  "/admin",
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const [
      usersByRole,
      pendingReviewers,
      tasksByStatus,
      submissions,
      verifications,
      approvedRewards,
      fundingCompleted,
      fundingSimulated,
      fundingSandbox,
      payoutsCompleted,
      failedPayments,
      payoutsAvailable,
      webhookCounts,
      openDisputes,
      recentAudit,
      recentTasks,
    ] = await Promise.all([
      prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
      prisma.user.count({ where: { role: "REVIEWER", isReviewerApproved: false } }),
      prisma.reviewTask.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.reviewSubmission.count(),
      prisma.verificationRun.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.reward.aggregate({
        where: { status: { in: ["AUTHORIZED", "PROCESSING", "PAID"] } },
        _sum: { amountMinor: true },
        _count: { _all: true },
      }),
      prisma.paymentTransaction.aggregate({
        where: { type: "FUNDING", status: "COMPLETED" },
        _sum: { amountMinor: true },
        _count: { _all: true },
      }),
      prisma.paymentTransaction.aggregate({
        where: { mode: "SIMULATED", status: "COMPLETED" },
        _sum: { amountMinor: true },
        _count: { _all: true },
      }),
      prisma.paymentTransaction.aggregate({
        where: { mode: "SANDBOX", status: "COMPLETED" },
        _sum: { amountMinor: true },
        _count: { _all: true },
      }),
      prisma.paymentTransaction.aggregate({
        where: { type: "PAYOUT", status: "COMPLETED" },
        _sum: { amountMinor: true },
        _count: { _all: true },
      }),
      prisma.paymentTransaction.count({ where: { status: "FAILED" } }),
      prisma.paymentTransaction.count({
        where: { type: "PAYOUT", status: "PROCESSING" },
      }),
      prisma.paymentWebhookEvent.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.dispute.count({ where: { status: "OPEN" } }),
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
      prisma.reviewTask.findMany({
        where: { status: { in: ["FAILED", "FUNDING_FAILED", "PAYOUT_FAILED", "NEEDS_MANUAL_REVIEW", "DISPUTED"] } },
        orderBy: { updatedAt: "desc" },
        take: 8,
        include: {
          reward: true,
          requester: { select: { name: true, email: true } },
          assignment: { include: { reviewer: { select: { name: true } } } },
          payments: { orderBy: { createdAt: "desc" } },
        },
      }),
    ]);

    res.json({
      users: {
        byRole: usersByRole.map((row) => ({ role: row.role, count: row._count._all })),
        total: usersByRole.reduce((sum, row) => sum + row._count._all, 0),
        pendingReviewerApprovals: pendingReviewers,
      },
      tasks: {
        byStatus: tasksByStatus.map((row) => ({ status: row.status, count: row._count._all })),
        total: tasksByStatus.reduce((sum, row) => sum + row._count._all, 0),
      },
      submissions,
      verifications: {
        byStatus: verifications.map((row) => ({ status: row.status, count: row._count._all })),
        total: verifications.reduce((sum, row) => sum + row._count._all, 0),
      },
      approvedRewards: money(approvedRewards._sum.amountMinor ?? 0, "USD"),
      approvedRewardCount: approvedRewards._count._all,
      funding: {
        completed: money(fundingCompleted._sum.amountMinor ?? 0, "USD"),
        completedCount: fundingCompleted._count._all,
        simulated: money(fundingSimulated._sum.amountMinor ?? 0, "USD"),
        simulatedCount: fundingSimulated._count._all,
        sandbox: money(fundingSandbox._sum.amountMinor ?? 0, "USD"),
        sandboxCount: fundingSandbox._count._all,
      },
      payouts: {
        completed: money(payoutsCompleted._sum.amountMinor ?? 0, "USD"),
        completedCount: payoutsCompleted._count._all,
        processingCount: payoutsAvailable,
      },
      failedPayments,
      webhooks: {
        byStatus: webhookCounts.map((row) => ({ status: row.status, count: row._count._all })),
        total: webhookCounts.reduce((sum, row) => sum + row._count._all, 0),
      },
      openDisputes,
      recentAudit,
      attentionTasks: recentTasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        requester: task.requester,
        reviewer: task.assignment?.reviewer.name ?? null,
        reward: task.reward
          ? { ...task.reward, amountDisplay: formatMinorUnits(task.reward.amountMinor, task.reward.currency) }
          : null,
        failedPayments: task.payments
          .filter((payment) => payment.status === "FAILED")
          .map((payment) => ({
            id: payment.id,
            type: payment.type,
            message: payment.failureMessage,
            mode: payment.mode,
          })),
      })),
    });
  }),
);

export default router;
