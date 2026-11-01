import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { parseJson } from "../../lib/json.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type SkillLevelNumber = 1 | 2 | 3;

export const SKILL_LEVEL_NAMES: Record<SkillLevelNumber, string> = {
  1: "Foundation",
  2: "Practitioner",
  3: "Advanced",
};

export function isValidSkillLevel(level: number): level is SkillLevelNumber {
  return level === 1 || level === 2 || level === 3;
}

export function getSkillLevelName(level: number): string {
  if (level <= 1) return SKILL_LEVEL_NAMES[1];
  if (level === 2) return SKILL_LEVEL_NAMES[2];
  return SKILL_LEVEL_NAMES[3];
}

export type AssessmentQuestion = {
  id: string;
  type: "MULTIPLE_CHOICE" | "CODE_TASK";
  prompt: string;
  starterCode?: string;
  options?: { id: string; text: string }[];
  weight: number;
  // Internal grading keys (stripped before sending questions to client)
  correctOptionId?: string;
  requiredSnippets?: string[];
  forbiddenSnippets?: string[];
  explanation: string;
};

export type PublicAssessmentQuestion = Omit<
  AssessmentQuestion,
  "correctOptionId" | "requiredSnippets" | "forbiddenSnippets" | "explanation"
>;

export type SeedStageDefinition = {
  level: SkillLevelNumber;
  title: string;
  description: string;
  passingScore: number;
  cooldownMinutes: number;
  maxAttemptsPerDay: number;
  questions: AssessmentQuestion[];
};

export type SeedSkillDefinition = {
  slug: string;
  name: string;
  category: "PROGRAMMING" | "CRYPTO" | "CONCEPTUAL" | "HARDWARE";
  description: string;
  version: string;
  stages: SeedStageDefinition[];
};

