import { beforeEach, describe, expect, it } from "vitest";
import { agent, fundTask, loginAs, resetDatabase, seedDemoUsers } from "./helpers.js";
import { INDIA_PAYOUT_CONSTRAINT_NOTE, resolvePayoutAvailability } from "../services/payments.js";

async function createAndVerifyTask() {
  await seedDemoUsers();

  const requesterAgent = agent();
  await loginAs(requesterAgent, "agent@demo.trusttopay.dev");

  const reviewerAgent = agent();
  await loginAs(reviewerAgent, "reviewer@demo.trusttopay.dev");

  // Ensure reviewer has payout consent & email configured
  const consentRes = await reviewerAgent
    .patch("/api/v1/users/me/payout")
    .send({ payoutEmail: "reviewer-payout@example.com", payoutConsent: true });
  expect(consentRes.status).toBe(200);

  const created = await requesterAgent.post("/api/v1/tasks").send({
    title: "Implement constant-time token comparison utility",
    question:
      "How should we compare bearer tokens in src/tokenCompare.ts so timing side channels are eliminated?",
    acceptanceCriteria:
      "Provide a TypeScript implementation in src/tokenCompare.ts using crypto.timingSafeEqual, handle length mismatches safely, and include unit test coverage.",
    requiredSkills: ["TypeScript", "Security"],
    rewardMinor: 2500,
    rewardApproved: true,
    riskLevel: "STANDARD",
    category: "PROGRAMMING",
  });
  expect(created.status).toBe(201);
  const taskId = created.body.task.id as string;
  const sessionId = created.body.task.sessionId as string;

  await fundTask(requesterAgent, taskId);

  const accept = await reviewerAgent.post(`/api/v1/tasks/${taskId}/accept`).send({});
  expect(accept.status).toBe(200);

  const submitRes = await reviewerAgent.post(`/api/v1/tasks/${taskId}/submit`).send({
    answer:
      "We recommend this TypeScript implementation using crypto.timingSafeEqual in src/tokenCompare.ts to handle length mismatches safely in under 1ms with unit test coverage.",
    explanation:
      "Constant-time TypeScript comparison prevents byte-by-byte timing attacks on bearer tokens by checking byte length and comparing buffers.",
    confidenceScore: 96,
    sourceUrl: "https://nodejs.org/api/crypto.html",
    evidenceNotes:
      'Official Node.js quote: "crypto.timingSafeEqual(a, b) compares two buffers without leaking timing information."',
    files: [
      {
        path: "src/tokenCompare.ts",
        content: [
          "import crypto from 'node:crypto';",
          "export function compareTokensSafely(a: string, b: string): boolean {",
          "  const bufA = Buffer.from(a, 'utf8');",
          "  const bufB = Buffer.from(b, 'utf8');",
          "  if (bufA.length !== bufB.length) return false;",
          "  return crypto.timingSafeEqual(bufA, bufB);",
          "}",
        ].join("\n"),
      },
    ],
  });
  expect(submitRes.status).toBe(201);
  expect(submitRes.body.verification.status).toBe("PASSED");

  return { taskId, sessionId, requesterAgent, reviewerAgent };
}

