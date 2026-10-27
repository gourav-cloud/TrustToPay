import { config } from "../../config.js";
import { detectCategory, normalizeCategory, type Category } from "../../lib/categories.js";
import type { AnalysisInput, AnalysisOutput, Conflict } from "./schema.js";

/**
 * Deterministic, rule-based analysis engine.
 *
 * This is NOT an LLM. It performs explicit checks for missing specifications,
 * contradictions, and weak evidence, and derives a heuristic confidence score.
 * The score is never presented as a calibrated probability.
 */

type Doc = AnalysisInput["documents"][number];

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are", "was",
  "were", "be", "by", "at", "as", "it", "this", "that", "from", "than", "into", "when",
]);

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function strengthFor(doc: Doc): "STRONG" | "MODERATE" | "WEAK" {
  if (doc.sourceType === "MANUFACTURER") return "STRONG";
  const haystack = `${doc.publisher ?? ""} ${doc.title} ${doc.url ?? ""}`.toLowerCase();
  if (/manufacturer|official|support|docs?\.|support\./.test(haystack)) return "STRONG";
  if (doc.sourceType === "RETAILER" || doc.sourceType === "DOCUMENT") return "MODERATE";
  return "WEAK";
}

function wattClaims(text: string): number[] {
  const values: number[] = [];
  const regex = /(\d{1,3})\s*(?:w\b|watts?\b)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    values.push(Number.parseInt(match[1], 10));
  }
  return values;
}

function voltAmpWatts(text: string): number[] {
  const values: number[] = [];
  const regex = /(\d+(?:\.\d+)?)\s*v\s*(?:[/x×]|at)\s*(\d+(?:\.\d+)?)\s*a\b/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    values.push(Math.round(Number.parseFloat(match[1]) * Number.parseFloat(match[2])));
  }
  return values;
}

function excerptFor(text: string): string {
  const relevant = sentences(text).find((sentence) =>
    /(\d+\s*w\b|\d+(?:\.\d+)?\s*v\b|power delivery|usb-c|type-c|requires?|protocol)/i.test(sentence),
  );
  const value = relevant ?? sentences(text)[0] ?? text;
  return value.length > 300 ? `${value.slice(0, 297)}...` : value;
}

function findRequiredWattage(input: AnalysisInput): { watts: number; source: string } | null {
  const candidates: { watts: number; source: string }[] = [];
  const regexes = [
    /requires?\s+(?:at\s+least\s+)?(\d{2,3})\s*w/gi,
    /(\d{2,3})\s*w\s+(?:or\s+higher|minimum|required|rated)/gi,
    /(?:charging|charger)[^.]{0,60}?(\d{2,3})\s*w/gi,
  ];

  const questionMatches: number[] = [];
  for (const regex of regexes) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(input.question)) !== null) {
      questionMatches.push(Number.parseInt(match[1], 10));
    }
  }
  if (questionMatches.length) {
    candidates.push({ watts: Math.max(...questionMatches), source: "Original question" });
  }

  for (const doc of input.documents) {
    const haystack = `${doc.title} ${doc.content}`;
    for (const regex of regexes) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(haystack)) !== null) {
        candidates.push({ watts: Number.parseInt(match[1], 10), source: doc.title });
      }
    }
  }

  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.watts - a.watts)[0];
}

type PortLimit = { watts: number; source: string; sentence: string; total: boolean };

function findPortLimits(docs: Doc[]): PortLimit[] {
  const limits: PortLimit[] = [];
  for (const doc of docs) {
    for (const sentence of sentences(doc.content)) {
      if (!/usb[- ]?c|type[- ]?c/i.test(sentence)) continue;
      const claims = [...wattClaims(sentence), ...voltAmpWatts(sentence)];
      if (!claims.length) continue;
      const total = /total|combined|shared|across both|both ports/i.test(sentence);
      const restricted = /max|maximum|only|limited|up to|when|shared|combined|total/i.test(sentence);
      if (!restricted) continue;
      limits.push({
        watts: Math.min(...claims),
        source: doc.title,
        sentence,
        total,
      });
    }
  }
  return limits;
}

function billingSummary(conflicts: Conflict[], missing: string[], confidence: number): string {
  return `Rule-based analysis finished with ${conflicts.length} conflicting claim(s) and ${missing.length} information gap(s). Heuristic confidence ${(confidence * 100).toFixed(0)}%.`;
}

