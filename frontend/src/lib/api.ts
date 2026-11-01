import type {
  AgentSession,
  AnalysisRun,
  IntegrationStatus,
  Notification,
  Paginated,
  Payment,
  PublicUser,
  Reward,
  TaskDetail,
  TaskSummary,
  VerificationRun,
} from "./types";

const BASE = "/api/v1";
const SESSION_TOKEN_KEY = "ttp_session_token";

export function getStoredSessionToken(): string | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredSessionToken(token: string | null | undefined): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    if (token) {
      window.localStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredSessionToken();
  const response = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && path === "/auth/me") {
      setStoredSessionToken(null);
    }
    const error = (payload as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    throw new ApiError(
      response.status,
      error?.code ?? `HTTP_${response.status}`,
      error?.message ?? "The request failed. Please try again.",
      error?.details,
    );
  }

  return payload as T;
}

function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}

type DocumentInput = {
  title: string;
  url?: string | null;
  publisher?: string | null;
  sourceType: "MANUFACTURER" | "RETAILER" | "MARKETPLACE" | "FORUM" | "DOCUMENT";
  content: string;
};

export type CreateSessionInput = {
  title?: string;
  category?: string;
  question: string;
  productModels: string[];
  specifications: string[];
  documents: DocumentInput[];
};

export type CreateTaskInput = {
  sessionId: string;
  acceptanceCriteria: string;
  requiredSkills?: string[];
  rewardMinor: number;
  rewardApproved: true;
  riskLevel?: "STANDARD" | "HIGH";
  category?: string;
};

export type SubmitInput = {
  answer: string;
  explanation: string;
  confidenceScore: number;
  sourceUrl?: string;
  evidenceNotes?: string;
  files?: { path: string; content: string; encoding?: "utf8" | "base64" }[];
  patchText?: string;
};

