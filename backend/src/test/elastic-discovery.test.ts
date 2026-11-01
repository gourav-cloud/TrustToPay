import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db.js";
import { agent, createUser, fundTask, loginAs, resetDatabase, seedDemoUsers } from "./helpers.js";
import {
  assertNoConfidentialSpecialistData,
  buildSanitizedSpecialistDocument,
  cosineSimilarity,
  reindexAllApprovedSpecialists,
  setElasticAdaptersForTesting,
  syncSpecialistToElasticIndex,
  type ElasticHybridSearchHit,
  type ElasticTransportAdapter,
  type EmbeddingProvider,
  type SanitizedSpecialistDocument,
} from "../services/elastic/specialistIndexService.js";
import { rankSpecialistsForTask } from "../services/matching/rankingService.js";
import { acceptTaskOfferAtomically, dispatchTopOffers } from "../services/matching/offerDispatcher.js";
import { ensureDefaultSkillsSeeded } from "../services/skills/assessmentEngine.js";

class InMemoryElasticAdapter implements ElasticTransportAdapter {
  public docs = new Map<string, SanitizedSpecialistDocument>();
  public indexCreatedDims: number | null = null;
  public shouldFailSearch = false;

  async ping(): Promise<boolean> {
    return !this.shouldFailSearch;
  }

  async ensureIndex(_indexName: string, vectorDimensions: number | null): Promise<void> {
    this.indexCreatedDims = vectorDimensions;
  }

  async indexDocument(_indexName: string, id: string, doc: SanitizedSpecialistDocument): Promise<void> {
    assertNoConfidentialSpecialistData(doc);
    this.docs.set(id, doc);
  }

  async deleteDocument(_indexName: string, id: string): Promise<void> {
    this.docs.delete(id);
  }

  async hybridSearch(params: {
    indexName: string;
    queryText: string;
    requiredSkills: string[];
    minimumSkillLevel: number;
    queryVector: number[] | null;
    limit: number;
  }): Promise<ElasticHybridSearchHit[]> {
    if (this.shouldFailSearch) {
      throw new Error("Simulated Elasticsearch cluster timeout (2500ms exceeded)");
    }

    const hits: ElasticHybridSearchHit[] = [];
    const tokens = params.queryText
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2);

    for (const doc of this.docs.values()) {
      const hay = doc.searchableText.toLowerCase();
      let keywordMatches = 0;
      for (const token of tokens) {
        if (hay.includes(token)) keywordMatches += 1;
      }
      const keywordScore = tokens.length > 0 ? (keywordMatches / tokens.length) * 10 : 1;
      const vectorScore =
        params.queryVector && doc.embeddingVector
          ? Math.max(0, cosineSimilarity(params.queryVector, doc.embeddingVector))
          : null;
      const hybridScore =
        Math.round((keywordScore + (vectorScore !== null ? vectorScore * 10 : 0)) * 100) / 100;

      if (hybridScore > 0 || keywordMatches > 0) {
        hits.push({
          specialistId: doc.specialistId,
          hybridScore,
          keywordScore: Math.round(keywordScore * 100) / 100,
          vectorScore: vectorScore !== null ? Math.round(vectorScore * 100) / 100 : null,
          matchedSkills: doc.verifiedSkills.map((s) => `${s.name} (L${s.level})`),
          similarOutcomes: doc.completedOutcomes.slice(0, 3),
        });
      }
    }

    hits.sort((a, b) => b.hybridScore - a.hybridScore);
    return hits.slice(0, params.limit);
  }
}

class DeterministicJinaEmbeddingMock implements EmbeddingProvider {
  public modelName = "jina-embeddings-v3";
  public dims = 6;

  async embedText(text: string): Promise<{ vector: number[]; model: string; dimensions: number } | null> {
    const lower = text.toLowerCase();
    const vector = [
      lower.includes("crypto") || lower.includes("token") || lower.includes("security") ? 0.92 : 0.1,
      lower.includes("typescript") || lower.includes("node") ? 0.88 : 0.15,
      lower.includes("sql") || lower.includes("postgres") ? 0.85 : 0.05,
      lower.includes("python") ? 0.8 : 0.1,
      lower.includes("react") ? 0.75 : 0.1,
      0.25,
    ];
    return {
      vector,
      model: this.modelName,
      dimensions: this.dims,
    };
  }
}

