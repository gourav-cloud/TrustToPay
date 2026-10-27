import { describe, expect, it } from "vitest";
import { runDemoAnalysis } from "../services/ai/demoEngine.js";
import { detectCategory } from "../lib/categories.js";
import { chargerDocuments } from "./helpers.js";

const baseInput = {
  productModels: ["AeroBook 14 (2024)", "VoltEdge VE-65D"],
  specifications: ["Laptop charging input: USB-C, requires 65W or higher USB Power Delivery (20V/3.25A)."],
};

describe("deterministic demo AI engine", () => {
  it("escalates the 45W-versus-65W charger conflict with a critical finding", () => {
    const output = runDemoAnalysis({
      question: "Is this 65W USB-C charger compatible with the specified laptop?",
      ...baseInput,
      documents: chargerDocuments,
    });

    expect(output.recommendedAction).toBe("ESCALATE_TO_HUMAN");
    expect(output.conflictingClaims.some((claim) => claim.severity === "CRITICAL")).toBe(true);
    expect(output.confidenceScore).toBeLessThan(0.75);
    expect(output.escalationReason).toContain("critical");
    expect(output.missingInformation.length).toBeGreaterThan(0);
  });

  it("keeps the reward suggestion inside the server-configured limits", () => {
    const output = runDemoAnalysis({
      question: "Is this 65W USB-C charger compatible with the specified laptop?",
      ...baseInput,
      documents: chargerDocuments,
    });

    // REWARD_MIN_MINOR=500 and REWARD_MAX_MINOR=10000 in the test environment.
    expect(output.suggestedReward.amountMinor).toBeGreaterThanOrEqual(500);
    expect(output.suggestedReward.amountMinor).toBeLessThanOrEqual(10_000);
    expect(output.suggestedReward.currency).toBe("USD");
  });

  it("only cites supplied documents and never invents evidence", () => {
    const output = runDemoAnalysis({
      question: "Is this 65W USB-C charger compatible with the specified laptop?",
      ...baseInput,
      documents: chargerDocuments,
    });

    const suppliedTitles = new Set(chargerDocuments.map((document) => document.title));
    expect(output.evidence).toHaveLength(chargerDocuments.length);
    for (const reference of output.evidence) {
      expect(suppliedTitles.has(reference.title)).toBe(true);
      expect(reference.excerpt.length).toBeGreaterThan(0);
    }
  });

  it("resolves a consistent single-port scenario without escalating", () => {
    const output = runDemoAnalysis({
      question: "Can a 65W USB-C PD charger power a 45W mini PC?",
      productModels: ["MiniPC X1", "GaN 65W charger"],
      specifications: ["Mini PC requires 45W USB-C PD."],
      documents: [
        {
          title: "MiniPC X1 documentation",
          url: "https://example.com/minipc-x1/power",
          publisher: "MiniPC (sample manufacturer)",
          sourceType: "MANUFACTURER",
          content:
            "MiniPC X1 requires 45W USB-C Power Delivery at 20V/2.25A for full-speed operation. It does not ship with a charger.",
        },
        {
          title: "GaN 65W charger specifications",
          url: "https://example.com/gan-65w/specs",
          publisher: "Volt Labs (sample manufacturer)",
          sourceType: "MANUFACTURER",
          content:
            "GaN 65W charger with USB-C Power Delivery 3.0. Output 20V/3.25A. Maximum output is 65W on its single USB-C port. Includes a 5A e-marker cable.",
        },
      ],
    });

    expect(output.recommendedAction).toBe("RESOLVE_AUTOMATICALLY");
    expect(output.conflictingClaims).toHaveLength(0);
    expect(output.missingInformation).toHaveLength(0);
    expect(output.confidenceScore).toBeGreaterThanOrEqual(0.75);
  });
});

const programmingDocuments = [
  {
    title: "worker-pool.ts excerpt",
    sourceType: "DOCUMENT" as const,
    content:
      "The worker pool is configured with pool size is 4 workers. Each job calls await fetch inside a for loop. The retry limit is 3 attempts. The queue stops draining after four jobs because every worker waits on a response that has no timeout.",
  },
  {
    title: "Deployment runbook",
    sourceType: "DOCUMENT" as const,
    content:
      "The worker pool is configured with pool size is 12 workers. The retry limit is 3 attempts. The HTTP timeout is 30 seconds. This runbook does not describe a semaphore or backpressure mechanism.",
  },
];