export const api = {
  auth: {
    me: () => request<{ user: PublicUser | null; unreadNotifications: number }>("/auth/me"),
    login: (input: { email: string; password: string }) =>
      request<{ user: PublicUser }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    register: (input: {
      email: string;
      name: string;
      password: string;
      role: "REQUESTER" | "REVIEWER";
    }) =>
      request<{ user: PublicUser }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    demoLogin: (role: "requester" | "reviewer" | "admin") =>
      request<{ user: PublicUser; demo: boolean }>("/auth/demo-login", {
        method: "POST",
        body: JSON.stringify({ role }),
      }),
    logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
    notifications: () => request<Paginated<Notification>>("/auth/notifications"),
    markRead: (id: string) => request<{ ok: true }>(`/auth/notifications/${id}/read`, { method: "POST" }),
    markAllRead: () => request<{ ok: true }>("/auth/notifications/read-all", { method: "POST" }),
  },

  integrations: {
    status: () => request<IntegrationStatus>("/integrations/status"),
    testOAuth: () =>
      request<{ ok: boolean; environment: string; durationMs: number; message: string; testedAt: string }>(
        "/integrations/paypal/test-oauth",
        { method: "POST" },
      ),
  },

  sessions: {
    create: (input: CreateSessionInput) =>
      request<{ session: AgentSession }>("/sessions", { method: "POST", body: JSON.stringify(input) }),
    list: (params: { page?: number; pageSize?: number; status?: string; q?: string } = {}) =>
      request<Paginated<AgentSession>>(`/sessions${query(params)}`),
    get: (id: string) => request<{ session: AgentSession }>(`/sessions/${id}`),
    analyze: (id: string) =>
      request<{
        analysis: AnalysisRun;
        sessionStatus: string;
        mode: "DEMO_AI" | "PROVIDER_AI";
        threshold: number;
      }>(`/sessions/${id}/analyze`, { method: "POST" }),
    resume: (id: string) =>
      request<{ session: AgentSession; finalAnswer: string; message: string }>(`/sessions/${id}/resume`, {
        method: "POST",
      }),
  },

  tasks: {
    create: (input: CreateTaskInput) =>
      request<{ task: TaskDetail }>("/tasks", { method: "POST", body: JSON.stringify(input) }),
    list: (params: {
      scope?: "all" | "available" | "assigned" | "requested";
      status?: string;
      category?: string;
      skill?: string;
      q?: string;
      minReward?: number;
      maxReward?: number;
      sort?: "newest" | "reward_desc" | "reward_asc";
      page?: number;
      pageSize?: number;
    } = {}) => request<Paginated<TaskSummary>>(`/tasks${query(params)}`),
    get: (id: string) => request<{ task: TaskDetail }>(`/tasks/${id}`),
    accept: (id: string) =>
      request<{ task: TaskDetail; message: string }>(`/tasks/${id}/accept`, { method: "POST" }),
    offers: (id: string) =>
      request<{ offers: import("./types").TaskOffer[]; ranking?: unknown[] }>(`/tasks/${id}/offers`),
    dispatchOffers: (id: string, input: { forceNextBatch?: boolean; ttlMinutes?: number } = {}) =>
      request<{
        taskId: string;
        batchNumber: number;
        dispatchedCount: number;
        status: string;
        task: TaskDetail;
      }>(`/tasks/${id}/offers/dispatch`, { method: "POST", body: JSON.stringify(input) }),
    declineOffer: (id: string) =>
      request<{
        offer: import("./types").TaskOffer;
        remainingPending: number;
        task: TaskDetail;
      }>(`/tasks/${id}/offers/decline`, { method: "POST" }),
    handback: (id: string) =>
      request<{
        handback: import("./types").AgentHandbackPayload;
        signature: { header: string; timestamp: string; algorithm: string };
        idempotentReplay: boolean;
      }>(`/tasks/${id}/handback`),
    submit: (id: string, input: SubmitInput) =>
      request<{
        submission: { id: string; verification: VerificationRun };
        artifact?: import("./types").SubmissionArtifact;
        verification: VerificationRun;
        task: TaskDetail;
        message: string;
      }>(`/tasks/${id}/submit`, { method: "POST", body: JSON.stringify(input) }),
    verify: (id: string, input: { decision?: "PASS" | "REJECT"; note?: string }) =>
      request<{ verification: VerificationRun; task: TaskDetail }>(`/tasks/${id}/verify`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    updateReward: (id: string, rewardMinor: number) =>
      request<{ task: TaskDetail }>(`/tasks/${id}/reward`, {
        method: "PATCH",
        body: JSON.stringify({ rewardMinor, rewardApproved: true }),
      }),
    cancel: (id: string) => request<{ task: TaskDetail }>(`/tasks/${id}/cancel`, { method: "POST" }),
    dispute: (id: string, reason: string) =>
      request<{ task: TaskDetail }>(`/tasks/${id}/disputes`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
  },

  payments: {
    createOrder: (taskId: string) =>
      request<{
        transaction: Payment;
        paypal: {
          mode: "SIMULATED" | "SANDBOX";
          provider: string;
          orderId: string | null;
          clientId: string | null;
          currency: string;
          amount: string;
        };
      }>("/payments/paypal/orders", { method: "POST", body: JSON.stringify({ taskId }) }),
    capture: (orderId: string) =>
      request<{ completed: boolean; transaction: Payment; message: string }>(
        `/payments/paypal/orders/${encodeURIComponent(orderId)}/capture`,
        { method: "POST" },
      ),
    payout: (taskId: string) =>
      request<{ transaction: Payment; message: string }>("/payments/payouts", {
        method: "POST",
        body: JSON.stringify({ taskId }),
      }),
    list: (params: { type?: string; status?: string; mode?: string; page?: number; pageSize?: number } = {}) =>
      request<Paginated<Payment>>(`/payments${query(params)}`),
    get: (id: string) => request<{ payment: Payment }>(`/payments/${id}`),
    reconcile: (id: string) =>
      request<{ transaction: Payment; message: string }>(`/payments/${id}/reconcile`, { method: "POST" }),
    retry: (id: string) =>
      request<{ transaction: Payment; message: string }>(`/payments/${id}/retry`, { method: "POST" }),
  },

  dashboards: {
    agent: () =>
      request<{
        sessions: { total: number; byStatus: { status: string; count: number }[] };
        tasks: {
          total: number;
          byStatus: { status: string; count: number }[];
          awaitingFunding: number;
          active: number;
        };
        funding: { minor: number; display: string; currency: string };
        fundingCount: number;
        approvedRewards: { minor: number; display: string; currency: string };
        approvedRewardCount: number;
        recentTasks: TaskSummary[];
        recentSessions: {
          id: string;
          title: string;
          status: string;
          createdAt: string;
          confidence: number | null;
          action: string | null;
        }[];
      }>("/dashboard/agent"),
    reviewer: () =>
      request<{
        approval: { approved: boolean; role: string };
        availableCount: number;
        assignments: {
          total: number;
          byStatus: { status: string; count: number }[];
          active: number;
          completed: number;
        };
        earnings: { minor: number; display: string; currency: string };
        completedPayoutCount: number;
        pendingRewards: { minor: number; display: string; currency: string };
        pendingRewardCount: number;
        submissionCount: number;
        availableTasks: TaskSummary[];
        recentPayouts: {
          taskId: string;
          title: string;
          status: string;
          reward: Reward | null;
          payouts: {
            id: string;
            status: string;
            mode: string;
            amountDisplay: string;
            paidAt: string | null;
            createdAt: string;
          }[];
        }[];
        payoutProfile: { email: string | null; consent: boolean; provider: string } | null;
        skills: string[];
      }>("/dashboard/reviewer"),
    admin: () =>
      request<{
        users: {
          byRole: { role: string; count: number }[];
          total: number;
          pendingReviewerApprovals: number;
        };
        tasks: { byStatus: { status: string; count: number }[]; total: number };
        submissions: number;
        verifications: { byStatus: { status: string; count: number }[]; total: number };
        approvedRewards: { minor: number; display: string; currency: string };
        approvedRewardCount: number;
        funding: {
          completed: { minor: number; display: string; currency: string };
          completedCount: number;
          simulated: { minor: number; display: string; currency: string };
          simulatedCount: number;
          sandbox: { minor: number; display: string; currency: string };
          sandboxCount: number;
        };
        payouts: {
          completed: { minor: number; display: string; currency: string };
          completedCount: number;
          processingCount: number;
        };
        failedPayments: number;
        webhooks: { byStatus: { status: string; count: number }[]; total: number };
        openDisputes: number;
        recentAudit: {
          id: string;
          action: string;
          entityType: string;
          entityId: string;
          metadata: unknown;
          createdAt: string;
          actor: { id: string; name: string; email: string; role: string } | null;
        }[];
        attentionTasks: {
          id: string;
          title: string;
          status: string;
          requester: { name: string; email: string };
          reviewer: string | null;
          reward: Reward | null;
          failedPayments: { id: string; type: string; message: string | null; mode: string }[];
        }[];
      }>("/dashboard/admin"),
  },

  admin: {
    users: (params: { page?: number; role?: string; q?: string; approved?: string } = {}) =>
      request<Paginated<Record<string, unknown>>>(`/admin/users${query(params)}`),
    setEligibility: (id: string, input: { isReviewerApproved?: boolean; isActive?: boolean }) =>
      request<{ user: Record<string, unknown> }>(`/admin/users/${id}/eligibility`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    specialists: (params: { page?: number; pageSize?: number; q?: string } = {}) =>
      request<Paginated<import("./types").AdminSpecialistRow>>(`/admin/specialists${query(params)}`),
    tasks: (params: { page?: number; pageSize?: number; status?: string } = {}) =>
      request<Paginated<import("./types").AdminTaskRow>>(`/admin/tasks${query(params)}`),
    verifications: (params: { page?: number; pageSize?: number; status?: string } = {}) =>
      request<Paginated<import("./types").AdminVerificationRow>>(`/admin/verifications${query(params)}`),
    payments: (params: { page?: number; pageSize?: number; type?: string; status?: string } = {}) =>
      request<Paginated<import("./types").AdminPaymentLedgerRow>>(`/admin/payments${query(params)}`),
    assessments: (params: { page?: number; pageSize?: number } = {}) =>
      request<Paginated<import("./types").AdminAssessmentRow>>(`/admin/assessments${query(params)}`),
    elasticStatus: () =>
      request<{
        elastic: {
          enabled: boolean;
          configured: boolean;
          indexName: string;
          jinaConfigured: boolean;
          embeddingModel: string;
          mode: "HYBRID_ELASTIC" | "DATABASE_FALLBACK";
        };
      }>("/admin/elastic/status"),
    elasticReindex: () =>
      request<{
        indexName: string;
        elasticConfigured: boolean;
        indexedCount: number;
        removedCount: number;
        errors: string[];
      }>("/admin/elastic/reindex", { method: "POST" }),
    elasticSearch: (input: { query: string; requiredSkills?: string[]; minimumSkillLevel?: number }) =>
      request<{
        discovery: {
          mode: "HYBRID_ELASTIC" | "KEYWORD_ELASTIC" | "DATABASE_FALLBACK";
          usedElastic: boolean;
          fallbackReason: string | null;
          indexName: string;
          embeddingModel: string | null;
          candidateIds: string[] | null;
          similarCompletedTasks: { taskId: string; taskTitle: string; category: string; requiredSkills: string[] }[];
          durationMs: number;
        };
      }>("/admin/elastic/search", { method: "POST", body: JSON.stringify(input) }),
    audit: (params: { page?: number; action?: string } = {}) =>
      request<Paginated<Record<string, unknown>>>(`/admin/audit${query(params)}`),
    disputes: (params: { status?: string; page?: number } = {}) =>
      request<Paginated<Record<string, unknown>>>(`/admin/disputes${query(params)}`),
    resolveDispute: (
      id: string,
      input: { status: "RESOLVED" | "REJECTED"; resolution: string; restoreTo?: string },
    ) =>
      request<{ dispute: Record<string, unknown> }>(`/admin/disputes/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  },

  users: {
    updatePayout: (input: {
      payoutEmail?: string | null;
      payoutConsent?: boolean;
      headline?: string | null;
      bio?: string | null;
      timezone?: string;
    }) =>
      request<{ user: PublicUser; payoutProfile: Record<string, unknown> }>("/users/me/payout", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
  },

  skills: {
    list: () => request<{ skills: import("./types").SkillCatalogItem[] }>("/skills"),
    startAssessment: (skillId: string, level: number) =>
      request<{
        attempt: {
          id: string;
          skillId: string;
          skillSlug: string;
          skillName: string;
          stageId: string;
          level: number;
          levelName: string;
          version: string;
          status: string;
          passingScore: number;
          startedAt: string;
        };
        questions: import("./types").SkillAssessmentQuestion[];
      }>(`/skills/${encodeURIComponent(skillId)}/assessments/${level}/start`, {
        method: "POST",
      }),
    submitAttempt: (attemptId: string, answers: Record<string, string>) =>
      request<{ attempt: import("./types").SkillAssessmentAttemptResult }>(
        `/skills/attempts/${encodeURIComponent(attemptId)}/submit`,
        {
          method: "POST",
          body: JSON.stringify({ answers }),
        },
      ),
  },
};

export type { Reward } from "./types";
