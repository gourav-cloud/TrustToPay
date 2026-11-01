import { Prisma, type PrismaClient } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { notify, recordTaskEvent } from "../../lib/audit.js";
import { parseJson } from "../../lib/json.js";
import { rankSpecialistsForTask, type RankedSpecialist } from "./rankingService.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const TOP_OFFER_BATCH_SIZE = 5;
export const DEFAULT_OFFER_TTL_MS = 15 * 60 * 1000; // 15 minutes

export type OfferReasonsSnapshot = {
  reasons: string[];
  breakdown: RankedSpecialist["breakdown"];
  verifiedSkillLevel: number;
  verifiedSkillLevelName: string;
  matchedSkillId: string | null;
  matchedSkillName: string;
};

export function serializeTaskOffer(offer: {
  id: string;
  taskId: string;
  specialistId: string;
  batchNumber: number;
  rank: number;
  score: number;
  status: string;
  reasonsJson: string;
  expiresAt: Date;
  respondedAt: Date | null;
  createdAt: Date;
  specialist?: { id: string; name: string; email: string };
}) {
  const snapshot = parseJson<OfferReasonsSnapshot | null>(offer.reasonsJson, null);
  return {
    id: offer.id,
    taskId: offer.taskId,
    specialistId: offer.specialistId,
    specialist: offer.specialist
      ? {
          id: offer.specialist.id,
          name: offer.specialist.name,
          email: offer.specialist.email,
        }
      : undefined,
    batchNumber: offer.batchNumber,
    rank: offer.rank,
    score: offer.score,
    status: offer.status,
    reasons: snapshot?.reasons ?? [],
    breakdown: snapshot?.breakdown ?? null,
    verifiedSkillLevel: snapshot?.verifiedSkillLevel ?? null,
    verifiedSkillLevelName: snapshot?.verifiedSkillLevelName ?? null,
    matchedSkillName: snapshot?.matchedSkillName ?? null,
    expiresAt: offer.expiresAt.toISOString(),
    respondedAt: offer.respondedAt ? offer.respondedAt.toISOString() : null,
    createdAt: offer.createdAt.toISOString(),
  };
}