function runHardwareAnalysis(input: AnalysisInput): AnalysisOutput {
  const docs = input.documents;
  const strengths = docs.map(strengthFor);
  const strongEvidence = strengths.filter((value) => value === "STRONG").length;
  const weakOnly = docs.length > 0 && strengths.every((value) => value === "WEAK");

  const required = findRequiredWattage(input);
  const limits = findPortLimits(docs);
  const restrictedLimits = limits.filter((limit) => !limit.total);
  const totalClaims = limits.filter((limit) => limit.total);
  const maxMarketing = Math.max(0, ...docs.flatMap((doc) => wattClaims(`${doc.title} ${doc.content}`)));

  const conflicts: Conflict[] = [];

  // The central compatibility check: documented USB-C port limit below the
  // laptop's documented requirement is a critical contradiction.
  if (required && restrictedLimits.length) {
    const lowest = restrictedLimits.sort((a, b) => a.watts - b.watts)[0];
    if (lowest.watts < required.watts) {
      conflicts.push({
        claimA: `USB-C output is limited to about ${lowest.watts}W`,
        sourceA: lowest.source,
        claimB: `Laptop requires ${required.watts}W over USB-C`,
        sourceB: required.source,
        severity: "CRITICAL",
        detail: `The documented USB-C port maximum (${lowest.watts}W) is below the required ${required.watts}W. Marketing wattage alone does not prove that the required power is delivered on the USB-C port.`,
      });
    }
  } else if (required && maxMarketing > 0 && maxMarketing < required.watts) {
    conflicts.push({
      claimA: `Highest documented adapter output is ${maxMarketing}W`,
      sourceA: docs.find((doc) => wattClaims(doc.content).length)?.title ?? "Supplied documents",
      claimB: `Laptop requires ${required.watts}W`,
      sourceB: required.source,
      severity: "CRITICAL",
      detail: "The highest supplied wattage claim is below the laptop's documented requirement.",
    });
  }

  // "65W total" versus a lower per-port limit is a high-risk ambiguity.
  if (maxMarketing > 0 && restrictedLimits.length) {
    const lowest = [...restrictedLimits].sort((a, b) => a.watts - b.watts)[0];
    if (maxMarketing - lowest.watts >= 5) {
      const totalSource = totalClaims[0]?.source ?? docs[0]?.title ?? "Supplied documents";
      conflicts.push({
        claimA: `Marketing/total output claim of ${maxMarketing}W`,
        sourceA: totalSource,
        claimB: `USB-C port documented at about ${lowest.watts}W`,
        sourceB: lowest.source,
        severity: "HIGH",
        detail:
          "A headline wattage claim can refer to combined multi-port output. The per-port maximum is the relevant figure for laptop compatibility.",
      });
    }
  }

  const missingInformation: string[] = [];
  if (!required) {
    missingInformation.push("The laptop's required wattage and USB-C charging profile are not stated.");
  }
  if (!docs.some((doc) => /\d+(?:\.\d+)?\s*v\b/i.test(doc.content))) {
    missingInformation.push("No voltage/current table is supplied, so the port's power profile cannot be verified.");
  }
  if (!docs.some((doc) => /power delivery|usb[- ]?pd\b|pps\b|quick charge|qc\s?[0-9]/i.test(doc.content))) {
    missingInformation.push("The supported charging protocol (for example USB Power Delivery) is not documented.");
  }
  if (strongEvidence === 0) {
    missingInformation.push("No manufacturer or official support documentation was supplied as preferred evidence.");
  }
  for (const doc of docs) {
    const hasWatt = wattClaims(doc.content).length > 0;
    const hasVoltage = /\d+(?:\.\d+)?\s*v\b/i.test(doc.content);
    if (hasWatt && !hasVoltage) {
      missingInformation.push(`"${doc.title}" claims wattage without a voltage/current table.`);
    }
  }
  if (limits.some((limit) => /when usb-a|when both|shared|combined/i.test(limit.sentence))) {
    missingInformation.push(
      "Single-port behavior (USB-A unused) is not fully documented for the exact SKU, so full-wattage USB-C operation is unconfirmed.",
    );
  }
  if (docs.length && !docs.some((doc) => /e-?marker|5\s?a\b|100\s?w cable|cable rating/i.test(doc.content))) {
    missingInformation.push("Cable current rating (e-marker/5A) is not documented, which can independently limit charging.");
  }

  const uncertainties: string[] = [];
  for (const conflict of conflicts) {
    uncertainties.push(`${conflict.claimA} versus ${conflict.claimB} (${conflict.severity.toLowerCase()} severity).`);
  }
  for (const gap of missingInformation) uncertainties.push(gap);
  if (!uncertainties.length) uncertainties.push("No blocking uncertainty was detected by the rule-based checks.");

  const evidence = docs.map((doc, index) => ({
    title: doc.title,
    url: doc.url ?? null,
    publisher: doc.publisher ?? null,
    strength: strengths[index],
    supportsAnswer:
      (required !== null && doc.content.includes(String(required.watts))) ||
      restrictedLimits.some((limit) => limit.source === doc.title),
    excerpt: excerptFor(doc.content),
  }));

  let confidence = 0.9;
  const critical = conflicts.filter((conflict) => conflict.severity === "CRITICAL").length;
  const high = conflicts.filter((conflict) => conflict.severity === "HIGH").length;
  const other = conflicts.length - critical - high;

  if (!docs.length) confidence -= 0.35;
  confidence -= critical * 0.3;
  confidence -= high * 0.12;
  confidence -= other * 0.05;
  confidence -= Math.min(0.28, missingInformation.length * 0.06);
  if (strongEvidence === 0 && docs.length > 0) confidence -= 0.08;
  if (strongEvidence > 0) confidence += 0.03;
  if (weakOnly) confidence -= 0.05;
  if (required) confidence += 0.02;
  confidence = Math.max(0.05, Math.min(0.96, Number(confidence.toFixed(2))));

  let recommendedAction: AnalysisOutput["recommendedAction"] = "RESOLVE_AUTOMATICALLY";
  if (critical > 0) {
    recommendedAction = "ESCALATE_TO_HUMAN";
  } else if (confidence < config.aiEscalationThreshold) {
    recommendedAction = "ESCALATE_TO_HUMAN";
  } else if (missingInformation.length > 0) {
    recommendedAction = "REQUEST_MORE_INFORMATION";
  }

  const money = required && restrictedLimits.length
    ? `The charger's USB-C port is documented at up to ${[...restrictedLimits].sort((a, b) => a.watts - b.watts)[0].watts}W, while the laptop requires ${required.watts}W over USB-C.`
    : required
      ? `The laptop requires ${required.watts}W over USB-C.`
      : "The laptop's charging requirement is not documented in the supplied material.";

  const proposedAnswer =
    recommendedAction === "RESOLVE_AUTOMATICALLY"
      ? `The supplied documents are consistent with the stated requirement (${required ? `${required.watts}W` : "wattage not specified"}). This conclusion is based only on the supplied documents and has not been independently verified.`
      : `Compatibility is not confirmed from the supplied evidence. ${money} Headline wattage claims may refer to combined output rather than a single USB-C port. A human reviewer should confirm the exact model, per-port voltage/current profile, protocol, and cable rating before the agent relies on this answer.`;

  const escalationReason =
    recommendedAction === "ESCALATE_TO_HUMAN"
      ? critical > 0
        ? "A critical unresolved conflict affects the core compatibility decision: the documented USB-C limit is below the laptop's requirement. The AI must not guess."
        : `The rule-based confidence score (${confidence.toFixed(2)}) is below the configured escalation threshold (${config.aiEscalationThreshold.toFixed(2)}).`
      : recommendedAction === "REQUEST_MORE_INFORMATION"
        ? "The supplied documents leave information gaps that the requester can close before paying for a human review."
        : "";

  const skills = new Set<string>();
  const haystack = `${input.question} ${docs.map((doc) => doc.content).join(" ")}`.toLowerCase();
  if (/usb[- ]?c|type[- ]?c|charger|watt|volt/.test(haystack)) {
    skills.add("USB-C power compatibility");
    skills.add("USB Power Delivery");
  }
  if (/laptop|notebook|system|device/.test(haystack)) skills.add("Laptop charging requirements");
  if (docs.length) skills.add("Manufacturer documentation review");
  if (skills.size === 0) skills.add("Technical document review");

  const rewardMinor = Math.min(
    config.rewardMaxMinor,
    Math.max(config.rewardMinMinor, 1000 + conflicts.length * 350 + missingInformation.length * 250),
  );

  const summary = `${input.question.slice(0, 160)}${input.question.length > 160 ? "…" : ""} ${billingSummary(conflicts, missingInformation, confidence)}`;

  return {
    summary,
    proposedAnswer,
    confidenceScore: confidence,
    uncertainties: uncertainties.slice(0, 12),
    conflictingClaims: conflicts,
    missingInformation: missingInformation.slice(0, 12),
    evidence,
    recommendedAction,
    escalationReason,
    suggestedReviewerSkills: Array.from(skills).slice(0, 5),
    suggestedReward: {
      amountMinor: rewardMinor,
      currency: "USD",
      rationale: `Base reward ${config.rewardMinMinor} minor units plus conflict and evidence-review effort, within the server limit of ${config.rewardMaxMinor}.`,
    },
    reasoningSummary:
      "Deterministic checks extracted wattage and voltage/current claims, compared the documented USB-C port limit with the laptop requirement, and flagged missing protocol, voltage, single-port, and cable details. No specification or citation was invented. The confidence value is a heuristic derived from these checks, not an LLM self-report or a calibrated probability.",
  };
}

