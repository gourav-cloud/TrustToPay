# TrustToPay — Environment Variable Template & Reference

**Notice:** This template contains placeholders only. Never store, print, or commit real API keys, passwords, secrets, or credential tokens.

---

## Environment Variables Reference Table

| Variable Name | Purpose | Where Used | Scope | Default / Example | Required In Prod? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | Application runtime environment (`development`, `test`, `production`) | `backend/src/config.ts:40` | Server-only | `development` | Yes |
| `PORT` | Local HTTP port for Express backend API | `backend/src/config.ts:56` | Server-only | `4000` | No (Render assigns `PORT`) |
| `FRONTEND_URL` | Base URL of frontend application (for CORS & redirects) | `backend/src/config.ts:59`, `security.ts:19` | Server-only | `http://localhost:5173` | Yes |
| `API_BASE_URL` | Public base URL of backend API | `backend/src/config.ts:62`, `security.ts:19` | Server-only | `http://localhost:4000` | Yes |
| `DATABASE_URL` | Database connection string (SQLite file URI or PostgreSQL URL) | `backend/prisma/schema.prisma:12`, `config.ts:65` | Server-only | `file:./dev.db` (local) / `postgres://...` (Render) | Yes |
| `SESSION_SECRET` | Secret key used to sign JWT session cookies (min 32 chars) | `backend/src/auth/service.ts:23`, `config.ts:68` | Server-only | `replace_with_32_char_random_secret` | Yes |
| `AGENT_API_TOKEN_SECRET` | Salt/secret for hashing agent Bearer API tokens | `backend/src/auth/service.ts` | Server-only | `replace_with_agent_secret` | Yes |
| `DEMO_MODE` | Flags simulated mode (`true` = demo mocks; `false` = real Sandbox/AI) | `backend/src/config.ts:50` | Server-only | `true` (dev) / `false` (prod) | Yes |
| `DEMO_USERS_ENABLED` | Enables one-click demo login buttons on web interface | `backend/src/config.ts:53` | Server-only | `true` (dev) / `false` (prod) | No |
| `GEMINI_API_KEY` | Google AI Studio API key for official `@google/genai` SDK | `backend/src/services/security/geminiReviewService.ts` | Server-only | `replace_with_google_ai_studio_key` | Yes (for AI review) |
| `GEMINI_MODEL` | Gemini model name for semantic code reviews | `backend/src/config.ts` | Server-only | `gemini-2.5-flash` | Yes |
| `CODE_REVIEW_ENABLED` | Toggles semantic AI code review gate on submissions | `backend/src/config.ts` | Server-only | `true` | Yes |
| `CODE_REVIEW_FAIL_CLOSED` | Ensures review errors/timeouts result in quarantine/block | `backend/src/config.ts` | Server-only | `true` | Yes |
| `PAYPAL_ENV` | PayPal target environment (`sandbox` only; live blocked) | `backend/src/config.ts:111`, `client.ts:141` | Server-only | `sandbox` | Yes |
| `PAYPAL_CLIENT_ID` | PayPal Sandbox REST App Client ID | `backend/src/config.ts:114`, `client.ts:138`, checkout UI | Public/Server | `replace_with_sandbox_client_id` | Yes (when DEMO_MODE=false) |
| `PAYPAL_CLIENT_SECRET` | PayPal Sandbox REST App Client Secret | `backend/src/config.ts:117`, `client.ts:139` | Server-only | `replace_with_sandbox_secret` | Yes (when DEMO_MODE=false) |
| `PAYPAL_WEBHOOK_ID` | PayPal Webhook ID for signature verification | `backend/src/config.ts:139`, `client.ts:140` | Server-only | `replace_with_webhook_id` | Yes (when webhooks enabled) |
| `PAYPAL_PAYOUTS_ENABLED` | Toggles real Sandbox Payouts API calls | `backend/src/config.ts:133` | Server-only | `false` | No (keep false in India) |
| `PAYPAL_CURRENCY` | Default transaction currency code | `backend/src/config.ts:142` | Server-only | `USD` | Yes |
| `PAYMENT_MODE` | Payment processing mode alias (`sandbox` or `simulated`) | `backend/src/config.ts` | Server-only | `sandbox` | No |
| `CODE_SANDBOX_PROVIDER` | Isolated execution runner provider (`docker`, `fixture`) | `backend/src/services/execution/runner.ts` | Server-only | `fixture` | No |
| `REWARD_MIN_MINOR` | Minimum allowed task reward in cents (e.g. 500 = $5.00) | `backend/src/config.ts:145` | Server-only | `500` | No |
| `REWARD_MAX_MINOR` | Maximum allowed task reward in cents (e.g. 10000 = $100.00) | `backend/src/config.ts:148` | Server-only | `10000` | No |

---

## Safe `.env` File Template (Copy-Paste Placeholder)

```dotenv
# ==============================================================================
# TrustToPay — Environment Configuration Template
# Placeholders only. Keep this file outside version control.
# ==============================================================================

# --- Node & Network
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:5173
API_BASE_URL=http://localhost:4000

# --- Database & Storage
DATABASE_URL="file:./dev.db"

# --- Security & Auth
SESSION_SECRET=replace_with_at_least_32_random_characters
AGENT_API_TOKEN_SECRET=replace_with_agent_secret
DEMO_MODE=true
DEMO_USERS_ENABLED=true

# --- Google Gemini API (Server-Only)
GEMINI_API_KEY=replace_with_ai_studio_api_key
GEMINI_MODEL=gemini-2.5-flash
CODE_REVIEW_ENABLED=true
CODE_REVIEW_FAIL_CLOSED=true

# --- PayPal Developer Sandbox (Server-Only, Sandbox Only)
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=replace_with_sandbox_client_id
PAYPAL_CLIENT_SECRET=replace_with_sandbox_client_secret
PAYPAL_WEBHOOK_ID=replace_with_sandbox_webhook_id
PAYPAL_PAYOUTS_ENABLED=false
PAYPAL_CURRENCY=USD
PAYMENT_MODE=sandbox

# --- Execution Runner & Limits
CODE_SANDBOX_PROVIDER=fixture
REWARD_MIN_MINOR=500
REWARD_MAX_MINOR=10000
```
