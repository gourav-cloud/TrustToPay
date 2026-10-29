# TrustToPay — PRD Gap Analysis Matrix

**Audit Date:** 29 Oct 2026  
**Reference Document:** `TrustToPay_PRD.md` (v1.2)  
**Baseline Test Status:** 64 backend tests passing, 31 frontend tests passing, builds succeeding cleanly.

---

## 1. Executive Summary & Highest-Impact Gaps

The TrustToPay repository contains a well-tested, working prototype with strong security foundations (bcrypt, rate limiting, parameterized queries, origin validation) and an implemented PayPal Sandbox REST client. However, the repository reflects an earlier prototype designed around hardware/USB-C compatibility questions, rather than the PRD's coding/software MVP specification.

### Top 5 Highest-Impact Missing / Unsafe Features:
1. **Self-Reported Skills without Assessment (`UNSAFE`):** Specialist skills are currently created via arbitrary string inputs in `PATCH /api/users/me/payout` with hardcoded `level: 3`. The PRD's mandatory 3-level assessment system (L1 Foundation, L2 Practitioner, L3 Advanced) with sequential unlocking is completely absent.
2. **Missing Parallel Offers & Ranking (`MISSING`):** The system operates as a single global marketplace pool (`scope=available`). There is no multi-signal ranking algorithm, no `TaskOffer` model, and no parallel broadcast to the top five eligible specialists with expiring acceptance windows.
3. **No Code Artifact Pipeline or SHA-256 Hashing (`MISSING`):** Submissions are stored as plain text strings (`answer`, `explanation`, `sourceUrl`). There is no support for code patches/diffs, file archives, path traversal guards, or cryptographic SHA-256 artifact hashing.
4. **Missing Official Gemini Security Gate (`MISSING` / `SIMULATED`):** `@google/genai` is not installed. AI analysis is currently restricted to pre-task question escalation using OpenAI-compatible endpoints or a rule-based USB-C wattage checker (`demoEngine.ts`). Pre-submission security scanning (Gitleaks/Semgrep) and fail-closed semantic code review are missing.
5. **No Isolated Execution Runner (`MISSING`):** There is no containerized or sandboxed runner to execute unit/acceptance tests against submitted code. Currently, "verification" is a heuristic text-regex evaluator (`backend/src/services/verification.ts`).

---

## 2. Requirement-by-Requirement Gap Matrix

Status Legend:
- `IMPLEMENTED`: Fully meets PRD specification with test evidence.
- `PARTIAL`: Core logic present, but misses key PRD acceptance criteria.
- `MISSING`: No implementation exists in the codebase.
- `BROKEN`: Code exists but fails, errors, or does not function as intended.
- `UNSAFE`: Exists but introduces security vulnerabilities, bypasses, or data risks.
- `SIMULATED`: Intentionally mock or placeholder behavior.
- `UNKNOWN`: Insufficient evidence to determine.

