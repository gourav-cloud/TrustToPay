import { describe, expect, it } from "vitest";
import { isSafePublicUrl, verifySubmission, type VerificationInput } from "../services/verification.js";
import { acceptanceCriteria, goodSubmission, weakSubmission } from "./helpers.js";

const base: VerificationInput = {
  question: "Is this 65W USB-C charger compatible with the specified laptop?",
  acceptanceCriteria,
  category: "USB_C_COMPATIBILITY",
  rewardMinor: 1500,
  currency: "USD",
  riskLevel: "STANDARD",
  requesterId: "user_requester",
  reviewerId: "user_reviewer",
  submission: { ...goodSubmission, sourceUrl: goodSubmission.sourceUrl, evidenceNotes: goodSubmission.evidenceNotes },
  suppliedEvidence: [
    { title: "VoltEdge support specifications", url: "https://support.example.com/voltedge/ve-65d", sourceType: "MANUFACTURER" },
  ],
  analysis: null,
};

describe("source URL safety", () => {
  it("accepts public HTTPS URLs", () => {
    expect(isSafePublicUrl("https://www.usb.org/usb-charger")).toBe(true);
    expect(isSafePublicUrl("https://support.example.com/article")).toBe(true);
  });

  it.each([
    ["http://www.usb.org/usb-charger", "plain HTTP"],
    ["https://localhost/article", "localhost"],
    ["https://127.0.0.1/article", "loopback IP"],
    ["https://192.168.1.10/article", "private class C"],
    ["https://10.0.0.5/article", "private class A"],
    ["https://172.16.4.2/article", "private class B"],
    ["https://user:pass@example.com/article", "embedded credentials"],
    ["https://internal.local/article", "local suffix"],
    ["not-a-url", "unparseable"],
  ])("rejects %s (%s)", (value) => {
    expect(isSafePublicUrl(value)).toBe(false);
  });
});

describe("independent submission verification", () => {
  it("passes an evidence-backed, specific submission", () => {
    const result = verifySubmission(base);

    expect(result.verificationStatus).toBe("PASSED");
    expect(result.requiresAdminReview).toBe(false);
    expect(result.checksFailed).toHaveLength(0);
    expect(result.score).toBe(100);
    expect(result.evidenceReferences.some((reference) => reference.quote)).toBe(true);
  });

  it("rejects a vague submission and never authorizes the reward", () => {
    const result = verifySubmission({
      ...base,
      submission: { ...weakSubmission, sourceUrl: null, evidenceNotes: null },
    });

    expect(result.verificationStatus).toBe("REJECTED");
    const failedIds = result.checksFailed.map((check) => check.id);
    expect(failedIds).toContain("answer_present");
    expect(failedIds).toContain("source_url_valid");
    expect(failedIds).toContain("evidence_quote");
    expect(result.requiresAdminReview).toBe(false);
  });

  it("requires an administrator for high-risk tasks even when every hard check passes", () => {
    const result = verifySubmission({ ...base, riskLevel: "HIGH" });

    expect(result.verificationStatus).toBe("NEEDS_MANUAL_REVIEW");
    expect(result.requiresAdminReview).toBe(true);
    expect(result.checksFailed.map((check) => check.id)).toContain("risk_category");
  });

  it("requires an administrator for rewards at or above the manual-review threshold", () => {
    const result = verifySubmission({ ...base, rewardMinor: 5000 });

    expect(result.verificationStatus).toBe("NEEDS_MANUAL_REVIEW");
    expect(result.checksFailed.map((check) => check.id)).toContain("reward_risk");
  });

  it("rejects a submission that cites an unsafe source URL", () => {
    const result = verifySubmission({
      ...base,
      submission: { ...goodSubmission, sourceUrl: "http://localhost/internal" },
    });

    expect(result.verificationStatus).toBe("REJECTED");
    expect(result.checksFailed.map((check) => check.id)).toContain("source_url_valid");
  });

  it("rejects a submission whose criteria coverage is missing", () => {
    const result = verifySubmission({
      ...base,
      acceptanceCriteria: "Describe the e-marker cable rating and the PPS profile in detail",
      submission: { ...goodSubmission },
    });

    expect(result.verificationStatus).toBe("REJECTED");
    expect(result.checksFailed.map((check) => check.id)).toContain("acceptance_criteria");
  });
});

const generalBase = {
  question: "A domain-specific technical question.",
  rewardMinor: 1200,
  currency: "USD",
  riskLevel: "STANDARD",
  requesterId: "user_requester",
  reviewerId: "user_reviewer",
  suppliedEvidence: [
    {
      title: "Supplied reference",
      url: "https://docs.example.com/reference",
      sourceType: "DOCUMENT",
    },
  ],
  analysis: null,
};