export const DEFAULT_SKILLS_CATALOG: SeedSkillDefinition[] = [
  {
    slug: "typescript",
    name: "TypeScript",
    category: "PROGRAMMING",
    description:
      "Type-safe Node.js & browser engineering, runtime schema validation, async error handling, and concurrency safety.",
    version: "1.0.0",
    stages: [
      {
        level: 1,
        title: "Level 1 — Foundation",
        description: "Core type narrowing, strict null checks, basic async debugging, and reading API contracts.",
        passingScore: 80,
        cooldownMinutes: 30,
        maxAttemptsPerDay: 3,
        questions: [
          {
            id: "ts-l1-q1",
            type: "MULTIPLE_CHOICE",
            prompt:
              "Given `function parseAmount(input: unknown): number`, which approach safely narrows `input` before arithmetic under `strict: true`?",
            options: [
              { id: "a", text: "Use `typeof input === 'number' && Number.isFinite(input)` before returning." },
              { id: "b", text: "Cast `input as any as number` and multiply by 100." },
              { id: "c", text: "Use `Boolean(input)` to narrow `unknown` to `number`." },
              { id: "d", text: "Disable `strictNullChecks` in tsconfig.json." },
            ],
            correctOptionId: "a",
            weight: 50,
            explanation: "Runtime type guards (`typeof` + `Number.isFinite`) safely narrow `unknown` to a finite `number`.",
          },
          {
            id: "ts-l1-q2",
            type: "CODE_TASK",
            prompt:
              "Write a TypeScript function `safeDivide(a: number, b: number): number | null` that returns `null` when `b === 0` and otherwise returns `a / b`.",
            starterCode: "export function safeDivide(a: number, b: number): number | null {\n  // TODO\n}",
            requiredSnippets: ["b === 0", "null", "a / b"],
            forbiddenSnippets: ["eval(", "as any"],
            weight: 50,
            explanation: "A safe division helper must explicitly guard `b === 0` and return `null` without unsafe casts.",
          },
        ],
      },
      {
        level: 2,
        title: "Level 2 — Practitioner",
        description: "Async timeout handling, AbortController cancellation, API integration edge cases, and unit testing.",
        passingScore: 80,
        cooldownMinutes: 30,
        maxAttemptsPerDay: 3,
        questions: [
          {
            id: "ts-l2-q1",
            type: "MULTIPLE_CHOICE",
            prompt:
              "A worker pool loops over tasks calling `await fetch(url)` without a timeout and stalls when upstream hangs. What is the idiomatic fix in Node 20+?",
            options: [
              {
                id: "a",
                text: "Pass `signal: AbortSignal.timeout(ms)` (or an `AbortController` timer) to `fetch` and handle abort errors.",
              },
              { id: "b", text: "Wrap `fetch` in `setTimeout(() => {}, 0)` without awaiting the promise." },
              { id: "c", text: "Increase the worker pool size to 10,000 concurrent promises." },
              { id: "d", text: "Catch errors with an empty `catch {}` block outside the loop." },
            ],
            correctOptionId: "a",
            weight: 50,
            explanation: "`AbortSignal.timeout` bounds request latency and prevents worker starvation.",
          },
          {
            id: "ts-l2-q2",
            type: "CODE_TASK",
            prompt:
              "Implement `fetchWithTimeout(url: string, timeoutMs: number)` using `AbortSignal.timeout(timeoutMs)` passed into `fetch(url, { signal })`.",
            starterCode:
              "export async function fetchWithTimeout(url: string, timeoutMs: number) {\n  // Pass AbortSignal.timeout(timeoutMs) to fetch\n}",
            requiredSnippets: ["AbortSignal.timeout", "fetch", "signal"],
            forbiddenSnippets: ["eval("],
            weight: 50,
            explanation: "Passing `signal: AbortSignal.timeout(timeoutMs)` into `fetch` aborts hanging HTTP requests.",
          },
        ],
      },
      {
        level: 3,
        title: "Level 3 — Advanced",
        description: "Idempotency guarantees, race-condition prevention, security hardening, and bounded concurrency.",
        passingScore: 80,
        cooldownMinutes: 60,
        maxAttemptsPerDay: 3,
        questions: [
          {
            id: "ts-l3-q1",
            type: "MULTIPLE_CHOICE",
            prompt:
              "Two concurrent webhook requests arrive with the same `eventId`. How do you prevent double-crediting a ledger in a transactional backend?",
            options: [
              {
                id: "a",
                text: "Enforce a unique constraint on `(provider, eventId)` or `idempotencyKey` inside the database transaction and treat duplicate key conflicts as idempotent no-ops.",
              },
              { id: "b", text: "Store processed IDs in a local variable inside the Express route handler." },
              { id: "c", text: "Wait 500ms before processing every webhook." },
              { id: "d", text: "Trust the caller never to retry a webhook." },
            ],
            correctOptionId: "a",
            weight: 50,
            explanation:
              "Database-level unique constraints combined with transactional state updates guarantee idempotency under concurrent retries.",
          },
          {
            id: "ts-l3-q2",
            type: "CODE_TASK",
            prompt:
              "Write a constant-time digest comparison helper `verifySignature(expectedHex: string, actualHex: string): boolean` using `crypto.timingSafeEqual` and `Buffer.from`.",
            starterCode:
              "import crypto from 'node:crypto';\nexport function verifySignature(expectedHex: string, actualHex: string): boolean {\n  // TODO\n}",
            requiredSnippets: ["timingSafeEqual", "Buffer.from"],
            forbiddenSnippets: ["expectedHex === actualHex", "eval("],
            weight: 50,
            explanation: "`crypto.timingSafeEqual` prevents timing side-channel attacks when verifying webhook or HMAC digests.",
          },
        ],
      },
    ],
  },
  {
    slug: "python",
    name: "Python",
    category: "PROGRAMMING",
    description:
      "Python 3.11+ backend services, data validation, async/await concurrency, deterministic testing, and secure execution.",
    version: "1.0.0",
    stages: [
      {
        level: 1,
        title: "Level 1 — Foundation",
        description: "Mutable default argument pitfalls, exception handling, context managers, and type hints.",
        passingScore: 80,
        cooldownMinutes: 30,
        maxAttemptsPerDay: 3,
        questions: [
          {
            id: "py-l1-q1",
            type: "MULTIPLE_CHOICE",
            prompt: "Why is `def append_item(item: str, bucket: list[str] = []):` dangerous in Python?",
            options: [
              {
                id: "a",
                text: "Default list `[]` is evaluated once at function definition time and shared across calls that omit `bucket`.",
              },
              { id: "b", text: "Python raises a SyntaxError when a list is used as a default parameter." },
              { id: "c", text: "Type hints automatically deep-copy default arguments at runtime." },
              { id: "d", text: "Lists cannot store strings in Python 3." },
            ],
            correctOptionId: "a",
            weight: 50,
            explanation: "Mutable default arguments persist across invocations unless defaulted to `None` and initialized inside the body.",
          },
          {
            id: "py-l1-q2",
            type: "CODE_TASK",
            prompt:
              "Fix `append_item(item: str, bucket: list[str] | None = None) -> list[str]` so it initializes a new list when `bucket is None` and appends `item`.",
            starterCode:
              "def append_item(item: str, bucket: list[str] | None = None) -> list[str]:\n    # TODO\n",
            requiredSnippets: ["bucket is None", "append", "return"],
            forbiddenSnippets: ["eval(", "exec("],
            weight: 50,
            explanation: "Use `if bucket is None: bucket = []` before appending and returning `bucket`.",
          },
        ],
      },
      {
        level: 2,
        title: "Level 2 — Practitioner",
        description: "Asyncio task groups, bounded semaphores, deterministic decimal arithmetic, and pytest fixtures.",
        passingScore: 80,
        cooldownMinutes: 30,
        maxAttemptsPerDay: 3,
        questions: [
          {
            id: "py-l2-q1",
            type: "MULTIPLE_CHOICE",
            prompt:
              "When calculating financial payouts in Python, why should `decimal.Decimal` or integer minor units be used instead of `float`?",
            options: [
              {
                id: "a",
                text: "IEEE 754 binary floating-point cannot represent base-10 fractions like `0.1 + 0.2` exactly, causing rounding drift.",
              },
              { id: "b", text: "`float` only supports positive numbers in Python." },
              { id: "c", text: "`Decimal` executes on the GPU automatically." },
              { id: "d", text: "JSON serializers reject integers." },
            ],
            correctOptionId: "a",
            weight: 50,
            explanation: "Integer minor units (cents) or `Decimal` avoid binary floating-point representation errors.",
          },
          {
            id: "py-l2-q2",
            type: "CODE_TASK",
            prompt:
              "Write a function `to_minor_units(amount: Decimal) -> int` that multiplies `amount` by `100` and converts it to `int`.",
            starterCode:
              "from decimal import Decimal\n\ndef to_minor_units(amount: Decimal) -> int:\n    # TODO\n",
            requiredSnippets: ["int(", "100", "return"],
            forbiddenSnippets: ["eval(", "exec("],
            weight: 50,
            explanation: "Converting `Decimal` amounts to integer minor units ensures exact arithmetic.",
          },
        ],
      },
      {
        level: 3,
        title: "Level 3 — Advanced",
        description: "Subprocess sandboxing, resource limits, SQL injection prevention, and distributed lock safety.",
        passingScore: 80,
        cooldownMinutes: 60,
        maxAttemptsPerDay: 3,
        questions: [
          {
            id: "py-l3-q1",
            type: "MULTIPLE_CHOICE",
            prompt:
              "Which pattern prevents command injection when invoking an external binary with user-supplied filenames in Python?",
            options: [
              {
                id: "a",
                text: "Pass an argument list `subprocess.run(['git', 'diff', '--', filename], shell=False, check=True, timeout=5)`.",
              },
              { id: "b", text: "Use `os.system(f'git diff {filename}')`." },
              { id: "c", text: "Use `subprocess.Popen(cmd, shell=True)`." },
              { id: "d", text: "Use `eval(filename)` before running the command." },
            ],
            correctOptionId: "a",
            weight: 50,
            explanation: "`shell=False` with an explicit argv list and `--` prevents shell metacharacter interpretation.",
          },
          {
            id: "py-l3-q2",
            type: "CODE_TASK",
            prompt:
              "Write a parameterized SQLite query execution `fetch_user(cursor, user_id: str)` using `cursor.execute` with a `?` placeholder tuple `(user_id,)`.",
            starterCode: "def fetch_user(cursor, user_id: str):\n    # Use parameterized query\n",
            requiredSnippets: ["cursor.execute", "?", "(user_id,)"],
            forbiddenSnippets: ["f\"", "f'", "% user_id"],
            weight: 50,
            explanation: "Parameterized queries bind parameters separately from SQL syntax, eliminating SQL injection.",
          },
        ],
      },
    ],
  },
  {
    slug: "smart-contracts",
    name: "Smart Contracts",
    category: "CRYPTO",
    description:
      "Solidity & EVM security auditing, EIP-712 / EIP-2612 signature verification, reentrancy protection, and invariant testing.",
    version: "1.0.0",
    stages: [
      {
        level: 1,
        title: "Level 1 — Foundation",
        description: "Checks-Effects-Interactions pattern, integer overflow semantics, and access control fundamentals.",
        passingScore: 80,
        cooldownMinutes: 30,
        maxAttemptsPerDay: 3,
        questions: [
          {
            id: "sc-l1-q1",
            type: "MULTIPLE_CHOICE",
            prompt: "In Solidity, what is the primary purpose of the Checks-Effects-Interactions (CEI) pattern?",
            options: [
              {
                id: "a",
                text: "Update contract storage state (balances/nonces) before making external calls so reentrant calls observe updated state.",
              },
              { id: "b", text: "Reduce bytecode size by skipping `require` statements." },
              { id: "c", text: "Allow external contracts to modify storage directly via `delegatecall`." },
              { id: "d", text: "Disable gas metering during token transfers." },
            ],
            correctOptionId: "a",
            weight: 50,
            explanation: "Zeroing or decrementing state prior to external calls prevents classic reentrancy exploits.",
          },
          {
            id: "sc-l1-q2",
            type: "CODE_TASK",
            prompt:
              "Write the body of `withdraw(uint256 amount)` following Checks-Effects-Interactions: check `balances[msg.sender] >= amount`, subtract `amount` from `balances[msg.sender]`, then call `msg.sender.call{value: amount}(\"\")`.",
            starterCode:
              "function withdraw(uint256 amount) external {\n    // 1. Check\n    // 2. Effect\n    // 3. Interaction\n}",
            requiredSnippets: ["require(", "balances[msg.sender]", ".call{value: amount}"],
            forbiddenSnippets: ["tx.origin"],
            weight: 50,
            explanation: "State updates must precede `.call{value: amount}`.",
          },
        ],
      },
      {
        level: 2,
        title: "Level 2 — Practitioner",
        description: "EIP-2612 permit replay protection, dynamic `block.chainid` validation, and safe ERC-20 operations.",
        passingScore: 80,
        cooldownMinutes: 30,
        maxAttemptsPerDay: 3,
        questions: [
          {
            id: "sc-l2-q1",
            type: "MULTIPLE_CHOICE",
            prompt:
              "If a vault contract caches its EIP-712 `DOMAIN_SEPARATOR` in the constructor and never checks `block.chainid`, what risk arises on a hard fork?",
            options: [
              {
                id: "a",
                text: "Signatures intended for the original chain can be replayed on the forked chain because the cached domain separator still uses the old chainId.",
              },
              { id: "b", text: "The contract automatically self-destructs on fork." },
              { id: "c", text: "`ecrecover` stops returning addresses." },
              { id: "d", text: "Nonces reset to zero every block." },
            ],
            correctOptionId: "a",
            weight: 50,
            explanation: "Recomputing the domain separator when `block.chainid != INITIAL_CHAIN_ID` prevents cross-chain replay.",
          },
          {
            id: "sc-l2-q2",
            type: "CODE_TASK",
            prompt:
              "Write a Solidity check that verifies `block.timestamp <= deadline` and `signer != address(0)` after `ecrecover`.",
            starterCode:
              "function verifyPermit(uint256 deadline, address signer, address owner) internal view {\n    // TODO\n}",
            requiredSnippets: ["block.timestamp <= deadline", "signer != address(0)", "signer == owner"],
            forbiddenSnippets: ["tx.origin"],
            weight: 50,
            explanation: "`ecrecover` returns `address(0)` on invalid signatures, so `signer != address(0)` and `signer == owner` must both be checked.",
          },
        ],
      },
      {
        level: 3,
        title: "Level 3 — Advanced",
        description: "Read-only reentrancy, flash-loan oracle manipulation, and formal invariant verification.",
        passingScore: 80,
        cooldownMinutes: 60,
        maxAttemptsPerDay: 3,
        questions: [
          {
            id: "sc-l3-q1",
            type: "MULTIPLE_CHOICE",
            prompt: "How does read-only reentrancy exploit lending protocols that integrate AMM LP tokens?",
            options: [
              {
                id: "a",
                text: "During an external callback before the AMM finishes updating balances/supply, a `view` price function reads inconsistent intermediate state.",
              },
              { id: "b", text: "`view` functions modify storage slots directly on L1." },
              { id: "c", text: "Solidity compilers inline `view` functions into `selfdestruct`." },
              { id: "d", text: "Flash loans bypass block gas limits." },
            ],
            correctOptionId: "a",
            weight: 50,
            explanation: "Even `view` functions can return inflated LP prices if called mid-execution while the pool's reentrancy lock is active.",
          },
          {
            id: "sc-l3-q2",
            type: "CODE_TASK",
            prompt:
              "Write a Foundry invariant assertion function `invariant_solvency()` asserting `vault.totalAssets() >= vault.totalLiabilities()`.",
            starterCode: "function invariant_solvency() public view {\n    // TODO\n}",
            requiredSnippets: ["assertGe", "totalAssets()", "totalLiabilities()"],
            forbiddenSnippets: ["vm.etch"],
            weight: 50,
            explanation: "Stateful fuzzing invariants assert protocol solvency across arbitrary call sequences.",
          },
        ],
      },
    ],
  },
  {
    slug: "distributed-systems",
    name: "Distributed Systems",
    category: "CONCEPTUAL",
    description:
      "Queue vs synchronous RPC trade-offs, backpressure, transactional outbox, lease locks, and idempotent consumers.",
    version: "1.0.0",
    stages: [
      {
        level: 1,
        title: "Level 1 — Foundation",
        description: "Latency vs throughput, retry amplification, timeouts, and queue operational trade-offs.",
        passingScore: 80,
        cooldownMinutes: 30,
        maxAttemptsPerDay: 3,
        questions: [
          {
            id: "ds-l1-q1",
            type: "MULTIPLE_CHOICE",
            prompt:
              "Why can immediate retries without jitter or backoff worsen an upstream service brownout?",
            options: [
              {
                id: "a",
                text: "Synchronized retry storms multiply request load on the degraded service, preventing recovery.",
              },
              { id: "b", text: "TCP packets cannot be retransmitted over TLS." },
              { id: "c", text: "Exponential backoff disables DNS caching." },
              { id: "d", text: "HTTP/2 forbids status code 503." },
            ],
            correctOptionId: "a",
            weight: 50,
            explanation: "Exponential backoff with random jitter spreads retry load and prevents thundering herds.",
          },
          {
            id: "ds-l1-q2",
            type: "CODE_TASK",
            prompt:
              "Write a backoff formula function `backoffMs(attempt: number, baseMs: number)` that returns `Math.min(30000, baseMs * (2 ** attempt))`.",
            starterCode: "export function backoffMs(attempt: number, baseMs: number): number {\n  // TODO\n}",
            requiredSnippets: ["Math.min", "30000", "2 ** attempt"],
            forbiddenSnippets: ["eval("],
            weight: 50,
            explanation: "Capped exponential backoff bounds retry delay while protecting downstream dependencies.",
          },
        ],
      },
      {
        level: 2,
        title: "Level 2 — Practitioner",
        description: "Transactional outbox pattern, at-least-once delivery, and dead-letter queues.",
        passingScore: 80,
        cooldownMinutes: 30,
        maxAttemptsPerDay: 3,
        questions: [
          {
            id: "ds-l2-q1",
            type: "MULTIPLE_CHOICE",
            prompt:
              "What problem does the Transactional Outbox pattern solve when a service updates its database and publishes an event to a broker?",
            options: [
              {
                id: "a",
                text: "It avoids dual-write inconsistency where the DB commit succeeds but publishing to the broker fails (or vice versa).",
              },
              { id: "b", text: "It eliminates the need for database indexes." },
              { id: "c", text: "It compresses JSON payloads into binary protobufs automatically." },
              { id: "d", text: "It guarantees zero network latency between regions." },
            ],
            correctOptionId: "a",
            weight: 50,
            explanation: "Writing the event row in the same local acid transaction as the business state prevents lost or phantom events.",
          },
          {
            id: "ds-l2-q2",
            type: "CODE_TASK",
            prompt:
              "Write a transactional outbox insert helper using `tx.task.update` and `tx.outboxEvent.create` inside `db.$transaction(async (tx) => { ... })`.",
            starterCode:
              "export async function completeWithOutbox(db: any, taskId: string) {\n  // Run both writes in db.$transaction\n}",
            requiredSnippets: ["$transaction", "tx.task.update", "tx.outboxEvent.create"],
            forbiddenSnippets: ["eval("],
            weight: 50,
            explanation: "Atomically persisting the state change and outbox record in one transaction ensures eventual delivery.",
          },
        ],
      },
      {
        level: 3,
        title: "Level 3 — Advanced",
        description: "Fencing tokens with lease locks, split-brain prevention, and consensus invariants.",
        passingScore: 80,
        cooldownMinutes: 60,
        maxAttemptsPerDay: 3,
        questions: [
          {
            id: "ds-l3-q1",
            type: "MULTIPLE_CHOICE",
            prompt:
              "A worker acquires a 30s lease lock on a task, pauses for 45s due to a GC pause, and then attempts to write its result after a second worker already acquired the new lease. How do fencing tokens prevent corruption?",
            options: [
              {
                id: "a",
                text: "Each lease acquisition increments a monotonic fencing token (`leaseVersion`), and the storage layer rejects writes with a token lower than the current `leaseVersion`.",
              },
              { id: "b", text: "The first worker checks `Date.now()` on its own clock before sending the request." },
              { id: "c", text: "Both workers overwrite each other and the last packet wins." },
              { id: "d", text: "The load balancer drops all POST requests." },
            ],
            correctOptionId: "a",
            weight: 50,
            explanation: "Storage-enforced monotonic fencing tokens reject zombie writes from expired lease holders.",
          },
          {
            id: "ds-l3-q2",
            type: "CODE_TASK",
            prompt:
              "Write an optimistic fenced update query `updateWithFence(db: any, taskId: string, leaseVersion: number, data: any)` that filters `where: { id: taskId, leaseVersion }`.",
            starterCode:
              "export async function updateWithFence(db: any, taskId: string, leaseVersion: number, data: any) {\n  // TODO\n}",
            requiredSnippets: ["where", "id: taskId", "leaseVersion"],
            forbiddenSnippets: ["eval("],
            weight: 50,
            explanation: "Conditioning the write on `leaseVersion` ensures stale workers cannot clobber newer lease owners.",
          },
        ],
      },
    ],
  },
];

