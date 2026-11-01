# TrustToPay — Product Requirements Document & Integration Specification

**Version:** 1.2 · 29 Oct 2026 · **Purpose:** single source of truth for codebase audit, implementation, testing and deployment.  
**MVP focus:** a coding AI delegates a blocker to a qualified human; the result is safety-checked and independently tested; then it is handed back to the AI.  
**Rule:** inspect the actual repository first. Preserve working code. Do not implement or deploy until the audit plan is approved.

## 1. Product and MVP

TrustToPay connects AI agents that are stuck with verified human specialists. An agent submits a bounded task; the platform selects the best eligible humans and sends offers to the top five in parallel. The first eligible human to accept wins through an atomic server-side lock. The submission is versioned, reviewed, tested in isolation, and returned to the requesting agent only after every required gate passes. PayPal Developer Sandbox demonstrates supported payment steps.

**MVP scope:** software/coding tasks only.  
**Not MVP:** universal human-task marketplace, arbitrary code execution in the app server, claims of perfect AI security, legal escrow/custody, live payouts before eligibility is verified, or automatic acceptance of subjective work without appropriate human review.

## 2. Roles and core journey

- **Requester/agent owner:** configures allowed tasks, budget, deadlines and acceptance tests; views status, result and audit trail.
- **Requestor AI agent:** submits authenticated/idempotent tasks; polls or receives a signed callback; cannot bypass safety checks or alter locked terms.
- **Human specialist:** profile, skills and assessment levels; availability/rate controls; accepts/declines timed offers; submits artifact and evidence.
- **Admin/moderator:** manages skills, assessments, flagged tasks, abuse and exceptions. Privileged overrides require a reason and audit log.

**Journey:** detect repeated failure or configured uncertainty → validate/redact task → rank eligible people → offer to top five → atomic first accept → submit immutable artifact → deterministic checks → Gemini semantic security review → isolated tests → hand only verified artifact to requester AI → update separate payment/task states → log events.

## 3. Functional requirements

Priority: **P0** demo-critical; **P1** next iteration; **P2** later.

### P0 — Repository preservation, auth and tasks
- Inventory existing stack, routes, schemas, tests, UI, environment names, integrations and deployment. Record baseline build/test results before edits. Do not rewrite working code just to match a suggested stack.
- Keep existing design/routing where practical. Add migrations and tests; document breaking changes. Never commit secrets.
- Enforce server-side requester/specialist/admin roles and task ownership on all protected operations. Agent APIs need authenticated credentials (store hashed tokens if managed in-app), validation, rate limits and idempotency keys.
- Task payload: title, problem, context, required skill IDs/levels, budget/currency, deadline, allowed deliverables, acceptance criteria/tests, sensitivity label, attachments and idempotency key. Limit size, rates, retries, task count and per-agent spend. Do not escalate every transient error; use retries/backoff and repetition thresholds.

### P0/P1 — Skill assessments
- Each skill has stable ID, description, version and three sequential levels: **L1 Foundation**, **L2 Practitioner**, **L3 Advanced**. One round per level means one assessment stage, possibly with multiple questions and/or practical tasks.
- Passing L1 unlocks L2; passing L2 unlocks L3. Grant only the level actually passed. Store version, date, result, score and attempts. Admin-configurable cooldowns/retake limits; optional documented manual evidence review.
- Prefer task-like practical tests and hidden test cases for technical skills; MCQ-only tests are not enough for practical coding ability. Make assessment rules explainable and versioned.

### P0 — Matching, broadcast and assignment
- Hard filters before ranking: verified required skill levels, account standing, availability, price/budget, workload, task/data access eligibility and policy acceptance.
- Rank transparently using relevant level, outcomes on comparable tasks, revision/verification rate, reliability, response time, workload, rate and applicable timezone/language. Do not use self-reported skills or one opaque rating alone.
- Send expiring offers to the **top five eligible humans in parallel** (or fewer if fewer qualify). Show price/reward, requirements, deadline, deliverable and data sensitivity. Store ranked snapshot and matching reasons for audit.
- First eligible accept wins only via DB transaction/row lock/compare-and-swap; acceptance must be idempotent. Invalidate other offers and notify those candidates. Declines/expiry/no-response trigger next ranked batch or `NO_MATCH`. Prevent spam and avoid unfairly excluding new qualified users.

