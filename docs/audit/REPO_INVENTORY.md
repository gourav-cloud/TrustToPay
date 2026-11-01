# TrustToPay — Repository Inventory & Baseline Audit

**Audit Date:** 29 Oct 2026  
**Repository Working Directory:** `c:\Users\Win11 Pro\Desktop\Paypal Hackathon\TrustToPay`  
**Git Branch:** `main` (clean working tree, up to date with origin/main)  
**Baseline Verification:** All tests pass, build succeeds cleanly.

---

## 1. Workspace & Architecture

TrustToPay is structured as an npm workspaces monorepo containing two main packages: `backend` and `frontend`, plus root scripts.

| Component | Path | Technology Stack | Description |
| :--- | :--- | :--- | :--- |
| **Root** | `./` | npm workspaces, concurrently | Monorepo orchestration, environment configuration, setup scripts. |
| **Backend** | `./backend` | Node.js (>=20.0.0), TypeScript 5.7.3, Express 4.21.2, Prisma 6.2.1, SQLite, Zod 3.24.1, Vitest 2.1.8 | REST API server, authentication, business logic, state machine, PayPal Sandbox client, verification engine. |
| **Frontend** | `./frontend` | React 18.3.1, TypeScript 5.7.3, Vite 6.0.7, Tailwind CSS 3.4.17, TanStack React Query 5.62.11, React Router DOM 6.28.1, Radix UI | Single Page Application (SPA), authenticated dashboard, task browser, session workspace, PayPal Checkout UI. |
| **Database** | `./backend/prisma` | SQLite (`dev.db` for dev, `test.db` for tests), Prisma ORM | Relational data persistence with 17 models and 2 migrations (`0001_init`, `0002_add_session_category`). |

---

## 2. Test & Build Baseline (Recorded 29 Oct 2026)

All local checks were run cleanly without modifying configuration or dependencies:

- **Backend Test Suite (`npm run test:api`):**
  - Command: `vitest run`
  - Results: **7 test files passed**, **64 tests passed**, 0 failed.
  - Test suites:
    1. `src/test/workflow.test.ts` (4 tests passed)
    2. `src/test/verification.test.ts` (21 tests passed)
    3. `src/test/ai-analysis.test.ts` (10 tests passed)
    4. `src/test/sessions.test.ts` (9 tests passed)
    5. `src/test/auth.test.ts` (10 tests passed)
    6. `src/test/security.test.ts` (7 tests passed)
    7. `src/test/health.test.ts` (3 tests passed)
- **Frontend Test Suite (`npm run test:web`):**
  - Command: `vitest run`
  - Results: **4 test files passed**, **31 tests passed**, 0 failed.
  - Test suites:
    1. `src/lib/api.test.ts` (9 tests passed)
    2. `src/lib/format.test.ts` (13 tests passed)
    3. `src/components/ui/badge.test.tsx` (4 tests passed)
    4. `src/components/ui/button.test.tsx` (5 tests passed)
- **Production Build (`npm run build`):**
  - Backend: `tsc -p tsconfig.json` exited code 0 (0 type errors).
  - Frontend: `tsc -b && vite build` exited code 0 (2,356 modules transformed, assets bundled cleanly).

---

## 3. Server Entry Points & Route Inventory

### Entry Points
- **Backend Entry:** `backend/src/index.ts` (server startup, port 4000) -> `backend/src/app.ts` (Express app middleware and routing).
- **Frontend Entry:** `frontend/src/main.tsx` -> `frontend/src/App.tsx` (React Router and QueryClientProvider).

### Route Inventory (`backend/src/app.ts`)

| Route Prefix | Source File | Purpose | Auth / Role Requirements |
| :--- | :--- | :--- | :--- |
| `/health` | `backend/src/app.ts:38` | Service liveness, database ping, configuration check | Public |
| `/api-docs` | `backend/src/app.ts:50` | Swagger UI OpenAPI 3.0 documentation | Public |
| `/api/auth` | `backend/src/routes/auth.ts` | Registration, login, logout, current user session (`/me`), demo logins | Public / Cookie-based |
| `/api/sessions` | `backend/src/routes/sessions.ts` | Agent question sessions, evidence attachments, AI escalation analysis | Authenticated (`requireAuth`) |
| `/api/tasks` | `backend/src/routes/tasks.ts` | Review task creation, listing, acceptance, submission, verification, cancel, disputes | Authenticated (`requireAuth`, role guards) |
| `/api/payments` | `backend/src/routes/payments.ts` | Funding order creation, order capture, reviewer payout, transaction reconciliation | Authenticated (`requireAuth`, role guards) |
| `/api/webhooks` | `backend/src/routes/webhooks.ts` | Incoming PayPal webhook processing, signature verification, simulated admin test | Public / PayPal signature (`/paypal`), Admin (`/paypal/simulate`) |
| `/api/users` | `backend/src/routes/users.ts` | Specialist payout profile and skill management | Authenticated (`requireAuth`) |
| `/api/admin` | `backend/src/routes/admin.ts` | Reviewer approval/suspension, audit log viewing, dispute queue | Admin only (`requireRole('ADMIN')`) |
| `/api/dashboards`| `backend/src/routes/dashboards.ts`| Aggregated metrics for Requester, Reviewer, and Admin dashboards | Authenticated (`requireAuth`) |
| `/api/integrations`| `backend/src/routes/integrations.ts`| PayPal and AI configuration status, PayPal OAuth connectivity check | Public (`/status`), Admin (`/paypal/test-oauth`) |

