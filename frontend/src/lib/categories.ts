/**
 * Frontend category metadata and examples.
 *
 * Keep the values in sync with backend/src/lib/categories.ts. The backend
 * normalises legacy strings, so the browser can safely display older sessions.
 */

export const CATEGORY_VALUES = ["PROGRAMMING", "CRYPTO", "CONCEPTUAL", "HARDWARE"] as const;
export type CategoryValue = (typeof CATEGORY_VALUES)[number];

export const DEFAULT_CATEGORY: CategoryValue = "CONCEPTUAL";

const LEGACY: Record<string, CategoryValue> = {
  USB_C_COMPATIBILITY: "HARDWARE",
  USB_C_HARDWARE: "HARDWARE",
  USB_C: "HARDWARE",
  LAPTOPS: "HARDWARE",
  HARDWARE: "HARDWARE",
  PROGRAMMING: "PROGRAMMING",
  CODE: "PROGRAMMING",
  SOFTWARE: "PROGRAMMING",
  CRYPTO: "CRYPTO",
  CRYPTOCURRENCY: "CRYPTO",
  BLOCKCHAIN: "CRYPTO",
  WEB3: "CRYPTO",
  CONCEPTUAL: "CONCEPTUAL",
  CONCEPT: "CONCEPTUAL",
  GENERAL: "CONCEPTUAL",
  RESEARCH: "CONCEPTUAL",
};

export function normalizeCategoryValue(raw?: string | null): CategoryValue {
  if (!raw) return DEFAULT_CATEGORY;
  const key = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if ((CATEGORY_VALUES as readonly string[]).includes(key)) return key as CategoryValue;
  return LEGACY[key] ?? DEFAULT_CATEGORY;
}

type CategoryMeta = {
  label: string;
  shortLabel: string;
  description: string;
  questionPlaceholder: string;
  modelsPlaceholder: string;
  specsPlaceholder: string;
};

export const CATEGORY_META: Record<CategoryValue, CategoryMeta> = {
  PROGRAMMING: {
    label: "Programming",
    shortLabel: "Code",
    description: "Debugging, APIs, runtime behaviour and configuration.",
    questionPlaceholder: "Why does the worker pool stall after a deploy, and is the retry configuration safe?",
    modelsPlaceholder: "worker-pool.ts, Node 20",
    specsPlaceholder: "Node 20.11\nJobs are fetched from an internal HTTP API.",
  },
  CRYPTO: {
    label: "Crypto & blockchain",
    shortLabel: "Crypto",
    description: "Smart contracts, signatures, wallets and protocol safety.",
    questionPlaceholder: "Is this EIP-2612 permit replay-safe across chain forks?",
    modelsPlaceholder: "Vault.sol, Ethereum mainnet",
    specsPlaceholder: "Ethereum mainnet\nPermit signatures are submitted by a relayer.",
  },
  CONCEPTUAL: {
    label: "Conceptual",
    shortLabel: "Conceptual",
    description: "Architecture, trade-offs and open-ended technical decisions.",
    questionPlaceholder: "Should we replace direct HTTP calls with a message queue?",
    modelsPlaceholder: "Order service, message queue",
    specsPlaceholder: "Peak load is 1,000 messages per second.\nThe team has no dedicated platform engineer.",
  },
  HARDWARE: {
    label: "Hardware compatibility",
    shortLabel: "Hardware",
    description: "Chargers, cables, docks, ports and power delivery.",
    questionPlaceholder: "Is this 65W USB-C charger compatible with the laptop at full speed?",
    modelsPlaceholder: "VE-65D, AeroBook 14",
    specsPlaceholder: "AeroBook 14 requires 65W USB Power Delivery at 20V/3.25A.\nCharger is marketed as 65W total.",
  },
};

export function categoryLabel(raw?: string | null): string {
  return CATEGORY_META[normalizeCategoryValue(raw)].label;
}

type ExampleDocument = {
  title: string;
  url: string;
  publisher: string;
  sourceType: "MANUFACTURER" | "RETAILER" | "MARKETPLACE" | "FORUM" | "DOCUMENT";
  content: string;
};

export type CategoryExample = {
  title: string;
  question: string;
  productModels: string[];
  specifications: string[];
  documents: ExampleDocument[];
};

