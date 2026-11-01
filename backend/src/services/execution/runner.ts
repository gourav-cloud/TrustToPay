import { AppError } from "../../lib/errors.js";
import {
  runLabelledFixtureVerification,
  type IsolatedExecutionResult,
  type RunnerResourceLimits,
} from "./fixtureRunner.js";

export const DEFAULT_RUNNER_LIMITS: RunnerResourceLimits = {
  cpuCores: 1,
  memoryMb: 256,
  timeoutMs: 15_000,
  networkDisabled: true,
  hostMountDisabled: true,
  credentialsStripped: true,
};

const APPROVED_TEST_COMMANDS = new Set([
  "npm test -- --run",
  "npm run test",
  "vitest run",
  "pytest -q",
  "cargo test --offline",
]);

export type IsolatedSandboxAdapter = {
  executeInDisposableSandbox(input: {
    artifactVersion: number;
    artifactSha256: string;
    files: { path: string; content: string }[];
    patchText?: string | null;
    command: string;
    limits: RunnerResourceLimits;
    sanitizedEnv: Record<string, string>;
  }): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    failures?: string[];
    durationMs?: number;
    runnerImageVersion?: string;
  }>;
};

export type ExecuteIsolatedTestsInput = {
  artifactVersion: number;
  artifactSha256: string;
  securityVerdict: string | null | undefined;
  files: { path: string; content: string }[];
  patchText?: string | null;
  acceptanceCriteria: string;
  command?: string;
  timeoutMs?: number;
  sandboxAdapter?: IsolatedSandboxAdapter;
};

/**
 * Builds a strictly stripped environment for disposable sandbox workers.
 * Never forwards DATABASE_URL, GEMINI_API_KEY, PAYPAL_CLIENT_SECRET, SESSION_SECRET, or AI_API_KEY.
 */
export function buildSanitizedRunnerEnv(): Record<string, string> {
  return {
    NODE_ENV: "test",
    CI: "true",
    TZ: "UTC",
    HOME: "/tmp/sandbox",
    PATH: "/usr/local/bin:/usr/bin:/bin",
  };
}

/**
 * Guard ensuring the Express application server never executes arbitrary submitted
 * code in-process via `eval`, `new Function`, or host `child_process`.
 */
export function assertNoInProcessCodeExecution(executionMode: string): void {
  if (executionMode === "IN_PROCESS_EVAL" || executionMode === "HOST_CHILD_PROCESS") {
    throw new AppError(
      403,
      "UNSAFE_EXECUTION_FORBIDDEN",
      "Direct execution of untrusted submitted code in the main application process is strictly forbidden.",
    );
  }
}

export function validateApprovedTestCommand(rawCommand?: string): string {
  const command = (rawCommand ?? "npm test -- --run").trim();
  if (!APPROVED_TEST_COMMANDS.has(command)) {
    throw new AppError(
      400,
      "UNAPPROVED_TEST_COMMAND",
      `Test command "${command}" is not in the approved isolated runner allowlist.`,
    );
  }
  return command;
}

/**
 * Executes verification tests across the isolation boundary.
 *
 * Security invariants:
 * 1. Requires `securityVerdict === "PASS"` before running. Any artifact that has not passed
 *    both the deterministic scanner and Gemini security review is rejected with HTTP 409.
 * 2. Enforces CPU, memory, 15s timeout, disabled network, disabled host mounts, and stripped secrets.
 * 3. Uses an external `IsolatedSandboxAdapter` if provided; otherwise defaults to the labelled
 *    non-executing fixture runner (`[RUNNER_MODE=FIXTURE_LABELLED]`). Never runs untrusted code in-process.
 */
export async function executeIsolatedVerificationTests(
  input: ExecuteIsolatedTestsInput,
): Promise<IsolatedExecutionResult> {
  if (input.securityVerdict !== "PASS") {
    throw new AppError(
      409,
      "SECURITY_GATE_NOT_PASSED",
      `Artifact ${input.artifactSha256} cannot enter the test runner because securityVerdict is "${input.securityVerdict ?? "NONE"}".`,
    );
  }

  const command = validateApprovedTestCommand(input.command);
  const timeoutMs = Math.min(Math.max(50, input.timeoutMs ?? DEFAULT_RUNNER_LIMITS.timeoutMs), 15_000);
  const limits: RunnerResourceLimits = {
    ...DEFAULT_RUNNER_LIMITS,
    timeoutMs,
  };

  if (!input.sandboxAdapter) {
    assertNoInProcessCodeExecution("FIXTURE_LABELLED");
    return runLabelledFixtureVerification({
      artifactVersion: input.artifactVersion,
      artifactSha256: input.artifactSha256,
      files: input.files,
      patchText: input.patchText,
      acceptanceCriteria: input.acceptanceCriteria,
      command,
      limits,
    });
  }

  assertNoInProcessCodeExecution("ISOLATED_SANDBOX");
  const sanitizedEnv = buildSanitizedRunnerEnv();
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const adapterRes = await Promise.race([
      input.sandboxAdapter.executeInDisposableSandbox({
        artifactVersion: input.artifactVersion,
        artifactSha256: input.artifactSha256,
        files: input.files,
        patchText: input.patchText,
        command,
        limits,
        sanitizedEnv,
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const err = new Error(`Isolated sandbox execution timed out after ${timeoutMs}ms.`);
          err.name = "SandboxTimeoutError";
          reject(err);
        }, timeoutMs);
      }),
    ]);

    const passed = adapterRes.exitCode === 0;
    return {
      runnerMode: "ISOLATED_SANDBOX",
      runnerImageVersion: adapterRes.runnerImageVersion ?? "trusttopay-sandbox-runner:1.0.0",
      artifactVersion: input.artifactVersion,
      artifactSha256: input.artifactSha256,
      command,
      exitCode: adapterRes.exitCode,
      passed,
      timedOut: false,
      durationMs: adapterRes.durationMs ?? Math.max(1, Date.now() - start),
      limits,
      stdout: adapterRes.stdout.slice(0, 8000),
      stderr: adapterRes.stderr.slice(0, 4000),
      failures: adapterRes.failures ?? (passed ? [] : [adapterRes.stderr || "Sandbox test exited with non-zero code."]),
      executedAt: new Date().toISOString(),
    };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "SandboxTimeoutError";
    const errMsg = error instanceof Error ? error.message : "Sandbox runner failed.";
    return {
      runnerMode: "ISOLATED_SANDBOX",
      runnerImageVersion: "trusttopay-sandbox-runner:1.0.0",
      artifactVersion: input.artifactVersion,
      artifactSha256: input.artifactSha256,
      command,
      exitCode: isTimeout ? 124 : 1,
      passed: false,
      timedOut: isTimeout,
      durationMs: Math.max(1, Date.now() - start),
      limits,
      stdout: "",
      stderr: errMsg.slice(0, 4000),
      failures: [errMsg],
      executedAt: new Date().toISOString(),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
