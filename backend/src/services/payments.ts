import { randomUUID } from "node:crypto";
import type { PaymentTransaction } from "@prisma/client";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { AppError } from "../lib/errors.js";
import { transitionTask } from "./stateMachine.js";
import { audit, notify, recordTaskEvent } from "../lib/audit.js";
import { formatMinorUnits, isSupportedCurrency, toPayPalAmount } from "../lib/money.js";
import { getPayPalGateway, type PayPalOrderSnapshot, type PayPalPayoutBatchSnapshot } from "./paypal/client.js";
import { safeJson } from "../lib/json.js";

export type PaymentActor = { id: string; role: string };

const PAYOUT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PayoutAvailability = "DEMO_SIMULATED" | "PAYOUT_UNAVAILABLE" | "SANDBOX_ENABLED";

export function resolvePayoutAvailability(): PayoutAvailability {
  if (config.paymentsMode === "SIMULATED") return "DEMO_SIMULATED";
  if (config.paypalConfigured && config.paypalPayoutsEnabled) return "SANDBOX_ENABLED";
  return "PAYOUT_UNAVAILABLE";
}

export const INDIA_PAYOUT_CONSTRAINT_NOTE =
  "PayPal Sandbox Checkout (Orders v2) works with Indian merchant accounts, but PayPal Payouts requires separate regional approval. When PAYPAL_PAYOUTS_ENABLED=false, payouts are marked PAYOUT_UNAVAILABLE or can be demonstrated with DEMO_MODE=true (DEMO_SIMULATED).";

export type PaymentView = Omit<PaymentTransaction, "safePayloadJson"> & {
  isSimulated: boolean;
  amountDisplay: string;
  payoutAvailability: PayoutAvailability;
};

export function serializePayment(transaction: PaymentTransaction): PaymentView {
  const { safePayloadJson: _omit, ...rest } = transaction;
  return {
    ...rest,
    isSimulated: transaction.mode === "SIMULATED",
    amountDisplay: formatMinorUnits(transaction.amountMinor, transaction.currency),
    payoutAvailability:
      transaction.mode === "SIMULATED"
        ? "DEMO_SIMULATED"
        : config.paypalPayoutsEnabled
          ? "SANDBOX_ENABLED"
          : "PAYOUT_UNAVAILABLE",
  };
}

export function paymentModeSummary() {
  const payoutAvailability = resolvePayoutAvailability();
  return {
    mode: config.paymentsMode,
    simulated: config.paymentsMode === "SIMULATED",
    provider: config.paymentsMode === "SIMULATED" ? "DemoPaymentProvider" : "PayPalSandboxCheckoutProvider",
    payoutsProvider:
      config.paymentsMode === "SIMULATED"
        ? "DemoPaymentProvider"
        : config.paypalPayoutsEnabled
          ? "PayPalSandboxPayoutProvider"
          : "Unavailable (PAYPAL_PAYOUTS_ENABLED=false)",
    payoutAvailability,
    indiaMerchantConstraintNote: INDIA_PAYOUT_CONSTRAINT_NOTE,
    paypalConfigured: config.paypalConfigured,
    payoutsEnabled: config.paypalPayoutsEnabled,
    currency: config.paypalCurrency,
  };
}

function assertPayPalReady(): void {
  if (config.paymentsMode !== "SANDBOX") {
    throw new AppError(
      409,
      "PAYMENT_MODE_SIMULATED",
      "This action needs genuine PayPal Sandbox mode. Set DEMO_MODE=false and configure Sandbox credentials.",
      { mode: config.paymentsMode },
    );
  }
  if (!config.paypalConfigured) {
    throw new AppError(
      503,
      "PAYPAL_NOT_CONFIGURED",
      "Genuine PayPal Sandbox mode was requested, but PAYPAL_CLIENT_ID and/or PAYPAL_CLIENT_SECRET are missing.",
      {
        required: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"],
        hint: "Add both Sandbox credentials from developer.paypal.com, or set DEMO_MODE=true for clearly labelled simulated payments.",
      },
    );
  }
}

function validateRewardAmount(amountMinor: number, currency: string): void {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new AppError(400, "INVALID_AMOUNT", "Reward must be a positive integer amount in minor units.");
  }
  if (amountMinor < config.rewardMinMinor || amountMinor > config.rewardMaxMinor) {
    throw new AppError(
      400,
      "REWARD_OUT_OF_RANGE",
      `Reward must be between ${formatMinorUnits(config.rewardMinMinor)} and ${formatMinorUnits(config.rewardMaxMinor)}.`,
    );
  }
  if (!isSupportedCurrency(currency)) {
    throw new AppError(400, "CURRENCY_NOT_SUPPORTED", `Currency ${currency} is not supported.`);
  }
}

function taskAccess(actor: PaymentActor, requesterId: string): void {
  if (actor.role !== "ADMIN" && requesterId !== actor.id) {
    throw new AppError(403, "FORBIDDEN", "Only the requester or an administrator can manage this payment.");
  }
}

