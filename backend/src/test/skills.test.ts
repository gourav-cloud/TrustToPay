import { beforeEach, describe, expect, it } from "vitest";
import { agent, createUser, loginAs, resetDatabase } from "./helpers.js";

describe("Phase 2 — Three-Level Skill Assessment & Sequential Verification Engine", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("forbids self-reported skills via PATCH /api/v1/users/me/payout", async () => {
    const reviewer = await createUser("REVIEWER", { email: "rev-skills@test.dev" });
    const client = agent();
    await loginAs(client, reviewer.email);

    const response = await client.patch("/api/v1/users/me/payout").send({
      headline: "Senior Engineer",
      skills: ["TypeScript", "Smart Contracts"],
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("SELF_REPORTED_SKILLS_FORBIDDEN");
  });

  it("lists technical skills with L1 unlocked and L2/L3 locked for a new user without leaking answer keys", async () => {
    const reviewer = await createUser("REVIEWER", { email: "rev-catalog@test.dev" });
    const client = agent();
    await loginAs(client, reviewer.email);

    const res = await client.get("/api/v1/skills");
    expect(res.status).toBe(200);
    expect(res.body.skills.length).toBeGreaterThanOrEqual(4);

    const tsSkill = res.body.skills.find((s: { slug: string }) => s.slug === "typescript");
    expect(tsSkill).toBeDefined();
    expect(tsSkill.verifiedLevel).toBe(0);
    expect(tsSkill.stages).toHaveLength(3);

    const [l1, l2, l3] = tsSkill.stages;
    expect(l1.level).toBe(1);
    expect(l1.levelName).toBe("Foundation");
    expect(l1.status).toBe("AVAILABLE");
    expect(l1.unlocked).toBe(true);

    expect(l2.level).toBe(2);
    expect(l2.levelName).toBe("Practitioner");
    expect(l2.status).toBe("LOCKED");
    expect(l2.unlocked).toBe(false);

    expect(l3.level).toBe(3);
    expect(l3.levelName).toBe("Advanced");
    expect(l3.status).toBe("LOCKED");
    expect(l3.unlocked).toBe(false);
  });

  it("blocks attempting L2 without L1 and L3 without L2 (SEQUENTIAL_LEVEL_LOCKED)", async () => {
    const reviewer = await createUser("REVIEWER", { email: "rev-locked@test.dev" });
    const client = agent();
    await loginAs(client, reviewer.email);

    const l2Attempt = await client.post("/api/v1/skills/typescript/assessments/2/start");
    expect(l2Attempt.status).toBe(403);
    expect(l2Attempt.body.error.code).toBe("SEQUENTIAL_LEVEL_LOCKED");

    const l3Attempt = await client.post("/api/v1/skills/typescript/assessments/3/start");
    expect(l3Attempt.status).toBe(403);
    expect(l3Attempt.body.error.code).toBe("SEQUENTIAL_LEVEL_LOCKED");
  });

  it("enforces sequential L1 -> L2 -> L3 progression, preserves L1 on L2 failure, and enforces cooldown", async () => {
    const reviewer = await createUser("REVIEWER", { email: "rev-progression@test.dev" });
    const client = agent();
    await loginAs(client, reviewer.email);

    // 1. Start L1 for TypeScript
    const startL1 = await client.post("/api/v1/skills/typescript/assessments/1/start");
    expect(startL1.status).toBe(201);
    expect(startL1.body.attempt.level).toBe(1);
    expect(startL1.body.questions).toHaveLength(2);
    // Ensure answer keys are stripped from public questions
    expect(startL1.body.questions[0].correctOptionId).toBeUndefined();
    expect(startL1.body.questions[1].requiredSnippets).toBeUndefined();

    // 2. Submit passing answers for L1
    const submitL1 = await client
      .post(`/api/v1/skills/attempts/${startL1.body.attempt.id}/submit`)
      .send({
        answers: {
          "ts-l1-q1": "a",
          "ts-l1-q2":
            "export function safeDivide(a: number, b: number): number | null { if (b === 0) return null; return a / b; }",
        },
      });
    expect(submitL1.status).toBe(200);
    expect(submitL1.body.attempt.passed).toBe(true);
    expect(submitL1.body.attempt.score).toBe(100);
    expect(submitL1.body.attempt.verifiedLevel).toBe(1);
    expect(submitL1.body.attempt.verifiedLevelName).toBe("Foundation");

    // Still cannot skip to L3 before passing L2
    const prematureL3 = await client.post("/api/v1/skills/typescript/assessments/3/start");
    expect(prematureL3.status).toBe(403);
    expect(prematureL3.body.error.code).toBe("SEQUENTIAL_LEVEL_LOCKED");

    // 3. Start L2 and submit a failing attempt
    const startL2Fail = await client.post("/api/v1/skills/typescript/assessments/2/start");
    expect(startL2Fail.status).toBe(201);

    const submitL2Fail = await client
      .post(`/api/v1/skills/attempts/${startL2Fail.body.attempt.id}/submit`)
      .send({
        answers: {
          "ts-l2-q1": "c",
          "ts-l2-q2": "// incomplete",
        },
      });
    expect(submitL2Fail.status).toBe(200);
    expect(submitL2Fail.body.attempt.passed).toBe(false);
    expect(submitL2Fail.body.attempt.score).toBe(0);
    // Failing L2 must NOT grant L2 AND must NOT revoke previously passed L1
    expect(submitL2Fail.body.attempt.verifiedLevel).toBe(1);
    expect(submitL2Fail.body.attempt.cooldownUntil).toBeTruthy();

    // 4. Immediate retry of L2 during cooldown must be blocked with 429 ASSESSMENT_COOLDOWN_ACTIVE
    const retryDuringCooldown = await client.post("/api/v1/skills/typescript/assessments/2/start");
    expect(retryDuringCooldown.status).toBe(429);
    expect(retryDuringCooldown.body.error.code).toBe("ASSESSMENT_COOLDOWN_ACTIVE");

    // Verify /auth/me still shows TypeScript at L1
    const meAfterFail = await client.get("/api/v1/auth/me");
    expect(meAfterFail.status).toBe(200);
    expect(meAfterFail.body.user.skills).toEqual([
      expect.objectContaining({ name: "TypeScript", level: 1 }),
    ]);

    // 5. Complete L1 -> L2 -> L3 on Python to verify full sequential path to L3 Advanced
    const pyL1 = await client.post("/api/v1/skills/python/assessments/1/submit").send({
      answers: {
        "py-l1-q1": "a",
        "py-l1-q2":
          "def append_item(item: str, bucket: list[str] | None = None) -> list[str]:\n    if bucket is None:\n        bucket = []\n    bucket.append(item)\n    return bucket",
      },
    });
    expect(pyL1.status).toBe(200);
    expect(pyL1.body.attempt.passed).toBe(true);
    expect(pyL1.body.attempt.verifiedLevel).toBe(1);

    const pyL2 = await client.post("/api/v1/skills/python/assessments/2/submit").send({
      answers: {
        "py-l2-q1": "a",
        "py-l2-q2": "def to_minor_units(amount: Decimal) -> int:\n    return int(amount * 100)",
      },
    });
    expect(pyL2.status).toBe(200);
    expect(pyL2.body.attempt.passed).toBe(true);
    expect(pyL2.body.attempt.verifiedLevel).toBe(2);

    const pyL3 = await client.post("/api/v1/skills/python/assessments/3/submit").send({
      answers: {
        "py-l3-q1": "a",
        "py-l3-q2": "def fetch_user(cursor, user_id: str):\n    return cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))",
      },
    });
    expect(pyL3.status).toBe(200);
    expect(pyL3.body.attempt.passed).toBe(true);
    expect(pyL3.body.attempt.verifiedLevel).toBe(3);
    expect(pyL3.body.attempt.verifiedLevelName).toBe("Advanced");
  });
});