/* ------------------------------------------------------------------------- */
/* General categories: programming, crypto and conceptual questions.         */
/* ------------------------------------------------------------------------- */

const NUMBER_UNIT =
  "(?:ms|milliseconds?|s|sec(?:onds?)?|m|min(?:utes?)?|h|hours?|%|kb|mb|gb|tb|rps|req(?:uests?)?\\s*(?:\\/|per)\\s*(?:s|sec(?:ond)?)|msgs?\\s*(?:\\/|per)\\s*(?:s|sec(?:ond)?)|messages?\\s*(?:\\/|per)\\s*(?:s|sec(?:ond)?)|connections?|workers?|threads?|retries|attempts|nodes?|replicas?)";

const NUMBER_CLAIM = new RegExp(
  `\\b([a-z][a-z0-9 _-]{2,50}?)\\s*(?:is|are|was|were|=|:|of|at|up to|max(?:imum)?(?: of)?|defaults? to)\\s*(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)\\s*(${NUMBER_UNIT})\\b`,
  "gi",
);

type NumericClaim = {
  key: string;
  value: number;
  unit: string;
  source: string;
  sentence: string;
};

function normalizeUnit(unit: string): string {
  const value = unit.toLowerCase().replace(/\s+/g, " ").trim();
  if (/^(?:ms|millisecond)/.test(value)) return "ms";
  if (/mess|msg/.test(value)) return "messages/second";
  if (/req/.test(value)) return "requests/second";
  if (/^(?:s|sec)/.test(value)) return "s";
  if (/^(?:m|min)/.test(value)) return "min";
  if (/^(?:h|hour)/.test(value)) return "hour";
  if (value === "workers" || value === "worker") return "workers";
  if (value === "threads" || value === "thread") return "threads";
  if (value === "connections" || value === "connection") return "connections";
  if (value === "retries" || value === "retry") return "retries";
  if (value === "attempts" || value === "attempt") return "attempts";
  if (value === "nodes" || value === "node") return "nodes";
  if (value === "replicas" || value === "replica") return "replicas";
  return value;
}

function normalizeClaimKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(
      /\b(?:the|a|an|is|are|was|were|of|at|to|up|maximum|max|default|defaults|value|setting|limit|size|count|documented|documentation|reported|observed|configured|with|and|for|our|their)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(-3)
    .filter((word, index, words) => index === 0 || word !== words[index - 1])
    .join(" ");
}

function numericClaimsFor(docs: Doc[]): NumericClaim[] {
  const claims: NumericClaim[] = [];
  for (const doc of docs) {
    for (const sentence of sentences(doc.content)) {
      NUMBER_CLAIM.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = NUMBER_CLAIM.exec(sentence)) !== null) {
        const key = normalizeClaimKey(match[1]);
        if (key.length < 3) continue;
        claims.push({
          key,
          value: Number(match[2].replaceAll(",", "")),
          unit: normalizeUnit(match[3]),
          source: doc.title,
          sentence,
        });
      }
    }
  }
  return claims;
}

function numericConflicts(docs: Doc[]): Conflict[] {
  const groups = new Map<string, NumericClaim[]>();
  for (const claim of numericClaimsFor(docs)) {
    const anchor = claim.key.split(" ").at(-1) ?? claim.key;
    const id = `${anchor}|${claim.unit}`;
    const group = groups.get(id) ?? [];
    if (!group.some((item) => item.source === claim.source && item.value === claim.value)) {
      group.push(claim);
    }
    groups.set(id, group);
  }

  const conflicts: Conflict[] = [];
  for (const group of groups.values()) {
    const values = Array.from(new Set(group.map((item) => item.value)));
    const sources = new Set(group.map((item) => item.source));
    if (values.length < 2 || sources.size < 2) continue;

    const first = group[0];
    const second = group.find((item) => item.source !== first.source && item.value !== first.value);
    if (!second) continue;

    const sensitive = /(?:chain|nonce|key|signature|security|replay)/i.test(first.key);
    const severity: Conflict["severity"] = sensitive ? "CRITICAL" : "HIGH";
    conflicts.push({
      claimA: `${first.key} is documented as ${first.value} ${first.unit}`,
      sourceA: first.source,
      claimB: `${second.key} is documented as ${second.value} ${second.unit}`,
      sourceB: second.source,
      severity,
      detail: `The supplied sources give different values for "${first.key}" (${first.value} versus ${second.value} ${first.unit}). Resolving this discrepancy changes the answer, so it should not be guessed.`,
    });
    if (conflicts.length >= 4) break;
  }
  return conflicts;
}