export function stripQuestionSecrets(questions: AssessmentQuestion[]): PublicAssessmentQuestion[] {
  return questions.map(({ correctOptionId: _c, requiredSnippets: _r, forbiddenSnippets: _f, explanation: _e, ...pub }) => pub);
}

export async function ensureDefaultSkillsSeeded(db: DbClient): Promise<void> {
  const existingCount = await db.skill.count();
  if (existingCount >= DEFAULT_SKILLS_CATALOG.length) {
    return;
  }

  for (const def of DEFAULT_SKILLS_CATALOG) {
    const skill = await db.skill.upsert({
      where: { slug: def.slug },
      update: {
        name: def.name,
        category: def.category,
        description: def.description,
        version: def.version,
        isActive: true,
      },
      create: {
        slug: def.slug,
        name: def.name,
        category: def.category,
        description: def.description,
        version: def.version,
        isActive: true,
      },
    });

    for (const stage of def.stages) {
      await db.assessmentStage.upsert({
        where: {
          skillId_level: {
            skillId: skill.id,
            level: stage.level,
          },
        },
        update: {
          title: stage.title,
          description: stage.description,
          version: def.version,
          passingScore: stage.passingScore,
          cooldownMinutes: stage.cooldownMinutes,
          maxAttemptsPerDay: stage.maxAttemptsPerDay,
          questionsJson: JSON.stringify(stage.questions),
        },
        create: {
          skillId: skill.id,
          level: stage.level,
          title: stage.title,
          description: stage.description,
          version: def.version,
          passingScore: stage.passingScore,
          cooldownMinutes: stage.cooldownMinutes,
          maxAttemptsPerDay: stage.maxAttemptsPerDay,
          questionsJson: JSON.stringify(stage.questions),
        },
      });
    }
  }
}

