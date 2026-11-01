import { Client } from "@elastic/elasticsearch";
import type { Prisma, PrismaClient } from "@prisma/client";
import { config } from "../../config.js";
import { getSkillLevelName } from "../skills/assessmentEngine.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type IndexedVerifiedSkill = {
  skillId: string;
  slug: string;
  name: string;
  category: string;
  level: number;
  levelName: string;
  score: number;
};

export type IndexedCompletedOutcome = {
  taskId: string;
  taskTitle: string;
  category: string;
  requiredSkills: string[];
  verifiedAt: string;
};

export type SanitizedSpecialistDocument = {
  specialistId: string;
  displayName: string;
  isActive: boolean;
  isReviewerApproved: boolean;
  headline: string;
  bioSummary: string;
  searchableText: string;
  verifiedSkills: IndexedVerifiedSkill[];
  skillSlugs: string[];
  skillNames: string[];
  maxVerifiedLevel: number;
  completedOutcomes: IndexedCompletedOutcome[];
  aggregateMetrics: {
    completedCount: number;
    acceptedSubmissions: number;
    rejectedSubmissions: number;
    verificationSuccessRate: number;
    avgTurnaroundMinutes: number | null;
    activeWorkload: number;
  };
  embeddingModel: string | null;
  embeddingDimensions: number | null;
  embeddingVector?: number[];
  updatedAt: string;
};

export type ElasticHybridSearchHit = {
  specialistId: string;
  hybridScore: number;
  keywordScore: number;
  vectorScore: number | null;
  matchedSkills: string[];
  similarOutcomes: IndexedCompletedOutcome[];
};

export type ElasticDiscoveryResult = {
  mode: "HYBRID_ELASTIC" | "KEYWORD_ELASTIC" | "DATABASE_FALLBACK";
  usedElastic: boolean;
  fallbackReason: string | null;
  indexName: string;
  embeddingModel: string | null;
  candidateIds: string[] | null;
  hitsBySpecialistId: Record<string, ElasticHybridSearchHit>;
  similarCompletedTasks: IndexedCompletedOutcome[];
  durationMs: number;
};

export interface EmbeddingProvider {
  embedText(text: string): Promise<{ vector: number[]; model: string; dimensions: number } | null>;
}

export interface ElasticTransportAdapter {
  ensureIndex(indexName: string, vectorDimensions: number | null): Promise<void>;
  indexDocument(indexName: string, id: string, doc: SanitizedSpecialistDocument): Promise<void>;
  deleteDocument(indexName: string, id: string): Promise<void>;
  hybridSearch(params: {
    indexName: string;
    queryText: string;
    requiredSkills: string[];
    minimumSkillLevel: number;
    queryVector: number[] | null;
    limit: number;
  }): Promise<ElasticHybridSearchHit[]>;
  ping(): Promise<boolean>;
}

const FORBIDDEN_INDEX_KEYS = new Set([
  "passwordHash",
  "password",
  "payoutEmail",
  "email",
  "rawKey",
  "keyHash",
  "apiKey",
  "secret",
  "callbackSecret",
  "filesJson",
  "patchText",
  "evidenceNotes",
  "securityReviewJson",
  "safePayloadJson",
]);

const SECRET_VALUE_PATTERNS = [
  /ttp_agent_[a-zA-Z0-9_-]{12,}/g,
  /sk-[a-zA-Z0-9]{20,}/g,
  /AIza[0-9A-Za-z-_]{35}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /[^\s@]+@[^\s@]+\.[^\s@]+/g,
];

export function scrubConfidentialText(input: string | null | undefined, maxLength = 600): string {
  if (!input) return "";
  let cleaned = input.trim();
  for (const pattern of SECRET_VALUE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "[REDACTED]");
  }
  return cleaned.slice(0, maxLength);
}

/**
 * Guard that throws if any forbidden key or raw credential/email/code payload
 * is present in a document scheduled for Elasticsearch indexing.
 */
