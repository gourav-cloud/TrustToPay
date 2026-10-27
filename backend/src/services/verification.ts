import type { AnalysisOutput } from "./ai/schema.js";
import { normalizeCategory, type Category } from "../lib/categories.js";

export type VerificationCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  severity: "HARD" | "SOFT";
};

export type VerificationResult = {
  verificationStatus: "PENDING" | "PASSED" | "REJECTED" | "NEEDS_MANUAL_REVIEW";
  decisionReason: string;
  checksPassed: VerificationCheck[];
  checksFailed: VerificationCheck[];
  evidenceReferences: { label: string; url: string | null; quote?: string }[];
  requiresAdminReview: boolean;
  score: number;
};

export type VerificationInput = {
  question: string;
  acceptanceCriteria: string;
  category: string;
  rewardMinor: number;
  currency: string;
  riskLevel: string;
  requesterId: string;
  reviewerId: string;
  submission: {
    answer: string;
    explanation: string;
    confidenceScore: number;
    sourceUrl: string | null;
    evidenceNotes: string | null;
  };
  suppliedEvidence: { title: string; url: string | null; sourceType: string }[];
  analysis: AnalysisOutput | null;
};

const STOPWORDS = new Set([
  "that", "this", "with", "from", "have", "will", "your", "into", "when", "what", "which",
  "whether", "state", "explain", "cite", "about", "their", "there", "these", "those", "must",
  "should", "over", "than", "also", "does", "using", "provide", "include", "answer",
]);

function tokens(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9.+-]+/g, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 4 && !STOPWORDS.has(word)),
    ),
  );
}

function tokenPresent(token: string, haystack: string): boolean {
  if (haystack.includes(token)) return true;
  if (token.length >= 6) {
    const prefix = token.slice(0, 5);
    if (haystack.includes(prefix)) return true;
  }
  return false;
}

export function isSafePublicUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^(127\.|10\.|0\.|169\.254\.)/.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return false;
  if (host === "::1" || host.startsWith("[")) return false;
  return host.includes(".") && !host.startsWith("-");
}

function check(
  id: string,
  label: string,
  passed: boolean,
  detail: string,
  severity: "HARD" | "SOFT" = "HARD",
): VerificationCheck {
  return { id, label, passed, detail, severity };
}

/**
 * Independent verification of a reviewer submission.
 *
 * This is deliberately separate from reward approval. A reviewer cannot call
 * this service on their own submission (enforced by the route), and a source
 * URL alone never counts as proof that the source supports the claim.
 */