async function resolveSkill(db: DbClient, skillIdOrSlug: string) {
  await ensureDefaultSkillsSeeded(db);
  const skill = await db.skill.findFirst({
    where: {
      OR: [{ id: skillIdOrSlug }, { slug: skillIdOrSlug }, { name: skillIdOrSlug }],
      isActive: true,
    },
    include: {
      stages: { orderBy: { level: "asc" } },
    },
  });
  if (!skill) {
    throw new AppError(404, "SKILL_NOT_FOUND", `Skill '${skillIdOrSlug}' was not found.`);
  }
  return skill;
}

export async function listSkillsForUser(db: DbClient, userId?: string | null, now = new Date()) {
  await ensureDefaultSkillsSeeded(db);

  const skills = await db.skill.findMany({
    where: { isActive: true },
    include: {
      stages: { orderBy: { level: "asc" } },
    },
    orderBy: { name: "asc" },
  });

  const userLevels = userId
    ? await db.userSkillLevel.findMany({
        where: { userId },
      })
    : [];

  const recentAttempts = userId
    ? await db.skillAssessmentAttempt.findMany({
        where: { userId },
        orderBy: { startedAt: "desc" },
      })
    : [];

  const levelBySkillId = new Map(userLevels.map((ul) => [ul.skillId, ul]));

  return skills.map((skill) => {
    const userLevelRecord = levelBySkillId.get(skill.id) ?? null;
    const currentLevel = userLevelRecord?.level ?? 0;

    const stages = skill.stages.map((stage) => {
      const questions = parseJson<AssessmentQuestion[]>(stage.questionsJson, []);
      const stageAttempts = recentAttempts.filter((a) => a.stageId === stage.id);
      const latestAttempt = stageAttempts[0] ?? null;

      const isPassed = currentLevel >= stage.level;
      const isPrerequisiteMet = stage.level === 1 || currentLevel >= stage.level - 1;
      const activeCooldownUntil =
        latestAttempt?.cooldownUntil && latestAttempt.cooldownUntil.getTime() > now.getTime()
          ? latestAttempt.cooldownUntil
          : null;

      let status: "PASSED" | "AVAILABLE" | "COOLDOWN" | "LOCKED" = "LOCKED";
      if (isPassed) {
        status = "PASSED";
      } else if (!isPrerequisiteMet) {
        status = "LOCKED";
      } else if (activeCooldownUntil) {
        status = "COOLDOWN";
      } else {
        status = "AVAILABLE";
      }

      return {
        id: stage.id,
        level: stage.level,
        levelName: getSkillLevelName(stage.level),
        title: stage.title,
        description: stage.description,
        version: stage.version,
        passingScore: stage.passingScore,
        cooldownMinutes: stage.cooldownMinutes,
        questionCount: questions.length,
        status,
        unlocked: isPrerequisiteMet,
        passed: isPassed,
        cooldownUntil: activeCooldownUntil ? activeCooldownUntil.toISOString() : null,
        latestAttempt: latestAttempt
          ? {
              id: latestAttempt.id,
              status: latestAttempt.status,
              score: latestAttempt.score,
              startedAt: latestAttempt.startedAt.toISOString(),
              completedAt: latestAttempt.completedAt ? latestAttempt.completedAt.toISOString() : null,
            }
          : null,
      };
    });

    return {
      id: skill.id,
      slug: skill.slug,
      name: skill.name,
      category: skill.category,
      description: skill.description,
      version: skill.version,
      verifiedLevel: currentLevel,
      verifiedLevelName: currentLevel > 0 ? getSkillLevelName(currentLevel) : null,
      verifiedAt: userLevelRecord ? userLevelRecord.verifiedAt.toISOString() : null,
      stages,
    };
  });
}