describe("Phase 7B — Elastic Intelligent Specialist Discovery & Admin Operations APIs", () => {
  let memoryElastic: InMemoryElasticAdapter;
  let mockEmbeddings: DeterministicJinaEmbeddingMock;

  beforeEach(async () => {
    await resetDatabase();
    memoryElastic = new InMemoryElasticAdapter();
    mockEmbeddings = new DeterministicJinaEmbeddingMock();
    setElasticAdaptersForTesting({
      elasticAdapter: memoryElastic,
      embeddingProvider: mockEmbeddings,
    });
  });

  afterEach(() => {
    process.env.ELASTIC_ENABLED = "false";
    process.env.ELASTICSEARCH_URL = "";
    process.env.ELASTICSEARCH_API_KEY = "";
    process.env.JINA_API_KEY = "";
    setElasticAdaptersForTesting({});
  });

  it("blocks indexing of confidential fields, API keys, private keys, and raw code payloads", async () => {
    expect(() =>
      assertNoConfidentialSpecialistData({
        specialistId: "usr_1",
        payoutEmail: "secret-payout@example.com",
      }),
    ).toThrowError(/Forbidden confidential field "payoutEmail"/);

    expect(() =>
      assertNoConfidentialSpecialistData({
        specialistId: "usr_1",
        filesJson: '[{"path":"src/secret.ts","content":"export const x = 1;"}]',
      }),
    ).toThrowError(/Forbidden confidential field "filesJson"/);

    expect(() =>
      assertNoConfidentialSpecialistData({
        specialistId: "usr_1",
        searchableText: "Leaked agent key ttp_agent_1234567890abcdef123456",
      }),
    ).toThrowError(/Confidential credential pattern detected/);

    // Verify buildSanitizedSpecialistDocument scrubs emails/secrets and never includes payoutEmail or passwordHash
    await seedDemoUsers();
    await ensureDefaultSkillsSeeded(prisma);
    const reviewer = await prisma.user.findUniqueOrThrow({
      where: { email: "reviewer@demo.trusttopay.dev" },
    });

    await prisma.userProfile.upsert({
      where: { userId: reviewer.id },
      update: {
        payoutEmail: "private-paypal@example.com",
        payoutConsent: true,
        headline: "Security engineer contact me at private-paypal@example.com",
        bio: "Experienced in TypeScript and Node.js cryptography.",
      },
      create: {
        userId: reviewer.id,
        payoutEmail: "private-paypal@example.com",
        payoutConsent: true,
        headline: "Security engineer contact me at private-paypal@example.com",
        bio: "Experienced in TypeScript and Node.js cryptography.",
      },
    });

    const doc = await buildSanitizedSpecialistDocument(prisma, reviewer.id);
    expect(doc).not.toBeNull();
    const serialized = JSON.stringify(doc);
    expect(serialized).not.toContain("private-paypal@example.com");
    expect(serialized).not.toContain("passwordHash");
    expect(serialized).not.toContain("payoutEmail");
    expect(doc!.embeddingModel).toBe("jina-embeddings-v3");
    expect(doc!.embeddingDimensions).toBe(6);
  });

  it("synchronizes index on assessment/eligibility changes, discovers semantic candidates, and revalidates DB eligibility", async () => {
    process.env.ELASTIC_ENABLED = "true";
    process.env.ELASTICSEARCH_URL = "https://elastic.example.test:9200";
    process.env.ELASTICSEARCH_API_KEY = "test-elastic-api-key";
    process.env.JINA_API_KEY = "test-jina-api-key";

    await seedDemoUsers();
    await ensureDefaultSkillsSeeded(prisma);
    const skills = await prisma.skill.findMany();
    const securitySkill = skills.find((s) => s.slug === "security") ?? skills[0];

    const specA = await createUser("REVIEWER", {
      email: "spec-a@test.dev",
      name: "Spec Alpha (Security L3)",
      approved: true,
    });
    const specB = await createUser("REVIEWER", {
      email: "spec-b@test.dev",
      name: "Spec Beta (Security L1 only)",
      approved: true,
    });

    await prisma.userSkillLevel.create({
      data: {
        userId: specA.id,
        skillId: securitySkill.id,
        level: 3,
        score: 96,
      },
    });
    await prisma.userSkillLevel.create({
      data: {
        userId: specB.id,
        skillId: securitySkill.id,
        level: 1,
        score: 82,
      },
    });

    // Reindex all approved specialists into Elastic
    const reindexRes = await reindexAllApprovedSpecialists(prisma);
    expect(reindexRes.elasticConfigured).toBe(true);
    expect(reindexRes.indexedCount).toBeGreaterThanOrEqual(2);
    expect(memoryElastic.docs.has(specA.id)).toBe(true);
    expect(memoryElastic.docs.has(specB.id)).toBe(true);

    // Create a task with semantic security phrasing and minimumSkillLevel = 2
    const requester = await prisma.user.findUniqueOrThrow({
      where: { email: "agent@demo.trusttopay.dev" },
    });
    const session = await prisma.agentSession.create({
      data: {
        userId: requester.id,
        title: "Timing attack mitigation in bearer auth",
        category: "PROGRAMMING",
        question: "How do we eliminate timing side channels when comparing HMAC digests?",
        status: "ESCALATION_REQUIRED",
      },
    });
    const task = await prisma.reviewTask.create({
      data: {
        sessionId: session.id,
        requesterId: requester.id,
        category: "PROGRAMMING",
        title: "Timing attack mitigation in bearer auth",
        question: "How do we eliminate timing side channels when comparing HMAC digests?",
        acceptanceCriteria: "Use constant-time comparison and include unit tests.",
        requiredSkillsJson: JSON.stringify(["HMAC Timing Side-Channel Mitigation"]),
        minimumSkillLevel: 2,
        rewardMinor: 2500,
        currency: "USD",
        status: "FUNDED",
      },
    });

    // Rank specialists: Elastic discovers both specA and specB semantically,
    // but relational DB revalidation MUST exclude specB because specB only holds L1 (< minimum L2)!
    const ranking = await rankSpecialistsForTask(prisma, task.id);
    expect(ranking.discovery.usedElastic).toBe(true);
    expect(ranking.discovery.mode).toBe("HYBRID_ELASTIC");
    expect(ranking.discovery.embeddingModel).toBe("jina-embeddings-v3");

    const eligibleIds = ranking.eligible.map((e) => e.specialistId);
    expect(eligibleIds).toContain(specA.id);
    expect(eligibleIds).not.toContain(specB.id);

    const specBExclusion = ranking.excluded.find((e) => e.specialistId === specB.id);
    expect(specBExclusion?.reasonCode).toBe("INSUFFICIENT_SKILL_LEVEL");

    // Deactivating specA removes specA from Elastic index and excludes from ranking
    await prisma.user.update({
      where: { id: specA.id },
      data: { isReviewerApproved: false },
    });
    const syncOutcome = await syncSpecialistToElasticIndex(prisma, specA.id);
    expect(syncOutcome.action).toBe("REMOVED");
    expect(memoryElastic.docs.has(specA.id)).toBe(false);
  });

  it("gracefully falls back to relational DB matching on Elastic timeout/outage and preserves top-5 dispatch & atomic accept", async () => {
    process.env.ELASTIC_ENABLED = "true";
    process.env.ELASTICSEARCH_URL = "https://elastic.example.test:9200";
    process.env.ELASTICSEARCH_API_KEY = "test-elastic-api-key";
    memoryElastic.shouldFailSearch = true; // Simulate Elastic timeout/outage

    await seedDemoUsers();
    await ensureDefaultSkillsSeeded(prisma);
    const skills = await prisma.skill.findMany();
    const tsSkill = skills.find((s) => s.slug === "typescript") ?? skills[0];

    // Create 6 eligible specialists with verified TypeScript L2
    const specialists = [];
    for (let i = 1; i <= 6; i += 1) {
      const sp = await createUser("REVIEWER", {
        email: `fallback-spec-${i}@test.dev`,
        name: `Fallback Specialist ${i}`,
        approved: true,
      });
      await prisma.userSkillLevel.create({
        data: {
          userId: sp.id,
          skillId: tsSkill.id,
          level: 2,
          score: 85 + i,
        },
      });
      specialists.push(sp);
    }

    const requesterClient = agent();
    await loginAs(requesterClient, "agent@demo.trusttopay.dev");

    const created = await requesterClient.post("/api/v1/tasks").send({
      title: "Fix TypeScript generic inference in API client",
      question: "How do we preserve literal union types in request<T>()?",
      acceptanceCriteria: "Provide TypeScript implementation with zero any casts.",
      requiredSkills: ["TypeScript"],
      minimumSkillLevel: 2,
      rewardMinor: 2000,
      rewardApproved: true,
    });
    expect(created.status).toBe(201);
    const taskId = created.body.task.id as string;

    await fundTask(requesterClient, taskId);

    // Ranking succeeds via DB fallback despite Elastic outage
    const ranking = await rankSpecialistsForTask(prisma, taskId);
    expect(ranking.discovery.usedElastic).toBe(false);
    expect(ranking.discovery.mode).toBe("DATABASE_FALLBACK");
    expect(ranking.discovery.fallbackReason).toContain("Simulated Elasticsearch cluster timeout");
    expect(ranking.eligible.length).toBeGreaterThanOrEqual(6);

    // Top-5 parallel offer broadcast and atomic first-accept remain unchanged
    const dispatchRes = await prisma.$transaction((db) => dispatchTopOffers(db, taskId));
    expect(dispatchRes.dispatchedCount).toBe(5);
    expect(dispatchRes.status).toBe("OFFERED");

    const topTwo = dispatchRes.offers.slice(0, 2);
    const results = await Promise.allSettled([
      acceptTaskOfferAtomically(prisma, { taskId, specialistId: topTwo[0].specialistId }),
      acceptTaskOfferAtomically(prisma, { taskId, specialistId: topTwo[1].specialistId }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it("serves sanitized Admin Operations AG Grid endpoints to ADMIN and blocks non-admin roles", async () => {
    await seedDemoUsers();

    const reviewerClient = agent();
    await loginAs(reviewerClient, "reviewer@demo.trusttopay.dev");

    const forbidden = await reviewerClient.get("/api/v1/admin/specialists");
    expect(forbidden.status).toBe(403);

    const adminClient = agent();
    await loginAs(adminClient, "admin@demo.trusttopay.dev");

    const [specialistsRes, tasksRes, verificationsRes, paymentsRes, assessmentsRes, elasticStatusRes] =
      await Promise.all([
        adminClient.get("/api/v1/admin/specialists"),
        adminClient.get("/api/v1/admin/tasks"),
        adminClient.get("/api/v1/admin/verifications"),
        adminClient.get("/api/v1/admin/payments"),
        adminClient.get("/api/v1/admin/assessments"),
        adminClient.get("/api/v1/admin/elastic/status"),
      ]);

    expect(specialistsRes.status).toBe(200);
    expect(Array.isArray(specialistsRes.body.items)).toBe(true);
    expect(JSON.stringify(specialistsRes.body)).not.toContain("passwordHash");

    expect(tasksRes.status).toBe(200);
    expect(Array.isArray(tasksRes.body.items)).toBe(true);

    expect(verificationsRes.status).toBe(200);
    expect(Array.isArray(verificationsRes.body.items)).toBe(true);
    expect(JSON.stringify(verificationsRes.body)).not.toContain("evidenceNotes");

    expect(paymentsRes.status).toBe(200);
    expect(Array.isArray(paymentsRes.body.items)).toBe(true);
    expect(JSON.stringify(paymentsRes.body)).not.toContain("safePayloadJson");

    expect(assessmentsRes.status).toBe(200);
    expect(Array.isArray(assessmentsRes.body.items)).toBe(true);

    expect(elasticStatusRes.status).toBe(200);
    expect(elasticStatusRes.body.elastic.embeddingModel).toBe("jina-embeddings-v3");
  });
});
