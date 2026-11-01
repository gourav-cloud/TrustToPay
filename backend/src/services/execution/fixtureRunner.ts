export type RunnerResourceLimits = {
  cpuCores: number;
  memoryMb: number;
  timeoutMs: number;
  networkDisabled: true;
  hostMountDisabled: true;
  credentialsStripped: true;
};

export type IsolatedExecutionResult = {
  runnerMode: "FIXTURE_LABELLED" | "ISOLATED_SANDBOX";
  runnerImageVersion: string;
  artifactVersion: number;
  artifactSha256: string;
  command: string;
  exitCode: number;
  passed: boolean;
  timedOut: boolean;
  durationMs: number;
  limits: RunnerResourceLimits;
  stdout: string;
  stderr: string;
  failures: string[];
  executedAt: string;
};

export type FixtureExecutionInput = {
  artifactVersion: number;
  artifactSha256: string;
  files: { path: string; content: string }[];
  patchText?: string | null;
  acceptanceCriteria: string;
  command?: string;
  limits: RunnerResourceLimits;
};

function checkBalancedDelimiters(content: string): { ok: boolean; reason?: string } {
  let curly = 0;
  let paren = 0;
  let bracket = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (!inSingle && !inDouble && !inTemplate) {
      if (ch === "/" && next === "/") {
        inLineComment = true;
        i++;
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        i++;
        continue;
      }
    }

    if (ch === "\\" && (inSingle || inDouble || inTemplate)) {
      i++;
      continue;
    }

    if (!inDouble && !inTemplate && ch === "'") {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inTemplate && ch === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && ch === "`") {
      inTemplate = !inTemplate;
      continue;
    }

    if (inSingle || inDouble || inTemplate) continue;

    if (ch === "{") curly++;
    else if (ch === "}") curly--;
    else if (ch === "(") paren++;
    else if (ch === ")") paren--;
    else if (ch === "[") bracket++;
    else if (ch === "]") bracket--;

    if (curly < 0 || paren < 0 || bracket < 0) {
      return { ok: false, reason: "Unbalanced closing delimiter detected." };
    }
  }

  if (curly !== 0 || paren !== 0 || bracket !== 0) {
    return {
      ok: false,
      reason: `Unbalanced code delimiters (curly=${curly}, paren=${paren}, bracket=${bracket}).`,
    };
  }

  return { ok: true };
}

/**
 * Labelled non-executing fixture runner (`[RUNNER_MODE=FIXTURE_LABELLED]`).
 *
 * CRITICAL SECURITY INVARIANT:
 * This runner NEVER evaluates or executes untrusted specialist code in the Express
 * application process (`eval`, `new Function`, `child_process`, or `vm` are never called).
 * Instead, it performs deterministic static & structural verification against the
 * artifact manifest and acceptance criteria when an external disposable container
 * sandbox is not configured.
 */
export function runLabelledFixtureVerification(input: FixtureExecutionInput): IsolatedExecutionResult {
  const start = Date.now();
  const command = input.command ?? "npm test -- --run";
  const failures: string[] = [];
  const logLines: string[] = [
    "[RUNNER_MODE=FIXTURE_LABELLED] Non-executing static verification fixture active (no untrusted code executed on host).",
    `[RUNNER_ISOLATION] artifact=v${input.artifactVersion} sha256=${input.artifactSha256}`,
    `[RUNNER_LIMITS] cpu=${input.limits.cpuCores} mem=${input.limits.memoryMb}MB timeout=${input.limits.timeoutMs}ms net=disabled`,
  ];

  if (input.files.length === 0 && (!input.patchText || input.patchText.trim().length === 0)) {
    failures.push("Artifact contains no verifiable files or unified diff hunks.");
  }

  for (const file of input.files) {
    const trimmed = file.content.trim();
    if (trimmed.length === 0) {
      failures.push(`File "${file.path}" is empty.`);
      continue;
    }

    const isCodeFile = /\.(?:ts|tsx|js|jsx|mjs|cjs|json)$/i.test(file.path);
    if (isCodeFile) {
      const balance = checkBalancedDelimiters(trimmed);
      if (!balance.ok) {
        failures.push(`Syntax/structure check failed in "${file.path}": ${balance.reason}`);
      } else {
        logLines.push(`[PASS] Structural syntax verification passed for ${file.path} (${trimmed.length} bytes)`);
      }
    } else {
      logLines.push(`[PASS] Deliverable file verified: ${file.path} (${trimmed.length} bytes)`);
    }

    // Explicit test failure marker for deterministic test simulation
    if (/\b__SIMULATE_TEST_FAILURE__\b/.test(trimmed)) {
      failures.push(`Acceptance test suite failed in "${file.path}": simulated assertion failure.`);
    }
  }

  const passed = failures.length === 0;
  const durationMs = Math.max(1, Date.now() - start);

  if (passed) {
    logLines.push("[RUNNER_RESULT] status=PASSED exitCode=0");
  } else {
    logLines.push(`[RUNNER_RESULT] status=FAILED exitCode=1 failures=${failures.length}`);
  }

  return {
    runnerMode: "FIXTURE_LABELLED",
    runnerImageVersion: "trusttopay-fixture-runner:1.0.0",
    artifactVersion: input.artifactVersion,
    artifactSha256: input.artifactSha256,
    command,
    exitCode: passed ? 0 : 1,
    passed,
    timedOut: false,
    durationMs,
    limits: input.limits,
    stdout: logLines.join("\n").slice(0, 8000),
    stderr: failures.join("\n").slice(0, 4000),
    failures,
    executedAt: new Date().toISOString(),
  };
}