export async function startAssessmentAttempt(
  db: DbClient,
  args: {
    userId: string;
    skillIdOrSlug: string;
    level: number;
    now?: Date;
  },
) {
  const now = args.now ?? new Date();
  if (!isValidSkillLevel(args.level)) {
    throw new AppError(400, "INVALID_SKILL_LEVEL", "Skill assessment level must be 1 (Foundation), 2 (Practitioner), or 3 (Advanced).");
  }

  const skill = await resolveSkill(db, args.skillIdOrSlug);
  const stage = skill.stages.find((s) => s.level === args.level);
  if (!stage) {
    throw new AppError(404, "ASSESSMENT_STAGE_NOT_FOUND", `Level ${args.level} stage not found for ${skill.name}.`);
  }

  // Enforce sequential unlocking: L2 requires L1 passed; L3 requires L2 passed.
  const existingLevel = await db.userSkillLevel.findUnique({
    where: {
      userId_skillId: {
        userId: args.userId,
        skillId: skill.id,
      },
    },
  });

  const currentVerifiedLevel = existingLevel?.level ?? 0;
  if (args.level > 1 && currentVerifiedLevel < args.level - 1) {
    const requiredLevel = args.level - 1;
    throw new AppError(
      403,
      "SEQUENTIAL_LEVEL_LOCKED",
      `Cannot start Level ${args.level} (${getSkillLevelName(args.level)}) for ${skill.name} before passing Level ${requiredLevel} (${getSkillLevelName(requiredLevel)}).`,
      {
        skillId: skill.id,
        skillSlug: skill.slug,
        requestedLevel: args.level,
        requiredLevel,
        currentVerifiedLevel,
      },
    );
  }

  // Check active cooldown on this stage
  const lastFailedAttempt = await db.skillAssessmentAttempt.findFirst({
    where: {
      userId: args.userId,
      skillId: skill.id,
      level: args.level,
      status: "FAILED",
      cooldownUntil: { gt: now },
    },
    orderBy: { completedAt: "desc" },
  });

  if (lastFailedAttempt?.cooldownUntil) {
    throw new AppError(
      429,
      "ASSESSMENT_COOLDOWN_ACTIVE",
      `Assessment retry cooldown is active for ${skill.name} Level ${args.level} until ${lastFailedAttempt.cooldownUntil.toISOString()}.`,
      {
        cooldownUntil: lastFailedAttempt.cooldownUntil.toISOString(),
        attemptId: lastFailedAttempt.id,
      },
    );
  }

  const questions = parseJson<AssessmentQuestion[]>(stage.questionsJson, []);

  const attempt = await db.skillAssessmentAttempt.create({
    data: {
      userId: args.userId,
      skillId: skill.id,
      stageId: stage.id,
      level: stage.level,
      version: stage.version,
      status: "IN_PROGRESS",
      startedAt: now,
    },
  });

  return {
    attempt: {
      id: attempt.id,
      skillId: skill.id,
      skillSlug: skill.slug,
      skillName: skill.name,
      stageId: stage.id,
      level: stage.level,
      levelName: getSkillLevelName(stage.level),
      version: attempt.version,
      status: attempt.status,
      passingScore: stage.passingScore,
      startedAt: attempt.startedAt.toISOString(),
    },
    questions: stripQuestionSecrets(questions),
  };
}

