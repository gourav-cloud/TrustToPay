import { beforeEach, describe, expect, it } from "vitest";
import {
  agent,
  analyzeChargerSession,
  chargerDocuments,
  createChargerSession,
  createUser,
  loginAs,
  resetDatabase,
  sessionInput,
} from "./helpers.js";

let requester: Awaited<ReturnType<typeof createUser>>;
let outsider: Awaited<ReturnType<typeof createUser>>;
let requesterClient: ReturnType<typeof agent>;
let outsiderClient: ReturnType<typeof agent>;

beforeEach(async () => {
  await resetDatabase();
  requester = await createUser("REQUESTER", { email: "session-owner@test.dev", name: "Session Owner" });
  outsider = await createUser("REQUESTER", { email: "session-outsider@test.dev", name: "Someone Else" });
  requesterClient = agent();
  outsiderClient = agent();
  await loginAs(requesterClient, requester.email);
  await loginAs(outsiderClient, outsider.email);
});

describe("agent session creation", () => {
  it("creates a DRAFT session with evidence in a single request", async () => {
    const response = await requesterClient.post("/api/v1/sessions").send(sessionInput);

    expect(response.status).toBe(201);
    expect(response.body.session.status).toBe("DRAFT");
    expect(response.body.session.title).toBe(sessionInput.title);
    expect(response.body.session.category).toBe("HARDWARE");
    expect(response.body.session.productModels).toEqual(sessionInput.productModels);
    expect(response.body.session.evidence).toHaveLength(chargerDocuments.length);
  });

  it("rejects a question that is too short", async () => {
    const response = await requesterClient.post("/api/v1/sessions").send({ ...sessionInput, question: "Too short" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details.some((detail: { path: string }) => detail.path === "question")).toBe(true);
  });

  it("requires authentication", async () => {
    const response = await agent().post("/api/v1/sessions").send(sessionInput);
    expect(response.status).toBe(401);
  });
});

describe("analysis", () => {
  it("escalates a documented capability conflict and persists the new status", async () => {
    const session = await createChargerSession(requesterClient);

    const analysis = await analyzeChargerSession(requesterClient, session.id);

    expect(analysis.mode).toBe("DEMO_AI");
    expect(analysis.threshold).toBe(0.75);
    expect(analysis.sessionStatus).toBe("ESCALATION_REQUIRED");
    expect(analysis.analysis.recommendedAction).toBe("ESCALATE_TO_HUMAN");
    expect(analysis.analysis.confidenceScore).toBeLessThan(analysis.threshold);
    expect(analysis.analysis.output.conflictingClaims.length).toBeGreaterThan(0);

    const stored = await requesterClient.get(`/api/v1/sessions/${session.id}`);
    expect(stored.status).toBe(200);
    expect(stored.body.session.status).toBe("ESCALATION_REQUIRED");
    expect(stored.body.session.analysisRuns).toHaveLength(1);
  });

  it("escalates when no evidence is supplied because confidence is too low", async () => {
    const create = await requesterClient.post("/api/v1/sessions").send({
      question: "Is my laptop charger good enough for full speed charging?",
      documents: [],
    });
    expect(create.status).toBe(201);

    const analysis = await analyzeChargerSession(requesterClient, create.body.session.id);

    expect(analysis.analysis.recommendedAction).toBe("ESCALATE_TO_HUMAN");
    expect(analysis.analysis.output.missingInformation.length).toBeGreaterThan(0);
  });

  it("analyzes a programming question and inherits its category on the review task", async () => {
    const create = await requesterClient.post("/api/v1/sessions").send({
      title: "Worker pool stalls after deploy",
      category: "PROGRAMMING",
      question:
        "Our Node 20 worker pool stalls after a deploy. Why does the queue stop draining, and is the retry configuration safe?",
      productModels: ["worker-pool.ts"],
      specifications: ["Node 20.11"],
      documents: [
        {
          title: "worker-pool.ts excerpt",
          sourceType: "DOCUMENT",
          content:
            "The worker pool is configured with pool size is 4 workers. Each job calls await fetch inside a for loop. The queue stops draining after four jobs.",
        },
        {
          title: "Deployment runbook",
          sourceType: "DOCUMENT",
          content:
            "The worker pool is configured with pool size is 12 workers. The HTTP timeout is 30 seconds. This runbook does not describe a backpressure mechanism.",
        },
      ],
    });
    expect(create.status).toBe(201);
    expect(create.body.session.category).toBe("PROGRAMMING");

    const analysis = await requesterClient.post(`/api/v1/sessions/${create.body.session.id}/analyze`);
    expect(analysis.status).toBe(201);
    expect(analysis.body.analysis.recommendedAction).toBe("ESCALATE_TO_HUMAN");

    const task = await requesterClient.post("/api/v1/tasks").send({
      sessionId: create.body.session.id,
      acceptanceCriteria:
        "State the likely root cause\nCite the pool size and timeout configuration\nRecommend a fix",
      rewardMinor: 1200,
      rewardApproved: true,
    });

    expect(task.status, JSON.stringify(task.body)).toBe(201);
    expect(task.body.task.category).toBe("PROGRAMMING");
    expect(task.body.task.requiredSkills).toContain("Node.js runtime");
  });
});

describe("session ownership", () => {
  it("hides another requester's session", async () => {
    const session = await createChargerSession(requesterClient);

    const response = await outsiderClient.get(`/api/v1/sessions/${session.id}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("lists only the signed-in requester's sessions", async () => {
    await createChargerSession(requesterClient);

    const ownerList = await requesterClient.get("/api/v1/sessions");
    const outsiderList = await outsiderClient.get("/api/v1/sessions");

    expect(ownerList.body.pagination.total).toBe(1);
    expect(outsiderList.body.pagination.total).toBe(0);
  });

  it("refuses to resume a session without a review task", async () => {
    const session = await createChargerSession(requesterClient);

    const response = await requesterClient.post(`/api/v1/sessions/${session.id}/resume`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("NO_REVIEW_TASK");
  });
});