### P0 — Submission and exact-artifact identity
- Accept only allowed deliverables (e.g. patch/diff, changed files, test results, explanation). Validate type/size/path; limit archive expansion; reject/quarantine traversal, absolute paths, escaping symlinks, unexpected executables and secrets.
- Version submissions as immutable artifacts. Compute SHA-256 over the exact files/metadata reviewed and tested. Any change creates a new version and invalidates prior scans/tests.

### P0 — Layered Gemini security gate
- Server-only service using official SDK for the real backend: JS/TS `@google/genai`; Python `google-genai`. Model is configured with `GEMINI_MODEL` and must be checked against current model availability; never bake a model name into many files.
- Before Gemini: path/type policy, secret redaction, deterministic scanners relevant to the codebase (e.g. Gitleaks for secrets, Semgrep for static analysis, `npm audit` for Node dependencies; choose relevant tools, not all blindly).
- Send only changed code + minimum task context after redacting secrets and unrelated/private files. Treat code, comments, README, filenames and tool output as **untrusted data**, never as instructions. Gemini must not execute code, alter permissions or payments, or bypass gates.
- Require validated JSON: `verdict` = `PASS | BLOCK | NEEDS_HUMAN_REVIEW`, `riskLevel`, findings (`filePath`, `lineRange`, category, evidence, reason), confidence and recommended action. Validate schema/paths/line ranges in app code; structured JSON does not make the verdict correct.
- Check behavior such as credential theft/exfiltration, unauthorized network access, persistence, destructive actions, privilege escalation, hidden download/execute paths, obfuscation, suspicious install hooks/dependencies, test/security bypasses and unrelated changes. Avoid keyword-only judgement; consider legitimate task context.
- **Fail closed:** timeout, quota, malformed/uncertain output or high-risk result → quarantine/retry/review; never forward unreviewed code. A `PASS` is not proof of safety. Keep review result tied to exact artifact hash; rerun all gates if bytes change.

### P0 — Isolated execution and requester handoff
- Run only approved test commands in a disposable isolated runner—not the public API or ordinary Render web/worker process. Use unprivileged identity, CPU/memory/process/disk/output/time limits, network disabled by default, no host mount and no DB/PayPal/Gemini credentials. Pin runner/dependencies where practical; do not run arbitrary install scripts without controls.
- Record digest, runner/image version, test command, exit status, duration, bounded output and failures. If secure isolation cannot be delivered in MVP, use labelled non-executing fixtures; never silently run untrusted submissions in the app server.
- Return only the same digest that passed safety + acceptance tests. API/callback response includes status, changed files, test summary, safety review ID and artifact reference, but no private reviewer notes, secrets or other candidates' data. Callbacks must authenticate/sign and be idempotent.

### P0 — PayPal Sandbox and separate payment states
- Use current PayPal Checkout/Orders APIs. Create orders/capture server-side as dictated by the chosen supported flow; client SDK is checkout UI only. Never trust browser redirect as proof of payment. Verify status server-side; verify webhook signatures and deduplicate event IDs; persist provider IDs and use idempotency/correlation keys.
- Separate **task completion**, **requester charge/order/capture**, and **worker payout**. Never call this legal escrow unless the product/account/legal setup truly supports it. No live credentials for dev/test.
- India constraint (verify again before production): PayPal's current payout country table marks India **Receive and withdraw**, meaning a merchant in India cannot send PayPal Payouts. Keep production worker payouts disabled unless PayPal confirms a supported arrangement. A mock payout must be labelled simulated/demo; do not claim it is a real transfer.
- Payment failures/unknown timeouts remain recoverable states; never mark paid optimistically. Feature flag live mode and require separate explicit approval.