export type QuestionEvaluation = {
  questionId: string;
  passed: boolean;
  earnedWeight: number;
  maxWeight: number;
  feedback: string;
};

export function gradeAssessmentQuestions(
  questions: AssessmentQuestion[],
  answers: Record<string, string>,
): {
  score: number;
  evaluations: QuestionEvaluation[];
} {
  if (questions.length === 0) {
    return { score: 0, evaluations: [] };
  }

  let totalWeight = 0;
  let earnedWeight = 0;
  const evaluations: QuestionEvaluation[] = [];

  for (const q of questions) {
    const weight = q.weight > 0 ? q.weight : 1;
    totalWeight += weight;
    const rawAnswer = typeof answers[q.id] === "string" ? answers[q.id].trim() : "";

    if (q.type === "MULTIPLE_CHOICE") {
      const passed = Boolean(q.correctOptionId && rawAnswer === q.correctOptionId);
      const earned = passed ? weight : 0;
      earnedWeight += earned;
      evaluations.push({
        questionId: q.id,
        passed,
        earnedWeight: earned,
        maxWeight: weight,
        feedback: passed ? `Passed: ${q.explanation}` : `Incorrect option selected. ${q.explanation}`,
      });
    } else {
      // CODE_TASK: Deterministic static & pattern check (never execute untrusted code on main server)
      const required = q.requiredSnippets ?? [];
      const forbidden = q.forbiddenSnippets ?? [];

      const missingRequired = required.filter((snippet) => !rawAnswer.includes(snippet));
      const matchedForbidden = forbidden.filter((snippet) => rawAnswer.includes(snippet));
      const passed = rawAnswer.length > 0 && missingRequired.length === 0 && matchedForbidden.length === 0;
      const earned = passed ? weight : 0;
      earnedWeight += earned;

      let feedback = q.explanation;
      if (!passed) {
        const reasons: string[] = [];
        if (rawAnswer.length === 0) reasons.push("No code answer submitted.");
        if (missingRequired.length > 0) {
          reasons.push(`Missing required constructs: ${missingRequired.join(", ")}.`);
        }
        if (matchedForbidden.length > 0) {
          reasons.push(`Contains disallowed constructs: ${matchedForbidden.join(", ")}.`);
        }
        feedback = `${reasons.join(" ")} ${q.explanation}`.trim();
      }

      evaluations.push({
        questionId: q.id,
        passed,
        earnedWeight: earned,
        maxWeight: weight,
        feedback,
      });
    }
  }

  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
  return { score, evaluations };
}

