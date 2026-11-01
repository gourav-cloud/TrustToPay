import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { AppError, asyncHandler } from "../lib/errors.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { createFundingOrder, captureFundingOrder, releasePayout, reconcilePayment, retryPayment, serializePayment, paymentSummaryForTask } from "../services/payments.js";
import { paymentRateLimit } from "../middleware/security.js";
import { paginated, paginationFrom } from "../lib/http.js";
import { audit } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

const orderSchema = z.object({ taskId: z.string().trim().min(1).max(100) });

router.post(
  "/paypal/orders",
  paymentRateLimit(),
  asyncHandler(async (req, res) => {
    const body = orderSchema.parse(req.body);
    const result = await createFundingOrder(req.user!, body.taskId, req);
    res.status(201).json(result);
  }),
);

router.post(
  "/paypal/orders/:orderId/capture",
  paymentRateLimit(),
  asyncHandler(async (req, res) => {
    const result = await captureFundingOrder(req.user!, req.params.orderId, req);
    res.status(result.completed ? 200 : 202).json(result);
  }),
);

router.post(
  "/payouts",
  paymentRateLimit(),
  asyncHandler(async (req, res) => {
    const body = orderSchema.parse(req.body);
    const result = await releasePayout(req.user!, body.taskId, req);
    res.status(201).json(result);
  }),
);

const listQuery = z.object({
  type: z.enum(["FUNDING", "PAYOUT"]).optional(),
  status: z.string().trim().max(40).optional(),
  mode: z.enum(["SIMULATED", "SANDBOX"]).optional(),
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listQuery.parse(req.query);
    const { page, pageSize, skip } = paginationFrom(req.query);

    const where = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.mode ? { mode: query.mode } : {}),
      ...(req.user!.role === "ADMIN"
        ? {}
        : req.user!.role === "REVIEWER"
          ? { type: "PAYOUT", task: { assignment: { is: { reviewerId: req.user!.id } } } }
          : { task: { requesterId: req.user!.id } }),
    };

    const [items, total] = await Promise.all([
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
              assignment: { select: { reviewerId: true, reviewer: { select: { name: true } } } },
            },
          },
        },
      }),
      prisma.paymentTransaction.count({ where }),
    ]);

    res.json(
      paginated(
        items.map((item) => ({
          ...serializePayment(item),
          task: item.task,
        })),
        total,
        page,
        pageSize,
      ),
    );
  }),
);

router.get(
  "/summary/:taskId",
  asyncHandler(async (req, res) => {
    const summary = await paymentSummaryForTask(req.params.taskId);
    res.json({ summary });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const payment = await prisma.paymentTransaction.findUnique({
      where: { id: req.params.id },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            requesterId: true,
            assignment: { select: { reviewerId: true } },
          },
        },
        reward: true,
      },
    });
    if (!payment) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment transaction not found.");

    const isAdmin = req.user!.role === "ADMIN";
    const isRequester = payment.task.requesterId === req.user!.id;
    const isReviewer = payment.task.assignment?.reviewerId === req.user!.id;
    if (!isAdmin && !isRequester && !(isReviewer && payment.type === "PAYOUT")) {
      throw new AppError(403, "FORBIDDEN", "You do not have access to this payment.");
    }

    res.json({
      payment: {
        ...serializePayment(payment),
        task: payment.task,
        reward: payment.reward
          ? {
              ...payment.reward,
              amountDisplay: payment.reward.amountMinor,
            }
          : null,
      },
    });
  }),
);

router.post(
  "/:id/reconcile",
  asyncHandler(async (req, res) => {
    const result = await reconcilePayment(req.user!, req.params.id, req);
    res.json(result);
  }),
);

router.post(
  "/:id/retry",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const result = await retryPayment(req.user!, req.params.id, req);
    await audit(prisma, req, {
      action: "PAYMENT_RETRY",
      entityType: "PaymentTransaction",
      entityId: req.params.id,
      metadata: { resultingStatus: result.transaction.status },
    });
    res.status(201).json(result);
  }),
);

export default router;

// Ensure the payment mode is part of the API surface without exposing secrets.
export function paymentConfigPublic() {
  return {
    mode: config.paymentsMode,
    simulated: config.paymentsMode === "SIMULATED",
    currency: config.paypalCurrency,
    payoutsEnabled: config.paypalPayoutsEnabled,
  };
}