describe("Phase 7 — PayPal Sandbox Decoupling & UI States", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("exposes explicit DEMO_SIMULATED / PAYOUT_UNAVAILABLE availability and India merchant constraint note", async () => {
    await seedDemoUsers();
    const requesterAgent = agent();
    await loginAs(requesterAgent, "agent@demo.trusttopay.dev");

    const statusRes = await requesterAgent.get("/api/v1/integrations/status");
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.paypal.payoutAvailability).toBe(resolvePayoutAvailability());
    expect(["DEMO_SIMULATED", "PAYOUT_UNAVAILABLE", "SANDBOX_ENABLED"]).toContain(
      statusRes.body.paypal.payoutAvailability,
    );
    expect(statusRes.body.paypal.indiaMerchantConstraintNote).toBe(INDIA_PAYOUT_CONSTRAINT_NOTE);
    expect(statusRes.body.paypal.indiaMerchantConstraintNote).toContain("PayPal Payouts");
  });

  it("decouples agent handback from payout: handback/resume can run before payout, and payout still succeeds cleanly", async () => {
    const { taskId, sessionId, requesterAgent } = await createAndVerifyTask();

    // 1. Check payment summary before handback
    const summaryBefore = await requesterAgent.get(`/api/v1/payments/summary/${taskId}`);
    expect(summaryBefore.status).toBe(200);
    expect(summaryBefore.body.summary.payoutEligible).toBe(true);
    expect(summaryBefore.body.summary.payoutAvailability).toBe(resolvePayoutAvailability());
    expect(summaryBefore.body.summary.mode.indiaMerchantConstraintNote).toContain("PayPal Payouts");

    // 2. Perform agent handback BEFORE releasing payout -> transitions task to HANDED_OFF
    const handbackRes = await requesterAgent.get(`/api/v1/tasks/${taskId}/handback`);
    expect(handbackRes.status).toBe(200);
    expect(handbackRes.body.handback.taskId).toBe(taskId);

    const detailAfterHandback = await requesterAgent.get(`/api/v1/tasks/${taskId}`);
    expect(detailAfterHandback.status).toBe(200);
    expect(detailAfterHandback.body.task.status).toBe("HANDED_OFF");
    expect(detailAfterHandback.body.task.payoutEligible).toBe(true);
    expect(detailAfterHandback.body.task.payoutAvailability).toBe(resolvePayoutAvailability());

    // 3. Resume original session BEFORE releasing payout -> transitions session to RESOLVED and task to COMPLETED
    const resumeRes = await requesterAgent.post(`/api/v1/sessions/${sessionId}/resume`).send({});
    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.session.status).toBe("RESOLVED");

    const detailAfterResume = await requesterAgent.get(`/api/v1/tasks/${taskId}`);
    expect(detailAfterResume.status).toBe(200);
    expect(detailAfterResume.body.task.status).toBe("COMPLETED");
    expect(detailAfterResume.body.task.payoutEligible).toBe(true);

    // 4. Release payout AFTER handback & session resume -> succeeds without corrupting task status
    const payoutRes = await requesterAgent.post("/api/v1/payments/payouts").send({ taskId });
    expect(payoutRes.status).toBe(201);
    expect(payoutRes.body.transaction.type).toBe("PAYOUT");
    expect(payoutRes.body.transaction.status).toBe("COMPLETED");
    expect(payoutRes.body.transaction.payoutAvailability).toBe(resolvePayoutAvailability());

    // 5. Task remains in COMPLETED and reward is PAID
    const detailAfterPayout = await requesterAgent.get(`/api/v1/tasks/${taskId}`);
    expect(detailAfterPayout.status).toBe(200);
    expect(detailAfterPayout.body.task.status).toBe("COMPLETED");
    expect(detailAfterPayout.body.task.reward.status).toBe("PAID");
    expect(detailAfterPayout.body.task.payoutEligible).toBe(false);
  });

  it("allows payout first and verified agent handback second without blocking", async () => {
    const { taskId, requesterAgent } = await createAndVerifyTask();

    // 1. Release payout first while task is PAYMENT_READY
    const payoutRes = await requesterAgent.post("/api/v1/payments/payouts").send({ taskId });
    expect(payoutRes.status).toBe(201);
    expect(payoutRes.body.transaction.status).toBe("COMPLETED");

    // 2. Retrieve verified handback AFTER payout -> succeeds and returns verified artifact
    const handbackRes = await requesterAgent.get(`/api/v1/tasks/${taskId}/handback`);
    expect(handbackRes.status).toBe(200);
    expect(handbackRes.body.handback.taskId).toBe(taskId);
    expect(handbackRes.body.handback.safetyReview.verdict).toBe("PASS");
    expect(handbackRes.body.handback.testRunSummary.passed).toBe(true);
  });
});
