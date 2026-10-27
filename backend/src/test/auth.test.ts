import { beforeEach, describe, expect, it } from "vitest";
import { agent, createUser, loginAs, resetDatabase, seedDemoUsers, TEST_PASSWORD } from "./helpers.js";

beforeEach(async () => {
  await resetDatabase();
});

describe("demo login", () => {
  it("signs in a seeded demo requester and persists a session cookie", async () => {
    await seedDemoUsers();
    const client = agent();

    const login = await client.post("/api/v1/auth/demo-login").send({ role: "requester" });

    expect(login.status).toBe(200);
    expect(login.body.demo).toBe(true);
    expect(login.body.user.email).toBe("agent@demo.trusttopay.dev");
    expect(login.body.user.role).toBe("REQUESTER");
    expect(login.body.user).not.toHaveProperty("passwordHash");
    expect(login.headers["set-cookie"]?.join(";")).toContain("hf_session=");

    const me = await client.get("/api/v1/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("agent@demo.trusttopay.dev");
  });

  it("rejects an unknown demo role before touching the database", async () => {
    await seedDemoUsers();
    const response = await agent().post("/api/v1/auth/demo-login").send({ role: "agent" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details[0].path).toBe("role");
  });

  it("explains that demo users must be seeded when they are missing", async () => {
    const response = await agent().post("/api/v1/auth/demo-login").send({ role: "admin" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("DEMO_USER_MISSING");
  });
});

describe("registration and login", () => {
  it("registers a requester, sets a cookie and rejects a duplicate email", async () => {
    const client = agent();
    const payload = {
      email: "New.Requester@Example.com",
      name: "New Requester",
      password: "Password1",
      role: "REQUESTER",
    };

    const created = await client.post("/api/v1/auth/register").send(payload);
    expect(created.status).toBe(201);
    // Emails are normalised to lower case.
    expect(created.body.user.email).toBe("new.requester@example.com");
    expect(created.body.user.role).toBe("REQUESTER");

    const duplicate = await agent().post("/api/v1/auth/register").send(payload);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects a weak password with field-level details", async () => {
    const response = await agent().post("/api/v1/auth/register").send({
      email: "weak@example.com",
      name: "Weak Password",
      password: "short",
      role: "REQUESTER",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    const paths = response.body.error.details.map((detail: { path: string }) => detail.path);
    expect(paths).toContain("password");
  });

  it("auto-approves reviewers in demo mode but not outside it", async () => {
    const response = await agent().post("/api/v1/auth/register").send({
      email: "reviewer-new@example.com",
      name: "New Reviewer",
      password: "Password1",
      role: "REVIEWER",
    });

    expect(response.status).toBe(201);
    expect(response.body.user.isReviewerApproved).toBe(true);
  });

  it("rejects a wrong password without revealing which field failed", async () => {
    await createUser("REQUESTER", { email: "known@example.com" });

    const response = await agent()
      .post("/api/v1/auth/login")
      .send({ email: "known@example.com", password: "WrongPassword1" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(response.body.error.message).toBe("Email or password is incorrect.");
  });

  it("accepts the correct password", async () => {
    await createUser("REQUESTER", { email: "known@example.com", name: "Known Requester" });
    const client = agent();

    const me = await loginAs(client, "known@example.com", TEST_PASSWORD);
    expect(me.email).toBe("known@example.com");
  });
});

describe("session lifecycle", () => {
  it("clears the session cookie on logout", async () => {
    await createUser("REQUESTER", { email: "logout@example.com" });
    const client = agent();
    await loginAs(client, "logout@example.com");

    const logout = await client.post("/api/v1/auth/logout");
    expect(logout.status).toBe(200);
    expect(logout.body.ok).toBe(true);

    const me = await client.get("/api/v1/auth/me");
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects /auth/me without a session", async () => {
    const response = await agent().get("/api/v1/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });
});
