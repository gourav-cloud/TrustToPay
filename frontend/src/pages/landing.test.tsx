import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LandingPage from "@/pages/landing";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    demoLogin: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe("LandingPage dark obsidian redesign & interactive workflow", () => {
  it("renders the preserved brand identity, primary navigation links, and hero headline", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /Give your AI agents a human when they need one\./i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/AI doesn't have to solve everything alone\./i)).toBeInTheDocument();

    expect(screen.getAllByText("TrustToPay").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole("link", { name: "Product" })[0]).toHaveAttribute("href", "/#product");
    expect(screen.getAllByRole("link", { name: "How It Works" })[0]).toHaveAttribute("href", "/#how-it-works");
    expect(screen.getAllByRole("link", { name: "Developers" })[0]).toHaveAttribute("href", "/#developers");
    const docLinks = screen.getAllByRole("link", { name: "Documentation" });
    expect(docLinks.length).toBeGreaterThanOrEqual(1);
    expect(docLinks[0]).toHaveAttribute("href", "/app/docs");
  });

  it("excludes seeded example tasks, demo credentials, and hackathon badges from the public homepage", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/65W USB-C charger/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AnchorVolt/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Demo1234!/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hackathon project/i)).not.toBeInTheDocument();
  });

  it("renders all 9 sequential workflow steps and updates the synchronized telemetry inspector on selection", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    const expectedSteps = [
      "Step 1 — AI encounters a blocker",
      "Step 2 — Task creation",
      "Step 3 — Intelligent specialist matching",
      "Step 4 — Top-five dispatch",
      "Step 5 — Human resolves the problem",
      "Step 6 — Security review",
      "Step 7 — Independent verification",
      "Step 8 — AI resumes",
      "Step 9 — Payment workflow",
    ];

    for (const stepTitle of expectedSteps) {
      expect(screen.getAllByText(stepTitle).length).toBeGreaterThanOrEqual(1);
    }

    // Select Step 6 — Security review
    const step6Tab = screen.getByRole("tab", { name: /Step 6 — Security review/i });
    fireEvent.click(step6Tab);
    expect(step6Tab).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText(/SecurityGateService\.inspectSubmission/i).length).toBeGreaterThanOrEqual(1);

    // Select Step 9 — Payment workflow
    const step9Tab = screen.getByRole("tab", { name: /Step 9 — Payment workflow/i });
    fireEvent.click(step9Tab);
    expect(step9Tab).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText(/POST \/api\/v1\/payments\/tasks\/:id\/payout/i).length).toBeGreaterThanOrEqual(1);
  });
});