async function syncReviewerSkillBadge(
  db: DbClient,
  args: {
    userId: string;
    skillName: string;
    category: string;
    level: number;
  },
) {
  await db.reviewerSkill.upsert({
    where: {
      userId_name: {
        userId: args.userId,
        name: args.skillName,
      },
    },
    update: {
      category: args.category,
      level: args.level,
    },
    create: {
      userId: args.userId,
      name: args.skillName,
      category: args.category,
      level: args.level,
    },
  });
}

export async function submitAssessmentAttempt(
  db: DbClient,
  args: {
    userId: string;
    attemptId: string;
    answers: Record<string, string>;
    now?: Date;
  },
) {
  const now = args.now ?? new Date();
  const attempt = await db.skillAssessmentAttempt.findUnique({
    where: { id: args.attemptId },
    include: {
      skill: true,
      stage: true,
    },
  });

  if (!attempt || attempt.userId !== args.userId) {
    throw new AppError(404, "ASSESSMENT_ATTEMPT_NOT_FOUND", "Assessment attempt not found.");
  }

  if (attempt.status !== "IN_PROGRESS") {
    throw new AppError(409, "ASSESSMENT_ATTEMPT_ALREADY_SUBMITTED", "This assessment attempt has already been submitted.");
  }

  // Re-verify prerequisite level in case state changed
  const existingLevel = await db.userSkillLevel.findUnique({
    where: {
      userId_skillId: {
        userId: args.userId,
        skillId: attempt.skillId,
      },
    },
  });
  const currentVerifiedLevel = existingLevel?.level ?? 0;
  if (attempt.level > 1 && currentVerifiedLevel < attempt.level - 1) {
    throw new AppError(
      403,
      "SEQUENTIAL_LEVEL_LOCKED",
      `Cannot submit Level ${attempt.level} without an active passed Level ${attempt.level - 1} record.`,
    );
  }

  const questions = parseJson<AssessmentQuestion[]>(attempt.stage.questionsJson, []);
  const { score, evaluations } = gradeAssessmentQuestions(questions, args.answers ?? {});
  const passed = score >= attempt.stage.passingScore;
  const status = passed ? "PASSED" : "FAILED";
  const cooldownUntil = passed
    ? null
    : new Date(now.getTime() + attempt.stage.cooldownMinutes * 60 * 1000);

  const updatedAttempt = await db.skillAssessmentAttempt.update({
    where: { id: attempt.id },
    data: {
      status,
      score,
      answersJson: JSON.stringify(args.answers ?? {}),
      feedbackJson: JSON.stringify(evaluations),
      completedAt: now,
      cooldownUntil,
    },
  });

  let verifiedLevel = currentVerifiedLevel;

  if (passed) {
    // Grant ONLY the level passed (or preserve higher level if re-taking a lower stage)
    verifiedLevel = Math.max(currentVerifiedLevel, attempt.level);
    await db.userSkillLevel.upsert({
      where: {
        userId_skillId: {
          userId: args.userId,
          skillId: attempt.skillId,
        },
      },
      update: {
        level: verifiedLevel,
        version: attempt.stage.version,
        score: attempt.level >= currentVerifiedLevel ? score : existingLevel?.score ?? score,
        lastAttemptId: attempt.id,
        verifiedAt: now,
      },
      create: {
        userId: args.userId,
        skillId: attempt.skillId,
        level: verifiedLevel,
        version: attempt.stage.version,
        score,
        lastAttemptId: attempt.id,
        verifiedAt: now,
      },
    });

    await syncReviewerSkillBadge(db, {
      userId: args.userId,
      skillName: attempt.skill.name,
      category: attempt.skill.category,
      level: verifiedLevel,
    });
  }

  return {
    attempt: {
      id: updatedAttempt.id,
      skillId: attempt.skillId,
      skillSlug: attempt.skill.slug,
      skillName: attempt.skill.name,
      level: updatedAttempt.level,
      levelName: getSkillLevelName(updatedAttempt.level),
      status: updatedAttempt.status,
      passed,
      score: updatedAttempt.score,
      passingScore: attempt.stage.passingScore,
      verifiedLevel,
      verifiedLevelName: verifiedLevel > 0 ? getSkillLevelName(verifiedLevel) : null,
      cooldownUntil: updatedAttempt.cooldownUntil ? updatedAttempt.cooldownUntil.toISOString() : null,
      completedAt: updatedAttempt.completedAt ? updatedAttempt.completedAt.toISOString() : null,
      evaluations,
    },
  };
}

