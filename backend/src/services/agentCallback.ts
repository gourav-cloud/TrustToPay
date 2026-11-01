import crypto from "node:crypto";
import { AppError } from "../lib/errors.js";
import { parseJson } from "../lib/json.js";
import type { CanonicalArtifactFile, CanonicalFileManifestEntry } from "../lib/artifacts.js";
import type { LayeredSecurityGateResult } from "./security/geminiReviewService.js";
import type { IsolatedExecutionResult } from "./execution/fixtureRunner.js";

export type AgentHandbackPayload = {
  taskId: string;
  taskStatus: string;
  verifiedAt: string;
  handoffIdempotencyKey: string;
  artifact: {
    id: string;
    version: number;
    sha256Digest: string;
    totalSizeBytes: number;
    fileCount: number;
    fileManifest: CanonicalFileManifestEntry[];
    changedFiles: CanonicalArtifactFile[];
    patchText: string | null;
    archiveUrl: string | null;
  };
  verification: {
    verificationRunId: string;
    status: "PASSED";
    decisionReason: string;
    artifactVersion: number;
    artifactSha256: string;
  };
  safetyReview: {
    safetyReviewId: string;
    verdict: "PASS";
    riskLevel: string;
    engine: string;
    artifactSha256: string;
    reviewedAt: string;
  };
  testRunSummary: {
    runnerMode: "FIXTURE_LABELLED" | "ISOLATED_SANDBOX";
    runnerImageVersion: string;
    command: string;
    exitCode: number;
    passed: true;
    durationMs: number;
    stdout: string;
    artifactSha256: string;
  };
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type TaskRow = Record<string, any>;

/**
 * Builds the sanitized, deterministic agent handback payload.
 *
 * Security invariants:
 * - Only returns an artifact that has passed:
 *   1. Deterministic checks (`VerificationRun.status === "PASSED"`)
 *   2. Layered Gemini security gate (`securityVerdict === "PASS"`)
 *   3. Isolated test execution (`executionSummary.passed === true`)
 * - Verifies exact SHA-256 digest match across the artifact, verification run, security review, and test execution.
 * - Never includes private reviewer notes (`evidenceNotes`), reviewer emails, secrets, or other candidates' offers.
 */
export function buildVerifiedAgentHandback(task: TaskRow): AgentHandbackPayload {
  const acceptedSubmission = (task.submissions ?? []).find(
    (sub: TaskRow) => sub.status === "ACCEPTED" && sub.artifact && !sub.artifact.invalidatedAt && !sub.artifact.isQuarantined,
  );
  if (!acceptedSubmission || !acceptedSubmission.artifact) {
    throw new AppError(
      409,
      "HANDBACK_NOT_READY",
      "No verified, non-invalidated code artifact is available for handoff on this task.",
    );
  }

  const artifact = acceptedSubmission.artifact;
  const activePassingRun = (task.verificationRuns ?? []).find(
    (run: TaskRow) =>
      !run.invalidatedAt &&
      run.submissionId === acceptedSubmission.id &&
      run.status === "PASSED" &&
      run.artifactSha256 === artifact.sha256Digest,
  );

  if (!activePassingRun) {
    throw new AppError(
      409,
      "HANDBACK_NOT_READY",
      "The latest submission artifact does not have a valid, non-invalidated passing verification run matching its SHA-256 digest.",
    );
  }

  const securityReview = parseJson<LayeredSecurityGateResult | null>(activePassingRun.securityReviewJson, null);
  if (
    activePassingRun.securityVerdict !== "PASS" ||
    !securityReview ||
    securityReview.verdict !== "PASS" ||
    securityReview.artifactSha256 !== artifact.sha256Digest
  ) {
    throw new AppError(
      409,
      "HANDBACK_SECURITY_GATE_REQUIRED",
      "Artifact cannot be handed back because it has not passed the Gemini security gate for its exact SHA-256 digest.",
    );
  }

  const executionSummary = parseJson<IsolatedExecutionResult | null>(activePassingRun.executionSummaryJson, null);
  if (
    !executionSummary ||
    !executionSummary.passed ||
    executionSummary.exitCode !== 0 ||
    executionSummary.artifactSha256 !== artifact.sha256Digest
  ) {
    throw new AppError(
      409,
      "HANDBACK_EXECUTION_GATE_REQUIRED",
      "Artifact cannot be handed back because it has not passed isolated verification test execution for its exact SHA-256 digest.",
    );
  }

  const fileManifest = parseJson<CanonicalFileManifestEntry[]>(artifact.fileManifestJson, []);
  const changedFiles = parseJson<CanonicalArtifactFile[]>(artifact.filesJson, []);
  const verifiedAt = task.verifiedAt
    ? new Date(task.verifiedAt).toISOString()
    : new Date(activePassingRun.createdAt).toISOString();

  return {
    taskId: task.id,
    taskStatus: task.status,
    verifiedAt,
    handoffIdempotencyKey: `handback:${task.id}:v${artifact.version}:${artifact.sha256Digest}`,
    artifact: {
      id: artifact.id,
      version: artifact.version,
      sha256Digest: artifact.sha256Digest,
      totalSizeBytes: artifact.totalSizeBytes,
      fileCount: artifact.fileCount,
      fileManifest,
      changedFiles,
      patchText: artifact.patchText ?? null,
      archiveUrl: artifact.archiveUrl ?? null,
    },
    verification: {
      verificationRunId: activePassingRun.id,
      status: "PASSED",
      decisionReason: activePassingRun.decisionReason,
      artifactVersion: artifact.version,
      artifactSha256: artifact.sha256Digest,
    },
    safetyReview: {
      safetyReviewId: `sr_${activePassingRun.id}`,
      verdict: "PASS",
      riskLevel: securityReview.riskLevel,
      engine: securityReview.engine,
      artifactSha256: artifact.sha256Digest,
      reviewedAt: securityReview.reviewedAt,
    },
    testRunSummary: {
      runnerMode: executionSummary.runnerMode,
      runnerImageVersion: executionSummary.runnerImageVersion,
      command: executionSummary.command,
      exitCode: executionSummary.exitCode,
      passed: true,
      durationMs: executionSummary.durationMs,
      stdout: executionSummary.stdout,
      artifactSha256: executionSummary.artifactSha256,
    },
  };
}

export function signAgentHandbackPayload(
  payload: AgentHandbackPayload,
  secret: string,
  timestampSeconds = Math.floor(Date.now() / 1000),
): {
  rawBody: string;
  timestamp: string;
  signature: string;
  signatureHeader: string;
  headers: Record<string, string>;
} {
  if (!secret || secret.trim().length < 8) {
    throw new AppError(400, "INVALID_CALLBACK_SECRET", "Callback signing secret must be at least 8 characters.");
  }

  const rawBody = JSON.stringify(payload);
  const timestamp = String(timestampSeconds);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const signatureHeader = `sha256=${signature}`;

  return {
    rawBody,
    timestamp,
    signature,
    signatureHeader,
    headers: {
      "Content-Type": "application/json",
      "X-TrustToPay-Signature": signatureHeader,
      "X-TrustToPay-Timestamp": timestamp,
      "X-TrustToPay-Artifact-Sha256": payload.artifact.sha256Digest,
      "Idempotency-Key": payload.handoffIdempotencyKey,
    },
  };
}

export function verifyAgentCallbackSignature(input: {
  rawBody: string;
  timestamp: string;
  signatureHeader: string;
  secret: string;
}): boolean {
  const expected = crypto
    .createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.rawBody}`)
    .digest("hex");
  const actual = input.signatureHeader.replace(/^sha256=/i, "").trim();
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(actual, "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

export type CallbackDispatcher = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string },
) => Promise<{ status: number; ok: boolean }>;

export async function dispatchSignedAgentCallback(input: {
  callbackUrl: string;
  callbackSecret: string;
  payload: AgentHandbackPayload;
  timestampSeconds?: number;
  dispatcher?: CallbackDispatcher;
}): Promise<{
  delivered: boolean;
  statusCode: number;
  signatureHeader: string;
  timestamp: string;
  idempotencyKey: string;
}> {
  const signed = signAgentHandbackPayload(input.payload, input.callbackSecret, input.timestampSeconds);

  const send: CallbackDispatcher =
    input.dispatcher ??
    (async (url, init) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        return { status: res.status, ok: res.ok };
      } finally {
        clearTimeout(timer);
      }
    });

  const response = await send(input.callbackUrl, {
    method: "POST",
    headers: signed.headers,
    body: signed.rawBody,
  });

  return {
    delivered: response.ok,
    statusCode: response.status,
    signatureHeader: signed.signatureHeader,
    timestamp: signed.timestamp,
    idempotencyKey: input.payload.handoffIdempotencyKey,
  };
}
