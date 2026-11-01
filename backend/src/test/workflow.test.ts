import { beforeEach, describe, expect, it } from "vitest";
import {
  acceptanceCriteria,
  agent,
  analyzeChargerSession,
  createChargerSession,
  createUser,
  fundTask,
  goodSubmission,
  loginAs,
  resetDatabase,
  weakSubmission,
} from "./helpers.js";

async function setupReview(options: { rewardMinor?: number; riskLevel?: "STANDARD" | "HIGH" } = {}) {
  const requester = await createUser("REQUESTER", { email: "requester@test.dev", name: "Rae Requester" });
  const reviewer = await createUser("REVIEWER", { email: "reviewer@test.dev", name: "Riley Reviewer" });
  const admin = await createUser("ADMIN", { email: "admin@test.dev", name: "Avery Admin" });

  const clients = { requester: agent(), reviewer: agent(), admin: agent() };
  await loginAs(clients.requester, requester.email);
  await loginAs(clients.reviewer, reviewer.email);
  await loginAs(clients.admin, admin.email);

  const session = await createChargerSession(clients.requester);
  await analyzeChargerSession(clients.requester, session.id);

  const created = await clients.requester.post("/api/v1/tasks").send({
    sessionId: session.id,
    acceptanceCriteria,
    rewardMinor: options.rewardMinor ?? 1500,
    rewardApproved: true,
    riskLevel: options.riskLevel ?? "STANDARD",
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);

  return {
    requester,
    reviewer,
    admin,
    clients,
    sessionId: session.id,
    taskId: created.body.task.id as string,
  };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("funding gate", () => {
  it("keeps unfunded tasks out of the reviewer marketplace until simulated capture succeeds", async () => {
    const { clients, taskId } = await setupReview();

    const before = await clients.reviewer.get("/api/v1/tasks?scope=available");
    expect(before.body.pagination.total).toBe(0);

    const created = await clients.requester.get(`/api/v1/tasks/${taskId}`);
    expect(created.body.task.status).toBe("AWAITING_FUNDING");

    const reviewerCannotFund = await clients.reviewer.post("/api/v1/payments/paypal/orders").send({ taskId });
    expect(reviewerCannotFund.status).toBe(403);

    const capture = await fundTask(clients.requester, taskId);
    expect(capture.transaction.mode).toBe("SIMULATED");
    expect(capture.transaction.status).toBe("COMPLETED");

    const funded = await clients.requester.get(`/api/v1/tasks/${taskId}`);
    expect(funded.body.task.status).toBe("FUNDED");

    const after = await clients.reviewer.get("/api/v1/tasks?scope=available");
    expect(after.body.pagination.total).toBe(1);
    expect(after.body.items[0].id).toBe(taskId);
  });
});

describe("verified review lifecycle", () => {
  it("rejects a vague answer, accepts a cited one, pays the reviewer and resumes the AI session", async () => {
    const { clients, taskId, sessionId } = await setupReview();
    await fundTask(clients.requester, taskId);

    const accepted = await clients.reviewer.post(`/api/v1/tasks/${taskId}/accept`);
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    expect(accepted.body.task.status).toBe("REVIEWER_ASSIGNED");

    // 1. A vague submission fails the hard checks and authorizes no reward.
    const rejected = await clients.reviewer.post(`/api/v1/tasks/${taskId}/submit`).send(weakSubmission);
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(201);
    expect(rejected.body.verification.status).toBe("REJECTED");
    expect(rejected.body.task.status).toBe("VERIFICATION_REJECTED");
    expect(rejected.body.task.payoutEligible).toBe(false);

    // 2. A corrected, evidence-backed submission passes independent verification.
    const passed = await clients.reviewer.post(`/api/v1/tasks/${taskId}/submit`).send(goodSubmission);
    expect(passed.status, JSON.stringify(passed.body)).toBe(201);
    expect(passed.body.verification.status).toBe("PASSED");
    expect(passed.body.task.status).toBe("PAYMENT_READY");
    expect(passed.body.task.reward.status).toBe("AUTHORIZED");

    const requesterView = await clients.requester.get(`/api/v1/tasks/${taskId}`);
    expect(requesterView.body.task.payoutEligible).toBe(true);

    // 3. Payout is separate from verification and needs reviewer consent first.
    const blocked = await clients.requester.post("/api/v1/payments/payouts").send({ taskId });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("PAYOUT_CONSENT_MISSING");

    const consent = await clients.reviewer
      .patch("/api/v1/users/me/payout")
      .send({ payoutEmail: "reviewer-payout@example.com", payoutConsent: true });
    expect(consent.status, JSON.stringify(consent.body)).toBe(200);

    const payout = await clients.requester.post("/api/v1/payments/payouts").send({ taskId });
    expect(payout.status, JSON.stringify(payout.body)).toBe(201);
    expect(payout.body.transaction.type).toBe("PAYOUT");
    expect(payout.body.transaction.status).toBe("COMPLETED");

    const paid = await clients.requester.get(`/api/v1/tasks/${taskId}`);
    expect(paid.body.task.status).toBe("PAYMENT_PAID");

    // 4. The original agent session can now resume with the verified answer.
    const resumed = await clients.requester.post(`/api/v1/sessions/${sessionId}/resume`);
    expect(resumed.status, JSON.stringify(resumed.body)).toBe(200);
    expect(resumed.body.session.status).toBe("RESOLVED");
    expect(resumed.body.finalAnswer).toBe(goodSubmission.answer);

    const session = await clients.requester.get(`/api/v1/sessions/${sessionId}`);
    expect(session.body.session.finalAnswer).toBe(goodSubmission.answer);
  });
});

describe("manual review path", () => {
  it("routes a high-risk submission to an administrator and pays out only after a manual pass", async () => {
    const { clients, taskId } = await setupReview({ riskLevel: "HIGH" });
    await fundTask(clients.requester, taskId);
    await clients.reviewer.post(`/api/v1/tasks/${taskId}/accept`).expect(200);

    const submitted = await clients.reviewer.post(`/api/v1/tasks/${taskId}/submit`).send(goodSubmission);
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(201);
    expect(submitted.body.verification.status).toBe("NEEDS_MANUAL_REVIEW");
    expect(submitted.body.task.status).toBe("NEEDS_MANUAL_REVIEW");

    const reviewerCannotVerify = await clients.reviewer
      .post(`/api/v1/tasks/${taskId}/verify`)
      .send({ decision: "PASS", note: "I approve my own work." });
    expect(reviewerCannotVerify.status).toBe(403);

    const missingNote = await clients.admin.post(`/api/v1/tasks/${taskId}/verify`).send({ decision: "PASS" });
    expect(missingNote.status).toBe(400);
    expect(missingNote.body.error.code).toBe("NOTE_REQUIRED");

    const override = await clients.admin
      .post(`/api/v1/tasks/${taskId}/verify`)
      .send({ decision: "PASS", note: "Checked the manufacturer table and the quoted excerpt." });
    expect(override.status, JSON.stringify(override.body)).toBe(200);
    expect(override.body.verification.status).toBe("PASSED");
    expect(override.body.task.status).toBe("PAYMENT_READY");

    await clients.reviewer
      .patch("/api/v1/users/me/payout")
      .send({ payoutEmail: "reviewer-payout@example.com", payoutConsent: true })
      .expect(200);
    await clients.requester.post("/api/v1/payments/payouts").send({ taskId }).expect(201);
    await clients.requester.get(`/api/v1/tasks/${taskId}`).then((response) => {
      expect(response.body.task.status).toBe("PAYMENT_PAID");
    });
  });
});

describe("task authorization and limits", () => {
  it("enforces reward limits, ownership, role guards and single assignment", async () => {
    const { requester, clients, sessionId, taskId } = await setupReview();
    const outsider = await createUser("REQUESTER", { email: "outsider@test.dev", name: "Outsider" });
    const otherReviewer = await createUser("REVIEWER", { email: "other-reviewer@test.dev", name: "Other Reviewer" });
    const outsiderClient = agent();
    const otherReviewerClient = agent();
    await loginAs(outsiderClient, outsider.email);
    await loginAs(otherReviewerClient, otherReviewer.email);

    const belowMinimum = await clients.requester.post("/api/v1/tasks").send({
      sessionId,
      acceptanceCriteria,
      rewardMinor: 100,
      rewardApproved: true,
    });
    expect(belowMinimum.status).toBe(400);
    expect(belowMinimum.body.error.code).toBe("REWARD_OUT_OF_RANGE");

    const aboveMaximum = await clients.requester.post("/api/v1/tasks").send({
      sessionId,
      acceptanceCriteria,
      rewardMinor: 20_000,
      rewardApproved: true,
    });
    expect(aboveMaximum.status).toBe(400);
    expect(aboveMaximum.body.error.code).toBe("REWARD_OUT_OF_RANGE");

    const unapproved = await clients.requester.post("/api/v1/tasks").send({
      sessionId,
      acceptanceCriteria,
      rewardMinor: 1500,
      rewardApproved: false,
    });
    expect(unapproved.status).toBe(400);
    expect(unapproved.body.error.code).toBe("VALIDATION_ERROR");

    const notOwner = await outsiderClient.post("/api/v1/tasks").send({
      sessionId,
      acceptanceCriteria,
      rewardMinor: 1500,
      rewardApproved: true,
    });
    expect(notOwner.status).toBe(403);

    const unanalyzed = await clients.requester.post("/api/v1/sessions").send({
      question: "Does an unanalyzed session allow task creation?",
      documents: [],
    });
    const noAnalysis = await clients.requester.post("/api/v1/tasks").send({
      sessionId: unanalyzed.body.session.id,
      acceptanceCriteria,
      rewardMinor: 1500,
      rewardApproved: true,
    });
    expect(noAnalysis.status).toBe(409);
    expect(noAnalysis.body.error.code).toBe("ANALYSIS_REQUIRED");

    const requesterCannotAccept = await clients.requester.post(`/api/v1/tasks/${taskId}/accept`);
    expect(requesterCannotAccept.status).toBe(403);
    expect(requesterCannotAccept.body.error.code).toBe("FORBIDDEN");

    await fundTask(clients.requester, taskId);
    await clients.reviewer.post(`/api/v1/tasks/${taskId}/accept`).expect(200);

    const secondAccept = await otherReviewerClient.post(`/api/v1/tasks/${taskId}/accept`);
    expect(secondAccept.status).toBe(409);
    expect(secondAccept.body.error.code).toBe("TASK_NOT_AVAILABLE");

    const unassignedSubmit = await otherReviewerClient.post(`/api/v1/tasks/${taskId}/submit`).send(goodSubmission);
    expect(unassignedSubmit.status).toBe(403);
    expect(unassignedSubmit.body.error.code).toBe("NOT_ASSIGNED");

    expect(requester.id).toBeTruthy();
  });

  it("deduplicates repeated POST /api/tasks requests with the same Idempotency-Key", async () => {
    const requester = await createUser("REQUESTER", { email: "idem-agent@test.dev", name: "Idempotent Agent" });
    const client = agent();
    await loginAs(client, requester.email);

    const keyRes = await client.post("/api/v1/auth/api-keys").send({ name: "Retry Agent", mode: "test" });
    const rawKey = keyRes.body.rawKey as string;

    const session = await createChargerSession(client);
    await analyzeChargerSession(client, session.id);

    const payload = {
      sessionId: session.id,
      acceptanceCriteria,
      rewardMinor: 1500,
      rewardApproved: true,
    };

    const first = await agent()
      .post("/api/tasks")
      .set("Authorization", `Bearer ${rawKey}`)
      .set("Idempotency-Key", "agent-retry-key-001")
      .send(payload);
    expect(first.status).toBe(201);

    const second = await agent()
      .post("/api/tasks")
      .set("Authorization", `Bearer ${rawKey}`)
      .set("Idempotency-Key", "agent-retry-key-001")
      .send(payload);
    expect(second.status).toBe(200);
    expect(second.body.idempotentReplay).toBe(true);
    expect(second.body.task.id).toBe(first.body.task.id);

    const list = await agent()
      .get("/api/tasks")
      .set("Authorization", `Bearer ${rawKey}`);
    expect(list.status).toBe(200);
    expect(list.body.pagination.total).toBe(1);
  });

  it("enforces decoupled task state machine transitions and rejects invalid jumps like ASSIGNED -> COMPLETED", async () => {
    const { assertTransition, canTransition } = await import("../services/stateMachine.js");

    expect(canTransition("DRAFT", "QUEUED")).toBe(true);
    expect(canTransition("QUEUED", "MATCHING")).toBe(true);
    expect(canTransition("MATCHING", "OFFERED")).toBe(true);
    expect(canTransition("OFFERED", "ASSIGNED")).toBe(true);
    expect(canTransition("ASSIGNED", "IN_PROGRESS")).toBe(true);
    expect(canTransition("IN_PROGRESS", "SUBMITTED")).toBe(true);
    expect(canTransition("SUBMITTED", "SAFETY_CHECKING")).toBe(true);
    expect(canTransition("SAFETY_CHECKING", "VERIFICATION_RUNNING")).toBe(true);
    expect(canTransition("VERIFICATION_RUNNING", "VERIFIED")).toBe(true);
    expect(canTransition("VERIFIED", "HANDED_OFF")).toBe(true);
    expect(canTransition("HANDED_OFF", "COMPLETED")).toBe(true);

    expect(canTransition("ASSIGNED", "COMPLETED")).toBe(false);
    expect(() => assertTransition("ASSIGNED", "COMPLETED")).toThrow(/Cannot move a review task from ASSIGNED to COMPLETED/);
  });
});