/**
 * Helper used by seed scripts and tests to grant sequential verified levels (1..targetLevel)
 * with recorded PASSED attempts so the audit trail and `UserSkillLevel` / `ReviewerSkill` match.
 */
export async function seedVerifiedSkillLevel(
  db: DbClient,
  args: {
    userId: string;
    skillSlug: string;
    targetLevel: SkillLevelNumber;
    score?: number;
  },
) {
  await ensureDefaultSkillsSeeded(db);
  const skill = await resolveSkill(db, args.skillSlug);
  const score = args.score ?? 95;
  const now = new Date();

  for (let lvl = 1; lvl <= args.targetLevel; lvl++) {
    const stage = skill.stages.find((s) => s.level === lvl);
    if (!stage) continue;

    const attempt = await db.skillAssessmentAttempt.create({
      data: {
        userId: args.userId,
        skillId: skill.id,
        stageId: stage.id,
        level: lvl,
        version: stage.version,
        status: "PASSED",
        score,
        answersJson: JSON.stringify({ seeded: true }),
        feedbackJson: JSON.stringify([]),
        startedAt: now,
        completedAt: now,
      },
    });

    await db.userSkillLevel.upsert({
      where: {
        userId_skillId: {
          userId: args.userId,
          skillId: skill.id,
        },
      },
      update: {
        level: lvl,
        version: stage.version,
        score,
        lastAttemptId: attempt.id,
        verifiedAt: now,
      },
      create: {
        userId: args.userId,
        skillId: skill.id,
        level: lvl,
        version: stage.version,
        score,
        lastAttemptId: attempt.id,
        verifiedAt: now,
      },
    });
  }

  await syncReviewerSkillBadge(db, {
    userId: args.userId,
    skillName: skill.name,
    category: skill.category,
    level: args.targetLevel,
  });
}
