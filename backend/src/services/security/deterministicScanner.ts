export type SecurityFinding = {
  filePath: string;
  category:
    | "HARDCODED_SECRET"
    | "DESTRUCTIVE_COMMAND"
    | "OBFUSCATED_EXECUTION"
    | "SSRF_EXFILTRATION"
    | "PROMPT_INJECTION"
    | "MALICIOUS_CODE";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reason: string;
  evidence: string;
};

export type DeterministicScanInput = {
  files: { path: string; content: string }[];
  patchText?: string | null;
  answerText?: string | null;
};

export type DeterministicScanResult = {
  passed: boolean;
  blockedBySecret: boolean;
  blockedByMaliciousPattern: boolean;
  promptInjectionDetected: boolean;
  findings: SecurityFinding[];
  redactedFiles: { path: string; content: string }[];
  redactedPatchText: string | null;
  redactedAnswerText: string | null;
};

type SecretRule = {
  id: string;
  label: string;
  pattern: RegExp;
};

const SECRET_RULES: SecretRule[] = [
  {
    id: "openai_key",
    label: "Hardcoded OpenAI / Provider API Key",
    pattern: /\bsk-(?:proj-|ant-|live-|test-)?[A-Za-z0-9_-]{16,}\b/g,
  },
  {
    id: "github_pat",
    label: "Hardcoded GitHub Personal Access Token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/g,
  },
  {
    id: "aws_access_key",
    label: "Hardcoded AWS Access Key ID",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    id: "google_api_key",
    label: "Hardcoded Google Cloud / Gemini API Key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    id: "private_key_pem",
    label: "Embedded PEM Private Key",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    id: "stripe_live_key",
    label: "Hardcoded Stripe Live Secret Key",
    pattern: /\b(?:sk_live|rk_live)_[A-Za-z0-9]{16,}\b/g,
  },
  {
    id: "slack_token",
    label: "Hardcoded Slack Token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    id: "trusttopay_agent_key",
    label: "Hardcoded TrustToPay Live Agent API Key",
    pattern: /\bttp_live_[a-f0-9]{32,}\b/g,
  },
];

type MaliciousRule = {
  id: string;
  category: SecurityFinding["category"];
  severity: "HIGH" | "CRITICAL";
  reason: string;
  pattern: RegExp;
};