export async function dispatchTopOffers(
  db: DbClient,
  taskId: string,
  options: {
    now?: Date;
    ttlMs?: number;
    batchSize?: number;
    actorId?: string | null;
    forceNextBatch?: boolean;
  } = {},
) {
  const now = options.now ?? new Date();
  const ttlMs = options.ttlMs ?? DEFAULT_OFFER_TTL_MS;
  const batchSize = options.batchSize ?? TOP_OFFER_BATCH_SIZE;

  const task = await db.reviewTask.findUnique({
    where: { id: taskId },
    include: {
      assignment: true,
      offers: {
        include: {
          specialist: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ batchNumber: "desc" }, { rank: "asc" }],
      },
    },
  });

  if (!task) {
    throw new AppError(404, "TASK_NOT_FOUND", "Review task not found.");
  }

  if (task.assignment) {
    throw new AppError(409, "TASK_ALREADY_ASSIGNED", "Task already has an assigned specialist.");
  }

  // First expire any PENDING offers whose TTL has elapsed
  await db.taskOffer.updateMany({
    where: {
      taskId: task.id,
      status: "PENDING",
      expiresAt: { lte: now },
    },
    data: {
      status: "EXPIRED",
      respondedAt: now,
    },
  });

  // Check if there are still active PENDING offers (unless forceNextBatch is set)
  if (!options.forceNextBatch) {
    const activePending = await db.taskOffer.findMany({
      where: {
        taskId: task.id,
        status: "PENDING",
        expiresAt: { gt: now },
      },
      include: {
        specialist: { select: { id: true, name: true, email: true } },
      },
      orderBy: { rank: "asc" },
    });

    if (activePending.length > 0) {
      return {
        taskId: task.id,
        status: task.status,
        batchNumber: activePending[0].batchNumber,
        offers: activePending.map(serializeTaskOffer),
        dispatchedCount: 0,
      };
    }
  } else {
    // Expire any remaining pending offers before forcing next batch
    await db.taskOffer.updateMany({
      where: {
        taskId: task.id,
        status: "PENDING",
      },
      data: {
        status: "EXPIRED",
        respondedAt: now,
      },
    });
  }

  // Rank remaining eligible specialists (excluding those already offered in previous batches)
  const ranking = await rankSpecialistsForTask(db, task.id, {
    excludeAlreadyOffered: true,
  });

  const topCandidates = ranking.eligible.slice(0, batchSize);
  const previousMaxBatch = task.offers.reduce((max, o) => Math.max(max, o.batchNumber), 0);
  const nextBatchNumber = previousMaxBatch + 1;

  if (topCandidates.length === 0) {
    await db.reviewTask.update({
      where: { id: task.id },
      data: { status: "NO_MATCH" },
    });

    await recordTaskEvent(db, {
      taskId: task.id,
      type: "TASK_NO_MATCH",
      message: "No eligible verified specialists matched the task skill and workload requirements.",
      actorId: options.actorId ?? null,
      metadata: {
        batchNumber: nextBatchNumber,
        requiredSkills: ranking.requiredSkills,
        requiredSkillId: ranking.requiredSkillId,
        minimumSkillLevel: ranking.minimumSkillLevel,
        excludedCount: ranking.excluded.length,
        excluded: ranking.excluded,
      },
    });

    return {
      taskId: task.id,
      status: "NO_MATCH",
      batchNumber: nextBatchNumber,
      offers: [],
      dispatchedCount: 0,
      ranking,
    };
  }

  const expiresAt = new Date(now.getTime() + ttlMs);
  const createdOffers = [];

  for (let idx = 0; idx < topCandidates.length; idx++) {
    const candidate = topCandidates[idx];
    const rank = idx + 1;
    const reasonsSnapshot: OfferReasonsSnapshot = {
      reasons: candidate.reasons,
      breakdown: candidate.breakdown,
      verifiedSkillLevel: candidate.verifiedSkillLevel,
      verifiedSkillLevelName: candidate.verifiedSkillLevelName,
      matchedSkillId: candidate.matchedSkillId,
      matchedSkillName: candidate.matchedSkillName,
    };

    const offer = await db.taskOffer.create({
      data: {
        taskId: task.id,
        specialistId: candidate.specialistId,
        batchNumber: nextBatchNumber,
        rank,
        score: candidate.score,
        status: "PENDING",
        reasonsJson: JSON.stringify(reasonsSnapshot),
        expiresAt,
      },
      include: {
        specialist: { select: { id: true, name: true, email: true } },
      },
    });
    createdOffers.push(offer);

    await notify(db, {
      userId: candidate.specialistId,
      title: "New specialist review offer",
      body: `You were ranked #${rank} (score ${candidate.score}) for "${task.title}". Offer expires in ${Math.round(
        ttlMs / 60_000,
      )} minutes.`,
      link: `/app/tasks/${task.id}`,
    });
  }

  await db.reviewTask.update({
    where: { id: task.id },
    data: { status: "OFFERED" },
  });

  await recordTaskEvent(db, {
    taskId: task.id,
    type: "TASK_OFFERS_DISPATCHED",
    message: `Dispatched parallel offers to top ${createdOffers.length} ranked specialist${
      createdOffers.length === 1 ? "" : "s"
    } (batch #${nextBatchNumber}).`,
    actorId: options.actorId ?? null,
    metadata: {
      batchNumber: nextBatchNumber,
      expiresAt: expiresAt.toISOString(),
      minimumSkillLevel: ranking.minimumSkillLevel,
      requiredSkills: ranking.requiredSkills,
      offers: createdOffers.map((o, i) => ({
        offerId: o.id,
        specialistId: o.specialistId,
        rank: o.rank,
        score: o.score,
        verifiedSkillLevel: topCandidates[i].verifiedSkillLevel,
        matchedSkillName: topCandidates[i].matchedSkillName,
        reasons: topCandidates[i].reasons,
      })),
      excludedCount: ranking.excluded.length,
    },
  });

  return {
    taskId: task.id,
    status: "OFFERED",
    batchNumber: nextBatchNumber,
    offers: createdOffers.map(serializeTaskOffer),
    dispatchedCount: createdOffers.length,
    ranking,
  };
}

