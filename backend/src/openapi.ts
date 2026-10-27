export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "TrustToPay API",
    version: "1.0.0",
    description:
      "Confidence-triggered human review with independent verification and conditional PayPal Sandbox rewards. Demo mode uses clearly labelled simulated payments.",
    license: { name: "MIT" },
  },
  servers: [{ url: "/api/v1", description: "Current deployment" }],
  tags: [
    { name: "Auth" },
    { name: "Sessions" },
    { name: "Tasks" },
    { name: "Payments" },
    { name: "Webhooks" },
    { name: "Dashboards" },
    { name: "Integrations" },
  ],
  components: {
    securitySchemes: {
      cookieAuth: { type: "apiKey", in: "cookie", name: "hf_session" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: { type: "object", additionalProperties: true },
            },
          },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          email: { type: "string", format: "email" },
          name: { type: "string" },
          role: { type: "string", enum: ["REQUESTER", "REVIEWER", "ADMIN"] },
          isReviewerApproved: { type: "boolean" },
        },
      },
      Analysis: {
        type: "object",
        properties: {
          summary: { type: "string" },
          proposedAnswer: { type: "string" },
          confidenceScore: { type: "number" },
          recommendedAction: {
            type: "string",
            enum: ["RESOLVE_AUTOMATICALLY", "REQUEST_MORE_INFORMATION", "ESCALATE_TO_HUMAN"],
          },
          conflictingClaims: { type: "array", items: { type: "object" } },
          missingInformation: { type: "array", items: { type: "string" } },
          evidence: { type: "array", items: { type: "object" } },
          escalationReason: { type: "string" },
          suggestedReviewerSkills: { type: "array", items: { type: "string" } },
          suggestedReward: {
            type: "object",
            properties: {
              amountMinor: { type: "integer" },
              currency: { type: "string" },
              rationale: { type: "string" },
            },
          },
        },
      },
      Reward: {
        type: "object",
        properties: {
          amountMinor: { type: "integer", description: "Integer minor units, e.g. 1500 = $15.00" },
          currency: { type: "string", example: "USD" },
          status: { type: "string" },
        },
      },
      Task: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          status: { type: "string" },
          reward: { $ref: "#/components/schemas/Reward" },
          acceptanceCriteria: { type: "string" },
        },
      },
      Payment: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["FUNDING", "PAYOUT"] },
          provider: { type: "string", enum: ["DEMO", "PAYPAL_SANDBOX"] },
          mode: { type: "string", enum: ["SIMULATED", "SANDBOX"] },
          status: { type: "string" },
          amountMinor: { type: "integer" },
          currency: { type: "string" },
          orderId: { type: "string", nullable: true },
          captureId: { type: "string", nullable: true },
          payoutBatchId: { type: "string", nullable: true },
        },
      },
    },
  },
  security: [{ cookieAuth: [] }],
  paths: {
    "/auth/register": {
      post: {
        tags: ["Auth"],
        security: [],
        summary: "Register a requester or reviewer",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "name", "password", "role"],
                properties: {
                  email: { type: "string", format: "email" },
                  name: { type: "string" },
                  password: { type: "string", minLength: 8 },
                  role: { type: "string", enum: ["REQUESTER", "REVIEWER"] },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Registered and signed in" }, "409": { description: "Email taken" } },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        security: [],
        summary: "Sign in with email and password (sets an httpOnly cookie)",
        responses: { "200": { description: "Signed in" }, "401": { description: "Invalid credentials" } },
      },
    },
    "/auth/demo-login": {
      post: {
        tags: ["Auth"],
        security: [],
        summary: "Demo-only login for seeded evaluation users",
        description: "Returns 404 unless DEMO_MODE=true and DEMO_USERS_ENABLED=true. Never fabricates roles.",
      },
    },
    "/auth/logout": { post: { tags: ["Auth"], summary: "Clear the session cookie" } },
    "/auth/me": { get: { tags: ["Auth"], summary: "Current user and unread notification count" } },
    "/sessions": {
      post: {
        tags: ["Sessions"],
        summary: "Create an agent session with documents",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["question"],
                properties: {
                  title: { type: "string" },
                  question: { type: "string" },
                  productModels: { type: "array", items: { type: "string" } },
                  specifications: { type: "array", items: { type: "string" } },
                  documents: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        url: { type: "string" },
                        publisher: { type: "string" },
                        sourceType: {
                          type: "string",
                          enum: ["MANUFACTURER", "RETAILER", "MARKETPLACE", "FORUM", "DOCUMENT"],
                        },
                        content: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Session created" } },
      },
      get: { tags: ["Sessions"], summary: "List sessions (paginated)" },
    },
    "/sessions/{id}": { get: { tags: ["Sessions"], summary: "Session with analysis runs and tasks" } },
    "/sessions/{id}/analyze": {
      post: {
        tags: ["Sessions"],
        summary: "Run AI analysis and receive a schema-validated escalation decision",
        responses: { "201": { description: "Analysis stored", content: { "application/json": { schema: { $ref: "#/components/schemas/Analysis" } } } } },
      },
    },
    "/sessions/{id}/resume": {
      post: { tags: ["Sessions"], summary: "Resume the original AI session with the verified human answer" },
    },
    "/tasks": {
      post: { tags: ["Tasks"], summary: "Create a review task from an escalated session" },
      get: {
        tags: ["Tasks"],
        summary: "List tasks with scope, status, skill, reward and search filters",
        parameters: [
          { name: "scope", in: "query", schema: { type: "string", enum: ["all", "available", "assigned", "requested"] } },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "skill", in: "query", schema: { type: "string" } },
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "minReward", in: "query", schema: { type: "integer" } },
          { name: "maxReward", in: "query", schema: { type: "integer" } },
        ],
      },
    },
    "/tasks/{id}": { get: { tags: ["Tasks"], summary: "Task detail with evidence, submission, verification, payments and timeline" } },
    "/tasks/{id}/accept": {
      post: { tags: ["Tasks"], summary: "Accept an available task (transaction-safe, exclusive)" },
      responses: { "200": { description: "Accepted" }, "409": { description: "Another reviewer accepted first" } },
    },
    "/tasks/{id}/submit": {
      post: {
        tags: ["Tasks"],
        summary: "Submit an evidence-backed answer; automated independent verification runs immediately",
      },
    },
    "/tasks/{id}/verify": {
      post: {
        tags: ["Tasks"],
        summary: "Admin-only re-verification or manual decision. Reviewers cannot verify their own work.",
      },
    },
    "/tasks/{id}/reward": { patch: { tags: ["Tasks"], summary: "Change the reward before funding (server limits)" } },
    "/tasks/{id}/cancel": { post: { tags: ["Tasks"], summary: "Cancel an eligible task" } },
    "/tasks/{id}/disputes": { post: { tags: ["Tasks"], summary: "Open a dispute" } },
    "/payments/paypal/orders": {
      post: {
        tags: ["Payments"],
        summary: "Create a funding order (simulated in demo mode, real Sandbox Orders API otherwise)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { taskId: { type: "string" } } } } },
        },
      },
    },
    "/payments/paypal/orders/{orderId}/capture": {
      post: { tags: ["Payments"], summary: "Capture an approved order and validate amount, currency and reference" },
    },
    "/payments/payouts": {
      post: { tags: ["Payments"], summary: "Release the reviewer reward after verification (Payouts requires enablement)" },
    },
    "/payments": { get: { tags: ["Payments"], summary: "List payment transactions visible to the caller" } },
    "/payments/{id}": { get: { tags: ["Payments"], summary: "Payment detail" } },
    "/payments/{id}/reconcile": { post: { tags: ["Payments"], summary: "Reconcile provider status" } },
    "/payments/{id}/retry": { post: { tags: ["Payments"], summary: "Admin-only retry after reconciliation" } },
    "/paypal/webhook": {
      post: {
        tags: ["Webhooks"],
        security: [],
        summary: "PayPal webhook endpoint (signature verified, deduplicated by event id)",
      },
    },
    "/paypal/webhook/simulate": {
      post: { tags: ["Webhooks"], summary: "Admin-only local webhook simulation; demo mode only" },
    },
    "/dashboard/agent": { get: { tags: ["Dashboards"], summary: "Agent metrics and recent sessions" } },
    "/dashboard/reviewer": { get: { tags: ["Dashboards"], summary: "Reviewer marketplace and earnings metrics" } },
    "/dashboard/admin": { get: { tags: ["Dashboards"], summary: "Database-backed administrative metrics" } },
    "/admin/users": { get: { tags: ["Dashboards"], summary: "Admin user list" } },
    "/admin/disputes": { get: { tags: ["Dashboards"], summary: "Admin dispute list" } },
    "/admin/audit": { get: { tags: ["Dashboards"], summary: "Admin audit trail" } },
    "/integrations/status": {
      get: { tags: ["Integrations"], security: [], summary: "AI/PayPal configuration status without secrets" },
    },
    "/integrations/paypal/test-oauth": {
      post: { tags: ["Integrations"], summary: "Admin-only genuine Sandbox OAuth test (no money moves)" },
    },
  },
};

export type OpenApiSpec = typeof openApiSpec;