---

## 4. Database Schema Inventory (`backend/prisma/schema.prisma`)

| Model | Primary Key | Key Relationships | Purpose |
| :--- | :--- | :--- | :--- |
| `User` | CUID | `profile`, `skills`, `sessions`, `requestedTasks`, `assignments`, `submissions`, `auditLogs` | Core user entity (roles: `REQUESTER`, `REVIEWER`, `ADMIN`). |
| `UserProfile` | CUID | `user` (1:1) | Specialist bio, headline, timezone, PayPal payout email, payout consent. |
| `ReviewerSkill` | CUID | `user` (M:1) | User skill tag (`category`, `name`, `level` default 3). *Self-reported.* |
| `AgentSession` | CUID | `user`, `analysisRuns`, `evidence`, `tasks` | Requester session containing question, models, specs, and status. |
| `AnalysisRun` | CUID | `session` (M:1) | AI escalation analysis record (output JSON, confidence score, recommended action). |
| `EvidenceSource` | CUID | `session` (optional), `task` (optional) | Reference links, manufacturer documents, retail snippets. |
| `ReviewTask` | CUID | `session`, `requester`, `assignment`, `submissions`, `verificationRuns`, `reward`, `payments`, `events`, `disputes` | Escalate question task with reward, criteria, and status. |
| `TaskAssignment` | CUID | `task` (1:1), `reviewer` (M:1) | Atomic claim of a task by a single reviewer. |
| `ReviewSubmission` | CUID | `task`, `reviewer`, `verificationRuns` | Text response submitted by reviewer (`answer`, `explanation`, `sourceUrl`). |
| `VerificationRun` | CUID | `task`, `submission`, `verifier` | Results of rule-based or manual review checks. |
| `Reward` | CUID | `task` (1:1), `approvedBy`, `payments` | Reward amount in minor units (cents), status, approval timestamp. |
| `PaymentTransaction` | CUID | `task`, `reward` | Ledger record of funding orders, captures, and payouts. |
| `PaymentWebhookEvent`| CUID | *Independent* | Ingested PayPal webhook events (deduplication by `eventId`). |
| `TaskEvent` | CUID | `task`, `actor` | Timeline history of task transitions. |
| `AuditLog` | CUID | `actor` | Append-only security audit log (`action`, `entityType`, `metadataJson`, IP, UA). |
| `Notification` | CUID | `user` | In-app notification alerts. |
| `Dispute` | CUID | `task`, `openedBy` | Dispute ticket opened on a task. |

---

## 5. Security Middleware & Authentication Inventory

- **Authentication (`backend/src/auth/`):**
  - Session tokens signed with JWT (`jsonwebtoken`), secret from `SESSION_SECRET`.
  - Stored in HTTP-only cookie named `hf_session` (Legacy naming from "HumanFallback").
  - Token payload: `{ sub: userId, role: userRole }`.
  - `attachUser` middleware resolves cookie to active user in Prisma.
  - **Gap:** No API key / Bearer token authentication mechanism for autonomous AI agents.
- **Security Middlewares (`backend/src/middleware/security.ts`):**
  - `helmet`: Sets `crossOriginResourcePolicy: "cross-origin"`, `referrerPolicy: "no-referrer"`.
  - `cors`: Restricted to `FRONTEND_URL` and `API_BASE_URL` with credentials allowed.
  - `originCheck`: Enforces matching Origin header on state-changing requests (CSRF defense).
  - Rate Limiting (`express-rate-limit`):
    - Global: 600 requests / 15 minutes.
    - Auth: 30 attempts / 15 minutes.
    - Payments: 40 requests / 1 minute.
  - Request body size guard: Rejects payloads > 1 MB.

---

## 6. Integrations & External Services Inventory