export const CATEGORY_EXAMPLES: Record<CategoryValue, CategoryExample> = {
  PROGRAMMING: {
    title: "Worker pool stalls after deploy",
    question:
      "Our Node 20 worker pool stalls after a deploy. Why does the queue stop draining, and is the retry configuration safe? The code and runbook disagree about the pool size and timeout.",
    productModels: ["worker-pool.ts"],
    specifications: ["Node 20.11", "Jobs are fetched from an internal HTTP API."],
    documents: [
      {
        title: "worker-pool.ts excerpt",
        url: "https://gist.example.com/worker-pool",
        publisher: "Internal code excerpt",
        sourceType: "DOCUMENT",
        content:
          "The worker pool is configured with pool size is 4 workers. Each job calls await fetch inside a for loop. The retry limit is 3 attempts. The queue stops draining after four jobs because every worker waits on a response that has no timeout.",
      },
      {
        title: "Deployment runbook",
        url: "https://docs.example.com/runbooks/worker-pool",
        publisher: "Platform team",
        sourceType: "DOCUMENT",
        content:
          "The worker pool is configured with pool size is 12 workers. The retry limit is 3 attempts. The HTTP timeout is 30 seconds. This runbook does not describe a semaphore or backpressure mechanism.",
      },
    ],
  },
  CRYPTO: {
    title: "EIP-2612 permit replay safety review",
    question:
      "Is the EIP-2612 permit signature in our vault contract replay-safe across chain forks and after a chainId change? The audit notes and deployment checklist disagree about chain ID validation.",
    productModels: ["Vault.sol"],
    specifications: ["Ethereum mainnet", "Permit signatures are submitted by a relayer."],
    documents: [
      {
        title: "Vault.sol audit notes",
        url: "https://example.com/audits/vault-permit",
        publisher: "Independent audit",
        sourceType: "DOCUMENT",
        content:
          "The permit function hashes the owner, spender, value, nonce, deadline and chainId. The contract does not validate chainId against block.chainid. Nonces are incremented after a successful transfer.",
      },
      {
        title: "Vault deployment checklist",
        url: "https://docs.example.com/vault/deployment",
        publisher: "Protocol team",
        sourceType: "DOCUMENT",
        content:
          "The vault validates chainId against block.chainid before accepting a permit. The domain separator is cached at deployment time. Nonces are not incremented.",
      },
    ],
  },
  CONCEPTUAL: {
    title: "Message queue vs direct HTTP",
    question:
      "Should our team replace direct HTTP calls between services with a message queue, or is the added operational complexity not worth it? The benchmarks give different throughput figures.",
    productModels: [],
    specifications: [],
    documents: [
      {
        title: "Architecture review notes",
        url: "https://docs.example.com/architecture/order-service",
        publisher: "Platform architecture group",
        sourceType: "DOCUMENT",
        content:
          "Peak throughput is 1,000 messages per second. Direct HTTP calls add 40 ms of latency. The team has no dedicated platform engineer.",
      },
      {
        title: "Vendor benchmark summary",
        url: "https://example.com/benchmarks/message-queue",
        publisher: "Queue vendor benchmark",
        sourceType: "DOCUMENT",
        content:
          "Peak throughput is 5,000 messages per second. Queues add 40 ms of latency and require dedicated operational ownership.",
      },
    ],
  },
  HARDWARE: {
    title: "AeroBook 14 charger compatibility",
    question:
      "Is the VoltEdge VE-65D 65W USB-C charger compatible with the AeroBook 14 (2024)? The listing says 65W, but the manufacturer's support article says the USB-C port is limited to 45W when the USB-A port is in use. I need to know whether it can charge the laptop at full speed.",
    productModels: ["VoltEdge VE-65D", "AeroBook 14 (2024)"],
    specifications: [
      "AeroBook 14 requires 65W USB Power Delivery at 20V/3.25A.",
      "VoltEdge VE-65D is marketed as a 65W dual-port charger.",
    ],
    documents: [
      {
        title: "VoltEdge VE-65D retailer listing",
        url: "https://shop.example.com/voltedge-ve65d",
        publisher: "Example Electronics",
        sourceType: "RETAILER",
        content:
          "VoltEdge VE-65D 65W dual-port charger. USB-C output supports up to 65W, or 45W when the USB-A port is in use. Includes USB-C cable. Compatible with most USB-C laptops.",
      },
      {
        title: "VoltEdge support - VE-65D specifications",
        url: "https://support.example.com/voltedge/ve-65d",
        publisher: "VoltEdge",
        sourceType: "MANUFACTURER",
        content:
          "VE-65D output table: USB-C1 alone: 65W. USB-C1 + USB-A: USB-C1 limited to 45W, USB-A 12W. USB-C1 supports USB Power Delivery 3.0 at 20V/3.25A. Maximum combined output is 65W.",
      },
      {
        title: "AeroBook 14 (2024) charging requirements",
        url: "https://docs.example.net/aerobook/14-power",
        publisher: "AeroBook Documentation",
        sourceType: "MANUFACTURER",
        content:
          "AeroBook 14 (2024) requires 65W or higher USB Power Delivery at 20V/3.25A for full-speed charging. A lower-wattage adapter may charge slowly or not at all under load.",
      },
      {
        title: "VE-65D marketplace quick listing",
        url: "https://market.example.org/ve65d",
        publisher: "Marketplace seller",
        sourceType: "MARKETPLACE",
        content: "65W USB-C fast charger. PD compatible. Output up to 65W. Great for travel.",
      },
    ],
  },
};

export function defaultCriteriaFor(category: string, subject: string): string {
  const value = normalizeCategoryValue(category);
  if (value === "PROGRAMMING") {
    return [
      `State the likely root cause for ${subject}.`,
      "Explain the runtime, version or configuration constraint that matters.",
      "Give a concrete fix or next diagnostic step.",
      "Cite an independent source and include a verbatim quoted excerpt.",
    ].join("\n");
  }
  if (value === "CRYPTO") {
    return [
      `State whether ${subject} is safe and under which assumptions.`,
      "Explain the chain, contract or signature detail that matters.",
      "Call out any replay, custody or key-management risk.",
      "Cite an independent source and include a verbatim quoted excerpt.",
    ].join("\n");
  }
  if (value === "CONCEPTUAL") {
    return [
      `State a clear recommendation about ${subject}.`,
      "Explain the trade-off and the constraints that drive it.",
      "Name the conditions under which the recommendation changes.",
      "Cite an independent source and include a verbatim quoted excerpt.",
    ].join("\n");
  }
  return [
    `State the compatibility conclusion for ${subject}.`,
    "Explain the relevant wattage, voltage and protocol constraints.",
    "Cite an independent source and include a verbatim quoted excerpt.",
  ].join("\n");
}
