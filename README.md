# <p align="center">🛡️ TrustToPay</p>
<h3 align="center">The Deterministic Human-in-the-Loop Escrow & Verification Protocol for Autonomous AI Agents</h3>

<p align="center">
  <em>Turn AI agent uncertainty and edge-case blockers into verified, cryptographically signed solutions in seconds — with programmatic escrow, sub-millisecond specialist dispatch, and multi-layer deterministic code verification.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Production%20Ready-10b981?style=for-the-badge" alt="Status" />
  <img src="https://img.shields.io/badge/React-18.3.1-61dafb?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178c6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/AG%20Grid-Community%20v32-e02424?style=for-the-badge&logo=aggrid&logoColor=white" alt="AG Grid" />
  <img src="https://img.shields.io/badge/Elasticsearch-8.16%20Hybrid-005571?style=for-the-badge&logo=elasticsearch&logoColor=white" alt="Elasticsearch" />
  <img src="https://img.shields.io/badge/PayPal-Sandbox%20Escrow-00457c?style=for-the-badge&logo=paypal&logoColor=white" alt="PayPal" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License" />
</p>

---

## 📑 Table of Contents

- [Executive Summary & Value Proposition](#-executive-summary--value-proposition)
- [The Problem We Solve](#-the-problem-we-solve)
- [How TrustToPay Works](#-how-trusttopay-works)
- [Deep Dive: AG Grid Community Operations Console](#-deep-dive-ag-grid-community-operations-console)
- [Deep Dive: Elastic Hybrid Specialist Discovery](#-deep-dive-elastic-hybrid-specialist-discovery)
- [Security & Deterministic Verification Gate](#-security--deterministic-verification-gate)
- [Step-by-Step Setup Guide](#-step-by-step-setup-guide)
  - [1. 60-Second Zero-Config Quickstart](#1-60-second-zero-config-quickstart)
  - [2. Pre-Configured Demo Accounts](#2-pre-configured-demo-accounts)
  - [3. Production & Service Configurations](#3-production--service-configurations)
  - [4. Agent API Integration Quickstart](#4-agent-api-integration-quickstart)
- [System Architecture & Tech Stack](#-system-architecture--tech-stack)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [License & Support](#-license--support)

---

## 🚀 Executive Summary & Value Proposition

**TrustToPay** is mission-critical developer infrastructure that bridges the **Autonomous AI Agent Trust Gap**. 

As engineering teams deploy autonomous agents to write code, triage infrastructure, manage DeFi protocols, and refactor codebases, agents inevitably face complex ambiguity: syntax edge cases, undocumented APIs, breaking dependency updates, or hardware-specific constraints.

When this occurs, today's agents face a disastrous dilemma:
1. **Hallucinate silently** and push destructive changes into production, or
2. **Crash & burn context**, wasting tens of dollars in token retries before giving up.

```
       Autonomous Agent Hits Blocker / Low Confidence (< 0.75)
                                │
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                🛡️ TrustToPay Orchestration                  │
 │                                                             │
 │  1. Programmatic PayPal Escrow Authorization (Orders v2)    │
 │  2. Elastic Hybrid Vector (Jina) + BM25 Specialist Matching  │
 │  3. Top-5 Parallel Broadcast with Atomic First-Accept Lock  │
 │  4. Human Specialist Fix Submitted with Proof Artifacts     │
 │  5. Deterministic AST + Gemini Multi-Layer Verification     │
 │  6. Escrow Released via PayPal & Signed HMAC Handback       │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
       Agent Resumes Workflow with Verified, Signed Artifact
```

**TrustToPay turns agent failure into guaranteed task completion.** Agents autonomously open an escrow-backed task, dispatch the job to vetted human specialists using **Elasticsearch hybrid search**, verify the solution through **deterministic scanners and Gemini AI analysis**, and consume the cryptographically signed output—without human management overhead.

---

## 🎯 The Problem We Solve

| The Challenge | Traditional AI Agent Failure Mode | The TrustToPay Solution |
| :--- | :--- | :--- |
| **Silent Hallucinations** | Agents guess missing parameters or write insecure workarounds that slip past linting. | Solutions must pass deterministic AST rules, isolated syntax checks, and Gemini security audits before escrow unlock. |
| **Context Window Bleed** | Agents get trapped in recursive debug loops, burning API budget and time. | Programmatic handoff triggers immediately when agent confidence drops below your threshold. |
| **Financial & Execution Risk** | Paying human contractors via manual invoices causes days of delay and counterparty risk. | Automated micro-escrow locks funds on dispatch and releases payment instantly upon verified resolution. |
| **Disjointed Handoffs** | Human output isn't formatted for machines, breaking automated pipelines. | Output is returned in a structured JSON schema, accompanied by an `X-TrustToPay-Signature` HMAC hash for seamless downstream ingestion. |

---

## ⚡ How TrustToPay Works

The protocol executes in four tightly coordinated, atomic stages:

```
  ┌──────────────┐       ┌──────────────────────┐       ┌──────────────────────┐       ┌──────────────────────┐
  │   STAGE 1    │  ──►  │       STAGE 2        │  ──►  │       STAGE 3        │  ──►  │       STAGE 4        │
  │ Task Ingest  │       │  Intelligent Match   │       │ Layered Verification │       │ Financial Settlement │
  │   & Escrow   │       │   & Instant Claim    │       │     & Code Gate      │       │   & Agent Resumption │
  └──────────────┘       └──────────────────────┘       └──────────────────────┘       └──────────────────────┘
   • Confidence < 0.75    • Elastic Hybrid kNN           • Deterministic AST            • PayPal Payouts v1
   • Structured Bounty    • Jina Embeddings v3           • Gemini Code Review           • Audit Log Updated
   • PayPal Orders v2     • Top-5 Parallel Ping          • SHA-256 Digest Match         • HMAC-SHA256 Signed
   • Funds Vaulted        • Atomic Lock Acquired         • Fail-Closed Policy           • Agent Continues
```

1. **Ingest & Escrow Authorization**:
   An AI agent or developer posts a task with evidence requirements, code snippet, and max bounty (e.g., $15.00). Funds are held in escrow via PayPal Orders v2 or simulated internal vaulting.
2. **Elastic Hybrid Discovery**:
   Elasticsearch embeds the task using Jina AI embeddings (`jina-embeddings-v3`) and blends semantic similarity with exact BM25 keyword matching to locate the top 5 verified specialists. The first qualified specialist to accept wins an atomic lock.
3. **Layered Verification Gate**:
   Once the specialist submits the solution, TrustToPay subjects the artifact to a 3-layer security pipeline: deterministic pattern scanning, isolated runner syntax check, and an AI semantic audit via Gemini.
4. **Conditional Release & Signed Handback**:
   Upon verification pass, escrowed funds are released to the specialist via PayPal Payouts. The agent receives a webhook payload stamped with an `X-TrustToPay-Signature` header to resume execution.

---

## 📊 Deep Dive: AG Grid Community Operations Console

TrustToPay embeds the high-performance **AG Grid Community Edition** (`v32.3.3`) throughout the administrative and specialist operations suites. Built with zero paid licenses or Enterprise dependencies, it delivers sub-millisecond virtualized rendering across 5 core consoles.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  AG GRID COMMUNITY OPERATIONS SUITE                                                                    │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  ⚡ Specialists Workbench     Verified L1–L3 skill tiers, availability status, success rate %, actions │
│  📋 Tasks & Dispatch Engine   Bounty values, SLA counters, required skills, offer volume, assignees    │
│  🛡️ Security Verification      Deterministic scanner verdicts, Gemini audit flags, SHA-256 digests      │
│  💳 Payment Ledger (Read-Only) PayPal Order v2 IDs, capture states, transaction hashes, timestamps     │
│  🎓 Skill Assessments Console Candidate test runs, track levels, automated grading, promotion flags    │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Key Grid Capabilities Implemented:

- **Custom Charcoal Theme (`ag-theme-quartz-dark`)**: Tuned to TrustToPay's dark midnight/graphite palette (`#090D16` surface, `#1E293B` borders).
- **Custom React Cell Renderers**:
  - `ReputationPill`: Dynamic badge reflecting specialist trust rating and score (0–100).
  - `SkillMatrixPill`: Level-aware tags highlighting verified domains (e.g., `Rust L3`, `Solidity L2`, `Python L1`).
  - `Sha256DigestCell`: Truncated monospace hash with one-click clipboard copy.
  - `StatusPill`: High-contrast indicators for `ESCROWED`, `VERIFIED`, `DISPATCHED`, and `SETTLED`.
- **Instant Full-Text Client Quick Search**: Fast client-side debounced filtering across all columns without re-querying the database.
- **Client-Side CSV Export**: One-click compliance and financial reporting exports via native AG Grid Community `gridApi.exportDataAsCsv()`.
- **Zero Enterprise Dependencies**: 100% MIT-licensed Community edition (`ag-grid-community` & `ag-grid-react`).

---

## 🔍 Deep Dive: Elastic Hybrid Specialist Discovery

Specialist discovery is powered by the official **Elasticsearch** Node.js client (`@elastic/elasticsearch` v8.16.3), combining vector embeddings with lexical keyword matching.

```
                           Task Description & Requirements
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
         Dense Vector Path                              Lexical BM25 Path
    Jina Embeddings v3 (1024-d)                 Keywords, Category, L1–L3 Skills
                  │                                               │
                  └───────────────────────┬───────────────────────┘
                                          ▼
                         Elasticsearch Reciprocal Rank Fusion
                                          │
                                          ▼
                         Top-5 Verified Specialist Matches
                                          │
                                          ▼
                      Parallel Push Notification & Claim Lock
```

### Why Hybrid Semantic Search?

1. **Context Beyond Exact Matches**: When an agent reports `"E0382: use of moved value in closure"`, a simple keyword search for `"rust"` may miss high-caliber specialists. Elastic vector search maps semantic proximity directly to Tokio/Rust memory-safety experts.
2. **Skill Verification Gating**: The search applies strict hard filters on verified skill levels (L1, L2, L3) so only tested specialists receive matching tasks.
3. **Top-5 Parallel Broadcast**: Selected candidates receive an immediate alert. An atomic database transaction locks the assignment to the first specialist who accepts, preventing double claims.
4. **Resilient Dual-Engine Fallback**: If Elasticsearch is offline or unconfigured, TrustToPay **automatically and silently falls back** to a relational database query layer (`Prisma / SQLite / PostgreSQL`). Zero dispatches are ever lost.

---

## 🔒 Security & Deterministic Verification Gate

TrustToPay enforces a strict **Fail-Closed Security Model**. No payment is ever released and no solution is ever handed back to an agent without passing verification:

1. **Layer 1: Deterministic Pattern & AST Scanner**
   - Scans against dangerous shell injections, dynamic `eval()`, obfuscated network calls, and hardcoded secret keys.
   - Computes deterministic SHA-256 digests over submitted files.
2. **Layer 2: Isolated Syntax & Test Runner**
   - Executes language-specific syntax checks in isolated containers with strict timeout limits (default: 10,000ms).
3. **Layer 3: Gemini Semantic Code Audit**
   - Submits diffs and documentation to Google Gemini to verify that the specialist truly resolved the prompt's underlying problem without introducing malicious side effects.
4. **Layer 4: Agent Payload Signing (`HMAC-SHA256`)**
   - Every completed task returned to an agent webhook carries the `X-TrustToPay-Signature` header, signed using your shared secret, ensuring downstream agents cannot be spoofed.

---

## 🛠️ Step-by-Step Setup Guide

### 1. 60-Second Zero-Config Quickstart

TrustToPay works **out of the box** in local demo mode with zero external accounts or API keys required.

```bash
# 1. Clone the repository
git clone https://github.com/your-org/trusttopay.git
cd trusttopay

# 2. Run the automated one-shot setup script
# (Installs dependencies, bootstraps SQLite, seeds demo users & sample tasks)
npm run setup

# 3. Start backend & frontend concurrently
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)** in your browser.

| Service | Address | Notes |
| :--- | :--- | :--- |
| **Web Application** | `http://localhost:5173` | Proxies `/api/*` to the backend server |
| **Backend API** | `http://localhost:4000` | Node.js Express server |
| **Health Check** | `http://localhost:4000/health` | Service uptime & status |
| **Interactive API Docs** | `http://localhost:4000/api-docs` | Swagger UI documentation |

---

### 2. Pre-Configured Demo Accounts

All seeded demo accounts are configured with the password: `Demo1234!`

| Role | Email | Best For Testing |
| :--- | :--- | :--- |
| **Requester (Agent)** | `agent@demo.trusttopay.dev` | Posting tasks, viewing escrow, checking handback |
| **Senior Specialist** | `reviewer@demo.trusttopay.dev` | Browsing marketplace, claiming tasks, submitting fixes |
| **Junior Specialist** | `reviewer2@demo.trusttopay.dev` | Taking skill assessments, testing level progression |
| **Platform Admin** | `admin@demo.trusttopay.dev` | Exploring the **AG Grid Community Admin Console** |

---

### 3. Production & Service Configurations

Copy `.env.example` to `.env` to configure optional real-world integrations:

```bash
cp .env.example .env
```

#### A. PayPal Sandbox Escrow Integration
To enable real PayPal sandbox transactions (live money is permanently disabled for safety):
```env
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=your_paypal_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_paypal_sandbox_client_secret
PAYPAL_WEBHOOK_ID=your_paypal_webhook_id
PAYPAL_CURRENCY=USD
PAYPAL_PAYOUTS_ENABLED=true
```

#### B. Elasticsearch & Jina AI Embeddings
To activate semantic specialist matching:
```env
ELASTIC_ENABLED=true
ELASTICSEARCH_URL=https://your-elasticsearch-cluster:9200
ELASTICSEARCH_API_KEY=your_elastic_api_key
ELASTIC_INDEX_SPECIALISTS=trusttopay-specialists-v1
JINA_API_KEY=your_jina_ai_api_key
JINA_EMBEDDING_MODEL=jina-embeddings-v3
```

#### C. Google Gemini Code Reviewer
To enable the multi-tier AI code security audit:
```env
GEMINI_API_KEY=your_google_ai_studio_api_key
GEMINI_MODEL=gemini-2.5-flash
```

---

### 4. Agent API Integration Quickstart

Connect your autonomous agent (Python, LangChain, AutoGen, CrewAI, or Node.js) to TrustToPay with a single HTTP POST request:

#### Example: Autonomous Task Dispatch via cURL
```bash
curl -X POST http://localhost:4000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AGENT_TOKEN" \
  -d '{
    "title": "Fix memory leak in websocket event broadcaster",
    "description": "Agent hit unhandled promise rejection in production telemetry pipeline.",
    "category": "PROGRAMMING",
    "requiredSkills": ["Node.js", "TypeScript", "WebSockets"],
    "maxBountyMinor": 2500,
    "currency": "USD",
    "evidenceRequired": "Passing test suite output and clean memory heap snapshot."
  }'
```

#### Example: Consuming the Verified Handback in Python
```python
import hmac
import hashlib
import requests

def verify_and_consume_handback(webhook_payload: bytes, signature_header: str, secret: str):
    expected = hmac.new(secret.encode(), webhook_payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(f"sha256={expected}", signature_header):
        raise ValueError("Untrusted payload: Signature verification failed!")
    
    # Process verified code artifact
    data = requests.compat.json.loads(webhook_payload)
    print(f"Task {data['taskId']} resolved by verified specialist {data['specialistId']}")
    print(f"Artifact Hash: {data['artifactHash']}")
    return data["solutionArtifact"]
```

---

## 🏗️ System Architecture & Tech Stack

```
trusttopay/
├── backend/                  # High-throughput Express + TypeScript API server
│   ├── prisma/               # Database schema & migrations (SQLite / PostgreSQL)
│   ├── src/
│   │   ├── auth/             # JWT & hardened HttpOnly / Partitioned cookie management
│   │   ├── services/
│   │   │   ├── elastic/      # Elasticsearch client & Jina hybrid matching engine
│   │   │   ├── paypal/       # PayPal Orders v2 escrow capture & Payouts v1 release
│   │   │   ├── verification/ # Deterministic AST scanners & Gemini analyzer
│   │   │   └── ai/           # Multi-provider confidence scoring
│   │   └── routes/           # REST endpoints for tasks, specialists, admin, and ledger
│   └── test/                 # 94 Vitest backend tests (100% passing)
├── frontend/                 # Premium React 18 SPA (Vite + Tailwind CSS)
│   ├── src/
│   │   ├── components/
│   │   │   ├── admin/        # AG Grid Community operations suite (5 tables)
│   │   │   ├── layout/       # App shell, responsive drawer, public brand navigation
│   │   │   └── ui/           # Custom dark graphite design system
│   │   ├── context/          # Auth & QueryClient providers
│   │   └── pages/            # Requester dashboard, specialist marketplace, admin
│   └── test/                 # 42 Vitest frontend tests (100% passing)
└── scripts/                  # Automated setup, verification, and migration tooling
```

### Core Technologies:
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Lucide React, TanStack Query.
- **Grids**: AG Grid Community Edition (`v32.3.3`) — 100% MIT.
- **Backend**: Express, TypeScript, Zod, Helmet, Cookie-Parser, Supertest.
- **Search & Vector**: Elasticsearch Node.js Client (`@elastic/elasticsearch`), Jina AI Embeddings.
- **Database & ORM**: SQLite (Local development) / PostgreSQL (Production), Prisma ORM.
- **AI Verification**: Google Gemini (`@google/genai`).
- **Payments**: PayPal SDK (Orders v2 Escrow & Payouts v1).

---

## 🧪 Testing & Quality Assurance

TrustToPay enforces exhaustive test coverage across every authentication flow, escrow state machine, AG Grid table definition, and Elastic search fallback.

```bash
# Run all tests (backend + frontend)
npm test

# Run backend test suite (94 tests)
npm run test:api

# Run frontend test suite (42 tests)
npm run test:web
```

### Verified Test Matrix:
- ✅ **94 Backend Unit & Integration Tests**: Auth cookies, CSRF defenses, PayPal state transitions, task dispatch concurrency, Elastic failover, and verification AST rules.
- ✅ **42 Frontend Component Tests**: AG Grid column rendering, status badges, responsive drawer, route protection, and authentication state persistence.
- ✅ **Zero Broken Links**: All internal routes, navigation items, documentation pages, and actions are fully implemented and connected.

---

## 📜 License & Support

This project is licensed under the **MIT License**.

Built for the future of reliable autonomous computing.  
For technical inquiries, bug reports, or feature requests, visit the [Documentation](/app/docs) or submit an issue.
