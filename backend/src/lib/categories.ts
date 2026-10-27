/**
 * Shared request categories.
 *
 * The platform started as a USB-C hardware compatibility checker. It now accepts
 * programming, crypto and general conceptual questions as well. Category values
 * are stored as plain strings so the SQLite schema stays simple and portable.
 */

export const CATEGORIES = ["PROGRAMMING", "CRYPTO", "CONCEPTUAL", "HARDWARE"] as const;

export type Category = (typeof CATEGORIES)[number];

export const DEFAULT_CATEGORY: Category = "CONCEPTUAL";

const LEGACY_CATEGORIES: Record<string, Category> = {
  USB_C_COMPATIBILITY: "HARDWARE",
  USB_C_HARDWARE: "HARDWARE",
  USB_C: "HARDWARE",
  USBC: "HARDWARE",
  LAPTOPS: "HARDWARE",
  CHARGING: "HARDWARE",
  CONSUMER_ELECTRONICS: "HARDWARE",
  HARDWARE: "HARDWARE",
  PROGRAMMING: "PROGRAMMING",
  CODE: "PROGRAMMING",
  SOFTWARE: "PROGRAMMING",
  ENGINEERING: "PROGRAMMING",
  CRYPTO: "CRYPTO",
  CRYPTOCURRENCY: "CRYPTO",
  BLOCKCHAIN: "CRYPTO",
  WEB3: "CRYPTO",
  SMART_CONTRACTS: "CRYPTO",
  CONCEPTUAL: "CONCEPTUAL",
  CONCEPT: "CONCEPTUAL",
  GENERAL: "CONCEPTUAL",
  RESEARCH: "CONCEPTUAL",
  ARCHITECTURE: "CONCEPTUAL",
};

export function normalizeCategory(raw?: string | null): Category {
  if (!raw) return DEFAULT_CATEGORY;
  const key = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if ((CATEGORIES as readonly string[]).includes(key)) return key as Category;
  return LEGACY_CATEGORIES[key] ?? DEFAULT_CATEGORY;
}

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

type DetectionInput = {
  question?: string;
  productModels?: string[];
  specifications?: string[];
  documents?: { title?: string | null; content?: string | null }[];
};