export function assertNoConfidentialSpecialistData(doc: unknown): void {
  const visit = (value: unknown, path: string): void => {
    if (value === null || value === undefined) return;
    if (typeof value === "string") {
      if (
        /ttp_agent_[a-zA-Z0-9_-]{12,}/.test(value) ||
        /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value) ||
        /sk-[a-zA-Z0-9]{20,}/.test(value) ||
        /AIza[0-9A-Za-z-_]{35}/.test(value)
      ) {
        throw new Error(`Confidential credential pattern detected in Elastic document at ${path}`);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, idx) => visit(item, `${path}[${idx}]`));
      return;
    }
    if (typeof value === "object") {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (FORBIDDEN_INDEX_KEYS.has(key)) {
          throw new Error(`Forbidden confidential field "${key}" cannot be indexed in Elasticsearch (${path}.${key})`);
        }
        visit(child, `${path}.${key}`);
      }
    }
  };

  visit(doc, "root");
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length === 0 || vecA.length !== vecB.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i += 1) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

class JinaHttpEmbeddingProvider implements EmbeddingProvider {
  async embedText(text: string): Promise<{ vector: number[]; model: string; dimensions: number } | null> {
    if (!config.jinaConfigured || !text.trim()) {
      return null;
    }
    const model = config.jinaEmbeddingModel;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.elasticTimeoutMs);
    try {
      const response = await fetch("https://api.jina.ai/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.jinaApiKey}`,
        },
        body: JSON.stringify({
          model,
          input: [text.slice(0, 4000)],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        return null;
      }
      const data = (await response.json()) as {
        model?: string;
        data?: Array<{ embedding?: number[] }>;
      };
      const vector = data?.data?.[0]?.embedding;
      if (!Array.isArray(vector) || vector.length === 0 || !vector.every((n) => typeof n === "number" && Number.isFinite(n))) {
        return null;
      }
      return {
        vector,
        model: data.model ?? model,
        dimensions: vector.length,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

class OfficialElasticTransportAdapter implements ElasticTransportAdapter {
  private client: Client | null = null;
  private clientKey = "";

  private getClient(): Client {
    const key = `${config.elasticsearchUrl}|${config.elasticsearchApiKey}|${config.elasticTimeoutMs}`;
    if (!this.client || this.clientKey !== key) {
      this.client = new Client({
        node: config.elasticsearchUrl,
        auth: { apiKey: config.elasticsearchApiKey },
        requestTimeout: config.elasticTimeoutMs,
        maxRetries: 1,
      });
      this.clientKey = key;
    }
    return this.client;
  }

  async ping(): Promise<boolean> {
    if (!config.elasticConfigured) return false;
    const client = this.getClient();
    return Boolean(await client.ping());
  }

  async ensureIndex(indexName: string, vectorDimensions: number | null): Promise<void> {
    const client = this.getClient();
    const exists = await client.indices.exists({ index: indexName });
    if (exists) return;

    const properties: Record<string, unknown> = {
      specialistId: { type: "keyword" },
      displayName: { type: "text" },
      isActive: { type: "boolean" },
      isReviewerApproved: { type: "boolean" },
      headline: { type: "text" },
      bioSummary: { type: "text" },
      searchableText: { type: "text" },
      skillSlugs: { type: "keyword" },
      skillNames: { type: "text", fields: { keyword: { type: "keyword" } } },
      maxVerifiedLevel: { type: "integer" },
      verifiedSkills: {
        type: "nested",
        properties: {
          skillId: { type: "keyword" },
          slug: { type: "keyword" },
          name: { type: "text", fields: { keyword: { type: "keyword" } } },
          category: { type: "keyword" },
          level: { type: "integer" },
          levelName: { type: "keyword" },
          score: { type: "float" },
        },
      },
      completedOutcomes: {
        type: "nested",
        properties: {
          taskId: { type: "keyword" },
          taskTitle: { type: "text" },
          category: { type: "keyword" },
          requiredSkills: { type: "keyword" },
          verifiedAt: { type: "date" },
        },
      },
      updatedAt: { type: "date" },
    };

    if (vectorDimensions && vectorDimensions > 0) {
      properties.embeddingVector = {
        type: "dense_vector",
        dims: vectorDimensions,
        index: true,
        similarity: "cosine",
      };
    }

    await client.indices.create({
      index: indexName,
      mappings: {
        dynamic: true,
        properties: properties as Record<string, never>,
      },
    });
  }

  async indexDocument(indexName: string, id: string, doc: SanitizedSpecialistDocument): Promise<void> {
    assertNoConfidentialSpecialistData(doc);
    await this.ensureIndex(indexName, doc.embeddingDimensions);
    const client = this.getClient();
    await client.index({
      index: indexName,
      id,
      document: doc,
      refresh: true,
    });
  }

  async deleteDocument(indexName: string, id: string): Promise<void> {
    const client = this.getClient();
    try {
      await client.delete({
        index: indexName,
        id,
        refresh: true,
      });
    } catch (error) {
      const statusCode = (error as { meta?: { statusCode?: number } })?.meta?.statusCode;
      if (statusCode === 404) return;
      throw error;
    }
  }

  async hybridSearch(params: {
    indexName: string;
    queryText: string;
    requiredSkills: string[];
    minimumSkillLevel: number;
    queryVector: number[] | null;
    limit: number;
  }): Promise<ElasticHybridSearchHit[]> {
    const client = this.getClient();

    const shouldClauses: Array<Record<string, unknown>> = [
      {
        multi_match: {
          query: params.queryText,
          fields: ["skillNames^3", "headline^2", "bioSummary^1.5", "searchableText^1.2"],
          type: "best_fields",
          fuzziness: "AUTO",
        },
      },
    ];

    for (const skill of params.requiredSkills) {
      shouldClauses.push({
        match_phrase: {
          skillNames: {
            query: skill,
            boost: 3.0,
          },
        },
      });
    }

    const searchRequest: Record<string, unknown> = {
      index: params.indexName,
      size: params.limit,
      query: {
        bool: {
          filter: [
            { term: { isActive: true } },
            { term: { isReviewerApproved: true } },
            { range: { maxVerifiedLevel: { gte: params.minimumSkillLevel } } },
          ],
          should: shouldClauses,
        },
      },
    };

    if (params.queryVector && params.queryVector.length > 0) {
      searchRequest.knn = {
        field: "embeddingVector",
        query_vector: params.queryVector,
        k: params.limit,
        num_candidates: Math.max(20, params.limit * 4),
        boost: 2.0,
      };
    }

    const response = await client.search<SanitizedSpecialistDocument>(searchRequest as never);
    const hits = response.hits?.hits ?? [];

    return hits
      .map((hit) => {
        const source = hit._source;
        if (!source) return null;
        const rawScore = typeof hit._score === "number" ? hit._score : 1;
        const vectorScore =
          params.queryVector && source.embeddingVector
            ? Math.max(0, cosineSimilarity(params.queryVector, source.embeddingVector))
            : null;
        return {
          specialistId: source.specialistId,
          hybridScore: Math.round(rawScore * 100) / 100,
          keywordScore: Math.round(rawScore * 100) / 100,
          vectorScore: vectorScore !== null ? Math.round(vectorScore * 100) / 100 : null,
          matchedSkills: source.verifiedSkills.map((s) => `${s.name} (L${s.level})`),
          similarOutcomes: (source.completedOutcomes ?? []).slice(0, 3),
        };
      })
      .filter((item): item is ElasticHybridSearchHit => item !== null);
  }
}

let activeElasticAdapter: ElasticTransportAdapter = new OfficialElasticTransportAdapter();
let activeEmbeddingProvider: EmbeddingProvider = new JinaHttpEmbeddingProvider();

export function setElasticAdaptersForTesting(overrides: {
  elasticAdapter?: ElasticTransportAdapter | null;
  embeddingProvider?: EmbeddingProvider | null;
}): void {
  activeElasticAdapter = overrides.elasticAdapter ?? new OfficialElasticTransportAdapter();
  activeEmbeddingProvider = overrides.embeddingProvider ?? new JinaHttpEmbeddingProvider();
}

export async function buildSanitizedSpecialistDocument(
  db: DbClient,
  specialistId: string,
): Promise<SanitizedSpecialistDocument | null> {
  const user = await db.user.findUnique({
    where: { id: specialistId },
    include: {
      profile: true,
      verifiedSkillLevels: {
        include: {
          skill: true,
        },
      },
      skills: true,
      assignments: {
        include: {
          task: {
            select: {
              id: true,
              title: true,
              category: true,
              requiredSkillsJson: true,
              status: true,
              verifiedAt: true,
            },
          },
        },
      },
      submissions: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!user || user.role !== "REVIEWER") {
    return null;
  }

  const verifiedSkills: IndexedVerifiedSkill[] = user.verifiedSkillLevels.map((ul) => ({
    skillId: ul.skillId,
    slug: ul.skill.slug,
    name: ul.skill.name,
    category: ul.skill.category,
    level: ul.level,
    levelName: getSkillLevelName(ul.level),
    score: ul.score,
  }));

  // Include legacy ReviewerSkill records if not already in verifiedSkillLevels
  const existingNames = new Set(verifiedSkills.map((s) => s.name.toLowerCase()));
  for (const rs of user.skills) {
    if (!existingNames.has(rs.name.toLowerCase())) {
      const normalizedLevel = Math.max(1, Math.min(3, rs.level));
      verifiedSkills.push({
        skillId: rs.id,
        slug: rs.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name: rs.name,
        category: "GENERAL",
        level: normalizedLevel,
        levelName: getSkillLevelName(normalizedLevel),
        score: 80,
      });
    }
  }

  const maxVerifiedLevel = verifiedSkills.reduce((max, s) => Math.max(max, s.level), 0);

  const completedOutcomes: IndexedCompletedOutcome[] = user.assignments
    .filter((a) => a.status === "COMPLETED" && a.task)
    .slice(0, 10)
    .map((a) => {
      let parsedSkills: string[] = [];
      try {
        parsedSkills = JSON.parse(a.task.requiredSkillsJson || "[]");
      } catch {
        parsedSkills = [];
      }
      return {
        taskId: a.task.id,
        taskTitle: scrubConfidentialText(a.task.title, 160),
        category: a.task.category,
        requiredSkills: parsedSkills,
        verifiedAt: (a.task.verifiedAt ?? a.completedAt ?? new Date()).toISOString(),
      };
    });

  const acceptedSubmissions = user.submissions.filter((s) => s.status === "ACCEPTED").length;
  const rejectedSubmissions = user.submissions.filter((s) => s.status === "REJECTED").length;
  const gradedTotal = acceptedSubmissions + rejectedSubmissions;
  const verificationSuccessRate =
    gradedTotal > 0 ? Math.round((acceptedSubmissions / gradedTotal) * 10000) / 100 : 75;

  const completedWithTimes = user.assignments.filter(
    (a) => a.status === "COMPLETED" && a.completedAt && a.acceptedAt,
  );
  let avgTurnaroundMinutes: number | null = null;
  if (completedWithTimes.length > 0) {
    const totalMinutes = completedWithTimes.reduce((sum, a) => {
      const diffMs = Math.max(0, a.completedAt!.getTime() - a.acceptedAt.getTime());
      return sum + diffMs / 60_000;
    }, 0);
    avgTurnaroundMinutes = Math.round((totalMinutes / completedWithTimes.length) * 100) / 100;
  }

  const activeWorkload = user.assignments.filter((a) => a.status === "ACTIVE").length;
  const headline = scrubConfidentialText(user.profile?.headline, 160);
  const bioSummary = scrubConfidentialText(user.profile?.bio, 500);

  const searchableText = [
    user.name,
    headline,
    bioSummary,
    ...verifiedSkills.map((s) => `${s.name} ${s.slug} ${s.category} L${s.level} ${s.levelName}`),
    ...completedOutcomes.map((o) => `${o.taskTitle} ${o.category} ${o.requiredSkills.join(" ")}`),
  ]
    .filter(Boolean)
    .join(" | ");

  let embeddingModel: string | null = null;
  let embeddingDimensions: number | null = null;
  let embeddingVector: number[] | undefined;

  const embedded = await activeEmbeddingProvider.embedText(searchableText);
  if (embedded && embedded.vector.length > 0) {
    embeddingModel = embedded.model;
    embeddingDimensions = embedded.dimensions;
    embeddingVector = embedded.vector;
  }

  const doc: SanitizedSpecialistDocument = {
    specialistId: user.id,
    displayName: scrubConfidentialText(user.name, 100),
    isActive: user.isActive,
    isReviewerApproved: user.isReviewerApproved,
    headline,
    bioSummary,
    searchableText,
    verifiedSkills,
    skillSlugs: verifiedSkills.map((s) => s.slug),
    skillNames: verifiedSkills.map((s) => s.name),
    maxVerifiedLevel,
    completedOutcomes,
    aggregateMetrics: {
      completedCount: completedWithTimes.length,
      acceptedSubmissions,
      rejectedSubmissions,
      verificationSuccessRate,
      avgTurnaroundMinutes,
      activeWorkload,
    },
    embeddingModel,
    embeddingDimensions,
    ...(embeddingVector ? { embeddingVector } : {}),
    updatedAt: new Date().toISOString(),
  };

  assertNoConfidentialSpecialistData(doc);
  return doc;
}

/**
 * Synchronizes a specialist's non-sensitive profile & verified skills into Elasticsearch,
 * or removes them from the index if deactivated/unapproved. Never throws on network outage
 * unless `throwOnError` is true.
 */
export async function syncSpecialistToElasticIndex(
  db: DbClient,
  specialistId: string,
  options: { throwOnError?: boolean } = {},
): Promise<{ synced: boolean; action: "INDEXED" | "REMOVED" | "SKIPPED"; reason?: string }> {
  if (!config.elasticConfigured) {
    return { synced: false, action: "SKIPPED", reason: "ELASTIC_NOT_CONFIGURED" };
  }

  try {
    const doc = await buildSanitizedSpecialistDocument(db, specialistId);
    if (!doc || !doc.isActive || !doc.isReviewerApproved) {
      await activeElasticAdapter.deleteDocument(config.elasticIndexSpecialists, specialistId);
      return { synced: true, action: "REMOVED" };
    }

    await activeElasticAdapter.indexDocument(config.elasticIndexSpecialists, specialistId, doc);
    return { synced: true, action: "INDEXED" };
  } catch (error) {
    if (options.throwOnError) throw error;
    return {
      synced: false,
      action: "SKIPPED",
      reason: error instanceof Error ? error.message : "ELASTIC_SYNC_ERROR",
    };
  }
}

export async function reindexAllApprovedSpecialists(
  db: DbClient,
): Promise<{
  indexName: string;
  elasticConfigured: boolean;
  indexedCount: number;
  removedCount: number;
  errors: string[];
}> {
  const reviewers = await db.user.findMany({
    where: { role: "REVIEWER" },
    select: { id: true, isActive: true, isReviewerApproved: true },
  });

  if (!config.elasticConfigured) {
    return {
      indexName: config.elasticIndexSpecialists,
      elasticConfigured: false,
      indexedCount: 0,
      removedCount: 0,
      errors: ["Elasticsearch is not configured (set ELASTIC_ENABLED=true, ELASTICSEARCH_URL, ELASTICSEARCH_API_KEY)."],
    };
  }

  let indexedCount = 0;
  let removedCount = 0;
  const errors: string[] = [];

  for (const reviewer of reviewers) {
    try {
      const outcome = await syncSpecialistToElasticIndex(db, reviewer.id, { throwOnError: true });
      if (outcome.action === "INDEXED") indexedCount += 1;
      if (outcome.action === "REMOVED") removedCount += 1;
    } catch (error) {
      errors.push(`${reviewer.id}: ${error instanceof Error ? error.message : "Sync failed"}`);
    }
  }

  return {
    indexName: config.elasticIndexSpecialists,
    elasticConfigured: true,
    indexedCount,
    removedCount,
    errors,
  };
}

/**
 * Performs hybrid keyword + semantic vector discovery in Elasticsearch to retrieve
 * candidate specialist IDs and similar completed tasks. Gracefully falls back to
 * relational database matching on timeout, error, or unconfigured state.
 */
export async function discoverSpecialistCandidatesForTask(
  task: {
    id: string;
    title: string;
    question: string;
    acceptanceCriteria: string;
    category: string;
    requiredSkills: string[];
    minimumSkillLevel: number;
  },
  options: { limit?: number } = {},
): Promise<ElasticDiscoveryResult> {
  const started = Date.now();
  const limit = options.limit ?? 25;

  if (!config.elasticConfigured) {
    return {
      mode: "DATABASE_FALLBACK",
      usedElastic: false,
      fallbackReason: config.elasticEnabled ? "ELASTIC_CREDENTIALS_MISSING" : "ELASTIC_DISABLED",
      indexName: config.elasticIndexSpecialists,
      embeddingModel: null,
      candidateIds: null,
      hitsBySpecialistId: {},
      similarCompletedTasks: [],
      durationMs: Date.now() - started,
    };
  }

  try {
    const queryText = [
      task.title,
      task.question,
      task.acceptanceCriteria,
      task.category,
      ...task.requiredSkills,
    ]
      .filter(Boolean)
      .join(" ");

    const embedded = await activeEmbeddingProvider.embedText(queryText);
    const hits = await activeElasticAdapter.hybridSearch({
      indexName: config.elasticIndexSpecialists,
      queryText,
      requiredSkills: task.requiredSkills,
      minimumSkillLevel: task.minimumSkillLevel,
      queryVector: embedded?.vector ?? null,
      limit,
    });

    const hitsBySpecialistId: Record<string, ElasticHybridSearchHit> = {};
    const similarCompletedTasks: IndexedCompletedOutcome[] = [];
    const seenTaskIds = new Set<string>();

    for (const hit of hits) {
      hitsBySpecialistId[hit.specialistId] = hit;
      for (const outcome of hit.similarOutcomes ?? []) {
        if (!seenTaskIds.has(outcome.taskId)) {
          seenTaskIds.add(outcome.taskId);
          similarCompletedTasks.push(outcome);
        }
      }
    }

    return {
      mode: embedded ? "HYBRID_ELASTIC" : "KEYWORD_ELASTIC",
      usedElastic: true,
      fallbackReason: null,
      indexName: config.elasticIndexSpecialists,
      embeddingModel: embedded?.model ?? null,
      candidateIds: hits.map((h) => h.specialistId),
      hitsBySpecialistId,
      similarCompletedTasks: similarCompletedTasks.slice(0, 5),
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      mode: "DATABASE_FALLBACK",
      usedElastic: false,
      fallbackReason: error instanceof Error ? error.message : "ELASTIC_SEARCH_FAILED",
      indexName: config.elasticIndexSpecialists,
      embeddingModel: null,
      candidateIds: null,
      hitsBySpecialistId: {},
      similarCompletedTasks: [],
      durationMs: Date.now() - started,
    };
  }
}