export async function expireStaleOffersForTask(
  db: DbClient,
  taskId: string,
  options: {
    now?: Date;
    autoDispatchNextBatch?: boolean;
    actorId?: string | null;
  } = {},
) {
  const now = options.now ?? new Date();
  const autoDispatchNextBatch = options.autoDispatchNextBatch ?? true;

  const expiredResult = await db.taskOffer.updateMany({
    where: {
      taskId,
      status: "PENDING",
      expiresAt: { lte: now },
    },
    data: {
      status: "EXPIRED",
      respondedAt: now,
    },
  });

  const task = await db.reviewTask.findUnique({
    where: { id: taskId },
    include: { assignment: true },
  });

  if (!task) {
    throw new AppError(404, "TASK_NOT_FOUND", "Review task not found.");
  }

  const remainingPending = await db.taskOffer.count({
    where: {
      taskId,
      status: "PENDING",
      expiresAt: { gt: now },
    },
  });

  const totalOffers = await db.taskOffer.count({ where: { taskId } });

  if (
    autoDispatchNextBatch &&
    !task.assignment &&
    totalOffers > 0 &&
    remainingPending === 0 &&
    ["OFFERED", "FUNDED", "MATCHING", "QUEUED"].includes(task.status)
  ) {
    const nextBatch = await dispatchTopOffers(db, taskId, {
      now,
      actorId: options.actorId ?? null,
    });
    return {
      expiredCount: expiredResult.count,
      remainingPending: nextBatch.offers.length,
      nextBatch,
    };
  }

  return {
    expiredCount: expiredResult.count,
    remainingPending,
    nextBatch: null,
  };
}

export async function declineTaskOffer(
  db: DbClient,
  args: {
    taskId: string;
    specialistId: string;
    now?: Date;
  },
) {
  const now = args.now ?? new Date();

  await db.taskOffer.updateMany({
    where: {
      taskId: args.taskId,
      status: "PENDING",
      expiresAt: { lte: now },
    },
    data: {
      status: "EXPIRED",
      respondedAt: now,
    },
  });

  const offer = await db.taskOffer.findUnique({
    where: {
      taskId_specialistId: {
        taskId: args.taskId,
        specialistId: args.specialistId,
      },
    },
  });

  if (!offer) {
    throw new AppError(404, "OFFER_NOT_FOUND", "No task offer found for your account.");
  }

  if (offer.status !== "PENDING") {
    throw new AppError(409, "OFFER_NOT_PENDING", `Offer cannot be declined because its status is ${offer.status}.`);
  }

  const updated = await db.taskOffer.update({
    where: { id: offer.id },
    data: {
      status: "DECLINED",
      respondedAt: now,
    },
    include: {
      specialist: { select: { id: true, name: true, email: true } },
    },
  });

  await recordTaskEvent(db, {
    taskId: args.taskId,
    type: "TASK_OFFER_DECLINED",
    message: "A specialist declined their task offer.",
    actorId: args.specialistId,
    metadata: { offerId: updated.id, batchNumber: updated.batchNumber, rank: updated.rank },
  });

  const remainingPending = await db.taskOffer.count({
    where: {
      taskId: args.taskId,
      status: "PENDING",
      expiresAt: { gt: now },
    },
  });

  let nextBatch = null;
  if (remainingPending === 0) {
    nextBatch = await dispatchTopOffers(db, args.taskId, {
      now,
      actorId: null,
    });
  }

  return {
    offer: serializeTaskOffer(updated),
    remainingPending: nextBatch ? nextBatch.offers.length : remainingPending,
    nextBatch,
  };
}

/**
 * Atomic first-accept locking for specialist task offers (and legacy open-funded tasks).
 * Guarantees that under parallel accept races (e.g. 5 offered specialists accepting at once),
 * exactly 1 specialist wins the assignment (`200`) and all other 4 receive `409`, while all
 * other pending offers are immediately transitioned to `EXPIRED`.
 */