const KEYWORDS: Record<Exclude<Category, "CONCEPTUAL">, { weight: number; pattern: RegExp }[]> = {
  HARDWARE: [
    { weight: 3, pattern: /\busb[- ]?c\b|\btype[- ]?c\b|power delivery|\busb[- ]?pd\b|\bthunderbolt\b/i },
    { weight: 3, pattern: /\bcharger\b|\badapter\b|\bdock(?:ing station)?\b|\bcable\b|\be-?marker\b/i },
    { weight: 2, pattern: /\bwatt(?:age|s)?\b|\bvoltage\b|\bvolt\b|\bamperage\b|\b20v\b|\b65w\b/i },
    { weight: 2, pattern: /\blaptop\b|\bnotebook\b|\bport\b|\bconnector\b|\bcharging\b/i },
  ],
  PROGRAMMING: [
    { weight: 3, pattern: /\bcode\b|\bcodebase\b|\bcompil(?:e|er|ation)\b|\bstack trace\b|\bexception\b|\bbug\b/i },
    { weight: 3, pattern: /\b(?:javascript|typescript|python|rust|golang|java|kotlin|swift|php|ruby|c\+\+|c#)\b/i },
    { weight: 2, pattern: /\b(?:react|next\.?js|node(?:\.js)?|express|django|flask|spring|rails|sql|postgres|prisma)\b/i },
    { weight: 2, pattern: /\b(?:function|method|class|variable|async|await|promise|thread|worker|queue|retry|timeout|memory leak|race condition)\b/i },
    { weight: 2, pattern: /\bapi\b|\bendpoint\b|\bsdk\b|\bgit\b|\bdocker\b|\bkubernetes\b|\bdeploy(?:ment)?\b|\bregression\b/i },
  ],
  CRYPTO: [
    { weight: 3, pattern: /\b(?:crypto|cryptocurrency|blockchain|bitcoin|ethereum|solana|web3|defi|nft)\b/i },
    { weight: 3, pattern: /\b(?:smart contract|solidity|evm|erc-?20|eip-?2612|permit signature|on-?chain|off-?chain)\b/i },
    { weight: 3, pattern: /\b(?:wallet|private key|seed phrase|nonce|chain ?id|replay attack|merkle|consensus|finality|reorg)\b/i },
    { weight: 2, pattern: /\b(?:token|gas fee|gwei|signature|hash|encryption|decryption|custody|staking|validator)\b/i },
  ],
};

const CONCEPTUAL_PATTERNS: { weight: number; pattern: RegExp }[] = [
  { weight: 3, pattern: /\b(?:trade[- ]?offs?|architecture|design decision|when should|why should|concept|conceptual)\b/i },
  { weight: 2, pattern: /\b(?:message queue|event[- ]driven|monolith|microservices?|caching strategy|scalability|operational complexity)\b/i },
  { weight: 2, pattern: /\b(?:explain|compare|difference between|pros and cons|best approach|recommend approach)\b/i },
  { weight: 3, pattern: /\b(?:should (?:we|our|a team|i)|is it worth|would you recommend)\b/i },
];

function score(text: string, patterns: { weight: number; pattern: RegExp }[]): number {
  return patterns.reduce((total, item) => total + (item.pattern.test(text) ? item.weight : 0), 0);
}

/**
 * Heuristic category detection. An explicit category from the client always
 * wins; this is only used when the requester does not choose one.
 */
export function detectCategory(input: DetectionInput): Category {
  const text = [
    input.question ?? "",
    ...(input.productModels ?? []),
    ...(input.specifications ?? []),
    ...(input.documents ?? []).map((document) => `${document.title ?? ""} ${document.content ?? ""}`),
  ]
    .join("\n")
    .slice(0, 6000);

  const hardware = score(text, KEYWORDS.HARDWARE);
  const programming = score(text, KEYWORDS.PROGRAMMING);
  const crypto = score(text, KEYWORDS.CRYPTO);
  const conceptual = score(text, CONCEPTUAL_PATTERNS);

  const ranked: { category: Category; value: number }[] = [
    { category: "HARDWARE" as const, value: hardware },
    { category: "PROGRAMMING" as const, value: programming },
    { category: "CRYPTO" as const, value: crypto },
    { category: "CONCEPTUAL" as const, value: conceptual },
  ].sort((a, b) => b.value - a.value);

  if (ranked[0].value === 0) return DEFAULT_CATEGORY;
  // A tie between a specific technical domain and the conceptual catch-all
  // should favour the specific domain only when it is clearly present.
  if (ranked[0].value === ranked[1].value && ranked[0].category === "CONCEPTUAL") {
    return ranked[1].category;
  }
  return ranked[0].category;
}

const LABELS: Record<Category, string> = {
  PROGRAMMING: "Programming",
  CRYPTO: "Crypto & blockchain",
  CONCEPTUAL: "Conceptual",
  HARDWARE: "Hardware compatibility",
};

export function categoryLabel(category: string): string {
  return LABELS[normalizeCategory(category)];
}

const DEFAULT_SKILLS: Record<Category, string[]> = {
  PROGRAMMING: ["Software debugging", "Code review", "Runtime and API behaviour"],
  CRYPTO: ["Smart contract security", "Blockchain protocol review", "Cryptography"],
  CONCEPTUAL: ["Systems design", "Architecture trade-offs", "Technical research"],
  HARDWARE: ["USB-C power compatibility", "USB Power Delivery", "Manufacturer documentation review"],
};

export function defaultSkillsFor(category: string): string[] {
  return DEFAULT_SKILLS[normalizeCategory(category)];
}

const DEFAULT_CRITERIA: Record<Category, string> = {
  PROGRAMMING:
    "State the likely root cause and the evidence behind it.\nExplain the runtime, version or configuration constraint that matters.\nGive a concrete fix or next diagnostic step.\nCite an independent source with a verbatim quoted excerpt.",
  CRYPTO:
    "State whether the property or design is safe, and under which assumptions.\nExplain the relevant chain, contract or signature detail.\nCall out any replay, custody or key-management risk.\nCite an independent source with a verbatim quoted excerpt.",
  CONCEPTUAL:
    "State a clear recommendation or conclusion.\nExplain the trade-off and the constraints that drive it.\nName the conditions under which the recommendation changes.\nCite an independent source with a verbatim quoted excerpt.",
  HARDWARE:
    "State the compatibility conclusion and the exact configuration it applies to.\nExplain the relevant wattage, voltage and protocol constraints.\nCite the manufacturer documentation with a verbatim quoted excerpt.",
};

export function defaultAcceptanceCriteria(category: string): string {
  return DEFAULT_CRITERIA[normalizeCategory(category)];
}