async function loadTaskForPayment(taskId: string) {
  const task = await prisma.reviewTask.findUnique({
    where: { id: taskId },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      reward: true,
      assignment: { include: { reviewer: { include: { profile: true } } } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!task) throw new AppError(404, "TASK_NOT_FOUND", "Review task not found.");
  return task;
}

function paymentResponse(transaction: PaymentTransaction) {
  return {
    transaction: serializePayment(transaction),
    paypal:
      transaction.provider === "PAYPAL_SANDBOX"
        ? {
            mode: "SANDBOX",
            provider: "PayPal Sandbox",
            orderId: transaction.orderId,
            clientId: config.paypalClientId || null,
            currency: transaction.currency,
            amount: toPayPalAmount(transaction.amountMinor),
          }
        : {
            mode: "SIMULATED",
            provider: "DemoPaymentProvider",
            orderId: transaction.orderId,
            clientId: null,
            currency: transaction.currency,
            amount: toPayPalAmount(transaction.amountMinor),
          },
  };
}

/** Create (or recover) a funding order. Duplicate requests reuse the open transaction. */
export async function createFundingOrder(actor: PaymentActor, taskId: string, req?: import("express").Request) {
  const task = await loadTaskForPayment(taskId);
  taskAccess(actor, task.requesterId);
  if (!task.reward) throw new AppError(409, "REWARD_MISSING", "This task has no reward to fund.");

  if (task.status !== "AWAITING_FUNDING" && task.status !== "FUNDING_FAILED") {
    throw new AppError(
      409,
      "TASK_NOT_FUNDABLE",
      `This task is ${task.status}; a new funding order cannot be created.`,
    );
  }

  validateRewardAmount(task.reward.amountMinor, task.reward.currency);

  let existing = task.payments.find(
    (payment) => payment.type === "FUNDING" && payment.status === "CREATED",
  );

  if (existing?.orderId) {
    return paymentResponse(existing);
  }

  if (config.paymentsMode === "SANDBOX") assertPayPalReady();

  if (!existing) {
    existing = await prisma.paymentTransaction.create({
      data: {
        taskId: task.id,
        rewardId: task.reward.id,
        type: "FUNDING",
        provider: config.paymentsMode === "SIMULATED" ? "DEMO" : "PAYPAL_SANDBOX",
        mode: config.paymentsMode === "SIMULATED" ? "SIMULATED" : "SANDBOX",
        status: "CREATED",
        amountMinor: task.reward.amountMinor,
        currency: task.reward.currency,
        idempotencyKey:
          config.paymentsMode === "SIMULATED"
            ? `demo-fund-${task.id}-${randomUUID()}`
            : `hf-fund-${task.id}-${randomUUID()}`,
        description: `TrustToPay review reward funding: ${task.title}`.slice(0, 200),
      },
    });
  }

  if (config.paymentsMode === "SIMULATED") {
    const orderId = `DEMO-ORDER-${randomUUID()}`;
    const updated = await prisma.paymentTransaction.update({
      where: { id: existing.id },
      data: { orderId, status: "CREATED", failureMessage: null },
    });
    await recordTaskEvent(prisma, {
      taskId: task.id,
      type: "FUNDING_ORDER_CREATED",
      message: "Simulated funding order created. No PayPal money moved.",
      actorId: actor.id,
      metadata: { orderId, mode: "SIMULATED" },
    });
    await audit(prisma, req ?? null, {
      actorId: actor.id,
      action: "FUNDING_ORDER_CREATED",
      entityType: "PaymentTransaction",
      entityId: updated.id,
      metadata: { mode: "SIMULATED", orderId, amountMinor: updated.amountMinor },
    });
    return paymentResponse(updated);
  }

  const gateway = getPayPalGateway();
  try {
    const order = await gateway.createOrder({
      amountMinor: existing.amountMinor,
      currency: existing.currency,
      referenceId: task.id,
      description: `TrustToPay review funding ${task.id}`.slice(0, 127),
      requestId: existing.idempotencyKey,
    });

    const updated = await prisma.paymentTransaction.update({
      where: { id: existing.id },
      data: {
        orderId: order.orderId,
        status: order.status === "COMPLETED" ? "CREATED" : "CREATED",
        failureMessage: null,
      },
    });

    await recordTaskEvent(prisma, {
      taskId: task.id,
      type: "FUNDING_ORDER_CREATED",
      message: "PayPal Sandbox order created. Awaiting buyer approval.",
      actorId: actor.id,
      metadata: { orderId: order.orderId, mode: "SANDBOX" },
    });
    await audit(prisma, req ?? null, {
      actorId: actor.id,
      action: "FUNDING_ORDER_CREATED",
      entityType: "PaymentTransaction",
      entityId: updated.id,
      metadata: { mode: "SANDBOX", orderId: order.orderId, amountMinor: updated.amountMinor },
    });

    return paymentResponse(updated);
  } catch (error) {
    const retryable = error instanceof AppError && "retryable" in error ? Boolean((error as { retryable?: boolean }).retryable) : false;
    const message = error instanceof Error ? error.message : "PayPal order creation failed.";
    await prisma.paymentTransaction.update({
      where: { id: existing.id },
      data: {
        status: retryable ? "CREATED" : "FAILED",
        failureCode: error instanceof AppError ? error.code : "PAYPAL_ORDER_FAILED",
        failureMessage: message.slice(0, 500),
      },
    });
    if (!retryable) {
      const fresh = await prisma.reviewTask.findUnique({ where: { id: task.id } });
      if (fresh && (fresh.status === "AWAITING_FUNDING" || fresh.status === "FUNDING_FAILED")) {
        if (fresh.status === "AWAITING_FUNDING") {
          await transitionTask(prisma, task.id, "FUNDING_FAILED", {
            type: "FUNDING_FAILED",
            message: "PayPal order creation failed.",
            actorId: actor.id,
            metadata: { code: error instanceof AppError ? error.code : "PAYPAL_ORDER_FAILED" },
          });
        }
      }
    }
    throw error;
  }
}

type FinalizeFundingInput = {
  status: "COMPLETED" | "PENDING" | "FAILED";
  captureId?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  referenceId?: string | null;
  failureCode?: string;
  failureMessage?: string;
  safePayload?: unknown;
  actorId?: string | null;
};

/** Idempotently apply a funding outcome after validating amount, currency and reference. */
export async function finalizeFunding(paymentId: string, input: FinalizeFundingInput): Promise<PaymentTransaction> {
  const tx = await prisma.paymentTransaction.findUnique({ where: { id: paymentId }, include: { task: true } });
  if (!tx) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment transaction not found.");
  if (tx.type !== "FUNDING") throw new AppError(409, "WRONG_PAYMENT_TYPE", "Not a funding transaction.");
  if (tx.status === "COMPLETED" && input.status === "COMPLETED") return tx;

  if (input.status === "COMPLETED") {
    if (!input.captureId) {
      throw new AppError(502, "CAPTURE_REFERENCE_MISSING", "PayPal did not return a capture reference.");
    }
    if (input.amountMinor !== tx.amountMinor || input.currency !== tx.currency) {
      return markFundingFailure(
        tx.id,
        "AMOUNT_MISMATCH",
        `Captured amount/currency (${input.amountMinor ?? "?"} ${input.currency ?? "?"}) does not match the server-stored reward (${tx.amountMinor} ${tx.currency}). The task was not funded.`,
      );
    }
    if (input.referenceId && input.referenceId !== tx.taskId) {
      return markFundingFailure(
        tx.id,
        "ORDER_REFERENCE_MISMATCH",
        "The PayPal order reference does not match this review task. The task was not funded.",
      );
    }

    return prisma.$transaction(async (db) => {
      const current = await db.paymentTransaction.findUnique({ where: { id: tx.id } });
      if (!current) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment transaction not found.");
      if (current.status === "COMPLETED") return current;

      const updated = await db.paymentTransaction.update({
        where: { id: tx.id },
        data: {
          status: "COMPLETED",
          captureId: input.captureId,
          capturedAt: new Date(),
          failureCode: null,
          failureMessage: null,
          safePayloadJson: input.safePayload ? safeJson(input.safePayload) : current.safePayloadJson,
        },
      });

      const task = await db.reviewTask.findUnique({ where: { id: tx.taskId } });
      if (task && task.status === "AWAITING_FUNDING") {
        await transitionTask(db, task.id, "FUNDED", {
          type: "FUNDED",
          message: "Reward funding captured. The task is now available to qualified reviewers.",
          actorId: input.actorId ?? null,
          extraData: { fundedAt: new Date() },
          metadata: { captureId: input.captureId, amountMinor: tx.amountMinor, currency: tx.currency },
        });
      }
      await db.reward.updateMany({
        where: { taskId: tx.taskId, status: "PENDING" },
        data: { status: "FUNDED" },
      });
      await recordTaskEvent(db, {
        taskId: tx.taskId,
        type: "FUNDING_CAPTURED",
        message: `Funding of ${formatMinorUnits(tx.amountMinor, tx.currency)} confirmed by PayPal.`,
        actorId: input.actorId ?? null,
        metadata: { captureId: input.captureId, orderId: tx.orderId },
      });
      return updated;
    }).then(async (updated) => {
      await notify(prisma, {
        userId: tx.task.requesterId,
        title: "Review task funded",
        body: `Funding of ${formatMinorUnits(tx.amountMinor, tx.currency)} was confirmed. Reviewers can now accept your task.`,
        link: `/app/tasks/${tx.taskId}`,
      });
      await audit(prisma, null, {
        actorId: input.actorId ?? null,
        action: "FUNDING_CAPTURED",
        entityType: "PaymentTransaction",
        entityId: updated.id,
        metadata: { captureId: input.captureId, amountMinor: tx.amountMinor },
      });
      return updated;
    });
  }

  if (input.status === "PENDING") {
    return prisma.paymentTransaction.update({
      where: { id: tx.id },
      data: {
        status: "PENDING",
        failureMessage: input.failureMessage ?? "PayPal has not completed the capture yet.",
        safePayloadJson: input.safePayload ? safeJson(input.safePayload) : tx.safePayloadJson,
      },
    });
  }

  return markFundingFailure(
    tx.id,
    input.failureCode ?? "FUNDING_FAILED",
    input.failureMessage ?? "PayPal reported that funding did not complete.",
    input.safePayload,
  );
}

async function markFundingFailure(
  paymentId: string,
  code: string,
  message: string,
  safePayload?: unknown,
): Promise<PaymentTransaction> {
  const tx = await prisma.paymentTransaction.findUnique({ where: { id: paymentId } });
  if (!tx) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment transaction not found.");
  if (tx.status === "COMPLETED") return tx;

  return prisma.$transaction(async (db) => {
    const updated = await db.paymentTransaction.update({
      where: { id: paymentId },
      data: {
        status: "FAILED",
        failureCode: code,
        failureMessage: message.slice(0, 500),
        safePayloadJson: safePayload ? safeJson(safePayload) : tx.safePayloadJson,
      },
    });
    const task = await db.reviewTask.findUnique({ where: { id: tx.taskId } });
    if (task && (task.status === "AWAITING_FUNDING" || task.status === "FUNDING_FAILED")) {
      if (task.status === "AWAITING_FUNDING") {
        await transitionTask(db, task.id, "FUNDING_FAILED", {
          type: "FUNDING_FAILED",
          message: "Funding did not complete. The task is not available to reviewers.",
          metadata: { code },
        });
      }
    }
    await recordTaskEvent(db, {
      taskId: tx.taskId,
      type: "FUNDING_FAILED",
      message,
      metadata: { code },
    });
    return updated;
  });
}

export async function captureFundingOrder(actor: PaymentActor, orderId: string, req?: import("express").Request) {
  const tx = await prisma.paymentTransaction.findFirst({
    where: { orderId, type: "FUNDING" },
    include: { task: true },
  });
  if (!tx) throw new AppError(404, "PAYMENT_ORDER_NOT_FOUND", "No local funding order matches that PayPal order ID.");
  taskAccess(actor, tx.task.requesterId);

  if (tx.status === "COMPLETED") {
    return { completed: true, transaction: serializePayment(tx), message: "Funding was already captured." };
  }
  if (tx.task.status !== "AWAITING_FUNDING") {
    throw new AppError(409, "TASK_NOT_FUNDABLE", `The task is ${tx.task.status}; capture is not allowed.`);
  }
  if (tx.mode === "SIMULATED" && config.paymentsMode !== "SIMULATED") {
    throw new AppError(
      409,
      "PAYMENT_MODE_MISMATCH",
      "This is a simulated order. It cannot be captured in genuine PayPal Sandbox mode.",
    );
  }
  if (tx.mode === "SANDBOX") assertPayPalReady();
  if (!tx.orderId) throw new AppError(409, "ORDER_MISSING", "The funding order has no provider reference.");

  let snapshot: PayPalOrderSnapshot;
  if (tx.mode === "SIMULATED") {
    snapshot = {
      orderId: tx.orderId,
      status: "COMPLETED",
      captureId: `DEMO-CAPTURE-${randomUUID()}`,
      capturedAmountMinor: tx.amountMinor,
      currency: tx.currency,
      referenceId: tx.taskId,
      rawStatus: "COMPLETED",
    };
  } else {
    const gateway = getPayPalGateway();
    try {
      snapshot = await gateway.captureOrder(tx.orderId, `hf-capture-${tx.id}`);
    } catch (error) {
      const code = error instanceof AppError ? error.code : "";
      if (code === "PAYPAL_DUPLICATE") {
        snapshot = await gateway.getOrder(tx.orderId);
      } else {
        const retryable = Boolean((error as { retryable?: boolean }).retryable);
        if (retryable) {
          // Reconcile an uncertain capture before surfacing an error.
          try {
            const order = await gateway.getOrder(tx.orderId);
            if (order.status === "COMPLETED") {
              snapshot = order;
            } else {
              await prisma.paymentTransaction.update({
                where: { id: tx.id },
                data: {
                  failureMessage:
                    "PayPal capture outcome is uncertain. Reconcile this payment before retrying; no success was recorded.",
                },
              });
              throw new AppError(
                504,
                "PAYPAL_CAPTURE_UNCERTAIN",
                "The PayPal capture timed out and could not be reconciled. No payment was marked successful. Use Reconcile before retrying.",
                { paymentId: tx.id },
              );
            }
          } catch (reconcileError) {
            if (reconcileError instanceof AppError) throw reconcileError;
            throw new AppError(
              504,
              "PAYPAL_CAPTURE_UNCERTAIN",
              "The PayPal capture timed out and could not be reconciled. No payment was marked successful. Use Reconcile before retrying.",
              { paymentId: tx.id },
            );
          }
        } else {
          await finalizeFunding(tx.id, {
            status: "FAILED",
            failureCode: code || "CAPTURE_FAILED",
            failureMessage: error instanceof Error ? error.message : "PayPal capture failed.",
            actorId: actor.id,
          });
          throw error;
        }
      }
    }
  }

  if (snapshot.status !== "COMPLETED") {
    await finalizeFunding(tx.id, {
      status: snapshot.status === "PENDING" ? "PENDING" : "FAILED",
      failureCode: `CAPTURE_${snapshot.status}`,
      failureMessage: `PayPal returned capture status ${snapshot.status}. No funding was recognized.`,
      safePayload: snapshot,
      actorId: actor.id,
    });
    return {
      completed: false,
      transaction: serializePayment((await prisma.paymentTransaction.findUnique({ where: { id: tx.id } }))!),
      message: `PayPal capture status is ${snapshot.status}. Funding is not complete.`,
    };
  }

  const updated = await finalizeFunding(tx.id, {
    status: "COMPLETED",
    captureId: snapshot.captureId,
    amountMinor: snapshot.capturedAmountMinor,
    currency: snapshot.currency,
    referenceId: snapshot.referenceId,
    safePayload: { orderId: snapshot.orderId, status: snapshot.status },
    actorId: actor.id,
  });

  await audit(prisma, req ?? null, {
    actorId: actor.id,
    action: "FUNDING_CAPTURE_REQUESTED",
    entityType: "PaymentTransaction",
    entityId: updated.id,
    metadata: { mode: tx.mode, orderId: tx.orderId },
  });

  return {
    completed: true,
    transaction: serializePayment(updated),
    message:
      tx.mode === "SIMULATED"
        ? "Simulated funding captured. No PayPal money moved."
        : "PayPal Sandbox capture confirmed and recorded.",
  };
}

const PAYABLE_TASK_STATUSES = ["PAYMENT_READY", "HANDED_OFF", "ORIGINAL_TASK_RESUMED", "COMPLETED"];

async function startPayoutState(taskId: string, actorId: string): Promise<void> {
  await prisma.$transaction(async (db) => {
    const task = await db.reviewTask.findUnique({ where: { id: taskId }, include: { reward: true } });
    if (!task) throw new AppError(404, "TASK_NOT_FOUND", "Review task not found.");
    if (task.status === "PAYMENT_READY") {
      await transitionTask(db, taskId, "PAYMENT_PROCESSING", {
        type: "PAYMENT_PROCESSING",
        message: "Reviewer payout started.",
        actorId,
      });
    } else if (task.status === "PAYOUT_FAILED") {
      await transitionTask(db, taskId, "PAYMENT_PROCESSING", {
        type: "PAYOUT_RETRY",
        message: "Reviewer payout retry started after reconciliation.",
        actorId,
      });
    } else if (task.status === "HANDED_OFF" || task.status === "ORIGINAL_TASK_RESUMED" || task.status === "COMPLETED") {
      await recordTaskEvent(db, {
        taskId,
        type: "PAYMENT_PROCESSING",
        message: "Reviewer payout started for handed-off task.",
        actorId,
      });
    } else {
      throw new AppError(409, "TASK_NOT_PAYABLE", `The task is ${task.status}; a payout cannot start.`);
    }
    await db.reward.updateMany({
      where: { taskId },
      data: { status: "PROCESSING" },
    });
  });
}

export async function releasePayout(actor: PaymentActor, taskId: string, req?: import("express").Request, allowRetry = false) {
  const task = await loadTaskForPayment(taskId);
  taskAccess(actor, task.requesterId);

  if (task.status === "PAYMENT_PAID" || task.reward?.status === "PAID") {
    const completed = task.payments.find((payment) => payment.type === "PAYOUT" && payment.status === "COMPLETED");
    if (completed) {
      return { transaction: serializePayment(completed), message: "The reviewer reward was already paid." };
    }
  }

  if (task.status === "PAYMENT_PROCESSING" || task.reward?.status === "PROCESSING") {
    const pending = task.payments.find(
      (payment) => payment.type === "PAYOUT" && ["PENDING", "PROCESSING"].includes(payment.status),
    );
    if (pending) {
      return { transaction: serializePayment(pending), message: "A payout is already processing." };
    }
  }

  if (!PAYABLE_TASK_STATUSES.includes(task.status) && !(allowRetry && task.status === "PAYOUT_FAILED")) {
    throw new AppError(409, "TASK_NOT_PAYABLE", `The task is ${task.status}; payout requires PAYMENT_READY.`);
  }

  if (!task.reward) throw new AppError(409, "REWARD_MISSING", "This task has no reward.");
  if (task.reward.status !== "AUTHORIZED") {
    throw new AppError(409, "REWARD_NOT_AUTHORIZED", "The reward is not authorized for payout.");
  }
  validateRewardAmount(task.reward.amountMinor, task.reward.currency);

  const reviewer = task.assignment?.reviewer;
  const profile = reviewer?.profile;
  if (!reviewer || !profile) {
    throw new AppError(409, "REVIEWER_NOT_ASSIGNED", "No reviewer is assigned to this task.");
  }
  if (!profile.payoutConsent) {
    throw new AppError(409, "PAYOUT_CONSENT_MISSING", "The reviewer has not consented to PayPal payouts.");
  }
  if (!profile.payoutEmail || !PAYOUT_EMAIL.test(profile.payoutEmail)) {
    throw new AppError(409, "PAYOUT_EMAIL_MISSING", "The reviewer has no valid PayPal payout email.");
  }
  if (profile.payoutEmail.toLowerCase() === task.requester.email.toLowerCase()) {
    throw new AppError(409, "PAYOUT_SELF_PAYMENT", "The requester and payout recipient must be different accounts.");
  }

  const existingPayout = task.payments.find(
    (payment) =>
      payment.type === "PAYOUT" &&
      ["PENDING", "PROCESSING", "COMPLETED"].includes(payment.status),
  );
  if (existingPayout) {
    if (existingPayout.status === "COMPLETED") {
      return { transaction: serializePayment(existingPayout), message: "The reviewer reward was already paid." };
    }
    return { transaction: serializePayment(existingPayout), message: "A payout is already in progress." };
  }

  if (config.paymentsMode === "SANDBOX") {
    assertPayPalReady();
    if (!config.paypalPayoutsEnabled) {
      throw new AppError(
        409,
        "PAYOUTS_NOT_ENABLED",
        "PayPal Payouts is not enabled. Checkout funding works, but reviewer payouts need Payouts access and PAYPAL_PAYOUTS_ENABLED=true. No payout was attempted.",
        {
          hint: "Enable Payouts for your Sandbox app, then set PAYPAL_PAYOUTS_ENABLED=true. The verified answer is preserved.",
          required: ["PAYPAL_PAYOUTS_ENABLED"],
        },
      );
    }
  }

  await startPayoutState(task.id, actor.id);

  const isSimulated = config.paymentsMode === "SIMULATED";
  const payoutTx = await prisma.paymentTransaction.create({
    data: {
      taskId: task.id,
      rewardId: task.reward.id,
      type: "PAYOUT",
      provider: isSimulated ? "DEMO" : "PAYPAL_SANDBOX",
      mode: isSimulated ? "SIMULATED" : "SANDBOX",
      status: "PROCESSING",
      amountMinor: task.reward.amountMinor,
      currency: task.reward.currency,
      idempotencyKey: `${isSimulated ? "demo" : "hf"}-payout-${task.id}-${randomUUID()}`,
      recipientEmail: profile.payoutEmail,
      description: `Reviewer reward for task ${task.id}`.slice(0, 200),
    },
  });

  if (isSimulated) {
    const completed = await finalizePayout(payoutTx.id, {
      status: "COMPLETED",
      payoutBatchId: `DEMO-PAYOUT-${randomUUID()}`,
      payoutItemId: `DEMO-PAYOUT-ITEM-${randomUUID()}`,
      actorId: actor.id,
      safePayload: { mode: "SIMULATED", note: "No PayPal money moved." },
    });
    await audit(prisma, req ?? null, {
      actorId: actor.id,
      action: "PAYOUT_SIMULATED_COMPLETED",
      entityType: "PaymentTransaction",
      entityId: completed.id,
      metadata: { amountMinor: completed.amountMinor },
    });
    return {
      transaction: serializePayment(completed),
      message: "Simulated reviewer payout completed. No PayPal money moved.",
    };
  }

  const gateway = getPayPalGateway();
  try {
    const payout = await gateway.createPayout({
      amountMinor: payoutTx.amountMinor,
      currency: payoutTx.currency,
      receiverEmail: profile.payoutEmail,
      senderItemId: payoutTx.id,
      senderBatchId: payoutTx.idempotencyKey,
      note: `TrustToPay verified review ${task.id}`,
      emailSubject: "You earned a TrustToPay review reward",
      emailMessage: "Your evidence-backed review passed verification. Thank you for improving an AI answer.",
    });

    await prisma.paymentTransaction.update({
      where: { id: payoutTx.id },
      data: { payoutBatchId: payout.batchId },
    });

    // Always reconcile provider state before marking a payout paid.
    const reconciled = await reconcilePayoutTransaction(payoutTx.id, actor.id);
    await audit(prisma, req ?? null, {
      actorId: actor.id,
      action: "PAYOUT_CREATED",
      entityType: "PaymentTransaction",
      entityId: payoutTx.id,
      metadata: { batchId: payout.batchId, status: reconciled.status },
    });
    return {
      transaction: serializePayment(reconciled),
      message:
        reconciled.status === "COMPLETED"
          ? "PayPal Payouts reported success and the reward is recorded as paid."
          : `PayPal Payouts accepted the batch (${payout.status}). Settlement is asynchronous; reconcile to refresh.`,
    };
  } catch (error) {
    const retryable = Boolean((error as { retryable?: boolean }).retryable);
    const message = error instanceof Error ? error.message : "PayPal payout failed.";
    if (retryable) {
      // No batch ID means we cannot prove whether the payout was created. Keep
      // the task in PROCESSING and require reconciliation instead of retrying.
      await prisma.paymentTransaction.update({
        where: { id: payoutTx.id },
        data: {
          failureCode: error instanceof AppError ? error.code : "PAYOUT_UNCERTAIN",
          failureMessage:
            "Payout outcome is uncertain; no automatic retry is allowed. Reconcile or check the PayPal dashboard.",
        },
      });
      throw new AppError(
        504,
        "PAYOUT_UNCERTAIN",
        "The payout request timed out before a batch reference was returned. No payout was marked paid and automatic retry is blocked; reconcile manually.",
        { paymentId: payoutTx.id },
      );
    }

    await finalizePayout(payoutTx.id, {
      status: "FAILED",
      failureCode: error instanceof AppError ? error.code : "PAYOUT_FAILED",
      failureMessage: message,
      actorId: actor.id,
    });
    throw error;
  }
}

type FinalizePayoutInput = {
  status: "COMPLETED" | "FAILED" | "PENDING";
  payoutBatchId?: string | null;
  payoutItemId?: string | null;
  failureCode?: string;
  failureMessage?: string;
  safePayload?: unknown;
  actorId?: string | null;
};

export async function finalizePayout(paymentId: string, input: FinalizePayoutInput): Promise<PaymentTransaction> {
  const tx = await prisma.paymentTransaction.findUnique({
    where: { id: paymentId },
    include: { task: { include: { assignment: true } } },
  });
  if (!tx) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment transaction not found.");
  if (tx.type !== "PAYOUT") throw new AppError(409, "WRONG_PAYMENT_TYPE", "Not a payout transaction.");
  if (tx.status === "COMPLETED") return tx;

  if (input.status === "PENDING") {
    return prisma.paymentTransaction.update({
      where: { id: tx.id },
      data: {
        status: "PROCESSING",
        payoutBatchId: input.payoutBatchId ?? tx.payoutBatchId,
        payoutItemId: input.payoutItemId ?? tx.payoutItemId,
        safePayloadJson: input.safePayload ? safeJson(input.safePayload) : tx.safePayloadJson,
      },
    });
  }

  if (input.status === "FAILED") {
    return prisma.$transaction(async (db) => {
      const updated = await db.paymentTransaction.update({
        where: { id: tx.id },
        data: {
          status: "FAILED",
          payoutBatchId: input.payoutBatchId ?? tx.payoutBatchId,
          payoutItemId: input.payoutItemId ?? tx.payoutItemId,
          failureCode: input.failureCode ?? "PAYOUT_FAILED",
          failureMessage: (input.failureMessage ?? "PayPal payout failed.").slice(0, 500),
          safePayloadJson: input.safePayload ? safeJson(input.safePayload) : tx.safePayloadJson,
        },
      });
      await db.reward.updateMany({
        where: { taskId: tx.taskId },
        data: { status: "AUTHORIZED" },
      });
      const task = await db.reviewTask.findUnique({ where: { id: tx.taskId } });
      if (task?.status === "PAYMENT_PROCESSING") {
        await transitionTask(db, tx.taskId, "PAYOUT_FAILED", {
          type: "PAYOUT_FAILED",
          message: "Reviewer payout failed. The verified answer is preserved; payment remains unresolved.",
          actorId: input.actorId ?? null,
          metadata: { code: input.failureCode },
        });
      }
      return updated;
    });
  }

  return prisma.$transaction(async (db) => {
    const current = await db.paymentTransaction.findUnique({ where: { id: tx.id } });
    if (!current) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment transaction not found.");
    if (current.status === "COMPLETED") return current;

    const updated = await db.paymentTransaction.update({
      where: { id: tx.id },
      data: {
        status: "COMPLETED",
        payoutBatchId: input.payoutBatchId ?? current.payoutBatchId,
        payoutItemId: input.payoutItemId ?? current.payoutItemId,
        paidAt: new Date(),
        failureCode: null,
        failureMessage: null,
        safePayloadJson: input.safePayload ? safeJson(input.safePayload) : current.safePayloadJson,
      },
    });
    await db.reward.updateMany({
      where: { taskId: tx.taskId },
      data: { status: "PAID", paidAt: new Date() },
    });

    const task = await db.reviewTask.findUnique({ where: { id: tx.taskId } });
    if (task?.status === "PAYMENT_PROCESSING") {
      await transitionTask(db, tx.taskId, "PAYMENT_PAID", {
        type: "PAYMENT_PAID",
        message: "Reviewer reward paid. The verified answer is available to resume.",
        actorId: input.actorId ?? null,
        metadata: { payoutBatchId: updated.payoutBatchId, amountMinor: updated.amountMinor },
      });
    } else if (task?.status === "PAYOUT_FAILED") {
      await transitionTask(db, tx.taskId, "PAYMENT_PROCESSING", {
        type: "PAYOUT_RECONCILED",
        message: "Reconciliation found a successful payout.",
        actorId: input.actorId ?? null,
      });
      await transitionTask(db, tx.taskId, "PAYMENT_PAID", {
        type: "PAYMENT_PAID",
        message: "Reviewer reward paid after reconciliation.",
        actorId: input.actorId ?? null,
      });
    } else if (task?.status === "HANDED_OFF" || task?.status === "ORIGINAL_TASK_RESUMED" || task?.status === "COMPLETED") {
      await recordTaskEvent(db, {
        taskId: tx.taskId,
        type: "PAYMENT_PAID",
        message: "Reviewer reward paid for handed-off task.",
        actorId: input.actorId ?? null,
        metadata: { payoutBatchId: updated.payoutBatchId, amountMinor: updated.amountMinor },
      });
    }

    return updated;
  }).then(async (updated) => {
    if (tx.task.assignment) {
      await notify(prisma, {
        userId: tx.task.assignment.reviewerId,
        title: "Review reward paid",
        body: `${formatMinorUnits(updated.amountMinor, updated.currency)} payout for "${tx.task.title}" is recorded as paid.`,
        link: `/app/tasks/${tx.taskId}`,
      });
    }
    await audit(prisma, null, {
      actorId: input.actorId ?? null,
      action: "PAYOUT_COMPLETED",
      entityType: "PaymentTransaction",
      entityId: updated.id,
      metadata: { mode: updated.mode, amountMinor: updated.amountMinor, batchId: updated.payoutBatchId },
    });
    return updated;
  });
}

async function assertPayoutMatches(
  paymentId: string,
  batch: PayPalPayoutBatchSnapshot,
  senderItemId: string,
): Promise<{ item: PayPalPayoutBatchSnapshot["items"][number] | undefined }> {
  const tx = await prisma.paymentTransaction.findUnique({ where: { id: paymentId } });
  if (!tx) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment transaction not found.");
  const item = batch.items.find((entry) => entry.senderItemId === senderItemId) ?? batch.items[0];
  if (item?.amountMinor != null && (item.amountMinor !== tx.amountMinor || item.currency !== tx.currency)) {
    await finalizePayout(paymentId, {
      status: "FAILED",
      failureCode: "PAYOUT_AMOUNT_MISMATCH",
      failureMessage: `Provider payout amount/currency (${item.amountMinor} ${item.currency ?? "?"}) does not match the authorized reward (${tx.amountMinor} ${tx.currency}). Manual review required.`,
      payoutBatchId: batch.batchId,
      payoutItemId: item.payoutItemId,
      safePayload: { batchStatus: batch.status, itemStatus: item.transactionStatus },
    });
    throw new AppError(409, "PAYOUT_AMOUNT_MISMATCH", "PayPal payout amount did not match the authorized reward. Manual review required.");
  }
  return { item };
}

export async function reconcilePayoutTransaction(paymentId: string, actorId?: string | null): Promise<PaymentTransaction> {
  const tx = await prisma.paymentTransaction.findUnique({ where: { id: paymentId } });
  if (!tx) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment transaction not found.");
  if (!tx.payoutBatchId) {
    throw new AppError(
      409,
      "PAYOUT_BATCH_MISSING",
      "No PayPal payout batch reference is stored. Reconcile in the PayPal dashboard; automatic retry is blocked.",
    );
  }
  if (tx.status === "COMPLETED") return tx;

  const gateway = getPayPalGateway();
  const batch = await gateway.getPayoutBatch(tx.payoutBatchId);
  const { item } = await assertPayoutMatches(paymentId, batch, tx.id);

  const itemStatus = item?.transactionStatus ?? null;
  const batchStatus = batch.status;

  if (batchStatus === "SUCCESS" && (itemStatus === "SUCCESS" || itemStatus === null)) {
    return finalizePayout(paymentId, {
      status: "COMPLETED",
      payoutBatchId: batch.batchId,
      payoutItemId: item?.payoutItemId ?? tx.payoutItemId,
      safePayload: { batchStatus, itemStatus },
      actorId,
    });
  }

  if (
    batchStatus === "FAILED" ||
    batchStatus === "CANCELED" ||
    itemStatus === "FAILED" ||
    itemStatus === "RETURNED" ||
    itemStatus === "BLOCKED" ||
    itemStatus === "DENIED"
  ) {
    return finalizePayout(paymentId, {
      status: "FAILED",
      failureCode: `PAYOUT_${itemStatus ?? batchStatus}`,
      failureMessage: `PayPal reported payout status ${itemStatus ?? batchStatus}.`,
      payoutBatchId: batch.batchId,
      payoutItemId: item?.payoutItemId ?? tx.payoutItemId,
      safePayload: { batchStatus, itemStatus },
      actorId,
    });
  }

  return finalizePayout(paymentId, {
    status: "PENDING",
    payoutBatchId: batch.batchId,
    payoutItemId: item?.payoutItemId ?? tx.payoutItemId,
    safePayload: { batchStatus, itemStatus },
  });
}

export async function reconcilePayment(actor: PaymentActor, paymentId: string, req?: import("express").Request) {
  const tx = await prisma.paymentTransaction.findUnique({ where: { id: paymentId }, include: { task: true } });
  if (!tx) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment transaction not found.");
  taskAccess(actor, tx.task.requesterId);

  if (tx.mode === "SIMULATED") {
    return {
      transaction: serializePayment(tx),
      message: "Simulated transactions settle locally and have no external provider status to reconcile.",
    };
  }

  assertPayPalReady();
  const gateway = getPayPalGateway();

  if (tx.type === "FUNDING") {
    if (!tx.orderId) throw new AppError(409, "ORDER_MISSING", "No PayPal order reference is stored.");
    const order = await gateway.getOrder(tx.orderId);
    if (order.status === "COMPLETED") {
      const updated = await finalizeFunding(tx.id, {
        status: "COMPLETED",
        captureId: order.captureId,
        amountMinor: order.capturedAmountMinor,
        currency: order.currency,
        referenceId: order.referenceId,
        safePayload: { status: order.status, orderId: order.orderId },
        actorId: actor.id,
      });
      return { transaction: serializePayment(updated), message: "Reconciliation confirmed the captured funding." };
    }
    if (order.status === "VOIDED" || order.status === "PAYER_ACTION_REQUIRED") {
      await finalizeFunding(tx.id, {
        status: "FAILED",
        failureCode: `ORDER_${order.status}`,
        failureMessage: `PayPal order status is ${order.status}.`,
        safePayload: { status: order.status },
        actorId: actor.id,
      });
      return {
        transaction: serializePayment((await prisma.paymentTransaction.findUnique({ where: { id: tx.id } }))!),
        message: `PayPal order status is ${order.status}. Funding is not complete.`,
      };
    }
    return {
      transaction: serializePayment(tx),
      message: `PayPal order status is ${order.status}; still awaiting completion.`,
    };
  }

  const updated = await reconcilePayoutTransaction(tx.id, actor.id);
  await audit(prisma, req ?? null, {
    actorId: actor.id,
    action: "PAYMENT_RECONCILED",
    entityType: "PaymentTransaction",
    entityId: tx.id,
    metadata: { status: updated.status, mode: updated.mode },
  });
  return { transaction: serializePayment(updated), message: `PayPal payout status is ${updated.status}.` };
}

export async function retryPayment(actor: PaymentActor, paymentId: string, req?: import("express").Request) {
  if (actor.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only an administrator can retry a payment operation.");
  }
  const tx = await prisma.paymentTransaction.findUnique({ where: { id: paymentId } });
  if (!tx) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment transaction not found.");
  if (tx.status === "COMPLETED") {
    return { transaction: serializePayment(tx), message: "This payment already completed; nothing to retry." };
  }
  if (tx.status === "PROCESSING" || tx.status === "PENDING") {
    throw new AppError(
      409,
      "PAYMENT_IN_PROGRESS",
      "This payment is still processing. Reconcile its provider status before retrying.",
      { paymentId: tx.id },
    );
  }
  if (tx.status !== "FAILED") {
    throw new AppError(409, "PAYMENT_NOT_RETRYABLE", "Only a failed payment can be retried.");
  }

  if (tx.type === "FUNDING") {
    if (tx.mode === "SANDBOX") {
      try {
        const reconciled = await reconcilePayment(actor, tx.id, req);
        if (reconciled.transaction.status === "COMPLETED") return reconciled;
      } catch (error) {
        if (error instanceof AppError && error.code === "PAYMENT_MODE_SIMULATED") throw error;
        // Continue only when reconciliation proves the payment did not succeed.
      }
    }
    const success = await prisma.paymentTransaction.findFirst({
      where: { taskId: tx.taskId, type: "FUNDING", status: "COMPLETED" },
    });
    if (success) {
      throw new AppError(409, "FUNDING_ALREADY_COMPLETED", "Funding already completed; no retry is needed.");
    }
    await prisma.$transaction(async (db) => {
      const task = await db.reviewTask.findUnique({ where: { id: tx.taskId } });
      if (task?.status === "FUNDING_FAILED") {
        await transitionTask(db, tx.taskId, "AWAITING_FUNDING", {
          type: "FUNDING_RETRY_READY",
          message: "Funding failure acknowledged; a new order may be created.",
          actorId: actor.id,
        });
      }
    });
    return createFundingOrder(actor, tx.taskId, req);
  }

  // Payout retry: reconcile first. A potentially successful payout must never
  // be retried blindly.
  if (tx.payoutBatchId) {
    const reconciled = await reconcilePayoutTransaction(tx.id, actor.id);
    if (reconciled.status === "COMPLETED") {
      return { transaction: serializePayment(reconciled), message: "Reconciliation found the payout succeeded." };
    }
    if (reconciled.status !== "FAILED") {
      throw new AppError(
        409,
        "PAYOUT_STILL_PROCESSING",
        "The payout is still processing after reconciliation; retry is blocked until its final status is known.",
      );
    }
  } else {
    throw new AppError(
      409,
      "PAYOUT_UNRECONCILED",
      "No payout batch reference exists. Check the PayPal dashboard before any retry; automatic retry is blocked.",
    );
  }

  const task = await prisma.reviewTask.findUnique({ where: { id: tx.taskId } });
  if (!task) throw new AppError(404, "TASK_NOT_FOUND", "Review task not found.");
  if (task.status !== "PAYOUT_FAILED") {
    throw new AppError(409, "TASK_NOT_RETRYABLE", `The task is ${task.status}; payout retry requires PAYOUT_FAILED.`);
  }

  return releasePayout(actor, task.id, req, true);
}

/** Admin/frontend-facing summary for a task's funding and payout eligibility. */
export async function paymentSummaryForTask(taskId: string) {
  const task = await prisma.reviewTask.findUnique({
    where: { id: taskId },
    include: {
      reward: true,
      payments: { orderBy: { createdAt: "desc" } },
      assignment: { include: { reviewer: { include: { profile: true } } } },
    },
  });
  if (!task) throw new AppError(404, "TASK_NOT_FOUND", "Review task not found.");
  const funding = task.payments.find((payment) => payment.type === "FUNDING" && payment.status === "COMPLETED");
  const payout = task.payments.find((payment) => payment.type === "PAYOUT" && payment.status === "COMPLETED");
  return {
    mode: paymentModeSummary(),
    reward: task.reward
      ? { ...task.reward, amountDisplay: formatMinorUnits(task.reward.amountMinor, task.reward.currency) }
      : null,
    fundingStatus: task.status === "AWAITING_FUNDING" ? "AWAITING_FUNDING" : funding ? "FUNDED" : "NOT_FUNDED",
    fundingTransaction: funding ? serializePayment(funding) : null,
    payoutTransaction: payout ? serializePayment(payout) : null,
    payoutEligible:
      PAYABLE_TASK_STATUSES.includes(task.status) &&
      task.reward?.status === "AUTHORIZED" &&
      Boolean(task.assignment?.reviewer.profile?.payoutEmail) &&
      Boolean(task.assignment?.reviewer.profile?.payoutConsent),
    payoutsEnabled: config.paypalPayoutsEnabled,
    payoutAvailability: resolvePayoutAvailability(),
  };
}