const programmingSubmission = {
  answer:
    "The root cause is an unbounded await fetch inside each worker combined with a pool size of 4 workers, so the queue stops draining after four jobs. The current configuration is unsafe. The retry limit of 3 attempts is already satisfied, so increasing it will not help. I recommend an AbortController timeout and a concurrency cap to fix the stall.",
  explanation:
    "I compared the deployment runbook with the worker-pool excerpt. The timeout configuration is missing on the fetch call, which leaves every worker waiting indefinitely. The expected behaviour is that a slow upstream response fails instead of blocking the queue. The concrete fix is to abort the request and release the worker.",
  confidenceScore: 91,
  sourceUrl: "https://nodejs.org/api/globals.html",
  evidenceNotes:
    'The runtime documentation states: "The AbortController interface represents a controller object that allows you to abort one or more web requests as and when desired." The deployment runbook also documents the 30 second timeout.',
};

const cryptoSubmission = {
  answer:
    "The permit is unsafe across chain forks because the contract does not validate chainId against block.chainid before accepting a signature. An attacker can replay the same permit on a forked chain, and the nonce is not incremented, so the signature remains valid for its full 300 second deadline. Bind the domain separator to block.chainid and consume the nonce before transfer.",
  explanation:
    "I compared the audit notes and deployment checklist. The signature, nonce and domain separator handling contradict each other. The expected behaviour is that a permit is accepted once per chain ID; otherwise replay protection depends on an off-chain relayer.",
  confidenceScore: 94,
  sourceUrl: "https://eips.ethereum.org/EIPS/eip-2612",
  evidenceNotes:
    'EIP-2612 defines the domain separator: "The domain separator is computed from the chain id and the verifying contract address." The deployment checklist also documents the cached separator.',
};

const conceptualSubmission = {
  answer:
    "We should not replace direct HTTP calls with a message queue yet. Peak throughput is 1,000 messages per second, which is far below the 5,000 messages per second where the queue becomes worthwhile. The recommendation is to revisit only after volume grows. Both options add 40 ms of latency, so the queue does not improve the user-visible response time.",
  explanation:
    "I compared the architecture notes with the benchmark. The throughput and latency trade-off favours direct HTTP at the current volume; the operational cost of dedicated ownership is the deciding constraint. The expected benefit only appears after the service exceeds the benchmark.",
  confidenceScore: 88,
  sourceUrl: "https://aws.amazon.com/message-queue/",
  evidenceNotes:
    'The architecture guidance notes: "A message queue decouples producers from consumers but adds operational ownership and delivery semantics." The benchmark also documents the 40 ms latency.',
};

describe("category-aware verification", () => {
  it("passes a programming submission with code and runtime specifics", () => {
    const result = verifySubmission({
      ...generalBase,
      category: "PROGRAMMING",
      acceptanceCriteria:
        "State the likely root cause\nCite the pool size and timeout configuration\nRecommend a fix",
      submission: programmingSubmission,
    });

    expect(result.verificationStatus).toBe("PASSED");
    expect(result.checksFailed).toHaveLength(0);
  });

  it("passes a crypto submission with signature and chain specifics", () => {
    const result = verifySubmission({
      ...generalBase,
      category: "CRYPTO",
      acceptanceCriteria:
        "State whether the permit is replay-safe\nCite the chain ID and nonce handling\nExplain the deployed contract risk",
      submission: cryptoSubmission,
    });

    expect(result.verificationStatus).toBe("PASSED");
    expect(result.checksFailed).toHaveLength(0);
  });

  it("passes a conceptual submission with measurable trade-off details", () => {
    const result = verifySubmission({
      ...generalBase,
      category: "CONCEPTUAL",
      acceptanceCriteria:
        "State the recommendation\nExplain the throughput and latency trade-off\nExplain the operational cost",
      submission: conceptualSubmission,
    });

    expect(result.verificationStatus).toBe("PASSED");
    expect(result.checksFailed).toHaveLength(0);
  });

  it("rejects a generic programming answer without technical specifics", () => {
    const result = verifySubmission({
      ...generalBase,
      category: "PROGRAMMING",
      acceptanceCriteria: "Explain the root cause\nRecommend a fix",
      submission: {
        ...weakSubmission,
        sourceUrl: "https://example.com/generic",
        evidenceNotes: '"It should be fine because the code looks correct to me."',
      },
    });

    expect(result.verificationStatus).toBe("REJECTED");
    const failed = result.checksFailed.map((check) => check.id);
    expect(failed).toContain("technical_specificity");
  });

  it("normalises legacy USB-C categories to the hardware checks", () => {
    const result = verifySubmission({
      ...base,
      category: "USB_C_COMPATIBILITY",
    });

    expect(result.verificationStatus).toBe("PASSED");
    expect(result.checksPassed.map((check) => check.id)).toContain("technical_specificity");
  });
});