const SENSITIVE_CLAIMS: { key: string; label: string; pattern: RegExp; severity: Conflict["severity"] }[] = [
  { key: "chainId", label: "chain ID validation", pattern: /\bchain ?id\b|\bdomain separator\b/i, severity: "CRITICAL" },
  { key: "replay", label: "replay protection", pattern: /\breplay\b|\bpermit\b|\bsignature\b/i, severity: "CRITICAL" },
  { key: "nonce", label: "nonce handling", pattern: /\bnonces?\s+(?:are|is|were|must be)\s+(?:not\s+)?(?:incremented|consumed|validated|checked|stored|used)\b|\b(?:increment|consume|validate|check)s?\s+(?:the\s+)?nonce\b/i, severity: "HIGH" },
  { key: "auth", label: "authentication and authorization", pattern: /\bauthenticat\w*|\bauthoriz\w*|\bjwt\b|\boauth\b/i, severity: "HIGH" },
  { key: "injection", label: "input sanitisation", pattern: /\bsanitiz\w*|\bescap\w*|\bparameteri[sz]ed\b|\bsql injection\b/i, severity: "CRITICAL" },
  { key: "rate", label: "rate limiting", pattern: /\brate[- ]?limit\w*|\bthrottl\w*/i, severity: "HIGH" },
  { key: "idempotency", label: "idempotency", pattern: /\bidempoten\w*/i, severity: "HIGH" },
  { key: "consensus", label: "consensus and finality", pattern: /\bconsensus\b|\bfinality\b|\breorg\b/i, severity: "HIGH" },
  { key: "locking", label: "locking and concurrency", pattern: /\bdeadlock\b|\bmutex\b|\brace condition\b|\block(?:ing|s)?\b/i, severity: "HIGH" },
];