const MALICIOUS_RULES: MaliciousRule[] = [
  {
    id: "reverse_shell",
    category: "DESTRUCTIVE_COMMAND",
    severity: "CRITICAL",
    reason: "Reverse shell or remote interactive shell payload detected.",
    pattern:
      /(?:\/bin\/(?:ba)?sh\s+-i|nc\s+-e\s+\/bin\/(?:ba)?sh|bash\s+-c\s+["'][^"']*\/dev\/tcp\/|socat\s+exec:)/i,
  },
  {
    id: "destructive_filesystem",
    category: "DESTRUCTIVE_COMMAND",
    severity: "CRITICAL",
    reason: "Destructive filesystem wipe or fork-bomb command detected.",
    pattern: /(?:rm\s+-rf\s+\/(?:\s|$|\*)|mkfs\.[a-z0-9]+|:\(\)\{\s*:\|:&\s*\};:)/i,
  },
  {
    id: "remote_pipe_exec",
    category: "DESTRUCTIVE_COMMAND",
    severity: "CRITICAL",
    reason: "Remote script download piped directly into shell execution.",
    pattern: /(?:curl|wget)\s+[^\n|]+\|\s*(?:sudo\s+)?(?:ba)?sh\b/i,
  },
  {
    id: "obfuscated_eval",
    category: "OBFUSCATED_EXECUTION",
    severity: "CRITICAL",
    reason: "Obfuscated dynamic code execution (eval/Function with base64 or hex decoding) detected.",
    pattern:
      /(?:\beval\s*\(\s*(?:atob|Buffer\.from)\s*\(|\bnew\s+Function\s*\(\s*(?:atob|Buffer\.from)\s*\(|\bchild_process\b[^\n]{0,80}\b(?:exec|execSync|spawn)\s*\([^\n]*\b(?:curl|wget|nc|bash\s+-i)\b)/i,
  },
  {
    id: "cloud_metadata_ssrf",
    category: "SSRF_EXFILTRATION",
    severity: "HIGH",
    reason: "Attempt to access cloud instance metadata service (169.254.169.254 / metadata.google.internal).",
    pattern: /(?:169\.254\.169\.254|metadata\.google\.internal)/i,
  },
];

const PROMPT_INJECTION_RULES: { id: string; reason: string; pattern: RegExp }[] = [
  {
    id: "ignore_previous_instructions",
    reason: "Untrusted code comment or string attempts to override system instructions.",
    pattern:
      /(?:ignore\s+(?:all\s+)?(?:previous|prior|above|system)\s+(?:instructions|rules|prompts)|disregard\s+(?:all\s+)?(?:previous|system)\s+(?:instructions|rules)|system\s*:\s*ignore\s+rules)/i,
  },
  {
    id: "force_pass_verdict",
    reason: "Untrusted code attempts to inject a fake security review PASS verdict.",
    pattern:
      /(?:you\s+must\s+output\s+verdict\s*[:=]\s*["']?PASS["']?|return\s+["']?verdict["']?\s*:\s*["']PASS["']\s+and\s+ignore)/i,
  },
];

function maskSecretValue(secret: string): string {
  if (secret.length <= 10) return "[REDACTED_SECRET]";
  return `${secret.slice(0, 6)}...[REDACTED]`;
}

export function redactSecrets(text: string): string {
  let output = text;
  for (const rule of SECRET_RULES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    output = output.replace(regex, (match) => maskSecretValue(match));
  }
  return output;
}

function scanSingleTarget(filePath: string, content: string): {
  findings: SecurityFinding[];
  blockedBySecret: boolean;
  blockedByMaliciousPattern: boolean;
  promptInjectionDetected: boolean;
  redactedContent: string;
} {
  const findings: SecurityFinding[] = [];
  let blockedBySecret = false;
  let blockedByMaliciousPattern = false;
  let promptInjectionDetected = false;

  for (const rule of SECRET_RULES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    const match = regex.exec(content);
    if (match) {
      blockedBySecret = true;
      findings.push({
        filePath,
        category: "HARDCODED_SECRET",
        severity: "CRITICAL",
        reason: `${rule.label} detected in deliverable. Hardcoded credentials and tokens are strictly prohibited.`,
        evidence: maskSecretValue(match[0]),
      });
    }
  }

  for (const rule of MALICIOUS_RULES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    const match = regex.exec(content);
    if (match) {
      blockedByMaliciousPattern = true;
      findings.push({
        filePath,
        category: rule.category,
        severity: rule.severity,
        reason: rule.reason,
        evidence: redactSecrets(match[0].slice(0, 120)),
      });
    }
  }

  for (const rule of PROMPT_INJECTION_RULES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    const match = regex.exec(content);
    if (match) {
      promptInjectionDetected = true;
      findings.push({
        filePath,
        category: "PROMPT_INJECTION",
        severity: "HIGH",
        reason: rule.reason,
        evidence: redactSecrets(match[0].slice(0, 120)),
      });
    }
  }

  return {
    findings,
    blockedBySecret,
    blockedByMaliciousPattern,
    promptInjectionDetected,
    redactedContent: redactSecrets(content),
  };
}

/**
 * Deterministic pre-LLM security scanner.
 * Scans all submitted code files, unified diffs, and submission text for exposed secrets,
 * destructive/reverse-shell payloads, obfuscated execution, and prompt injection strings.
 */
export function scanArtifactDeterministically(input: DeterministicScanInput): DeterministicScanResult {
  const findings: SecurityFinding[] = [];
  let blockedBySecret = false;
  let blockedByMaliciousPattern = false;
  let promptInjectionDetected = false;

  const redactedFiles: { path: string; content: string }[] = [];

  for (const file of input.files) {
    const res = scanSingleTarget(file.path, file.content);
    findings.push(...res.findings);
    if (res.blockedBySecret) blockedBySecret = true;
    if (res.blockedByMaliciousPattern) blockedByMaliciousPattern = true;
    if (res.promptInjectionDetected) promptInjectionDetected = true;
    redactedFiles.push({
      path: file.path,
      content: res.redactedContent,
    });
  }

  let redactedPatchText: string | null = null;
  if (input.patchText) {
    const res = scanSingleTarget("DIFF_PATCH", input.patchText);
    findings.push(...res.findings);
    if (res.blockedBySecret) blockedBySecret = true;
    if (res.blockedByMaliciousPattern) blockedByMaliciousPattern = true;
    if (res.promptInjectionDetected) promptInjectionDetected = true;
    redactedPatchText = res.redactedContent;
  }

  let redactedAnswerText: string | null = null;
  if (input.answerText) {
    const res = scanSingleTarget("SUBMISSION_ANSWER", input.answerText);
    // Avoid duplicating identical findings if DELIVERABLE.md was synthesized from answerText
    if (input.files.length !== 1 || input.files[0].path !== "DELIVERABLE.md") {
      findings.push(...res.findings);
    }
    if (res.blockedBySecret) blockedBySecret = true;
    if (res.blockedByMaliciousPattern) blockedByMaliciousPattern = true;
    if (res.promptInjectionDetected) promptInjectionDetected = true;
    redactedAnswerText = res.redactedContent;
  }

  const passed = !blockedBySecret && !blockedByMaliciousPattern;

  return {
    passed,
    blockedBySecret,
    blockedByMaliciousPattern,
    promptInjectionDetected,
    findings,
    redactedFiles,
    redactedPatchText,
    redactedAnswerText,
  };
}
