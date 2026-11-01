/**
 * Landing-page source data.
 *
 * Every route, state name, number, and payload below is copied from the
 * product's real API surface. Visual work may restyle these records but must
 * not rewrite their facts.
 */

export type HeroStage = {
  index: number;
  shortTitle: string;
  title: string;
  statusTag: string;
  tone: "amber" | "blue" | "emerald";
  summary: string;
  actor: string;
  endpoint: string;
  metrics: { label: string; value: string }[];
  terminalLines: { prefix: string; text: string; highlight?: "amber" | "blue" | "emerald" | "muted" }[];
};

export const HERO_STAGES: HeroStage[] = [
  {
    index: 1,
    shortTitle: "01. AI Agent Stuck",
    title: "AI Agent Encounters a High-Risk Blocker",
    statusTag: "ESCALATE_TO_HUMAN · CONFIDENCE 0.41",
    tone: "amber",
    summary:
      "An autonomous coding agent detects conflicting worker-pool specifications and an unbounded network call that stalls production queues.",
    actor: "Agent Runtime (agent_session_9f3a)",
    endpoint: "POST /api/v1/sessions/:id/analyze",
    metrics: [
      { label: "Heuristic Confidence", value: "41% (Threshold 75%)" },
      { label: "Conflict Severity", value: "CRITICAL" },
      { label: "Decision", value: "Pause & Escalate" },
    ],
    terminalLines: [
      { prefix: "agent>", text: "Analyzing src/worker-pool.ts against runbook specifications..." },
      {
        prefix: "warn >",
        text: "Conflict detected: worker-pool.ts sets 4 workers; runbook mandates 12 with 30s timeout.",
        highlight: "amber",
      },
      {
        prefix: "gate >",
        text: "Confidence 0.41 < 0.75 threshold. Halting autonomous mutation to prevent outage.",
        highlight: "amber",
      },
      { prefix: "next >", text: "Packaging bounded escalation payload for human specialist review.", highlight: "blue" },
    ],
  },
  {
    index: 2,
    shortTitle: "02. Task Created",
    title: "Bounded Task Created & Escrow Funded",
    statusTag: "FUNDED · PAYPAL ORDERS V2 CAPTURED",
    tone: "blue",
    summary:
      "TrustToPay encapsulates the exact file context, acceptance criteria, and required L2 skill level, locking the reward via PayPal Orders v2 before dispatch.",
    actor: "TrustToPay State Machine + PayPal Orders v2",
    endpoint: "POST /api/v1/tasks + POST /api/v1/payments/paypal/orders/:id/capture",
    metrics: [
      { label: "Required Skill", value: "Node.js Runtime · Min L2" },
      { label: "Escrow Status", value: "$25.00 USD Captured" },
      { label: "Task State", value: "FUNDED" },
    ],
    terminalLines: [
      { prefix: "task >", text: "Created task_84c1: 'Fix worker-pool AbortController timeout & pool cap'" },
      { prefix: "spec >", text: "Acceptance: 1) AbortController 30s timeout 2) Concurrency cap 3) Unit test pass" },
      {
        prefix: "pay  >",
        text: "PayPal Orders v2 capture confirmed (Order 8HK492019L) -> $25.00 USD locked.",
        highlight: "emerald",
      },
      { prefix: "state>", text: "Transition AWAITING_FUNDING -> FUNDED. Ready for specialist discovery.", highlight: "blue" },
    ],
  },
  {
    index: 3,
    shortTitle: "03. Ranked Specialists",
    title: "Elastic Hybrid Discovery & Top-Five Offer Wave",
    statusTag: "OFFERED · TOP-5 PARALLEL BROADCAST",
    tone: "blue",
    summary:
      "Elasticsearch combines Jina vector embeddings and BM25 keyword retrieval to discover candidates, while PostgreSQL revalidates L1–L3 badges and capacity before dispatching 5 expiring offers.",
    actor: "Elastic Hybrid Matcher + PostgreSQL Revalidator",
    endpoint: "POST /api/v1/tasks/:id/dispatch-offers",
    metrics: [
      { label: "Retrieval Engine", value: "Elastic Hybrid + PG Truth" },
      { label: "Offer Wave", value: "Batch #1 · Top 5 Ranked" },
      { label: "Claim Semantics", value: "Atomic First-Accept" },
    ],
    terminalLines: [
      { prefix: "elas >", text: "Hybrid query matched 14 candidate IDs via jina-embeddings-v3 + BM25." },
      { prefix: "pg   >", text: "Revalidated active status, L2–L3 Node.js badges, and workload (< 3 active)." },
      {
        prefix: "wave >",
        text: "Dispatched Batch #1 expiring offers to Top 5 specialists (scores: 96, 93, 91, 89, 86).",
        highlight: "blue",
      },
      {
        prefix: "lock >",
        text: "Specialist Elena R. (L3 Node.js) accepted -> 4 sibling offers atomically superseded.",
        highlight: "emerald",
      },
    ],
  },
  {
    index: 4,
    shortTitle: "04. Human Fixes Issue",
    title: "Verified Specialist Submits Code Patch & Evidence",
    statusTag: "SUBMITTED · ARTIFACT v1 SHA-256",
    tone: "blue",
    summary:
      "The assigned specialist resolves the concurrency bug, attaches a clean unified git diff and file artifact, and cites the authoritative runtime specification.",
    actor: "Assigned Specialist (L3 Verified)",
    endpoint: "POST /api/v1/tasks/:id/submit",
    metrics: [
      { label: "Artifact Version", value: "v1 (Immutable)" },
      { label: "SHA-256 Digest", value: "e3b0c44298fc1c14…" },
      { label: "Deliverable", value: "src/worker-pool.ts + Diff" },
    ],
    terminalLines: [
      { prefix: "diff >", text: "+ const controller = new AbortController();" },
      { prefix: "diff >", text: "+ const timer = setTimeout(() => controller.abort(), 30_000);", highlight: "emerald" },
      { prefix: "diff >", text: "+ return await fetch(job.endpoint, { signal: controller.signal });", highlight: "emerald" },
      {
        prefix: "hash >",
        text: "Canonicalized artifact v1 -> sha256:8f94d2c1b7e04a319c5d... Queued for security gate.",
        highlight: "blue",
      },
    ],
  },
  {
    index: 5,
    shortTitle: "05. Security + Verification",
    title: "Layered Security Gate & Isolated Execution Runner",
    statusTag: "VERIFIED · SECURITY CLEAN · EXIT 0",
    tone: "emerald",
    summary:
      "Before any code reaches the agent or unlocks payment, TrustToPay runs deterministic secret/injection scanners, Gemini security review, and an isolated execution runner with network disabled.",
    actor: "SecurityGateService + IsolatedExecutionRunner",
    endpoint: "POST /api/v1/tasks/:id/verify",
    metrics: [
      { label: "Deterministic Scan", value: "CLEAN (0 findings)" },
      { label: "Gemini Gate", value: "APPROVE (96% conf)" },
      { label: "Isolated Runner", value: "PASS · Exit 0 · 142ms" },
    ],
    terminalLines: [
      { prefix: "scan >", text: "Deterministic AST & regex scan: 0 secrets, 0 shell/eval injections, 0 traversal." },
      {
        prefix: "gem  >",
        text: "Gemini Security Gate (gemini-2.5-flash): Verdict APPROVE · Risk LOW.",
        highlight: "emerald",
      },
      {
        prefix: "exec >",
        text: "Isolated runner (net=disabled, mem=128MB): 6/6 acceptance checks passed (exit 0).",
        highlight: "emerald",
      },
      { prefix: "state>", text: "Verification PASSED -> Task transitioned to PAYMENT_READY.", highlight: "emerald" },
    ],
  },
  {
    index: 6,
    shortTitle: "06. Verified Handoff + Payout",
    title: "Signed Agent Handback & PayPal Payout Settlement",
    statusTag: "COMPLETED · HMAC SIGNED · PAID",
    tone: "emerald",
    summary:
      "The agent receives the verified patch signed with X-TrustToPay-Signature (HMAC-SHA256) to resume execution safely, while the specialist's reward settles via PayPal Payouts.",
    actor: "Handback Signer + PayPal Payouts v1",
    endpoint: "GET /api/v1/tasks/:id/handback + POST /api/v1/payments/payouts",
    metrics: [
      { label: "Agent Handback", value: "HMAC-SHA256 Verified" },
      { label: "Payout Settlement", value: "$25.00 USD Released" },
      { label: "Session State", value: "RESOLVED & RESUMED" },
    ],
    terminalLines: [
      {
        prefix: "hmac >",
        text: "X-TrustToPay-Signature: t=1730284012,v1=5a92f8c3d104e71b92a6...",
        highlight: "blue",
      },
      {
        prefix: "pay  >",
        text: "PayPal Payouts v1 batch B-992014 confirmed -> $25.00 USD settled to specialist.",
        highlight: "emerald",
      },
      {
        prefix: "agent>",
        text: "Verified artifact sha256:8f94d2c1 applied. Resuming autonomous workflow.",
        highlight: "emerald",
      },
    ],
  },
];

