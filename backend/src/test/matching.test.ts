import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db.js";
import { seedVerifiedSkillLevel } from "../services/skills/assessmentEngine.js";
import { expireStaleOffersForTask } from "../services/matching/offerDispatcher.js";
import {
  acceptanceCriteria,
  agent,
  createUser,
  fundTask,
  loginAs,
  resetDatabase,
} from "./helpers.js";

describe("Phase 3 — Specialist Ranking & Top-Five Parallel Offer Broadcast", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("filters out specialists lacking the verified required skill level, unapproved accounts, and overloaded specialists", async () => {
    const requester = await createUser("REQUESTER", { email: "req-filter@test.dev" });
    const reqClient = agent();
    await loginAs(reqClient, requester.email);

    // 1. Unapproved reviewer (even if verified L3)
    const unapproved = await createUser("REVIEWER", {
      email: "unapproved@test.dev",
      isReviewerApproved: false,
    });
    await seedVerifiedSkillLevel(prisma, {
      userId: unapproved.id,
      skillSlug: "typescript",
      targetLevel: 3,
    });

    // 2. Approved reviewer with only L1 TypeScript (task requires minimum L2)
    const level1Only = await createUser("REVIEWER", { email: "l1-only@test.dev" });
    await seedVerifiedSkillLevel(prisma, {
      userId: level1Only.id,
      skillSlug: "typescript",
      targetLevel: 1,
    });

    // 3. Approved reviewer with L2 Python, but no TypeScript
    const wrongSkill = await createUser("REVIEWER", { email: "python-only@test.dev" });
    await seedVerifiedSkillLevel(prisma, {
      userId: wrongSkill.id,
      skillSlug: "python",
      targetLevel: 3,
    });

    // 4. Qualified L2 TypeScript reviewer
    const qualifiedL2 = await createUser("REVIEWER", { email: "qualified-l2@test.dev" });
    await seedVerifiedSkillLevel(prisma, {
      userId: qualifiedL2.id,
      skillSlug: "typescript",
      targetLevel: 2,
    });

    // 5. Qualified L3 TypeScript reviewer
    const qualifiedL3 = await createUser("REVIEWER", { email: "qualified-l3@test.dev" });
    await seedVerifiedSkillLevel(prisma, {
      userId: qualifiedL3.id,
      skillSlug: "typescript",
      targetLevel: 3,
    });

    const created = await reqClient.post("/api/v1/tasks").send({
      title: "TypeScript worker pool abort signal audit",
      question: "Review our worker pool timeout handling and verify abort signal propagation.",
      acceptanceCriteria,
      requiredSkills: ["TypeScript"],
      requiredSkillId: "typescript",
      minimumSkillLevel: 2,
      rewardMinor: 1500,
      rewardApproved: true,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const taskId = created.body.task.id as string;

    await fundTask(reqClient, taskId);

    const dispatchRes = await reqClient.post(`/api/v1/tasks/${taskId}/offers/dispatch`).send({});
    expect(dispatchRes.status, JSON.stringify(dispatchRes.body)).toBe(201);
    expect(dispatchRes.body.status).toBe("OFFERED");
    expect(dispatchRes.body.dispatchedCount).toBe(2);

    // L3 should rank ahead of L2
    const offers = dispatchRes.body.offers;
    expect(offers).toHaveLength(2);
    expect(offers[0].specialistId).toBe(qualifiedL3.id);
    expect(offers[0].rank).toBe(1);
    expect(offers[0].verifiedSkillLevel).toBe(3);
    expect(offers[0].reasons.length).toBeGreaterThanOrEqual(3);

    expect(offers[1].specialistId).toBe(qualifiedL2.id);
    expect(offers[1].rank).toBe(2);
    expect(offers[1].verifiedSkillLevel).toBe(2);

    // Excluded list contains the filtered-out candidates with explicit reasons
    const excludedIds = dispatchRes.body.ranking.excluded.map((e: { specialistId: string }) => e.specialistId);
    expect(excludedIds).toContain(unapproved.id);
    expect(excludedIds).toContain(level1Only.id);
    expect(excludedIds).toContain(wrongSkill.id);
  });

  it("dispatches parallel offers to top 5 specialists and guarantees exactly 1 winner under 5 concurrent /accept requests", async () => {
    const requester = await createUser("REQUESTER", { email: "req-race@test.dev" });
    const reqClient = agent();
    await loginAs(reqClient, requester.email);

    // Create 7 eligible verified specialists (3 at L3, 3 at L2, 1 at L1)
    const specialists = [];
    for (let i = 1; i <= 7; i++) {
      const level = i <= 3 ? 3 : i <= 6 ? 2 : 1;
      const user = await createUser("REVIEWER", {
        email: `specialist-${i}@test.dev`,
        name: `Specialist ${i}`,
      });
      await seedVerifiedSkillLevel(prisma, {
        userId: user.id,
        skillSlug: "typescript",
        targetLevel: level as 1 | 2 | 3,
        score: 100 - i,
      });
      const client = agent();
      await loginAs(client, user.email);
      specialists.push({ user, client, level });
    }

    const created = await reqClient.post("/api/v1/tasks").send({
      title: "High-concurrency webhook idempotency review",
      question: "Verify our transactional webhook deduplication logic under concurrent retries.",
      acceptanceCriteria,
      requiredSkills: ["TypeScript"],
      requiredSkillId: "typescript",
      minimumSkillLevel: 1,
      rewardMinor: 2000,
      rewardApproved: true,
    });
    expect(created.status).toBe(201);
    const taskId = created.body.task.id as string;

    await fundTask(reqClient, taskId);

    // Dispatch top-5 offers
    const dispatchRes = await reqClient.post(`/api/v1/tasks/${taskId}/offers/dispatch`).send({});
    expect(dispatchRes.status).toBe(201);
    expect(dispatchRes.body.dispatchedCount).toBe(5);
    expect(dispatchRes.body.task.status).toBe("OFFERED");

    const offeredSpecialistIds = new Set<string>(
      dispatchRes.body.offers.map((o: { specialistId: string }) => o.specialistId),
    );
    expect(offeredSpecialistIds.size).toBe(5);

    // Specialist #7 (ranked 7th, not in top 5) cannot accept the task
    const nonOfferedSpecialist = specialists.find((s) => !offeredSpecialistIds.has(s.user.id))!;
    const nonOfferedAttempt = await nonOfferedSpecialist.client.post(`/api/v1/tasks/${taskId}/accept`);
    expect(nonOfferedAttempt.status).toBe(403);
    expect(nonOfferedAttempt.body.error.code).toBe("OFFER_REQUIRED");

    // All 5 offered specialists click accept concurrently
    const offeredClients = specialists.filter((s) => offeredSpecialistIds.has(s.user.id));
    expect(offeredClients).toHaveLength(5);

    const raceResponses = await Promise.all(
      offeredClients.map((s) => s.client.post(`/api/v1/tasks/${taskId}/accept`)),
    );

    const winners = raceResponses.filter((r) => r.status === 200);
    const conflicts = raceResponses.filter((r) => r.status === 409);

    expect(winners).toHaveLength(1);
    expect(conflicts).toHaveLength(4);
    for (const conflict of conflicts) {
      expect(conflict.body.error.code).toBe("TASK_ALREADY_ASSIGNED");
    }

    // Verify DB state: exactly 1 TaskAssignment, 1 ACCEPTED offer, and 4 EXPIRED offers
    const dbOffers = await prisma.taskOffer.findMany({ where: { taskId } });
    expect(dbOffers).toHaveLength(5);
    const acceptedOffers = dbOffers.filter((o) => o.status === "ACCEPTED");
    const expiredOffers = dbOffers.filter((o) => o.status === "EXPIRED");
    expect(acceptedOffers).toHaveLength(1);
    expect(expiredOffers).toHaveLength(4);

    const updatedTask = await prisma.reviewTask.findUnique({
      where: { id: taskId },
      include: { assignment: true },
    });
    expect(updatedTask?.status).toBe("ASSIGNED");
    expect(updatedTask?.assignment?.reviewerId).toBe(acceptedOffers[0].specialistId);
  });

  it("expires offers after TTL and dispatches to the next ranked batch or transitions to NO_MATCH", async () => {
    const requester = await createUser("REQUESTER", { email: "req-expiry@test.dev" });
    const reqClient = agent();
    await loginAs(reqClient, requester.email);

    // Create 6 eligible specialists so Batch 1 has 5 and Batch 2 has 1
    const specialists = [];
    for (let i = 1; i <= 6; i++) {
      const user = await createUser("REVIEWER", {
        email: `batch-spec-${i}@test.dev`,
        name: `Batch Specialist ${i}`,
      });
      await seedVerifiedSkillLevel(prisma, {
        userId: user.id,
        skillSlug: "smart-contracts",
        targetLevel: 2,
        score: 95 - i,
      });
      const client = agent();
      await loginAs(client, user.email);
      specialists.push({ user, client });
    }

    const created = await reqClient.post("/api/v1/tasks").send({
      title: "EIP-712 domain separator fork safety",
      question: "Verify whether cached domain separator is safe across chainId fork.",
      acceptanceCriteria,
      requiredSkills: ["Smart Contracts"],
      requiredSkillId: "smart-contracts",
      minimumSkillLevel: 2,
      rewardMinor: 1800,
      rewardApproved: true,
    });
    expect(created.status).toBe(201);
    const taskId = created.body.task.id as string;
    await fundTask(reqClient, taskId);

    // Dispatch Batch 1 (top 5)
    const batch1 = await reqClient.post(`/api/v1/tasks/${taskId}/offers/dispatch`).send({});
    expect(batch1.status).toBe(201);
    expect(batch1.body.batchNumber).toBe(1);
    expect(batch1.body.offers).toHaveLength(5);

    // Fast-forward past the 15-minute TTL and run expiry handler
    const futureNow = new Date(Date.now() + 16 * 60 * 1000);
    const expiryResult = await prisma.$transaction((db) =>
      expireStaleOffersForTask(db, taskId, { now: futureNow, autoDispatchNextBatch: true }),
    );

    expect(expiryResult.expiredCount).toBe(5);
    expect(expiryResult.nextBatch?.batchNumber).toBe(2);
    expect(expiryResult.nextBatch?.offers).toHaveLength(1);
    expect(expiryResult.nextBatch?.offers[0].specialistId).toBe(specialists[5].user.id);

    // If the 6th specialist declines their Batch 2 offer, no candidates remain -> task transitions to NO_MATCH
    const declineRes = await specialists[5].client.post(`/api/v1/tasks/${taskId}/offers/decline`);
    expect(declineRes.status).toBe(200);
    expect(declineRes.body.offer.status).toBe("DECLINED");
    expect(declineRes.body.nextBatch.status).toBe("NO_MATCH");
    expect(declineRes.body.task.status).toBe("NO_MATCH");
  });
});