const cryptoDocuments = [
  {
    title: "Vault.sol audit notes",
    sourceType: "DOCUMENT" as const,
    content:
      "The permit function hashes the owner, spender, value, nonce, deadline and chainId. The contract does not validate chainId against block.chainid. Nonces are incremented after a successful transfer.",
  },
  {
    title: "Vault deployment checklist",
    sourceType: "DOCUMENT" as const,
    content:
      "The vault validates chainId against block.chainid before accepting a permit. The domain separator is cached at deployment time. Nonces are not incremented.",
  },
];

const conceptualDocuments = [
  {
    title: "Architecture review notes",
    sourceType: "DOCUMENT" as const,
    content:
      "Peak throughput is 1,000 messages per second. Direct HTTP calls add 40 ms of latency. The team has no dedicated platform engineer.",
  },
  {
    title: "Vendor benchmark summary",
    sourceType: "DOCUMENT" as const,
    content:
      "Peak throughput is 5,000 messages per second. Queues add 40 ms of latency and require dedicated operational ownership.",
  },
];

describe("category detection", () => {
  it("keeps USB-C questions in the hardware category", () => {
    expect(
      detectCategory({
        question: "Is this 65W USB-C charger compatible with the specified laptop?",
        documents: chargerDocuments,
      }),
    ).toBe("HARDWARE");
  });

  it("recognises programming, crypto and conceptual questions", () => {
    expect(
      detectCategory({
        question: "Why does our Node worker pool stall after a deploy?",
        documents: programmingDocuments,
      }),
    ).toBe("PROGRAMMING");
    expect(
      detectCategory({
        question: "Is this EIP-2612 permit replay-safe across chain forks?",
        documents: cryptoDocuments,
      }),
    ).toBe("CRYPTO");
    expect(
      detectCategory({
        question: "Should we replace direct HTTP calls with a message queue?",
        documents: conceptualDocuments,
      }),
    ).toBe("CONCEPTUAL");
  });
});

describe("non-hardware demo analysis", () => {
  it("escalates a programming configuration contradiction", () => {
    const output = runDemoAnalysis({
      category: "PROGRAMMING",
      question:
        "Our Node 20 worker pool stalls after a deploy. Why does the queue stop draining, and is the retry configuration safe?",
      productModels: ["worker-pool"],
      specifications: ["Node 20.11", "Jobs are fetched from an internal HTTP API."],
      documents: programmingDocuments,
    });

    expect(output.recommendedAction).toBe("ESCALATE_TO_HUMAN");
    expect(output.conflictingClaims.some((conflict) => /pool size|worker/i.test(conflict.detail))).toBe(true);
    expect(output.missingInformation.length).toBeGreaterThan(0);
    expect(output.suggestedReviewerSkills).toContain("Node.js runtime");
  });

  it("forces escalation for a crypto replay contradiction", () => {
    const output = runDemoAnalysis({
      category: "CRYPTO",
      question:
        "Is the EIP-2612 permit signature in our vault contract replay-safe across chain forks and after a chainId change?",
      productModels: ["Vault.sol"],
      specifications: ["Ethereum mainnet", "Permit signatures are submitted by a relayer."],
      documents: cryptoDocuments,
    });

    expect(output.recommendedAction).toBe("ESCALATE_TO_HUMAN");
    expect(output.conflictingClaims.some((conflict) => conflict.severity === "CRITICAL")).toBe(true);
    expect(output.escalationReason).toMatch(/critical/i);
    expect(output.suggestedReviewerSkills).toContain("Smart contract security");
  });

  it("escalates a conceptual throughput contradiction", () => {
    const output = runDemoAnalysis({
      category: "CONCEPTUAL",
      question:
        "Should our team replace direct HTTP calls between services with a message queue, or is the added operational complexity not worth it?",
      productModels: [],
      specifications: [],
      documents: conceptualDocuments,
    });

    expect(output.recommendedAction).toBe("ESCALATE_TO_HUMAN");
    expect(output.conflictingClaims.some((conflict) => /throughput/i.test(conflict.detail))).toBe(true);
    expect(output.confidenceScore).toBeLessThan(0.75);
    expect(output.suggestedReviewerSkills).toContain("Systems design");
  });

  it("accepts a legacy USB-C category string without changing behaviour", () => {
    const output = runDemoAnalysis({
      category: "USB_C_COMPATIBILITY",
      question: "Is this 65W USB-C charger compatible with the specified laptop?",
      ...baseInput,
      documents: chargerDocuments,
    });

    expect(output.recommendedAction).toBe("ESCALATE_TO_HUMAN");
    expect(output.reasoningSummary).toMatch(/wattage/i);
  });
});