const NEGATION = /\b(?:does not|doesn't|is not|isn't|cannot|can't|never|not|without|missing|lacks?|no longer)\b/i;

type PolarizedSentence = { source: string; sentence: string; negated: boolean };

function polarityConflicts(docs: Doc[]): Conflict[] {
  const conflicts: Conflict[] = [];

  for (const sensitive of SENSITIVE_CLAIMS) {
    const positive: PolarizedSentence[] = [];
    const negative: PolarizedSentence[] = [];

    for (const doc of docs) {
      for (const sentence of sentences(doc.content)) {
        if (!sensitive.pattern.test(sentence)) continue;
        const claim = { source: doc.title, sentence, negated: NEGATION.test(sentence) };
        (claim.negated ? negative : positive).push(claim);
      }
    }

    const negated = negative.find((item) => positive.some((other) => other.source !== item.source));
    const affirmed = negated
      ? positive.find((item) => item.source !== negated.source)
      : undefined;
    if (!negated || !affirmed) continue;

    conflicts.push({
      claimA: negated.sentence.slice(0, 240),
      sourceA: negated.source,
      claimB: affirmed.sentence.slice(0, 240),
      sourceB: affirmed.source,
      severity: sensitive.severity,
      detail: `The sources disagree about ${sensitive.label}. One says the property is absent while another says it is present. This is a security-relevant contradiction that cannot be resolved from the supplied text alone.`,
    });
    if (conflicts.length >= 3) break;
  }

  return conflicts;
}

function generalExcerpt(text: string): string {
  const relevant = sentences(text).find((sentence) =>
    /(\d|because|however|therefore|not|risk|recommend|fails?|supports?|requires?)/i.test(sentence),
  );
  const value = relevant ?? sentences(text)[0] ?? text;
  return value.length > 300 ? `${value.slice(0, 297)}...` : value;
}

function generalMissingInformation(category: Category, input: AnalysisInput): string[] {
  const docs = input.documents;
  const text = [
    input.question,
    ...input.productModels,
    ...input.specifications,
    ...docs.map((doc) => `${doc.title} ${doc.content}`),
  ].join("\n");
  const missing: string[] = [];

  if (category === "PROGRAMMING") {
    if (!/\b(?:node|python|typescript|javascript|java|kotlin|go(?:lang)?|rust|php|ruby|c\+\+|c#|\.net)\s*\d+(?:\.\d+)*/i.test(text)) {
      missing.push("The language and runtime version are not stated, which affects behaviour and available APIs.");
    }
    if (!/\b(?:error|exception|stack trace|traceback|panic|segfault|stall(?:s|ed)?|timeout|crash(?:es|ed)?)\b/i.test(text)) {
      missing.push("The exact error, stack trace or failure mode is not supplied.");
    }
    if (!/\b(?:reproduc|steps to|consistently|intermittent|after (?:a )?deploy|since (?:the )?deploy|on every request)\b/i.test(text)) {
      missing.push("There is no reproducible trigger or clear before/after condition.");
    }
    if (!/\b(?:expected|actual|observed|should|instead)\b/i.test(text)) {
      missing.push("The expected versus actual behaviour is not documented.");
    }
    if (docs.length > 0 && !/\b(?:log|logs|metric|metrics|profile|profiler|trace|benchmark)\b/i.test(text)) {
      missing.push("No logs, metrics or profiler output are supplied to confirm the suspected cause.");
    }
  }

  if (category === "CRYPTO") {
    if (!/\b(?:ethereum|mainnet|testnet|polygon|arbitrum|optimism|base|solana|avalanche|chain ?id\s*[:=]?\s*\d+)\b/i.test(text)) {
      missing.push("The target chain or network is not stated, so fork and replay assumptions cannot be checked.");
    }
    if (!/\b0x[a-f0-9]{6,}\b/i.test(text)) {
      missing.push("No contract or wallet address is supplied, so the deployed code cannot be matched to the description.");
    }
    if (!/\b(?:threat model|attacker|trust assumption|replay|reorg|finality|custody)\b/i.test(text)) {
      missing.push("The threat model and trust assumptions are not explicit.");
    }
    if (!/\b(?:gas|nonce|signature|domain separator|deadline|calldata)\b/i.test(text)) {
      missing.push("The signature, nonce or gas details needed to verify the claim are incomplete.");
    }
  }

  if (category === "CONCEPTUAL") {
    if (!/\b(?:success criteria|goal|objective|requirement|constraint|budget|sla|latency|throughput|cost)\b/i.test(text)) {
      missing.push("The decision criteria, constraints and measurable goals are not stated.");
    }
    if (!/\b(?:team|owners?|ownership|operational|staff|on-?call|maintenance|complexity)\b/i.test(text)) {
      missing.push("Operational ownership and maintenance cost are not quantified.");
    }
    if (!/\b(?:failure|fallback|retry|duplicate|ordering|delivery guarantee|idempoten\w*|backpressure)\b/i.test(text)) {
      missing.push("Failure semantics (retries, ordering, duplicates, backpressure) are not discussed.");
    }
    if (input.specifications.length === 0) {
      missing.push("No explicit specifications or constraints were supplied with the question.");
    }
  }

  if (docs.length === 0) {
    missing.push("No evidence documents were supplied at all.");
  } else if (!docs.some((doc) => strengthFor(doc) === "STRONG")) {
    missing.push("No primary or official source was supplied; every document is secondary or informal.");
  }

  return Array.from(new Set(missing));
}

function generalSkills(category: Category, input: AnalysisInput): string[] {
  const text = `${input.question} ${input.documents.map((doc) => doc.content).join(" ")}`.toLowerCase();
  const skills = new Set<string>();

  if (category === "PROGRAMMING") {
    if (/typescript|tsx|ts\b|react/.test(text)) skills.add("TypeScript / React");
    if (/node|express|npm|worker_threads|event loop/.test(text)) skills.add("Node.js runtime");
    if (/python|django|flask|pytest/.test(text)) skills.add("Python");
    if (/sql|postgres|mysql|sqlite|prisma/.test(text)) skills.add("Database and SQL");
    if (/race condition|deadlock|mutex|thread|concurren/.test(text)) skills.add("Concurrency debugging");
    if (/api|http|endpoint|rest|graphql/.test(text)) skills.add("API design");
    if (skills.size === 0) skills.add("Software debugging");
  } else if (category === "CRYPTO") {
    if (/solidity|evm|smart contract|erc-?20|eip-?2612/.test(text)) skills.add("Smart contract security");
    if (/signature|nonce|chain ?id|replay|domain separator/.test(text)) skills.add("Cryptographic protocol review");
    if (/consensus|finality|reorg|validator|staking/.test(text)) skills.add("Blockchain protocol review");
    if (/wallet|custody|private key|seed phrase/.test(text)) skills.add("Key management and custody");
    if (skills.size === 0) skills.add("Blockchain protocol review");
  } else {
    if (/queue|event[- ]driven|kafka|rabbitmq|backpressure/.test(text)) skills.add("Messaging and event-driven design");
    if (/microservice|monolith|architecture|scal|trade[- ]?off|complexity|replace|design/.test(text)) skills.add("Systems design");
    if (/cache|latency|throughput|performance/.test(text)) skills.add("Performance trade-offs");
    if (/cost|budget|team|operational/.test(text)) skills.add("Engineering economics");
    if (skills.size === 0) skills.add("Technical research");
  }

  if (input.documents.length > 0) skills.add("Technical document review");
  return Array.from(skills).slice(0, 5);
}

const CATEGORY_COPY: Record<Exclude<Category, "HARDWARE">, {
  subject: string;
  advice: string;
  reasoning: string;
}> = {
  PROGRAMMING: {
    subject: "the root cause and the safe fix",
    advice:
      "A human reviewer should reproduce the failure, inspect the runtime configuration, and confirm the fix against the exact language and runtime version.",
    reasoning:
      "Deterministic checks looked for conflicting configuration values, security-sensitive claims and missing runtime, reproduction and observability details. No code was executed and no library behaviour was invented. The confidence value is a heuristic derived from the supplied text.",
  },
  CRYPTO: {
    subject: "whether the property holds under the stated threat model",
    advice:
      "A human reviewer should verify the deployed contract or protocol, the chain and fork assumptions, and the key-management model before the agent relies on this answer.",
    reasoning:
      "Deterministic checks compared numeric and security-sensitive claims across sources, including chain ID, nonce, signature and replay language. The engine does not execute contracts or invent audit findings. The confidence value is a heuristic, not a security guarantee.",
  },
  CONCEPTUAL: {
    subject: "which option fits the stated constraints",
    advice:
      "A human reviewer should weigh the measurable constraints, operating cost and failure semantics before the agent commits to a recommendation.",
    reasoning:
      "Deterministic checks compared numeric claims and missing decision criteria across the supplied sources. The engine does not invent benchmarks or organisational context. The confidence value is a heuristic derived from those checks.",
  },
};

function runGeneralAnalysis(category: Exclude<Category, "HARDWARE">, input: AnalysisInput): AnalysisOutput {
  const docs = input.documents;
  const strengths = docs.map(strengthFor);
  const strongEvidence = strengths.filter((value) => value === "STRONG").length;
  const weakOnly = docs.length > 0 && strengths.every((value) => value === "WEAK");

  const conflicts = [...numericConflicts(docs), ...polarityConflicts(docs)];
  const missingInformation = generalMissingInformation(category, input);

  const uncertainties = [
    ...conflicts.map(
      (conflict) =>
        `${conflict.claimA} versus ${conflict.claimB} (${conflict.severity.toLowerCase()} severity).`,
    ),
    ...missingInformation,
  ];
  if (uncertainties.length === 0) {
    uncertainties.push("No blocking uncertainty was detected by the rule-based checks.");
  }

  const conflictSources = new Set(conflicts.flatMap((conflict) => [conflict.sourceA, conflict.sourceB]));
  const evidence = docs.map((doc, index) => ({
    title: doc.title,
    url: doc.url ?? null,
    publisher: doc.publisher ?? null,
    strength: strengths[index],
    supportsAnswer: strengths[index] === "STRONG" && !conflictSources.has(doc.title),
    excerpt: generalExcerpt(doc.content),
  }));

  let confidence = 0.86;
  const critical = conflicts.filter((conflict) => conflict.severity === "CRITICAL").length;
  const high = conflicts.filter((conflict) => conflict.severity === "HIGH").length;
  const other = conflicts.length - critical - high;

  if (!docs.length) confidence -= 0.35;
  confidence -= critical * 0.3;
  confidence -= high * 0.12;
  confidence -= other * 0.05;
  confidence -= Math.min(0.28, missingInformation.length * 0.06);
  if (strongEvidence === 0 && docs.length > 0) confidence -= 0.08;
  if (strongEvidence > 0) confidence += 0.03;
  if (weakOnly) confidence -= 0.05;
  confidence = Math.max(0.05, Math.min(0.96, Number(confidence.toFixed(2))));

  let recommendedAction: AnalysisOutput["recommendedAction"] = "RESOLVE_AUTOMATICALLY";
  if (critical > 0) {
    recommendedAction = "ESCALATE_TO_HUMAN";
  } else if (confidence < config.aiEscalationThreshold) {
    recommendedAction = "ESCALATE_TO_HUMAN";
  } else if (missingInformation.length > 0) {
    recommendedAction = "REQUEST_MORE_INFORMATION";
  }

  const copy = CATEGORY_COPY[category];
  const firstConflict = conflicts[0];
  const evidenceSummary = firstConflict
    ? firstConflict.detail
    : missingInformation[0] ?? "The supplied material does not contain a blocking gap.";

  const proposedAnswer =
    recommendedAction === "RESOLVE_AUTOMATICALLY"
      ? `Based only on the supplied material, ${copy.subject} can be assessed without a human reviewer. ${evidenceSummary} This conclusion has not been independently verified.`
      : `The supplied material does not settle ${copy.subject}. ${evidenceSummary} ${copy.advice}`;

  const escalationReason =
    recommendedAction === "ESCALATE_TO_HUMAN"
      ? critical > 0
        ? `A critical contradiction affects the core answer: ${firstConflict?.claimA ?? "the sources disagree"} versus ${firstConflict?.claimB ?? "another source"}. The AI must not guess on a security- or correctness-sensitive point.`
        : `The rule-based confidence score (${confidence.toFixed(2)}) is below the configured escalation threshold (${config.aiEscalationThreshold.toFixed(2)}).`
      : recommendedAction === "REQUEST_MORE_INFORMATION"
        ? "The supplied material leaves information gaps that the requester can close before paying for a human review."
        : "";

  const rewardMinor = Math.min(
    config.rewardMaxMinor,
    Math.max(config.rewardMinMinor, 1000 + conflicts.length * 350 + missingInformation.length * 250),
  );

  return {
    summary: `${input.question.slice(0, 160)}${input.question.length > 160 ? "…" : ""} ${billingSummary(conflicts, missingInformation, confidence)}`,
    proposedAnswer,
    confidenceScore: confidence,
    uncertainties: uncertainties.slice(0, 12),
    conflictingClaims: conflicts.slice(0, 8),
    missingInformation: missingInformation.slice(0, 12),
    evidence,
    recommendedAction,
    escalationReason,
    suggestedReviewerSkills: generalSkills(category, input),
    suggestedReward: {
      amountMinor: rewardMinor,
      currency: "USD",
      rationale: `Base reward ${config.rewardMinMinor} minor units plus contradiction and evidence-review effort, within the server limit of ${config.rewardMaxMinor}.`,
    },
    reasoningSummary: copy.reasoning,
  };
}

/**
 * Public demo entry point. Hardware questions keep the original USB-C
 * compatibility checks; every other category uses the general contradiction
 * and missing-information checks above.
 */
export function runDemoAnalysis(input: AnalysisInput): AnalysisOutput {
  const category = input.category ? normalizeCategory(input.category) : detectCategory(input);
  if (category === "HARDWARE") return runHardwareAnalysis(input);
  return runGeneralAnalysis(category, input);
}
