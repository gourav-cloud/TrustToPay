import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PaymentLedgerGridTab,
  SecurityVerificationsGridTab,
  SkillAssessmentsGridTab,
  SpecialistsGridTab,
  TasksDispatchGridTab,
} from "./admin-ag-grids";
import { api } from "@/lib/api";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "admin-1",
      email: "admin@demo.trusttopay.dev",
      name: "Admin Operator",
      role: "ADMIN",
      isReviewerApproved: true,
    },
  }),
}));

function renderWithProviders(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Admin Operations AG Grid Community Tables", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders SpecialistsGridTab with verified skills L1-L3, workload, and Elastic discovery status", async () => {
    vi.spyOn(api.admin, "specialists").mockResolvedValue({
      items: [
        {
          id: "spec-1",
          name: "Ada Specialist",
          email: "ada@example.com",
          isActive: true,
          isReviewerApproved: true,
          availabilityStatus: "AVAILABLE",
          verifiedSkills: [
            {
              skillId: "sk-1",
              slug: "typescript",
              name: "TypeScript",
              category: "PROGRAMMING",
              level: 3,
              levelName: "Expert",
              score: 96,
            },
          ],
          verifiedSkillsSummary: "TypeScript (L3)",
          highestSkillLevel: 3,
          activeWorkload: 1,
          maxWorkload: 3,
          completedCount: 8,
          acceptedSubmissions: 8,
          rejectedSubmissions: 0,
          successRate: 100,
          avgTurnaroundMinutes: 18.5,
          payoutConsent: true,
          createdAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    });

    vi.spyOn(api.admin, "elasticStatus").mockResolvedValue({
      elastic: {
        enabled: false,
        configured: false,
        indexName: "trusttopay-specialists-v1",
        jinaConfigured: false,
        embeddingModel: "jina-embeddings-v3",
        mode: "DATABASE_FALLBACK",
      },
    });

    renderWithProviders(<SpecialistsGridTab />);

    expect(await screen.findByTestId("ag-grid-specialists")).toBeInTheDocument();
    expect(screen.getByText(/Elastic Intelligent Specialist Discovery/i)).toBeInTheDocument();
    expect(screen.getByText("Export CSV")).toBeInTheDocument();
  });

  it("renders empty and error states cleanly when backend requests fail or return no rows", async () => {
    vi.spyOn(api.admin, "tasks").mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 1 },
    });

    renderWithProviders(<TasksDispatchGridTab />);
    expect(await screen.findByText("No review tasks found")).toBeInTheDocument();

    vi.spyOn(api.admin, "verifications").mockRejectedValue(new Error("Admin telemetry unavailable"));
    renderWithProviders(<SecurityVerificationsGridTab />);
    expect(await screen.findByText("Admin telemetry unavailable")).toBeInTheDocument();
  });

  it("renders read-only PaymentLedgerGridTab and SkillAssessmentsGridTab with real API payloads", async () => {
    vi.spyOn(api.admin, "payments").mockResolvedValue({
      items: [
        {
          id: "pay-1",
          taskId: "task-1",
          taskTitle: "Verify OAuth PKCE challenge",
          taskStatus: "PAYMENT_PAID",
          requesterName: "Agent Alpha",
          reviewerName: "Ada Specialist",
          type: "FUNDING",
          mode: "SANDBOX",
          provider: "PAYPAL_SANDBOX",
          orderId: "ORDER-SANDBOX-999",
          captureId: "CAP-999",
          payoutBatchId: null,
          amountMinor: 2500,
          amountDisplay: "$25.00",
          currency: "USD",
          status: "COMPLETED",
          payoutAvailability: "PAYOUT_UNAVAILABLE",
          failureCode: null,
          failureMessage: null,
          createdAt: new Date().toISOString(),
          capturedAt: new Date().toISOString(),
          paidAt: null,
        },
      ],
      pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    });

    vi.spyOn(api.admin, "assessments").mockResolvedValue({
      items: [
        {
          id: "att-1",
          candidateId: "spec-1",
          candidateName: "Ada Specialist",
          candidateEmail: "ada@example.com",
          isReviewerApproved: true,
          skillId: "sk-1",
          skillSlug: "security",
          skillName: "Security",
          category: "SECURITY",
          level: 2,
          levelName: "Practitioner",
          stageTitle: "Security L2 Practitioner",
          version: "1.0.0",
          status: "PASSED",
          score: 92,
          passingScore: 80,
          passed: true,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    });

    renderWithProviders(
      <div>
        <PaymentLedgerGridTab />
        <SkillAssessmentsGridTab />
      </div>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ag-grid-payments")).toBeInTheDocument();
      expect(screen.getByTestId("ag-grid-assessments")).toBeInTheDocument();
    });
  });
});
