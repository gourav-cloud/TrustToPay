import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api";

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

function emptyResponse(status = 204): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => "",
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api request", () => {
  it("targets the versioned API with credentials on every request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ user: null, unreadNotifications: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    await api.auth.me();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/auth/me");
    expect(init.credentials).toBe("include");
    expect(init.headers).toEqual({});
  });

  it("serializes JSON bodies and sets the content type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ user: { id: "u1" } }));
    vi.stubGlobal("fetch", fetchMock);

    await api.auth.login({ email: "agent@example.com", password: "Password1" });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ email: "agent@example.com", password: "Password1" });
  });

  it("serializes query parameters and skips empty values", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [], pagination: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await api.tasks.list({ scope: "available", q: "", minReward: 500, page: 2 });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/tasks?scope=available&minReward=500&page=2");
  });

  it("omits the query string when no filters are supplied", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [], pagination: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await api.tasks.list();

    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/tasks");
  });

  it("encodes provider order IDs in the path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ completed: true }));
    vi.stubGlobal("fetch", fetchMock);

    await api.payments.capture("DEMO-ORDER/1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/payments/paypal/orders/DEMO-ORDER%2F1/capture");
    expect(init.method).toBe("POST");
  });

  it("turns the server error envelope into an ApiError", async () => {
    const payload = {
      error: {
        code: "REWARD_OUT_OF_RANGE",
        message: "Reward must be between 5.00 USD and 100.00 USD.",
        details: { minMinor: 500, maxMinor: 10000 },
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(payload, 400)));

    await expect(api.tasks.updateReward("task-1", 100)).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      code: "REWARD_OUT_OF_RANGE",
      message: "Reward must be between 5.00 USD and 100.00 USD.",
      details: { minMinor: 500, maxMinor: 10000 },
    });
  });

  it("falls back to an HTTP status code when the envelope is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ unexpected: true }, 502)));

    await expect(api.auth.me()).rejects.toMatchObject({
      status: 502,
      code: "HTTP_502",
      message: "The request failed. Please try again.",
    });
  });

  it("returns null for an empty successful body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(emptyResponse(204)));

    await expect(api.auth.logout()).resolves.toBeNull();
  });

  it("exposes the status on thrown errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: { code: "FORBIDDEN", message: "No." } }, 403)));

    const error = await api.admin.users().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(403);
  });
});