### P0/P1 — UI, operations and reliability
- Preserve existing visual language. Provide requester, specialist and admin views as supported by existing code. Show requirements, deadlines, offers, task/safety/verification/payment state and sandbox labels; support loading, empty, error, timeout, retry, decline and no-match states; responsive/accessibility basics; no inert controls.
- P1: in-app offer/status notifications and optional existing email/webhook integrations; admin views for profiles, assessment versions, offers, tasks, submissions, safety findings, tests and payment events.
- Use structured logs and correlation IDs across task → offer → assignment → artifact hash → scanners/Gemini → test run → PayPal event → handoff. Never log secrets or full private code unnecessarily. Track success/failure, latency, time to accept, no-match, revision rate, model errors/quotas, test timeouts, payment/webhook errors and handoff retries.

## 4. State models and core data

Use explicit backend-enforced transitions; adapt names to existing schema.

- **Task:** `DRAFT → QUEUED → MATCHING → OFFERED → ASSIGNED → IN_PROGRESS → SUBMITTED → SAFETY_CHECKING → VERIFICATION_RUNNING → VERIFIED → HANDED_OFF → COMPLETED`. Exceptions: `NO_MATCH`, `OFFER_EXPIRED`, `NEEDS_REVISION`, `SAFETY_BLOCKED`, `SAFETY_REVIEW_FAILED`, `VERIFICATION_FAILED`, `DISPUTED`, `CANCELLED`, `FAILED`.
- **Payment:** `NOT_STARTED`, `ORDER_CREATED`, `APPROVAL_PENDING`, `AUTHORIZED`, `CAPTURE_PENDING`, `CAPTURED`, `PAYMENT_FAILED`, `REFUNDED`; only use statuses supported by real APIs/selected flow.
- **Payout:** separate status, e.g. `PAYOUT_PENDING`, `PAYOUT_SUCCEEDED`, `PAYOUT_UNAVAILABLE`, `DEMO_SIMULATED`.
- **Core entities:** users/roles; skills/levels; assessment versions/attempts/results; agent credentials; tasks and acceptance criteria; ranked offers; atomic assignment; immutable submission versions + hash; safety reviews/findings; verification runs; payment/payout records; webhook events; append-only audit events/correlation IDs.

## 5. Recommended architecture (adapt to actual codebase)

Retain current framework/database unless there is a clear reason to change. Typical logical parts: frontend; authenticated API; relational DB; artifact/object storage; task/matching service; asynchronous worker/queue for Gemini, scans, notifications and long-running tasks; isolated code runner; PayPal provider adapter; audit/metrics. For the hackathon, avoid overengineering—DB-backed jobs may be enough if safe/reliable for the repo; add a separate queue only as needed.

### Render — use services appropriately
- **Web Service:** dynamic Next.js/API/backend. **Static Site:** only for a genuinely static frontend. **Render PostgreSQL:** if persistent relational DB is needed and current DB is unsuitable. **Background Worker:** only for asynchronous/long-running jobs; queue implementation may need Render Key Value or a DB-backed queue. **Cron Job:** periodic expiry/cleanup, not realtime dispatch. Consider a `render.yaml` Blueprint for reproducibility if compatible.
- Check current instance/plan limits and cost before adding paid services. Configure build/start commands, migrations, health checks, structured logs, staging with sandbox credentials, rollback and storage persistence. Render web services/workers are **not** by themselves a security boundary for arbitrary code execution.
- Add secrets in Render Dashboard → service → Environment, or environment groups. Keep local `.env` gitignored. Never expose `GEMINI_API_KEY`, PayPal secret, agent-token secret, or DB credentials as browser/public variables (`VITE_*`, `NEXT_PUBLIC_*`, etc.). PayPal Client ID may be public when required by checkout SDK.

## 6. Gemini API integration