### PayPal Sandbox Integration
- **Client Implementation:** `backend/src/services/paypal/client.ts` (`PayPalApiClient`).
- **Endpoints Interfaced:**
  - `POST /v1/oauth2/token` (OAuth 2.0 client credentials, cached with expiry).
  - `POST /v2/checkout/orders` (Order creation with intent `CAPTURE`).
  - `POST /v2/checkout/orders/{id}/capture` (Server-side order capture).
  - `GET /v2/checkout/orders/{id}` (Order reconciliation).
  - `POST /v1/payments/payouts` (Batch payout submission).
  - `GET /v1/payments/payouts/{id}` (Payout status check).
  - `POST /v1/notifications/verify-webhook-signature` (Webhook authenticity verification).
- **Execution Mode:**
  - Derived from `DEMO_MODE`: If `DEMO_MODE=true`, payments use `DemoPaymentProvider` (simulated). If `DEMO_MODE=false`, calls real PayPal Sandbox endpoints.
  - Live payments are hard-blocked by `config.paypalEnv === "sandbox"`.

### AI Provider Integration
- **Current Implementation:** `backend/src/services/ai/`
  - `backend/src/services/ai/demoEngine.ts`: Deterministic regex/keyword checker hardcoded for hardware wattage/USB-C compatibility.
  - `backend/src/services/ai/provider.ts`: OpenAI-compatible `fetch("${config.aiBaseUrl}/chat/completions")` using `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`.
  - **Gap:** Official Google GenAI SDK (`@google/genai`) is **not installed**; `GEMINI_API_KEY` and `GEMINI_MODEL` are not configured. AI is currently used only for pre-task question escalation, not for code submission safety gate.

### Deployment & Hosting Setup
- **Existing Setup:** None. No `render.yaml`, `Dockerfile`, or Render environment configurations exist in the repository.
- **Database:** Local SQLite (`file:./dev.db`), which will not persist across deploys on ephemeral cloud containers without Render persistent disk or Render PostgreSQL.

---

## 7. Environment Variables Inventory

| Variable Name | Required By | Used In Location | Public or Server-Only |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Runtime environment | `backend/src/config.ts:40` | Server-only |
| `PORT` | Backend port (default 4000) | `backend/src/config.ts:56` | Server-only |
| `FRONTEND_URL` | CORS and redirects (default `http://localhost:5173`) | `backend/src/config.ts:59`, `security.ts:19` | Server-only |
| `API_BASE_URL` | Backend base URL (default `http://localhost:4000`) | `backend/src/config.ts:62`, `security.ts:19` | Server-only |
| `DATABASE_URL` | Prisma SQLite or Postgres connection | `backend/src/config.ts:65`, `prisma/schema.prisma:12` | Server-only |
| `SESSION_SECRET` | JWT signing secret (>= 32 chars) | `backend/src/auth/service.ts:23`, `config.ts:68` | Server-only |
| `DEMO_MODE` | Flags simulated vs real sandbox integrations | `backend/src/config.ts:50` | Server-only |
| `DEMO_USERS_ENABLED` | Allows instant login as demo seeds | `backend/src/config.ts:53` | Server-only |
| `AI_PROVIDER` | `demo` or `openai-compatible` (legacy) | `backend/src/config.ts:86` | Server-only |
| `AI_API_KEY` | API key for legacy OpenAI-compatible provider | `backend/src/config.ts:89`, `provider.ts:68` | Server-only |
| `AI_BASE_URL` | Base URL for legacy AI provider | `backend/src/config.ts:92`, `provider.ts:64` | Server-only |
| `AI_MODEL` | Model ID for legacy AI provider | `backend/src/config.ts:95`, `provider.ts:71` | Server-only |
| `AI_ESCALATION_THRESHOLD` | Threshold for escalation (default 0.75) | `backend/src/config.ts:106` | Server-only |
| `PAYPAL_ENV` | PayPal environment (`sandbox` only) | `backend/src/config.ts:111` | Server-only |
| `PAYPAL_CLIENT_ID` | PayPal Sandbox Client ID | `backend/src/config.ts:114`, `client.ts:138`, exposed in payment response | Public/Server |
| `PAYPAL_CLIENT_SECRET` | PayPal Sandbox Secret | `backend/src/config.ts:117`, `client.ts:139` | Server-only |
| `PAYPAL_PAYOUTS_ENABLED` | Enables PayPal Payouts calls | `backend/src/config.ts:133` | Server-only |
| `PAYPAL_WEBHOOK_ID` | PayPal Webhook ID for signature verification | `backend/src/config.ts:139`, `client.ts:140` | Server-only |
| `PAYPAL_CURRENCY` | Currency code (default `USD`) | `backend/src/config.ts:142` | Server-only |
| `REWARD_MIN_MINOR` | Minimum reward in cents (default 500) | `backend/src/config.ts:145` | Server-only |
| `REWARD_MAX_MINOR` | Maximum reward in cents (default 10000) | `backend/src/config.ts:148` | Server-only |
