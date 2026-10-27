import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "./helpers.js";

describe("GET /health", () => {
  it("reports a healthy database, demo AI and simulated payments without auth", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.service).toBe("trusttopay-api");
    expect(response.body.database.ok).toBe(true);
    expect(response.body.ai.mode).toBe("demo");
    expect(response.body.payments.mode).toBe("SIMULATED");
    expect(response.body.payments.simulated).toBe(true);
    expect(response.body.payments.paypalConfigured).toBe(false);
  });

  it("reports no configuration errors in the documented demo defaults", async () => {
    const response = await request(app).get("/health");
    const errors = (response.body.configIssues as { level: string }[]).filter((issue) => issue.level === "error");
    expect(errors).toEqual([]);
  });
});

describe("unknown routes", () => {
  it("returns a consistent NOT_FOUND envelope", async () => {
    const response = await request(app).get("/api/v1/definitely-not-a-route");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});