| PRD Section | Requirement Summary | Status | Code Evidence | Risk / Severity | Dependencies | Proposed Fix | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Sec 1 & 2** | MVP Scope: Software/coding tasks only (retire USB-C hardware logic) | `PARTIAL` | `backend/src/lib/categories.ts:9`, `backend/src/services/ai/demoEngine.ts:36-100` | Medium (Confusing domain logic) | None | Refactor task categories and demo prompts to specialize on software/coding tasks. | P0 |
| **Sec 3 (P0)** | Repository preservation & test baseline | `IMPLEMENTED` | Root `package.json:17-27`, `vitest.config.ts`, `backend/src/test/*` | None (All 95 tests pass) | None | Preserve working structure, routes, and tests during incremental enhancements. | P0 |
| **Sec 3 (P0)** | Server-side requester / specialist / admin roles & guards | `IMPLEMENTED` | `backend/src/auth/middleware.ts:25-45`, `backend/src/routes/admin.ts:12` | Low | None | Existing role guards are robust; extend to support Agent API tokens. | P0 |
| **Sec 3 (P0)** | Authenticated Agent API, hashed tokens, rate limits, idempotency keys | `PARTIAL` | `backend/src/auth/middleware.ts:7-23`, `backend/src/routes/tasks.ts:93` | High (Agents cannot authenticate without browser cookies) | DB schema | Add `AgentApiKey` model, Bearer token auth in `attachUser`, and `idempotencyKey` on task endpoints. | P0 |
| **Sec 3 (P0/P1)** | 3-Level Skill Assessment System (L1, L2, L3) with sequential unlocking | `UNSAFE` / `MISSING` | `backend/src/routes/users.ts:63-72`, `backend/prisma/schema.prisma:57-69` | Critical (Unverified specialists claim advanced skills freely) | DB schema, migration | Create `Skill`, `AssessmentStage`, `SkillAssessmentAttempt` models; remove self-reported skill creation. | P0 |
| **Sec 3 (P0)** | Multi-factor specialist ranking (level, reliability, response time, rate) | `MISSING` | `backend/src/routes/tasks.ts:208-289` | High (Lacks quality-based specialist selection) | Skills system | Implement `RankingService` computing composite eligibility scores. | P0 |
| **Sec 3 (P0)** | Top-five parallel offer broadcast & expiring acceptance | `MISSING` | `backend/src/routes/tasks.ts:302-376` | High (No parallel offers; open marketplace grab) | Ranking engine, state machine | Add `TaskOffer` model with expiration timestamps, batch broadcast, and decline handling. | P0 |
| **Sec 3 (P0)** | Atomic first-accept concurrency lock | `IMPLEMENTED` | `backend/src/routes/tasks.ts:332-338` (`updateMany` count check + unique index) | Low (Well implemented with DB transaction) | None | Maintain atomic conditional update when assigning from accepted offer. | P0 |
| **Sec 3 (P0)** | Allowed deliverables (diff/patch, files), archive safety, path traversal guards | `MISSING` | `backend/src/routes/tasks.ts:378-384`, `schema.prisma:184-203` | Critical (Arbitrary text only, no code artifact validation) | Storage | Add deliverable validation service rejecting zip-bombs, path traversal (`../`), and executables. | P0 |
| **Sec 3 (P0)** | Immutable artifact versioning with SHA-256 digest binding | `MISSING` | `backend/src/routes/tasks.ts:596-606` | Critical (No cryptographic artifact binding) | Artifact schema | Add `SubmissionArtifact` model storing SHA-256 hash, file manifest, and version number. | P0 |
| **Sec 3 (P0)** | Deterministic pre-scanners (Gitleaks, Semgrep, secret redaction) | `MISSING` | `backend/src/services/verification.ts:1-150` | Critical (Code submitted without secret or syntax checks) | Artifact pipeline | Implement scanner hook running regex secret detectors and structural checks before AI review. | P0 |
| **Sec 3 (P0)** | Official Gemini SDK (`@google/genai`) integration | `MISSING` | `backend/package.json:28-40`, `backend/src/services/ai/provider.ts:64` | High (Uses generic OpenAI completions instead of GenAI) | Dependencies | Install `@google/genai`, configure `GEMINI_API_KEY` and `GEMINI_MODEL`, deprecate legacy provider. | P0 |
| **Sec 3 (P0)** | Fail-closed semantic code review gate with validated JSON output schema | `MISSING` | `backend/src/services/ai/provider.ts:18-32` | Critical (No code safety review; AI analysis is only question routing) | Gemini client | Implement `GeminiCodeReviewService` returning structured `{ verdict, riskLevel, findings }` failing closed. | P0 |
| **Sec 3 (P0)** | Isolated test execution environment (disposable runner or labelled fixture) | `MISSING` | `backend/src/services/verification.ts:104-360` | Critical (Heuristic regex keyword check only; no test runner) | Artifact pipeline | Implement runner adapter with resource/network isolation, or explicit labelled non-executing fixtures. | P0 |
| **Sec 3 (P0)** | Structured handoff of verified artifact back to requesting AI agent | `PARTIAL` | `backend/src/routes/sessions.ts:291-300` | Medium (Manual session resume only) | Agent API | Expose `GET /api/tasks/:id/artifact` and signed webhook callback with SHA-256 digest. | P0 |
| **Sec 3 (P0)** | Decoupled Task Lifecycle vs Financial Ledger | `PARTIAL` | `backend/src/services/stateMachine.ts:10-33` | Medium (Task state machine couples payments like `AWAITING_FUNDING`) | State machine | Decouple task states (`DRAFT`..`COMPLETED`) from payment transactions (`ORDER_CREATED`..`CAPTURED`). | P0 |
| **Sec 3 (P0)** | PayPal Sandbox server-side Orders v2 create & capture | `IMPLEMENTED` | `backend/src/services/paypal/client.ts:306-345`, `backend/src/services/payments.ts:130-220` | Low (Full server-side flow exists) | None | Retain existing working PayPal client and routes. | P0 |
| **Sec 3 (P0)** | PayPal Webhook signature verification and deduplication | `IMPLEMENTED` | `backend/src/services/webhooks.ts:102-150`, `backend/src/services/paypal/client.ts:426-463` | Low (Uses official `/v1/notifications/verify-webhook-signature`) | None | Retain existing webhook verification service. | P0 |
| **Sec 3 (P0)** | India PayPal Payouts constraint (Receive-only; simulate/label demo) | `IMPLEMENTED` / `SIMULATED` | `backend/src/config.ts:132-137`, `backend/src/services/payments.ts:35-44` | Low (Payouts require explicit opt-in flag; labeled demo) | None | Retain clear UI banner and API guard marking Indian merchant payouts as simulated/unavailable. | P0 |
| **Sec 3 (P0/P1)**| Structured logging and correlation IDs across entire pipeline | `PARTIAL` | `backend/src/lib/audit.ts:1-60`, `backend/src/services/payments.ts:259` | Medium (Task events exist, but lacks end-to-end `correlationId` tracking) | Logger middleware | Introduce `X-Correlation-Id` middleware and propagate across task, review, and payment logs. | P1 |
| **Sec 5 (P0)** | Render deployment configuration (`render.yaml`, persistent DB, worker) | `MISSING` | Root directory | High (Cannot deploy cleanly on Render without Blueprint) | None | Create `render.yaml` with Web Service, PostgreSQL/persistent disk, health check, and env mapping. | P0 |

---

## 3. High-Priority Remediation Plan

To bring the codebase to full PRD compliance without breaking working features:
1. **Model & State Decoupling:** Introduce `Skill`, `AssessmentStage`, `TaskOffer`, `SubmissionArtifact`, and `AgentApiKey` in Prisma, while decoupling task status from payment state.
2. **Three-Level Assessment Engine:** Seed standard technical coding skills with L1-L3 tests, and lock specialist assignment to verified skill tags.
3. **Offer Engine:** Replace the open marketplace with top-5 parallel expiring offers and atomic claim resolution.
4. **Code Artifact & Security Pipeline:** Add file/patch submission with SHA-256 calculation, deterministic secret scanners, and an official `@google/genai` semantic gate.
5. **Execution Boundary:** Add an isolated runner (or labelled non-executing fixture) and structured agent callback handoff.
6. **Deployment Blueprint:** Add `render.yaml` and PostgreSQL compatibility for Render deployment.