export function verifySubmission(input: VerificationInput): VerificationResult {
  const { submission } = input;
  const combined = `${submission.answer}\n${submission.explanation}\n${submission.evidenceNotes ?? ""}`;
  const lower = combined.toLowerCase();
  const checks: VerificationCheck[] = [];

  checks.push(
    check(
      "answer_present",
      "Answer is substantive",
      submission.answer.trim().length >= 80,
      "The answer must be at least 80 characters and state a conclusion.",
    ),
  );
  checks.push(
    check(
      "explanation_present",
      "Explanation is substantive",
      submission.explanation.trim().length >= 40,
      "The explanation must be at least 40 characters and describe the technical reasoning.",
    ),
  );

  const category: Category = normalizeCategory(input.category);
  const isHardware = category === "HARDWARE";

  const negativeVerdict = isHardware
    ? /\b(not\s+compatible|incompatible|does\s+not\s+(?:meet|support|work)|will\s+not\s+charge|insufficient|below\s+the\s+requirement)\b/i.test(
        combined,
      )
    : /\b(?:not\s+(?:recommended|safe|valid|correct|suitable|worth|the\s+right)|avoid|should\s+not|shouldn't|do\s+not|don't|cannot|can't|will\s+not|won't|unsafe|vulnerable|incorrect|wrong|reject(?:ed)?|fails?|broken|too\s+risky)\b/i.test(
        combined,
      );
  const positiveVerdict = isHardware
    ? /\b(compatible|supports?|meets?|works?)\b/i.test(combined)
    : /\b(?:recommended|recommend|should|prefer|valid|safe|correct|feasible|acceptable|advisable|supports?|works?|passes?|the\s+right\s+choice)\b/i.test(
        combined,
      );
  const hedged = /\b(maybe|might|possibly|not sure|uncertain)\b/i.test(combined);
  checks.push(
    check(
      "verdict_present",
      isHardware ? "Clear compatibility verdict" : "Clear conclusion or recommendation",
      (negativeVerdict || positiveVerdict) && !hedged,
      negativeVerdict
        ? isHardware
          ? "A negative/incompatible verdict is stated."
          : "A negative recommendation is stated."
        : positiveVerdict
          ? isHardware
            ? "A positive compatibility verdict is stated."
            : "A positive recommendation is stated."
          : isHardware
            ? "No explicit compatibility verdict was found."
            : "No explicit conclusion or recommendation was found.",
    ),
  );

  const hasWattOrVolt = /\b\d{1,3}\s*(?:w|v|a)\b/i.test(combined);
  const hasProtocol = /\b(power delivery|usb[- ]?pd|pps|quick charge|qc\s?[0-9]|voltage|protocol)\b/i.test(combined);

  const hasNumber =
    /\b\d+(?:\.\d+)?\s*(?:ms|milliseconds?|s|sec(?:onds?)?|min(?:utes?)?|hours?|%|kb|mb|gb|tb|rps|req(?:uests?)?\s*(?:\/|per)\s*(?:s|sec(?:ond)?)|messages?\s*(?:\/|per)\s*(?:s|sec(?:ond)?)|connections?|workers?|threads?|retries|attempts)\b/i.test(
      combined,
    );
  const hasIdentifier =
    /(?:`[^`]{2,60}`|\b[a-z][a-z0-9]*[A-Z][a-zA-Z0-9]*\b|\b[a-z]+_[a-z0-9_]+\b|\b[A-Z][A-Z0-9_]{2,}\b|\b[a-z][a-z0-9]*\.[a-z]{2,}\b)/.test(
      combined,
    );
  const hasTechnicalTerm =
    /\b(?:algorithm|complexity|api|async|await|race\s+condition|mutex|transaction|signature|nonce|chain\s*id|consensus|finality|throughput|latency|queue|backpressure|index|schema|protocol|cache|encryption|hash|merkle|evm|solidity|typescript|javascript|python|react|node|sql|http|tcp|oauth|jwt|tls|garbage\s+collection|event\s+loop)\b/i.test(
      combined,
    );
  const specificSignals = [hasNumber, hasIdentifier, hasTechnicalTerm].filter(Boolean).length;
  checks.push(
    check(
      "technical_specificity",
      "Technical specifics included",
      isHardware ? hasWattOrVolt && hasProtocol : specificSignals >= 2,
      isHardware
        ? "The submission must cite at least one wattage/voltage value and a charging protocol or voltage detail."
        : category === "PROGRAMMING"
          ? "The submission must include at least two concrete details, such as a code identifier, runtime version, error, complexity or configuration value."
          : category === "CRYPTO"
            ? "The submission must include at least two concrete details, such as a chain or network, contract identifier, signature/nonce, gas value or security property."
            : "The submission must include at least two concrete details, such as a named framework, measurable constraint, trade-off dimension or concrete example.",
    ),
  );

  const sourceUrl = submission.sourceUrl?.trim() ?? "";
  checks.push(
    check(
      "source_url_valid",
      "Evidence URL is a safe public HTTPS source",
      sourceUrl.length > 0 && isSafePublicUrl(sourceUrl),
      sourceUrl.length === 0
        ? "No source URL was supplied."
        : isSafePublicUrl(sourceUrl)
          ? "Source URL uses HTTPS and is not a private/local address."
          : "Source URL is invalid, not HTTPS, or points to a private/local address.",
    ),
  );

  const quoteMatch = (submission.evidenceNotes ?? "").match(/["“]([^"”]{15,300})["”]/);
  checks.push(
    check(
      "evidence_quote",
      "Verbatim evidence quote supplied",
      Boolean(quoteMatch),
      quoteMatch
        ? "A verbatim quoted excerpt was supplied. The app does not fetch or independently validate the quoted page."
        : 'Include the exact quoted text from the source in double quotes (15+ characters). A bare URL is not proof.',
    ),
  );

  const criteria = input.acceptanceCriteria
    .split(/\n|;/)
    .map((line) => line.replace(/^[\s\-*\d.]+/, "").trim())
    .filter((line) => line.length >= 6);
  const haystack = lower.replace(/[^a-z0-9.+-]+/g, " ");
  const criteriaResults = criteria.map((criterion) => {
    const criterionTokens = tokens(criterion);
    if (!criterionTokens.length) return true;
    const matches = criterionTokens.filter((token) => tokenPresent(token, haystack)).length;
    return matches >= Math.max(1, Math.ceil(criterionTokens.length * 0.25));
  });
  checks.push(
    check(
      "acceptance_criteria",
      "Acceptance criteria addressed",
      criteria.length > 0 && criteriaResults.every(Boolean),
      criteria.length === 0
        ? "The task has no acceptance criteria."
        : criteriaResults.every(Boolean)
          ? `All ${criteria.length} acceptance criteria have textual coverage.`
          : `${criteriaResults.filter((value) => !value).length} of ${criteria.length} acceptance criteria are not addressed.`,
    ),
  );

  checks.push(
    check(
      "reviewer_not_requester",
      "Reviewer is independent from the requester",
      input.reviewerId !== input.requesterId,
      "The reviewer must not be the requester of the task.",
    ),
  );

  checks.push(
    check(
      "reviewer_confidence",
      "Reviewer confidence is at least 70%",
      submission.confidenceScore >= 70,
      `Reviewer self-assessed confidence is ${submission.confidenceScore}%. Low confidence requires manual review.`,
      "SOFT",
    ),
  );

  const hostMatchesSupplied = (() => {
    if (!sourceUrl || !isSafePublicUrl(sourceUrl)) return false;
    const submittedHost = new URL(sourceUrl).hostname.toLowerCase();
    return input.suppliedEvidence.some((evidence) => {
      if (!evidence.url) return false;
      try {
        return new URL(evidence.url).hostname.toLowerCase() === submittedHost;
      } catch {
        return false;
      }
    });
  })();
  checks.push(
    check(
      "source_independence",
      "Source is independent from the supplied listings",
      !hostMatchesSupplied,
      hostMatchesSupplied
        ? "The submitted source shares a domain with a supplied listing. Independent corroboration is preferred."
        : "The submitted source does not reuse a supplied listing domain.",
      "SOFT",
    ),
  );

  const highValue = input.rewardMinor >= 5000;
  checks.push(
    check(
      "reward_risk",
      "Reward is below the manual-review threshold",
      !highValue,
      highValue
        ? "Rewards of $50.00 or more require an administrator decision."
        : "Reward amount is within automatic settlement limits.",
      "SOFT",
    ),
  );

  checks.push(
    check(
      "risk_category",
      "Task risk level is standard",
      input.riskLevel !== "HIGH",
      input.riskLevel === "HIGH"
        ? "High-risk categories require an administrator decision."
        : "Task risk level is standard.",
      "SOFT",
    ),
  );

  const hardFailures = checks.filter((item) => !item.passed && item.severity === "HARD");
  const softFailures = checks.filter((item) => !item.passed && item.severity === "SOFT");
  const passedChecks = checks.filter((item) => item.passed);
  const failedChecks = checks.filter((item) => !item.passed);

  const suppliedReferences = input.suppliedEvidence.map((evidence) => ({
    label: evidence.title,
    url: evidence.url,
    sourceType: evidence.sourceType,
  }));

  const evidenceReferences = [
    ...suppliedReferences.map((reference) => ({ label: reference.label, url: reference.url })),
    ...(sourceUrl
      ? [
          {
            label: "Reviewer source",
            url: sourceUrl,
            ...(quoteMatch ? { quote: quoteMatch[1] } : {}),
          },
        ]
      : []),
  ];

  let verificationStatus: VerificationResult["verificationStatus"];
  let decisionReason: string;

  if (hardFailures.length > 0) {
    verificationStatus = "REJECTED";
    decisionReason = `Rejected because ${hardFailures.length} required check(s) failed: ${hardFailures
      .map((item) => item.label)
      .join(", ")}. The reward was not authorized.`;
  } else if (softFailures.length > 0) {
    verificationStatus = "NEEDS_MANUAL_REVIEW";
    decisionReason = `Automated checks passed, but ${softFailures.length} risk check(s) need an administrator: ${softFailures
      .map((item) => item.label)
      .join(", ")}.`;
  } else {
    verificationStatus = "PASSED";
    decisionReason =
      "All required checks passed. The submission states a conclusion, cites specific technical details and a quoted source, and addresses every acceptance criterion. This verifies the submission, not the underlying web page.";
  }

  return {
    verificationStatus,
    decisionReason,
    checksPassed: passedChecks,
    checksFailed: failedChecks,
    evidenceReferences,
    requiresAdminReview: verificationStatus === "NEEDS_MANUAL_REVIEW",
    score: Math.round((passedChecks.length / checks.length) * 100),
  };
}
