# TrustToPay — Google AI Studio Implementation Guide

**Audience:** Repository Maintainer & Developer  
**Purpose:** Practical operational guide for executing the phased roadmap using Google AI Studio.

---

## 1. Why Phase 1 Must Be Implemented First

Always begin with **Phase 1: Agent Authentication, API Credentials & Decoupled State Machine**.

**Why?**
- **Dependency Root:** Autonomous agent API authentication and the decoupled state machine are the architectural foundation for all subsequent work.
- **State Machine Decoupling:** Right now, task states like `AWAITING_FUNDING` and `PAYMENT_PAID` are conflated with task execution. Subsequent phases (matching, offers, artifacts, security review) cannot progress cleanly until task lifecycle (`DRAFT`..`COMPLETED`) is separated from payment ledger records (`PaymentTransaction`).
- **Low Risk / High Leverage:** Phase 1 touches only data models, auth middleware, and state machine transitions without requiring external API keys or third-party networks.

---

## 2. Implementation Sequence & Dependency Chain

Execute the phases in this strict, non-overlapping sequence:

```
Phase 1: Agent Auth & Decoupled State Machine
   │
   ├──> Phase 2: Three-Level Skill Assessment Engine
   │       │
   │       └──> Phase 3: Specialist Ranking & Top-5 Offers
   │
   └──> Phase 4: Immutable Artifacts & SHA-256 Pipeline
           │
           └──> Phase 5: Deterministic Scanners & Gemini Security Gate
                   │
                   └──> Phase 6: Isolated Runner & Signed Agent Handoff
                           │
Phase 7: PayPal Sandbox Decoupling & UI States ◄───┘
   │
   └──> Phase 8: Render Deployment Blueprint & E2E Acceptance
```

---

## 3. What to Provide to Google AI Studio for Each Phase

To keep Google AI Studio within its token budget and prevent hallucinations:
1. **Never dump the entire repository.** Only provide:
   - The specific phase prompt from `docs/audit/AI_STUDIO_PHASE_PROMPTS.md`.
   - The exact files listed under that phase's "Relevant Files" section.
   - The relevant database schema snippet from `backend/prisma/schema.prisma`.
2. **Explicit Instruction:** Remind AI Studio:
   - "Inspect the attached files first."
   - "Preserve all existing working functions and tests."
   - "Do not refactor unassigned modules or rewrite the stack."
   - "Output modified code as complete, drop-in replacement files."

---

## 4. Verification Protocol After Every Phase

After copying code from Google AI Studio into the repository, run these verification steps before proceeding:

### Step 1: Type Checking & Build
```bash
npm run build
```
- Must complete with exit code 0 and zero TypeScript compiler errors.

### Step 2: Run Backend Tests
```bash
npm run test:api
```
- All existing tests (minimum 64 baseline) plus the newly added phase tests must pass.

### Step 3: Run Frontend Tests
```bash
npm run test:web
```
- All frontend tests (minimum 31 baseline) must pass.

### Step 4: Git Snapshot
Once verified, commit the changes locally:
```bash
git add .
git commit -m "feat(phase-X): implement <Phase Name>"
```
*Never proceed to the next phase on a dirty or unverified commit.*

---

## 5. Rollback & Recovery Strategy

If an AI Studio generation introduces errors, breaks existing tests, or produces invalid transitions:
1. **Immediate Git Reset:**
   ```bash
   git restore .
   git clean -fd
   ```
2. **Diagnose Failure:**
   - Check the specific Vitest failure output.
   - Did the prompt attempt too large a scope?
   - Did it introduce incompatible Prisma model changes?
3. **Re-Prompting AI Studio:**
   - Supply the specific error message, the failing test case, and the exact function that caused it.
   - Instruct AI Studio to make the minimal targeted fix.

---

## 6. Division of Labor: AI Studio vs Antigravity vs Manual Tasks

| Task | Executor | Rationale |
| :--- | :--- | :--- |
| **Code authoring & TypeScript implementation** | **Google AI Studio** | Fast, high-context code generation with clean modular code. |
| **Prisma migrations (`prisma migrate dev`)** | **Antigravity / Local Terminal** | Requires local database execution and interactive CLI handling. |
| **Running tests & inspecting outputs** | **Antigravity / Local Terminal** | Verifies actual runtime behavior against SQLite and Vitest. |
| **Google AI Studio API Key creation** | **Manual (User)** | Requires private Google account login and payment/project selection. |
| **PayPal Sandbox App registration** | **Manual (User)** | Requires private PayPal Developer Dashboard login. |
| **Render Dashboard secret provisioning** | **Manual (User)** | Entering production credentials into Render environment groups. |
| **Final live payment / deployment approval** | **Manual (User)** | Explicit human-in-the-loop sign-off required by PRD. |
