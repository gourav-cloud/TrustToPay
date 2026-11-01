import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Bot,
  CheckCircle2,
  Code2,
  Cpu,
  CreditCard,
  Database,
  FileCheck2,
  FileCode2,
  KeyRound,
  Layers,
  Lock,
  Pause,
  Play,
  Send,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Users,
  Wallet,
  Workflow,
} from "lucide-react";
import { PublicHeader, MarketingFooter } from "@/components/layout/public-layout";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type HeroStage = {
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

const HERO_STAGES: HeroStage[] = [
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

type WorkflowStep = {
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

const WORKFLOW_STEPS: WorkflowStep[] = [
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

type WorkspacePreviewKey = "requester" | "specialist" | "admin";

export default function LandingPage() {
  const { user } = useAuth();
  const [heroStageIdx, setHeroStageIdx] = useState(0);
  const [isPlayingHero, setIsPlayingHero] = useState(true);
  const [activeWorkflowIdx, setActiveWorkflowIdx] = useState(0);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspacePreviewKey>("requester");

  useEffect(() => {
    if (!isPlayingHero) return;
    const timer = window.setInterval(() => {
      setHeroStageIdx((current) => (current + 1) % HERO_STAGES.length);
    }, 4800);
    return () => window.clearInterval(timer);
  }, [isPlayingHero]);

  const currentHero = HERO_STAGES[heroStageIdx];
  const currentWorkflow = WORKFLOW_STEPS[activeWorkflowIdx];

  return (
    <div className="min-h-dvh bg-[#080C14] text-[#F1F5F9] selection:bg-[#3B82F6]/30 selection:text-white">
      <PublicHeader />

      <main>
        {/* 1. HERO SECTION */}
        <section className="relative overflow-hidden border-b border-[#1E2B42] pt-10 pb-16 lg:pt-16 lg:pb-24">
          <div className="surface-grid-dark pointer-events-none absolute inset-0 opacity-55" aria-hidden />
          <div
            className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-[#3B82F6]/[0.07] blur-3xl"
            aria-hidden
          />

          <div className="container relative z-10">
            <div className="grid items-start gap-10 lg:grid-cols-[1.02fr_1.18fr] lg:gap-12">
              {/* Left editorial column */}
              <div className="max-w-2xl pt-2">
                <div className="inline-flex items-center gap-2 text-xs font-medium text-[#94A3B8]">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3B82F6]">
                    Human-in-the-Loop Infrastructure
                  </span>
                  <span aria-hidden="true" className="text-[#64748B]">
                    ·
                  </span>
                  <span>Verified Escalation &amp; Settlement</span>
                </div>

                <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight text-[#F1F5F9] sm:text-5xl lg:text-[3.35rem]">
                  Give your AI agents a human when they need one.
                </h1>

                <p className="mt-4 font-display text-lg font-medium text-[#CBD5E1]">
                  AI doesn&apos;t have to solve everything alone.
                </p>

                <p className="mt-3 text-base leading-7 text-[#94A3B8]">
                  When an AI agent gets stuck on conflicting evidence, ambiguous specifications, or high-risk code,
                  TrustToPay matches a verified human specialist, runs deterministic and Gemini security gates in
                  isolation, settles rewards via PayPal, and returns a cryptographically signed handoff.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Button asChild size="lg" className="bg-[#3B82F6] text-white hover:bg-[#2563EB]">
                    <Link to={user ? "/app" : "/register"}>
                      {user ? "Open Workspace" : "Get Started"} <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="border-[#1E2B42] bg-[#0E1522] text-[#F1F5F9] hover:bg-[#151E2E]"
                  >
                    <a href="#how-it-works">Explore 9-Step Protocol</a>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="ghost"
                    className="text-[#94A3B8] hover:bg-[#151E2E] hover:text-[#F1F5F9]"
                  >
                    <Link to="/app/docs">Documentation</Link>
                  </Button>
                </div>

                {/* Unboxed architectural metadata strip */}
                <div className="mt-10 grid grid-cols-3 gap-4 border-t border-[#1E2B42] pt-6">
                  <div>
                    <p className="font-mono text-xs font-semibold text-[#F1F5F9]">Elastic + PG</p>
                    <p className="mt-1 text-xs leading-5 text-[#94A3B8]">
                      Hybrid semantic discovery with relational L1–L3 revalidation
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-xs font-semibold text-[#10B981]">SHA-256 + Gemini</p>
                    <p className="mt-1 text-xs leading-5 text-[#94A3B8]">
                      Deterministic secret scan, Gemini gate &amp; isolated runner
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-xs font-semibold text-[#3B82F6]">PayPal + HMAC</p>
                    <p className="mt-1 text-xs leading-5 text-[#94A3B8]">
                      Decoupled Orders v2 escrow, Payouts v1 &amp; signed handback
                    </p>
                  </div>
                </div>
              </div>

              {/* Right interactive 6-stage Hero Product Illustration */}
              <div
                className="rounded-xl border border-[#1E2B42] bg-[#0E1522] shadow-2xl"
                aria-label="Interactive AI-to-human escalation lifecycle preview"
              >
                {/* Window top bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2B42] bg-[#0B101B] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-[#EF4444]/70" aria-hidden />
                    <span className="size-2.5 rounded-full bg-[#F59E0B]/70" aria-hidden />
                    <span className="size-2.5 rounded-full bg-[#10B981]/70" aria-hidden />
                    <span className="ml-2 font-mono text-[11px] font-medium text-[#94A3B8]">
                      trusttopay://lifecycle-orchestrator
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-[#64748B]">
                      Stage {currentHero.index} of {HERO_STAGES.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsPlayingHero((prev) => !prev)}
                      className="inline-flex items-center gap-1 rounded border border-[#1E2B42] bg-[#151E2E] px-2 py-1 font-mono text-[10px] text-[#94A3B8] transition-colors hover:border-[#2A3B59] hover:text-[#F1F5F9]"
                      aria-label={isPlayingHero ? "Pause stage animation" : "Play stage animation"}
                    >
                      {isPlayingHero ? <Pause className="size-3" /> : <Play className="size-3" />}
                      {isPlayingHero ? "Auto" : "Paused"}
                    </button>
                  </div>
                </div>

                {/* 6-Stage pipeline selector */}
                <div className="grid grid-cols-2 gap-1 border-b border-[#1E2B42] bg-[#080C14]/60 p-2 sm:grid-cols-3">
                  {HERO_STAGES.map((stage, idx) => {
                    const active = idx === heroStageIdx;
                    return (
                      <button
                        key={stage.index}
                        type="button"
                        onClick={() => {
                          setHeroStageIdx(idx);
                          setIsPlayingHero(false);
                        }}
                        className={cn(
                          "flex items-center justify-between rounded-md px-2.5 py-2 text-left font-mono text-[11px] transition-colors",
                          active
                            ? "border border-[#3B82F6]/50 bg-[#151E2E] font-semibold text-[#F1F5F9]"
                            : "border border-transparent text-[#64748B] hover:bg-[#151E2E]/50 hover:text-[#94A3B8]",
                        )}
                      >
                        <span className="truncate">{stage.shortTitle}</span>
                        {idx < heroStageIdx ? (
                          <CheckCircle2 className="ml-1.5 size-3 shrink-0 text-[#10B981]" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                {/* Active stage telemetry card */}
                <div className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p
                        className={cn(
                          "font-mono text-[11px] font-semibold uppercase tracking-wider",
                          currentHero.tone === "amber"
                            ? "text-[#F59E0B]"
                            : currentHero.tone === "emerald"
                              ? "text-[#10B981]"
                              : "text-[#3B82F6]",
                        )}
                      >
                        {currentHero.statusTag}
                      </p>
                      <h2 className="mt-1 font-display text-lg font-bold text-[#F1F5F9]">{currentHero.title}</h2>
                    </div>
                    <code className="rounded border border-[#1E2B42] bg-[#080C14] px-2.5 py-1 font-mono text-[11px] text-[#94A3B8]">
                      {currentHero.endpoint}
                    </code>
                  </div>

                  <p className="text-xs leading-5 text-[#94A3B8]">{currentHero.summary}</p>

                  {/* 3 key stage metrics */}
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    {currentHero.metrics.map((metric) => (
                      <div
                        key={metric.label}
                        className="rounded-lg border border-[#1E2B42] bg-[#080C14] px-3 py-2.5"
                      >
                        <p className="font-mono text-[10px] uppercase tracking-wider text-[#64748B]">
                          {metric.label}
                        </p>
                        <p className="mt-1 font-mono text-xs font-semibold text-[#F1F5F9]">{metric.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Live protocol stream */}
                  <div className="rounded-lg border border-[#1E2B42] bg-[#060910] p-3.5 font-mono text-xs">
                    <div className="mb-2 flex items-center justify-between border-b border-[#1E2B42]/80 pb-2 text-[10px] text-[#64748B]">
                      <span>ACTOR: {currentHero.actor}</span>
                      <span>PROTOCOL STREAM</span>
                    </div>
                    <div className="space-y-1.5 leading-5">
                      {currentHero.terminalLines.map((line, i) => (
                        <div key={i} className="flex gap-2.5">
                          <span className="shrink-0 select-none text-[#64748B]">{line.prefix}</span>
                          <span
                            className={cn(
                              "break-words",
                              line.highlight === "amber"
                                ? "text-[#FBBF24]"
                                : line.highlight === "emerald"
                                  ? "text-[#34D399]"
                                  : line.highlight === "blue"
                                    ? "text-[#60A5FA]"
                                    : "text-[#CBD5E1]",
                            )}
                          >
                            {line.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. COMPLETE WORKFLOW EXPLANATION (#how-it-works) */}
        <section id="how-it-works" className="scroll-mt-20 border-b border-[#1E2B42] py-16 lg:py-24">
          <div className="container">
            <div className="max-w-3xl">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3B82F6]">
                End-to-End Execution Protocol
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#F1F5F9] sm:text-4xl">
                How TrustToPay orchestrates AI-to-human delegation
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#94A3B8]">
                Every task follows a strict, server-enforced state machine. Select any step below to inspect the exact
                inputs, security invariants, API routes, and structured payloads enforced by the platform.
              </p>
            </div>

            <div className="mt-10 grid gap-6 lg:grid-cols-[0.95fr_1.25fr]">
              {/* Left step selector list */}
              <div
                role="tablist"
                aria-label="TrustToPay 9-step workflow"
                className="flex flex-col gap-1.5"
              >
                {WORKFLOW_STEPS.map((step, idx) => {
                  const isSelected = idx === activeWorkflowIdx;
                  return (
                    <button
                      key={step.tabLabel}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => setActiveWorkflowIdx(idx)}
                      className={cn(
                        "group flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors",
                        isSelected
                          ? "border-[#3B82F6] bg-[#151E2E] text-[#F1F5F9]"
                          : "border-[#1E2B42] bg-[#0E1522] text-[#94A3B8] hover:border-[#2A3B59] hover:text-[#F1F5F9]",
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={cn(
                            "font-mono text-xs font-bold",
                            isSelected ? "text-[#3B82F6]" : "text-[#64748B]",
                          )}
                        >
                          {step.number}
                        </span>
                        <span className="truncate text-xs font-semibold">{step.tabLabel}</span>
                      </div>
                      <span className="ml-2 shrink-0 font-mono text-[10px] text-[#64748B] group-hover:text-[#94A3B8]">
                        {step.phase}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Right synchronized telemetry inspector */}
              <div className="rounded-xl border border-[#1E2B42] bg-[#0E1522] p-6 lg:p-8">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2B42] pb-4">
                  <div>
                    <span className="font-mono text-xs font-semibold text-[#3B82F6]">
                      {currentWorkflow.tabLabel}
                    </span>
                    <h3 className="mt-1 font-display text-xl font-bold text-[#F1F5F9]">
                      {currentWorkflow.title}
                    </h3>
                  </div>
                  <code className="rounded border border-[#1E2B42] bg-[#080C14] px-2.5 py-1 font-mono text-xs text-[#94A3B8]">
                    {currentWorkflow.endpoint}
                  </code>
                </div>

                <p className="mt-4 text-sm leading-6 text-[#94A3B8]">{currentWorkflow.description}</p>

                <div className="mt-6">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#CBD5E1]">
                    Enforced Server Invariants
                  </p>
                  <ul className="mt-2.5 space-y-2">
                    {currentWorkflow.invariants.map((inv) => (
                      <li key={inv} className="flex items-start gap-2.5 text-xs leading-5 text-[#94A3B8]">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#10B981]" />
                        <span>{inv}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6">
                  <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-[#1E2B42] bg-[#080C14] px-4 py-2">
                    <span className="font-mono text-[11px] font-medium text-[#94A3B8]">
                      {currentWorkflow.payloadTitle}
                    </span>
                    <span className="font-mono text-[10px] text-[#64748B]">{currentWorkflow.actor}</span>
                  </div>
                  <pre className="overflow-x-auto rounded-b-lg border border-[#1E2B42] bg-[#060910] p-4 font-mono text-xs leading-5 text-[#E2E8F0]">
                    <code>{currentWorkflow.payloadCode}</code>
                  </pre>
                </div>

                {/* All 9 step titles rendered for screen-reader & test discoverability */}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-[#1E2B42] pt-4">
                  <span className="text-xs text-[#64748B]">
                    Step {activeWorkflowIdx + 1} of {WORKFLOW_STEPS.length}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={activeWorkflowIdx === 0}
                      onClick={() => setActiveWorkflowIdx((i) => Math.max(0, i - 1))}
                    >
                      Previous step
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={activeWorkflowIdx === WORKFLOW_STEPS.length - 1}
                      onClick={() => setActiveWorkflowIdx((i) => Math.min(WORKFLOW_STEPS.length - 1, i + 1))}
                    >
                      Next step
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. PRODUCT & WORKSPACE PREVIEWS (#product) */}
        <section id="product" className="scroll-mt-20 border-b border-[#1E2B42] py-16 lg:py-24">
          <div className="container">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <div className="max-w-2xl">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3B82F6]">
                  Role-Scoped Workspaces
                </p>
                <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#F1F5F9] sm:text-4xl">
                  Purpose-built interfaces for operators, specialists, and administrators
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#94A3B8]">
                  TrustToPay separates agent escalation controls, specialist code &amp; evidence workbenches, and AG
                  Grid / Elastic administrative operations into dedicated role-enforced workspaces.
                </p>
              </div>

              {/* Workspace switcher */}
              <div className="inline-flex flex-wrap gap-1 rounded-lg border border-[#1E2B42] bg-[#0E1522] p-1">
                {[
                  { id: "requester" as const, label: "Requester Console", icon: Bot },
                  { id: "specialist" as const, label: "Specialist Workbench", icon: Code2 },
                  { id: "admin" as const, label: "Admin Operations (AG Grid)", icon: Layers },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const active = activeWorkspace === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveWorkspace(tab.id)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors",
                        active
                          ? "bg-[#151E2E] text-[#F1F5F9] shadow-sm"
                          : "text-[#94A3B8] hover:text-[#F1F5F9]",
                      )}
                    >
                      <Icon className="size-3.5 text-[#3B82F6]" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Workspace Screen Preview */}
            <div className="mt-8 rounded-xl border border-[#1E2B42] bg-[#0E1522] p-6 lg:p-8">
              {activeWorkspace === "requester" ? (
                <div className="grid gap-8 lg:grid-cols-[1fr_1.35fr]">
                  <div className="space-y-4">
                    <p className="font-mono text-xs font-semibold uppercase tracking-wider text-[#3B82F6]">
                      01 · Requester &amp; Agent Operator Workspace
                    </p>
                    <h3 className="font-display text-2xl font-bold text-[#F1F5F9]">
                      Monitor agent confidence, fund escalations, and verify handbacks
                    </h3>
                    <p className="text-sm leading-6 text-[#94A3B8]">
                      Submit technical questions or connect autonomous agents via bearer API keys. When an analysis run
                      identifies conflicting specifications, fund a bounded review via PayPal Orders v2 and resume the
                      agent session once independent verification passes.
                    </p>
                    <ul className="space-y-2.5 pt-2 text-xs text-[#CBD5E1]">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-[#10B981]" />
                        Deterministic conflict detection &amp; explicit escalation thresholds
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-[#10B981]" />
                        Upfront PayPal Orders v2 reward funding before marketplace dispatch
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-[#10B981]" />
                        Cryptographically signed <code className="font-mono">X-TrustToPay-Signature</code> agent
                        handback
                      </li>
                    </ul>
                    <div className="pt-3">
                      <Button asChild size="sm">
                        <Link to={user ? "/app/workspace" : "/register"}>
                          Open Agent Workspace <ArrowRight className="size-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#1E2B42] bg-[#080C14] p-4 font-mono text-xs">
                    <div className="flex items-center justify-between border-b border-[#1E2B42] pb-3 text-[11px] text-[#94A3B8]">
                      <span>SESSION · Worker Pool Concurrency &amp; AbortController Timeout</span>
                      <span className="text-[#F59E0B]">ESCALATE_TO_HUMAN</span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded border border-[#1E2B42] bg-[#0E1522] p-3">
                        <p className="text-[10px] text-[#64748B]">CONFIDENCE</p>
                        <p className="mt-1 text-base font-bold text-[#F59E0B]">41%</p>
                        <p className="text-[10px] text-[#64748B]">Threshold: 75%</p>
                      </div>
                      <div className="rounded border border-[#1E2B42] bg-[#0E1522] p-3">
                        <p className="text-[10px] text-[#64748B]">ESCROW FUNDING</p>
                        <p className="mt-1 text-base font-bold text-[#10B981]">$25.00 USD</p>
                        <p className="text-[10px] text-[#64748B]">PayPal Orders v2</p>
                      </div>
                      <div className="rounded border border-[#1E2B42] bg-[#0E1522] p-3">
                        <p className="text-[10px] text-[#64748B]">HANDBACK DIGEST</p>
                        <p className="mt-1 truncate text-xs font-bold text-[#3B82F6]">sha256:8f94d2c1…</p>
                        <p className="text-[10px] text-[#64748B]">HMAC-SHA256 Signed</p>
                      </div>
                    </div>
                    <div className="mt-3 rounded border border-[#1E2B42] bg-[#0E1522] p-3 text-[11px] leading-5 text-[#94A3B8]">
                      <p className="font-semibold text-[#F1F5F9]">Critical Conflict Flagged</p>
                      <p className="mt-1">
                        Source A (<code className="text-[#F1F5F9]">src/worker-pool.ts</code>) configures 4 workers with
                        no request timeout; Source B (<code className="text-[#F1F5F9]">runbook.md</code>) requires 12
                        workers and a 30s <code className="text-[#F1F5F9]">AbortController</code> bound.
                      </p>
                    </div>
                  </div>
                </div>
              ) : activeWorkspace === "specialist" ? (
                <div className="grid gap-8 lg:grid-cols-[1fr_1.35fr]">
                  <div className="space-y-4">
                    <p className="font-mono text-xs font-semibold uppercase tracking-wider text-[#10B981]">
                      02 · Specialist Marketplace &amp; Workbench
                    </p>
                    <h3 className="font-display text-2xl font-bold text-[#F1F5F9]">
                      Earn L1–L3 skill badges, claim top-five offers, and submit verified code artifacts
                    </h3>
                    <p className="text-sm leading-6 text-[#94A3B8]">
                      Specialists unlock sequential Foundation (L1), Practitioner (L2), and Advanced (L3) badges by
                      passing timed technical assessments. Claim funded tasks atomically, upload code files or unified
                      git diffs, and track PayPal Payouts in real time.
                    </p>
                    <ul className="space-y-2.5 pt-2 text-xs text-[#CBD5E1]">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-[#10B981]" />
                        Sequential L1 → L2 → L3 skill verification tracks (no self-reported badges)
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-[#10B981]" />
                        Top-5 parallel offer wave with atomic first-accept locking
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-[#10B981]" />
                        Immutable SHA-256 code artifact &amp; unified git diff submission workbench
                      </li>
                    </ul>
                    <div className="pt-3">
                      <Button asChild size="sm">
                        <Link to={user ? "/app/marketplace" : "/register"}>
                          Explore Specialist Workbench <ArrowRight className="size-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#1E2B42] bg-[#080C14] p-4 font-mono text-xs">
                    <div className="flex items-center justify-between border-b border-[#1E2B42] pb-3 text-[11px] text-[#94A3B8]">
                      <span>SPECIALIST OFFER · Batch #1 · Rank #1 (96 pts)</span>
                      <span className="text-[#10B981]">L3 VERIFIED · $25.00 USD</span>
                    </div>
                    <div className="mt-3 rounded border border-[#1E2B42] bg-[#0E1522] p-3">
                      <p className="text-[11px] font-semibold text-[#F1F5F9]">
                        Artifact v1 · src/worker-pool.ts (SHA-256: 8f94d2c1b7e04a31…)
                      </p>
                      <pre className="mt-2 overflow-x-auto text-[11px] leading-5 text-[#34D399]">
                        <code>{`+ const controller = new AbortController();
+ const timer = setTimeout(() => controller.abort(), 30_000);
+ try {
+   return await fetch(job.endpoint, { signal: controller.signal });
+ } finally {
+   clearTimeout(timer);
+ }`}</code>
                      </pre>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-[#1E2B42] bg-[#0E1522] px-3 py-2 text-[11px] text-[#94A3B8]">
                      <span>Security Gate: CLEAN · Gemini: APPROVE</span>
                      <span className="text-[#10B981]">Isolated Runner: PASS (Exit 0)</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-8 lg:grid-cols-[1fr_1.35fr]">
                  <div className="space-y-4">
                    <p className="font-mono text-xs font-semibold uppercase tracking-wider text-[#3B82F6]">
                      03 · Admin Operations Console (AG Grid + Elastic)
                    </p>
                    <h3 className="font-display text-2xl font-bold text-[#F1F5F9]">
                      High-density operational telemetry with AG Grid Community &amp; Elastic search
                    </h3>
                    <p className="text-sm leading-6 text-[#94A3B8]">
                      Inspect specialists, task offer waves, deterministic and Gemini security verdicts, L1–L3
                      assessment attempts, and the read-only PayPal payment ledger with sorting, filtering, quick
                      search, and CSV export.
                    </p>
                    <ul className="space-y-2.5 pt-2 text-xs text-[#CBD5E1]">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-[#10B981]" />
                        5 AG Grid Community operational tables with instant CSV export
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-[#10B981]" />
                        Live Elastic hybrid discovery tester &amp; index synchronization controls
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-[#10B981]" />
                        Strictly read-only financial ledger with explicit provider reconciliation
                      </li>
                    </ul>
                    <div className="pt-3">
                      <Button asChild size="sm">
                        <Link to={user ? "/app/admin" : "/login"}>
                          Open Admin Console <ArrowRight className="size-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#1E2B42] bg-[#080C14] p-4 font-mono text-xs">
                    <div className="flex items-center justify-between border-b border-[#1E2B42] pb-3 text-[11px] text-[#94A3B8]">
                      <span>AG GRID COMMUNITY · Security &amp; Verification Telemetry</span>
                      <span className="text-[#3B82F6]">ELASTIC HYBRID SYNCED</span>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="border-b border-[#1E2B42] text-[#64748B]">
                          <tr>
                            <th className="pb-2 pr-3">ARTIFACT SHA-256</th>
                            <th className="pb-2 pr-3">SCANNER</th>
                            <th className="pb-2 pr-3">GEMINI GATE</th>
                            <th className="pb-2 pr-3">RUNNER</th>
                            <th className="pb-2">STATUS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1E2B42]/60 text-[#CBD5E1]">
                          <tr>
                            <td className="py-2 pr-3">8f94d2c1b7e0…</td>
                            <td className="py-2 pr-3 text-[#10B981]">CLEAN (0)</td>
                            <td className="py-2 pr-3 text-[#10B981]">APPROVE</td>
                            <td className="py-2 pr-3 text-[#10B981]">PASS (0)</td>
                            <td className="py-2 text-[#10B981]">PASSED</td>
                          </tr>
                          <tr>
                            <td className="py-2 pr-3">3c19a7e402b1…</td>
                            <td className="py-2 pr-3 text-[#F59E0B]">REVIEW (1)</td>
                            <td className="py-2 pr-3 text-[#F59E0B]">NEEDS_REVIEW</td>
                            <td className="py-2 pr-3 text-[#10B981]">PASS (0)</td>
                            <td className="py-2 text-[#F59E0B]">MANUAL_REVIEW</td>
                          </tr>
                          <tr>
                            <td className="py-2 pr-3">d041e8f9a11c…</td>
                            <td className="py-2 pr-3 text-[#EF4444]">BLOCK (2)</td>
                            <td className="py-2 pr-3 text-[#EF4444]">REJECT</td>
                            <td className="py-2 pr-3 text-[#64748B]">SKIPPED</td>
                            <td className="py-2 text-[#EF4444]">REJECTED</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 4. FOR DEVELOPERS & CRYPTOGRAPHIC HANDBACK (#developers) */}
        <section id="developers" className="scroll-mt-20 border-b border-[#1E2B42] py-16 lg:py-24">
          <div className="container">
            <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.15fr]">
              <div className="space-y-4">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3B82F6]">
                  For Developers &amp; Agent Builders
                </p>
                <h2 className="font-display text-3xl font-bold tracking-tight text-[#F1F5F9] sm:text-4xl">
                  Integrate human escalation and signed handbacks in minutes
                </h2>
                <p className="text-sm leading-6 text-[#94A3B8]">
                  Authenticate autonomous agents with scoped <code className="font-mono text-xs text-[#F1F5F9]">ttp_ak_…</code>{" "}
                  bearer keys or session tokens. Verify every human deliverable with{" "}
                  <code className="font-mono text-xs text-[#F1F5F9]">X-TrustToPay-Signature</code> before applying
                  patches or resuming execution.
                </p>

                <div className="space-y-3 pt-2">
                  {[
                    {
                      icon: Terminal,
                      title: "Versioned REST API (/api/v1) & OpenAPI Spec",
                      detail: "Structured JSON responses, idempotent task and payment endpoints, and live Swagger docs at /api-docs.",
                    },
                    {
                      icon: ShieldCheck,
                      title: "Cryptographic Artifact & Handback Integrity",
                      detail: "Canonical SHA-256 digests over submitted files and unified diffs, signed with HMAC-SHA256.",
                    },
                    {
                      icon: Database,
                      title: "Elastic Hybrid Search with Relational Fallback",
                      detail: "Uses @elastic/elasticsearch for semantic + keyword specialist retrieval while preserving DB constraints.",
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.title}
                        className="flex items-start gap-3 rounded-lg border border-[#1E2B42] bg-[#0E1522] p-4"
                      >
                        <Icon className="mt-0.5 size-4 shrink-0 text-[#3B82F6]" />
                        <div>
                          <h3 className="text-xs font-semibold text-[#F1F5F9]">{item.title}</h3>
                          <p className="mt-1 text-xs leading-5 text-[#94A3B8]">{item.detail}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-3 pt-3">
                  <Button asChild variant="outline">
                    <Link to="/app/docs">
                      Read Technical Documentation <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="ghost">
                    <a href="/api-docs" target="_blank" rel="noreferrer">
                      OpenAPI / Swagger Spec
                    </a>
                  </Button>
                </div>
              </div>

              {/* Developer code integration preview */}
              <div className="rounded-xl border border-[#1E2B42] bg-[#0E1522] overflow-hidden shadow-xl">
                <div className="flex items-center justify-between border-b border-[#1E2B42] bg-[#0B101B] px-4 py-3 font-mono text-xs text-[#94A3B8]">
                  <span>verify-handback.ts · Agent Resumption Verification</span>
                  <span className="text-[#10B981]">HMAC-SHA256</span>
                </div>
                <pre className="overflow-x-auto bg-[#060910] p-5 font-mono text-xs leading-6 text-[#E2E8F0]">
                  <code>{`import crypto from "node:crypto";

// 1. Fetch the verified specialist handback payload
const res = await fetch(\`https://trusttopay.internal/api/v1/tasks/\${taskId}/handback\`, {
  headers: { Authorization: \`Bearer \${process.env.TTP_AGENT_API_KEY}\` },
});

const signatureHeader = res.headers.get("x-trusttopay-signature") ?? "";
const rawBody = await res.text();

// 2. Verify X-TrustToPay-Signature (t=<timestamp>,v1=<hmac>)
const [tPart, v1Part] = signatureHeader.split(",");
const timestamp = tPart.replace("t=", "");
const expectedHmac = crypto
  .createHmac("sha256", process.env.TTP_HANDBACK_SECRET!)
  .update(\`\${timestamp}.\${rawBody}\`)
  .digest("hex");

if (!crypto.timingSafeEqual(Buffer.from(v1Part.replace("v1=", "")), Buffer.from(expectedHmac))) {
  throw new Error("Untrusted handback signature");
}

// 3. Apply verified artifact & resume agent session
const { handback } = JSON.parse(rawBody);
console.log("Verified artifact SHA-256:", handback.artifact.sha256Digest);`}</code>
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* 5. BOTTOM CTA SECTION */}
        <section className="py-16 lg:py-20">
          <div className="container">
            <div className="flex flex-col items-start justify-between gap-6 rounded-xl border border-[#1E2B42] bg-[#0E1522] p-8 sm:flex-row sm:items-center lg:p-10">
              <div className="max-w-xl">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3B82F6]">
                  Ready to Deploy
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#F1F5F9] sm:text-3xl">
                  Start orchestrating verified human escalations for your AI agents.
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
                  Create a requester or specialist account, inspect the live verification and payment ledger, or review
                  the system architecture documentation.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" className="bg-[#3B82F6] text-white hover:bg-[#2563EB]">
                  <Link to={user ? "/app" : "/register"}>
                    {user ? "Go to Workspace" : "Create Account"} <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-[#1E2B42] bg-[#080C14] text-[#F1F5F9] hover:bg-[#151E2E]"
                >
                  <Link to="/login">Sign In</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