export type WorkflowStep = {
  number: string;
  tabLabel: string;
  title: string;
  phase: string;
  actor: string;
  endpoint: string;
  description: string;
  invariants: string[];
  payloadTitle: string;
  payloadCode: string;
};

export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    number: "01",
    tabLabel: "Step 1 — AI encounters a blocker",
    title: "AI Agent Hits a Blocker & Evaluates Confidence",
    phase: "Detection & Guardrail",
    actor: "Autonomous Agent / Server Analysis Engine",
    endpoint: "POST /api/v1/sessions/:id/analyze",
    description:
      "When an AI agent encounters contradictory evidence, missing runtime specifications, or security-sensitive code paths, the server-side analysis engine computes a structured confidence score and forces escalation on any critical conflict.",
    invariants: [
      "Critical specification or security conflicts force ESCALATE_TO_HUMAN regardless of raw score",
      "Output is strictly schema-validated before persisting the analysis run",
      "The client browser cannot override the server's escalation threshold",
    ],
    payloadTitle: "Analysis Escalation Verdict",
    payloadCode: `{
  "recommendedAction": "ESCALATE_TO_HUMAN",
  "confidenceScore": 0.41,
  "threshold": 0.75,
  "conflictingClaims": [
    {
      "severity": "CRITICAL",
      "sourceA": "src/worker-pool.ts",
      "claimA": "MAX_WORKERS = 4 (no AbortController timeout)",
      "sourceB": "production-runbook.md",
      "claimB": "12 workers with 30,000ms request abort bound"
    }
  ]
}`,
  },
  {
    number: "02",
    tabLabel: "Step 2 — Task creation",
    title: "Bounded Task Created with Explicit Acceptance Criteria",
    phase: "Task Encapsulation",
    actor: "Requester / Agent Operator",
    endpoint: "POST /api/v1/tasks",
    description:
      "The escalated blocker is packaged into a narrowly scoped review task containing the exact question, supplied evidence documents, verifiable acceptance criteria, required specialist skills, and minimum skill level (L1–L3).",
    invariants: [
      "Tasks start in AWAITING_FUNDING and cannot be claimed before funding capture",
      "Reward bounds are validated in integer minor units on the server",
      "Required skill tags and minimum verification level (L1–L3) are locked on creation",
    ],
    payloadTitle: "Bounded Task Specification",
    payloadCode: `{
  "sessionId": "sess_9f3a81c2",
  "category": "PROGRAMMING",
  "minimumSkillLevel": 2,
  "requiredSkills": ["Node.js Runtime", "Concurrency & Queues"],
  "rewardMinor": 2500,
  "currency": "USD",
  "status": "AWAITING_FUNDING"
}`,
  },
  {
    number: "03",
    tabLabel: "Step 3 — Intelligent specialist matching",
    title: "Elastic Hybrid Discovery + PostgreSQL Source-of-Truth Revalidation",
    phase: "Discovery & Ranking",
    actor: "ElasticSpecialistDiscoveryService + MatchingEngine",
    endpoint: "POST /api/v1/admin/elastic/search",
    description:
      "Elasticsearch executes a hybrid BM25 keyword + Jina vector similarity search to discover specialists with relevant expertise. PostgreSQL then revalidates every candidate's account eligibility, sequential L1–L3 skill badges, and active workload.",
    invariants: [
      "Relational database remains the authoritative source of truth for eligibility and skill levels",
      "Specialists at max concurrent workload (3 active tasks) are automatically filtered out",
      "Graceful fallback to deterministic relational matching if Elastic is unconfigured or times out",
    ],
    payloadTitle: "Hybrid Candidate Ranking",
    payloadCode: `{
  "discovery": {
    "mode": "ELASTIC_HYBRID",
    "embeddingModel": "jina-embeddings-v3",
    "revalidatedInDatabase": true
  },
  "topCandidates": [
    { "specialistId": "usr_elena", "verifiedLevel": 3, "score": 96, "activeWorkload": 1 },
    { "specialistId": "usr_marcus", "verifiedLevel": 2, "score": 91, "activeWorkload": 0 }
  ]
}`,
  },
  {
    number: "04",
    tabLabel: "Step 4 — Top-five dispatch",
    title: "Top-Five Parallel Offer Wave & Atomic First-Accept Locking",
    phase: "Offer Broadcast",
    actor: "OfferDispatchService",
    endpoint: "POST /api/v1/tasks/:id/dispatch-offers",
    description:
      "Instead of a slow single-queue assignment, TrustToPay dispatches expiring offers in parallel to the top 5 ranked specialists. The first eligible specialist to accept claims the task atomically inside a database transaction.",
    invariants: [
      "Up to 5 parallel expiring offers dispatched per batch wave",
      "Atomic transaction lock guarantees exactly one winner and supersedes sibling offers",
      "Expired batches can roll over to the next ranked specialist wave without duplicate assignment",
    ],
    payloadTitle: "Atomic Offer Claim Transaction",
    payloadCode: `{
  "batchNumber": 1,
  "dispatchedCount": 5,
  "acceptedOffer": {
    "offerId": "off_71b9",
    "rank": 1,
    "status": "ACCEPTED",
    "supersededSiblingOffers": 4
  },
  "taskStatus": "REVIEWER_ASSIGNED"
}`,
  },
  {
    number: "05",
    tabLabel: "Step 5 — Human resolves the problem",
    title: "Specialist Submits Code Deliverable & Verbatim Evidence",
    phase: "Human Resolution",
    actor: "Assigned Specialist",
    endpoint: "POST /api/v1/tasks/:id/submit",
    description:
      "The specialist submits a structured conclusion, technical explanation, authoritative HTTPS source with verbatim quoted excerpt, and optional code files or unified git diff patches canonicalized into an immutable SHA-256 artifact.",
    invariants: [
      "Every submission creates a versioned, immutable CodeArtifact with a canonical SHA-256 digest",
      "Path traversal (../), absolute paths, and binary executables are rejected on upload",
      "External URLs must be HTTPS and accompanied by a verbatim quoted excerpt",
    ],
    payloadTitle: "Immutable Code Artifact Submission",
    payloadCode: `{
  "submissionVersion": 1,
  "confidenceScore": 92,
  "artifact": {
    "version": 1,
    "fileCount": 1,
    "sha256Digest": "8f94d2c1b7e04a319c5d7e8b1204f9a3d6c8e1b2a4f09c3d8e7b6a5f4c3b2a10",
    "files": [{ "path": "src/worker-pool.ts", "sizeBytes": 412 }]
  }
}`,
  },
  {
    number: "06",
    tabLabel: "Step 6 — Security review",
    title: "Layered Deterministic + Gemini Security Gate",
    phase: "Security Inspection",
    actor: "SecurityGateService.inspectSubmission",
    endpoint: "POST /api/v1/tasks/:id/verify",
    description:
      "Submitted artifacts pass through a two-layer security gate: first, a deterministic scanner checks for hardcoded secrets, prompt injection, shell execution, and dangerous APIs; second, Gemini evaluates semantic backdoors and risk.",
    invariants: [
      "Deterministic CRITICAL findings fail closed immediately regardless of LLM output",
      "Gemini security gate returns a schema-validated verdict (APPROVE, NEEDS_REVIEW, REJECT)",
      "Sensitive credentials or malicious patches are blocked before verification or agent handback",
    ],
    payloadTitle: "SecurityGateService.inspectSubmission",
    payloadCode: `{
  "service": "SecurityGateService.inspectSubmission",
  "verdict": "APPROVE",
  "riskLevel": "LOW",
  "deterministic": { "verdict": "CLEAN", "findingCount": 0 },
  "gemini": {
    "model": "gemini-2.5-flash",
    "verdict": "APPROVE",
    "confidence": 0.96
  }
}`,
  },
  {
    number: "07",
    tabLabel: "Step 7 — Independent verification",
    title: "Isolated Verification Runner & Acceptance Checklist",
    phase: "Verification & Execution",
    actor: "IsolatedExecutionRunner + VerificationEngine",
    endpoint: "GET /api/v1/tasks/:id",
    description:
      "An independent verification engine checks textual and structural coverage of every acceptance criterion and executes submitted code inside an isolated runner with outbound network disabled, memory caps, and strict timeouts.",
    invariants: [
      "Specialists can never self-approve or verify their own submissions",
      "Isolated execution enforces networkAccess='DISABLED', memory cap, and timeout bounds",
      "Soft risk flags route to NEEDS_MANUAL_REVIEW for explicit administrator sign-off",
    ],
    payloadTitle: "Isolated Verification Run Record",
    payloadCode: `{
  "verificationStatus": "PASSED",
  "checksPassed": 6,
  "checksFailed": 0,
  "executionSummary": {
    "verdict": "PASS",
    "exitCode": 0,
    "durationMs": 142,
    "limits": { "networkAccess": "DISABLED", "maxMemoryMb": 128 }
  }
}`,
  },
  {
    number: "08",
    tabLabel: "Step 8 — AI resumes",
    title: "Signed Agent Handback (X-TrustToPay-Signature) & Session Resumption",
    phase: "Trusted Resumption",
    actor: "AgentHandbackService + SessionController",
    endpoint: "GET /api/v1/tasks/:id/handback + POST /api/v1/sessions/:id/resume",
    description:
      "Once verified, TrustToPay generates an idempotent agent handback payload containing the verified answer, immutable artifact SHA-256 digest, and an HMAC-SHA256 signature header so the AI agent can resume execution with cryptographic proof.",
    invariants: [
      "Signed with X-TrustToPay-Signature (t=<timestamp>,v1=<hmac_sha256>) to prevent tampering",
      "Verified deliverable is preserved for the agent even if a downstream payout requires reconciliation",
      "Idempotency key guarantees safe replay across agent retries",
    ],
    payloadTitle: "Signed Agent Handback Header & Payload",
    payloadCode: `X-TrustToPay-Signature: t=1730284012,v1=5a92f8c3d104e71b92a64c8f10e3b7d2
{
  "taskId": "task_84c1",
  "status": "HANDED_OFF",
  "handoffIdempotencyKey": "handoff_task_84c1_v1",
  "artifact": {
    "version": 1,
    "sha256Digest": "8f94d2c1b7e04a319c5d7e8b1204f9a3d6c8e1b2a4f09c3d8e7b6a5f4c3b2a10"
  }
}`,
  },
  {
    number: "09",
    tabLabel: "Step 9 — Payment workflow",
    title: "Decoupled PayPal Orders v2 Capture & Payouts v1 Settlement",
    phase: "Financial Settlement",
    actor: "PayPalPaymentService + Webhook Reconciler",
    endpoint: "POST /api/v1/payments/tasks/:id/payout",
    description:
      "Funding and payout are strictly decoupled. Requesters fund tasks upfront via PayPal Orders v2 capture; specialist rewards are released via PayPal Payouts v1 only after verification passes and payout consent is confirmed.",
    invariants: [
      "Hard-wired to PayPal Sandbox / labelled simulation — live-money endpoints are unreachable",
      "Server verifies captured minor-unit amounts, currency, and webhook signatures",
      "Unknown or failed payout states require explicit reconciliation before retry",
    ],
    payloadTitle: "POST /api/v1/payments/tasks/:id/payout",
    payloadCode: `POST /api/v1/payments/tasks/:id/payout
{
  "paymentId": "pay_902f1a",
  "type": "PAYOUT",
  "provider": "PAYPAL_SANDBOX",
  "payoutBatchId": "BATCH-7741902",
  "amountDisplay": "$25.00",
  "currency": "USD",
  "status": "COMPLETED"
}`,
  },
];