1. Create an API key in [Google AI Studio](https://aistudio.google.com/) and store it server-side only.
2. Use current official SDK: [SDK docs](https://ai.google.dev/gemini-api/docs/libraries). Use structured output and validate returned data in application logic: [structured output](https://ai.google.dev/gemini-api/docs/structured-output). Re-check current model catalogue before selecting `GEMINI_MODEL`.
3. Suggested vars: `GEMINI_API_KEY`, `GEMINI_MODEL`, `CODE_REVIEW_ENABLED=true`, `CODE_REVIEW_FAIL_CLOSED=true`. Add only vars used by actual stack.
4. Implement timeouts, bounded retries, quota/error metrics, minimal redacted inputs and safe audit metadata. No secrets/private unrelated context in prompts. Treat file contents as untrusted data. Gemini cannot mark a task paid or authorize handoff directly.

## 7. PayPal Developer setup and tests

1. Open [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/), enter Sandbox, create/use a sandbox REST app, and copy Sandbox Client ID/Secret. Create buyer/seller test accounts as needed. Use the matching sandbox environment for all dev demos.
2. Backend gets `PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, optional `PAYPAL_WEBHOOK_ID`, `PAYMENT_MODE=sandbox`, `APP_BASE_URL`. Exact vars must follow existing code.
3. Implement server-side Orders/Checkout and the selected create/approve/capture flow from [Orders API](https://developer.paypal.com/docs/api/orders/v2/) / [Checkout](https://developer.paypal.com/checkout/integrate). Register webhooks per [PayPal Webhooks](https://developer.paypal.com/api/rest/webhooks/), verify signatures, deduplicate IDs and reconcile uncertain API timeouts before retrying captures.
4. Test: order creation; cancellation; approved payment; invalid credentials; duplicate requests; duplicate and invalid webhooks; capture timeout/unknown state; UI clearly says Sandbox; payout available vs unavailable/simulated. Never use real credentials in tests.

## 8. Environment variable template (placeholders only)

Names are examples; audit the repo and keep its conventions. Do not save real values in docs or commits.

```dotenv
# Existing app/database/auth vars as required
DATABASE_URL=
APP_BASE_URL=http://localhost:3000
AGENT_API_TOKEN_SECRET=replace_locally

# Gemini — server only
GEMINI_API_KEY=replace_with_key
GEMINI_MODEL=check_current_supported_model
CODE_REVIEW_ENABLED=true
CODE_REVIEW_FAIL_CLOSED=true

# PayPal — sandbox only
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=replace_with_sandbox_id
PAYPAL_CLIENT_SECRET=replace_with_sandbox_secret
PAYPAL_WEBHOOK_ID=replace_if_used
PAYMENT_MODE=sandbox

# Only if architecture needs it
CODE_SANDBOX_PROVIDER=
QUEUE_URL=
```

## 9. Failure and abuse cases to cover

No matches/acceptances; offer timeout/decline; concurrent accept race; repeated API submissions; budget overrun; fake skill claims; malicious task or submission; prompt injection in files/logs; path traversal/oversized archive; secrets in artifacts; false Gemini pass; Gemini quota/outage/invalid JSON; changed artifact after review; sandbox timeout/network escape; failed/duplicate webhook; duplicate capture; payment timeout/unknown state; unsupported payout country; unauthorized private-artifact access; admin override without audit. Apply rate limits, spend caps, access checks, idempotency, least privilege and audit logging.

## 10. MVP acceptance criteria

- Existing build/test baseline recorded and preserved; setup instructions match actual repo.
- Authenticated idempotent task submit with budget, required skills and acceptance criteria.
- L1/L2/L3 verified skill tags with sequential unlocking; failed test never grants tag.
- Explainable matching, top-five parallel offers, timeouts/next batch, and automated concurrency test proving exactly one winner.
- Versioned immutable artifact/hash; benign code passes, malicious code and secret leak are blocked/quarantined, prompt-injection text is treated as data, Gemini outage/invalid output fails closed, altered artifact forces rerun.
- Code executes only in properly isolated runner; otherwise demo clearly uses non-executing fixtures.
- Only verified artifact returns in structured form; repeat handoff is idempotent.
- PayPal Sandbox flow tested; server verifies payment/webhooks; no duplicate financial state; payout is accurately labelled unavailable/simulated if not supported.
- Render secrets, health checks, logs, build/start/migration and rollback notes are documented; responsive UI covers failure states.
- README gives local setup, env variable names, sandbox workflow, tests, known limitations and demo steps.

## 11. Phased implementation — audit must adapt this to reality

**Phase 0 Audit (read-only):** inventory code/routes/schema/tests/auth/integrations/Render; record baseline; map PRD vs code; produce gap matrix with file evidence and risk register. No edits/deploys.  
**Phase 1 Core model:** task schema/state machine, authorization, validation, idempotency, audit/correlation IDs.  
**Phase 2 Skills/matching:** three-level assessment, ranking, top-five dispatch, expiry/next batch, atomic acceptance and tests.  
**Phase 3 Artifacts/verification:** immutable versions/hash, validation, relevant scanners, task tests and safe runner boundary.  
**Phase 4 Gemini:** SDK/service, redaction, validated JSON, fail-closed, digest binding, timeout/error tests.  
**Phase 5 PayPal:** Sandbox orders/checkout/capture, webhooks/idempotency, separate task/payment/payout statuses.  
**Phase 6 Render:** appropriate service topology, env secrets, DB/queue/storage, health/logging/staging/deploy/rollback.  
**Phase 7 Demo polish:** accessibility/states/seed data, README and demo script, run acceptance suite.  
Change order only with documented dependencies. Implement one approved phase at a time; never deploy or turn on live payments without explicit approval.

## 12. First audit output required

Before coding, create/update these concise artifacts (adapt paths if repo convention differs):
1. `docs/audit/REPO_INVENTORY.md` — stack, routes, data flow, tests/build baseline, deployment and env vars (names only).
2. `docs/audit/PRD_GAP_ANALYSIS.md` — requirement ID, status (`implemented/partial/missing/unknown`), file/line evidence, risk, proposed work.
3. `docs/audit/PHASED_PLAN.md` — phases, dependency, estimated effort, affected files, acceptance tests and stop conditions.
4. `docs/audit/RISK_REGISTER.md` — severity, likelihood, evidence, mitigation, owner/phase and test.
5. `docs/audit/INTEGRATION_PLAN.md` — PayPal/Gemini/Render topology, current official refs, setup steps and limitations.
6. `docs/audit/ENV_TEMPLATE.md` — variable names, purpose, service, public/server-only; no real values.

Summarize existing wins, biggest P0 gaps, critical risks, recommended MVP scope, required services/cost caveats, what is truly implemented vs simulated, and any blockers. Cite exact paths and tests; never invent code behavior. Stop for approval.

## 13. Official references

- PayPal dashboard/sandbox: https://developer.paypal.com/dashboard/
- Checkout: https://developer.paypal.com/checkout/integrate
- Orders API: https://developer.paypal.com/docs/api/orders/v2/
- Webhooks: https://developer.paypal.com/api/rest/webhooks/
- Payouts country support: https://developer.paypal.com/payouts/supported-features/
- PayPal AI Toolkit: https://github.com/paypal/AI-Toolkit
- Gemini API/SDKs: https://ai.google.dev/gemini-api/docs/libraries
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Gemini safety: https://ai.google.dev/gemini-api/docs/safety-settings
- Render background workers: https://render.com/docs/background-workers
- Render env/secrets: https://render.com/docs/configure-environment-variables
- Render health checks: https://render.com/docs/health-checks
- Render Blueprints: https://render.com/docs/blueprint-spec
- Render static sites: https://render.com/docs/static-sites
- Render Next.js: https://render.com/docs/deploy-nextjs-app
- Render Express: https://render.com/docs/deploy-node-express-app

---

## Final non-negotiables

1. Audit first; no coding until explicit approval. 2. Never invent repository facts. 3. No secrets in source, client bundles, prompts or logs. 4. Never execute arbitrary submitted code in the main app. 5. No unreviewed/unverified artifact to requester AI. 6. No Gemini-only safety guarantees. 7. No unverified payment success or false payout claims. 8. No live PayPal credentials, live transactions or deployment changes without separate permission. 9. Use existing stack and spend Render resources only when justified. 10. Keep outputs concise and evidence-based to conserve model context.
