import { prisma } from "../db.js";
import { config } from "../config.js";
import { AppError } from "../lib/errors.js";
import { safeJson } from "../lib/json.js";
import { parseProviderAmount } from "../lib/money.js";
import { finalizeFunding, finalizePayout, reconcilePayoutTransaction } from "./payments.js";
import { getPayPalGateway } from "./paypal/client.js";
import { recordTaskEvent } from "../lib/audit.js";

type WebhookEvent = {
  id?: unknown;
  event_type?: unknown;
  resource_type?: unknown;
  resource?: Record<string, unknown>;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function nestedString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function amountFromResource(resource: Record<string, unknown>): {
  amountMinor: number | null;
  currency: string | null;
} {
  const amount = record(resource.amount);
  let amountMinor: number | null = null;
  if (typeof amount.value === "string") {
    try {
      amountMinor = parseProviderAmount(amount.value);
    } catch {
      amountMinor = null;
    }
  }
  return {
    amountMinor,
    currency: typeof amount.currency_code === "string" ? amount.currency_code : null,
  };
}

async function findFundingTransaction(
  resource: Record<string, unknown>,
): Promise<{ id: string; taskId: string } | null> {
  const supplementary = record(resource.supplementary_data);
  const related = record(supplementary.related_ids);
  const orderId = nestedString(related.order_id);
  const captureId = nestedString(resource.id);

  const transaction = await prisma.paymentTransaction.findFirst({
    where: {
      type: "FUNDING",
      OR: [
        ...(orderId ? [{ orderId }] : []),
        ...(captureId ? [{ captureId }] : []),
      ],
    },
    select: { id: true, taskId: true },
  });
  return transaction;
}

async function findPayoutTransaction(
  resource: Record<string, unknown>,
): Promise<{ id: string; taskId: string; payoutBatchId: string | null; payoutItemId: string | null } | null> {
  const payoutItemId = nestedString(resource.payout_item_id);
  const payoutBatchId = nestedString(resource.payout_batch_id);
  const senderItemId = nestedString(record(resource.payout_item).sender_item_id);

  const or = [
    ...(payoutItemId ? [{ payoutItemId }] : []),
    ...(payoutBatchId ? [{ payoutBatchId }] : []),
    ...(senderItemId ? [{ id: senderItemId }] : []),
  ];
  if (or.length === 0) return null;

  return prisma.paymentTransaction.findFirst({
    where: { type: "PAYOUT", OR: or },
    select: { id: true, taskId: true, payoutBatchId: true, payoutItemId: true },
  });
}

export type WebhookOutcome = {
  status: number;
  duplicate: boolean;
  eventId: string;
  message: string;
  simulated: boolean;
};

/**
 * Official PayPal webhook flow:
 *  1. verify the signature through PayPal's verify-webhook-signature API
 *  2. deduplicate by provider event ID
 *  3. reconcile provider status before changing the local ledger
 *
 * `simulated` is only used by the local admin-only demo endpoint. It is never
 * reachable in genuine Sandbox mode.
 */
export async function handlePayPalWebhook(
  headers: Record<string, string | undefined>,
  event: WebhookEvent,
  options: { simulated?: boolean; actorId?: string } = {},
): Promise<WebhookOutcome> {
  const eventId = typeof event?.id === "string" ? event.id : "";
  const eventType = typeof event?.event_type === "string" ? event.event_type : "";
  if (!eventId || !eventType) {
    throw new AppError(400, "WEBHOOK_INVALID", "Webhook event is missing id or event_type.");
  }

  const simulated = Boolean(options.simulated);
  const verified = Boolean(
    !simulated && config.paypalConfigured && config.paypalWebhookId,
  );

  if (!simulated) {
    if (!config.paypalConfigured) {
      throw new AppError(
        503,
        "PAYPAL_NOT_CONFIGURED",
        "Genuine Sandbox mode is not configured, so real webhooks cannot be verified.",
      );
    }
    if (!config.paypalWebhookId) {
      throw new AppError(
        503,
        "PAYPAL_WEBHOOK_NOT_CONFIGURED",
        "PAYPAL_WEBHOOK_ID is missing. Webhook signatures cannot be verified, so the event was rejected.",
      );
    }
    const gateway = getPayPalGateway();
    let valid = false;
    try {
      valid = await gateway.verifyWebhook(headers, event);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(502, "WEBHOOK_VERIFICATION_FAILED", "PayPal webhook verification could not be completed.");
    }
    if (!valid) {
      throw new AppError(400, "WEBHOOK_SIGNATURE_INVALID", "PayPal webhook signature verification failed.");
    }
  }

  const existing = await prisma.paymentWebhookEvent.findUnique({ where: { eventId } });
  if (existing) {
    return {
      status: 200,
      duplicate: true,
      eventId,
      message: "Duplicate webhook event ignored.",
      simulated,
    };
  }

  const resource = record(event.resource);
  const stored = await prisma.paymentWebhookEvent.create({
    data: {
      eventId,
      eventType,
      resourceType: typeof event.resource_type === "string" ? event.resource_type : null,
      resourceId:
        nestedString(resource.id) ??
        nestedString(resource.payout_item_id) ??
        nestedString(resource.payout_batch_id),
      verified: verified || simulated,
      status: "RECEIVED",
      payloadJson: safeJson(event),
    },
  });

  try {
    let message = "Webhook received.";
    let ignored = false;

    if (eventType === "CHECKOUT.ORDER.APPROVED") {
      const orderId = nestedString(resource.id);
      if (orderId) {
        await prisma.paymentTransaction.updateMany({
          where: { type: "FUNDING", orderId, status: "CREATED" },
          data: { status: "APPROVED" },
        });
      }
      message = "Approved order recorded. Capture must still be confirmed on the server.";
      ignored = true;
    } else if (eventType.startsWith("PAYMENT.CAPTURE.")) {
      const funding = await findFundingTransaction(resource);
      if (!funding) {
        message = "No local funding transaction matches this capture event.";
        ignored = true;
      } else if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
        const { amountMinor, currency } = amountFromResource(resource);
        if (amountMinor === null || !currency) {
          throw new AppError(400, "WEBHOOK_AMOUNT_INVALID", "Capture webhook is missing a valid amount.");
        }
        const supplementary = record(resource.supplementary_data);
        const related = record(supplementary.related_ids);
        const updated = await finalizeFunding(funding.id, {
          status: "COMPLETED",
          captureId: nestedString(resource.id),
          amountMinor,
          currency,
          referenceId: nestedString(related.order_id) ? null : null,
          safePayload: { eventType, captureId: resource.id },
        });
        message = `Funding ledger reconciled from webhook: ${updated.status}.`;
      } else if (
        eventType === "PAYMENT.CAPTURE.DENIED" ||
        eventType === "PAYMENT.CAPTURE.DECLINED"
      ) {
        await finalizeFunding(funding.id, {
          status: "FAILED",
          failureCode: eventType,
          failureMessage: "PayPal reported that the capture was denied.",
          safePayload: { eventType },
        });
        message = "Funding marked failed from verified webhook.";
      } else {
        await recordTaskEvent(prisma, {
          taskId: funding.taskId,
          type: "FUNDING_PROVIDER_EVENT",
          message: `PayPal event ${eventType} recorded. Ledger unchanged.`,
          metadata: { eventId, eventType },
        });
        message = `Event ${eventType} recorded without changing the funding ledger.`;
        ignored = true;
      }
    } else if (eventType.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
      const payout = await findPayoutTransaction(resource);
      if (!payout) {
        message = "No local payout transaction matches this event.";
        ignored = true;
      } else if (
        eventType === "PAYMENT.PAYOUTS-ITEM.SUCCEEDED" ||
        eventType === "PAYMENT.PAYOUTS-ITEM.FAILED" ||
        eventType === "PAYMENT.PAYOUTS-ITEM.RETURNED" ||
        eventType === "PAYMENT.PAYOUTS-ITEM.BLOCKED" ||
        eventType === "PAYMENT.PAYOUTS-ITEM.DENIED"
      ) {
        const batchId = nestedString(resource.payout_batch_id);
        if (batchId && !payout.payoutBatchId) {
          await prisma.paymentTransaction.update({
            where: { id: payout.id },
            data: {
              payoutBatchId: batchId,
              payoutItemId: nestedString(resource.payout_item_id),
            },
          });
        }

        if (eventType === "PAYMENT.PAYOUTS-ITEM.SUCCEEDED") {
          try {
            const reconciled = await reconcilePayoutTransaction(payout.id);
            message = `Payout reconciled from webhook: ${reconciled.status}.`;
          } catch {
            message = "Payout success webhook received; reconciliation is still pending. Ledger not marked paid.";
          }
        } else {
          const { amountMinor, currency } = amountFromResource(resource);
          await finalizePayout(payout.id, {
            status: "FAILED",
            failureCode: eventType,
            failureMessage: `PayPal reported ${eventType.replace("PAYMENT.PAYOUTS-ITEM.", "")}.`,
            payoutBatchId: nestedString(resource.payout_batch_id),
            payoutItemId: nestedString(resource.payout_item_id),
            safePayload: { eventType, amountMinor, currency },
          });
          message = "Payout marked failed from verified webhook.";
        }
      } else {
        message = `Payout event ${eventType} recorded without changing the ledger.`;
        ignored = true;
      }
    } else {
      message = `Event ${eventType} is not handled by this application.`;
      ignored = true;
    }

    await prisma.paymentWebhookEvent.update({
      where: { id: stored.id },
      data: {
        status: ignored ? "IGNORED" : "PROCESSED",
        processedAt: new Date(),
      },
    });

    return { status: 200, duplicate: false, eventId, message, simulated };
  } catch (error) {
    await prisma.paymentWebhookEvent.update({
      where: { id: stored.id },
      data: {
        status: "FAILED",
        processedAt: new Date(),
        error: (error instanceof Error ? error.message : "Webhook processing failed.").slice(0, 500),
      },
    });
    if (error instanceof AppError) throw error;
    throw new AppError(500, "WEBHOOK_PROCESSING_FAILED", "Webhook was stored but processing failed.");
  }
}
