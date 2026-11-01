# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Requester / AI agent operators:** builders running autonomous agents in production who hit ambiguous specs, conflicting evidence, or high-risk code paths and cannot let the agent guess.
- **Verified human specialists:** engineers and domain experts who pass sequential L1–L3 skill assessments and resolve bounded, funded tasks for a reward.
- **Administrators:** operators who review security verdicts, specialist badges, offer waves, and the payment ledger.

## Product Purpose

TrustToPay unblocks autonomous AI agents by routing their uncertain moments to verified humans. It packages the blocker into a bounded task, escrows the reward, matches a qualified specialist, verifies the submitted evidence with deterministic and Gemini security gates plus an isolated execution runner, settles the reward through PayPal Sandbox, and returns a cryptographically signed handback so the agent can resume safely. Success means the agent never has to guess on a high-risk decision, and the human is paid only for verified work.

## Positioning

The product is not a freelance marketplace or a generic human-review queue. It is a server-enforced state machine that combines confidence-triggered escalation, L1–L3 skill verification, atomic first-accept offer waves, multi-layer security review, isolated execution, escrowed payment, and an HMAC-signed agent handback in one protocol.

## Operating Context

- Autonomous agents integrate over the versioned REST API (`/api/v1`) with scoped bearer keys and idempotency keys.
- Requesters fund tasks up front through PayPal Orders v2; rewards settle through PayPal Payouts v1 after verification.
- Specialists work in a role-scoped marketplace/workbench, claim expiring offers, and submit immutable SHA-256 code artifacts or unified diffs.
- Administrators use AG Grid Community tables and an Elastic hybrid discovery tester to operate the platform.
- Local development runs in demo mode with simulated payments, seeded demo scenarios, and SQLite; no credentials are required.

## Capabilities and Constraints

- Confidence-triggered escalation with a server-enforced threshold; critical conflicts always escalate.
- Sequential L1 → L2 → L3 skill assessments; specialists cannot self-approve.
- Elasticsearch hybrid (Jina embeddings + BM25) specialist discovery, revalidated against PostgreSQL as source of truth, with relational fallback.
- Top-five parallel expiring offer waves with atomic first-accept locking.
- Deterministic secret/injection scanner plus Gemini security review; isolated runner with network disabled and memory/time limits.
- Immutable artifact versioning with SHA-256 digests and HMAC-SHA256 signed handbacks.
- PayPal Sandbox only; live-money endpoints are unreachable. Demo mode is the default and payments are clearly labelled as simulated.
- Stack: React 18 + Vite + Tailwind frontend; Node 20+ Express backend; Prisma + SQLite.
- Backend processing, API contracts, state machine, and payment logic are out of scope for visual work and must not change.

## Brand Commitments

- Name: **TrustToPay**. Tagline space: human-in-the-loop escalation and verified handoff for AI agents.
- The geometric logo mark in `src/components/layout/public-layout.tsx` (two trajectories converging on a verification node) is preserved.
- Voice: precise, technical, trustworthy, quietly confident. No hype, no fabricated social proof.
- Marketing headlines and CTA copy may be rewritten; all technical claims, numbers, endpoints, and product facts must remain accurate.

## Evidence on Hand

- Working application with seeded demo scenarios (A–J), demo accounts, and simulated payments.
- Real API routes, payloads, state names, and security invariants as described in the codebase and OpenAPI spec.
- No customer logos, testimonials, benchmarks, press, or pricing claims exist. Future work must not fabricate them.
- Demo payments must stay visibly labelled as simulated; PayPal is Sandbox-only.

## Product Principles

1. **Prove, don't claim.** Show the protocol working with real routes, states, artifacts, and signatures.
2. **Trust is the interface.** Every surface should make verification, escrow, and provenance legible.
3. **Human judgement has value.** The specialist is a credentialed professional, not a fallback button.
4. **No invented evidence.** Never manufacture customers, numbers, or endorsements.
5. **The machine stays accountable.** Every handoff is signed, versioned, and replay-safe.