export async function acceptTaskOfferAtomically(
  prismaClient: PrismaClient,
  args: {
    taskId: string;
    specialistId: string;
    now?: Date;
  },
): Promise<{ assignmentId: string; offerId: string | null }> {
  const now = args.now ?? new Date();

  const task = await prismaClient.reviewTask.findUnique({
    where: { id: args.taskId },
    include: {
      assignment: true,
      offers: true,
    },
  });

  if (!task) {
    throw new AppError(404, "TASK_NOT_FOUND", "Review task not found.");
  }
  if (task.requesterId === args.specialistId) {
    throw new AppError(409, "SELF_ASSIGNMENT", "You cannot accept your own review task.");
  }

  const hasOfferRouting = task.offers.length > 0 || task.status === "OFFERED" || Boolean(task.requiredSkillId);
  let winningOfferId: string | null = null;

  if (hasOfferRouting) {
    const myOffer = task.offers.find((o) => o.specialistId === args.specialistId) ?? null;
    if (!myOffer) {
      throw new AppError(
        403,
        "OFFER_REQUIRED",
        "This task requires an active specialist offer before it can be accepted.",
      );
    }

    if (task.assignment || ["ASSIGNED", "REVIEWER_ASSIGNED", "IN_PROGRESS"].includes(task.status)) {
      throw new AppError(409, "TASK_ALREADY_ASSIGNED", "Another reviewer accepted this task first.");
    }

    if (myOffer.expiresAt.getTime() <= now.getTime() || myOffer.status === "EXPIRED") {
      await prismaClient.taskOffer.updateMany({
        where: { id: myOffer.id, status: "PENDING" },
        data: { status: "EXPIRED", respondedAt: now },
      });
      throw new AppError(409, "OFFER_EXPIRED", "Your offer for this task has expired.");
    }

    if (myOffer.status !== "PENDING") {
      throw new AppError(409, "OFFER_NOT_AVAILABLE", `Your offer is ${myOffer.status} and cannot be accepted.`);
    }

    if (!["OFFERED", "FUNDED"].includes(task.status)) {
      throw new AppError(409, "TASK_NOT_AVAILABLE", "This task is no longer available to accept.");
    }

    winningOfferId = myOffer.id;
  } else {
    // Legacy open-funded marketplace task without TaskOffer records
    if (task.status !== "FUNDED" || task.assignment) {
      throw new AppError(409, "TASK_NOT_AVAILABLE", "This task is no longer available to accept.");
    }
  }

  // Atomic compare-and-swap on ReviewTask status: only one concurrent request can transition
  // the row from OFFERED/FUNDED to ASSIGNED/REVIEWER_ASSIGNED.
  const nextStatus = task.status === "OFFERED" ? "ASSIGNED" : "REVIEWER_ASSIGNED";
  const claimedTask = await prismaClient.reviewTask.updateMany({
    where: {
      id: task.id,
      status: task.status,
      assignment: { is: null },
    },
    data: {
      status: nextStatus,
    },
  });

  if (claimedTask.count === 0) {
    throw new AppError(409, "TASK_ALREADY_ASSIGNED", "Another reviewer accepted this task first.");
  }

  try {
    return await prismaClient.$transaction(async (db) => {
      if (winningOfferId) {
        await db.taskOffer.update({
          where: { id: winningOfferId },
          data: {
            status: "ACCEPTED",
            respondedAt: now,
          },
        });

        await db.taskOffer.updateMany({
          where: {
            taskId: task.id,
            id: { not: winningOfferId },
            status: "PENDING",
          },
          data: {
            status: "EXPIRED",
            respondedAt: now,
          },
        });
      }

      const assignment = await db.taskAssignment.create({
        data: {
          taskId: task.id,
          reviewerId: args.specialistId,
          status: "ACTIVE",
          acceptedAt: now,
        },
      });

      await recordTaskEvent(db, {
        taskId: task.id,
        type: "TASK_ACCEPTED",
        message: winningOfferId
          ? "Offered specialist accepted the task; competing batch offers were expired."
          : "A qualified reviewer accepted the task.",
        actorId: args.specialistId,
        metadata: {
          assignmentId: assignment.id,
          offerId: winningOfferId,
        },
      });

      return {
        assignmentId: assignment.id,
        offerId: winningOfferId,
      };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "TASK_ALREADY_ASSIGNED", "Another reviewer accepted this task first.");
    }
    throw error;
  }
}
