import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { AppError, asyncHandler } from "../lib/errors.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { handlePayPalWebhook } from "../services/webhooks.js";
import { audit } from "../lib/audit.js";

const router = Router();

router.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    const headers = req.headers as Record<string, string | undefined>;
    const outcome = await handlePayPalWebhook(headers, req.body ?? {});
    res.status(outcome.status).json({
      received: true,
      duplicate: outcome.duplicate,
      eventId: outcome.eventId,
      message: outcome.message,
    });
  }),
);

const simulateSchema = z.object({
  id: z.string().trim().min(3).max(200),
  event_type: z.string().trim().min(3).max(100),
  resource_type: z.string().trim().max(100).optional(),
  resource: z.record(z.unknown()).default({}),
});

/**
 * Local-only webhook simulator. This is NOT an alternative signature check:
 * it is a separate admin-only endpoint that only exists in demo mode, and it
 * records the event as simulated. Genuine Sandbox webhooks always go through
 * /webhook and PayPal's verification API.
 */
router.post(
  "/webhook/simulate",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    if (!config.demoMode) {
      throw new AppError(
        404,
        "SIMULATION_DISABLED",
        "Local webhook simulation is only available in demo mode. Genuine Sandbox webhooks must be verified through PayPal.",
      );
    }
    const body = simulateSchema.parse(req.body);
    const outcome = await handlePayPalWebhook(
      {},
      {
        id: body.id,
        event_type: body.event_type,
        resource_type: body.resource_type,
        resource: body.resource,
      },
      { simulated: true, actorId: req.user!.id },
    );
    await audit(prisma, req, {
      action: "WEBHOOK_SIMULATED",
      entityType: "PaymentWebhookEvent",
      entityId: outcome.eventId,
      metadata: { eventType: body.event_type },
    });
    res.json({ ...outcome, note: "Simulated webhook. No PayPal call was made." });
  }),
);

router.get(
  "/webhook-events",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const events = await prisma.paymentWebhookEvent.findMany({
      orderBy: { receivedAt: "desc" },
      take: 50,
    });
    res.json({
      items: events.map((event) => {
        const { payloadJson: _payload, ...rest } = event;
        return rest;
      }),
    });
  }),
);

export default router;
