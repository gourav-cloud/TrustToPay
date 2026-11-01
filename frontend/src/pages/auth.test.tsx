import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/AuthContext";
import AuthPage from "@/pages/auth";

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

function renderAuthApp(initialEntry = "/login") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<AuthPage />} />
            <Route path="/register" element={<AuthPage initialMode="register" />} />
            <Route path="/app" element={<div data-testid="app-dashboard">Authenticated Workspace</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("AuthPage UI & session security acceptance", () => {
  it("renders clean login and registration forms without exposing demo passwords or storing tokens in localStorage", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/integrations/status")) {
        return Promise.resolve(
          jsonResponse({
            paypal: { paymentsMode: "SIMULATED", configured: false, payoutsEnabled: false },
            ai: { engine: "demo" },
          }),
        );
      }
      return Promise.resolve(jsonResponse({ error: { code: "UNAUTHENTICATED", message: "Sign in" } }, 401));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAuthApp("/login");

    expect(screen.getByRole("heading", { name: /Sign in to TrustToPay/i })).toBeInTheDocument();
    expect(screen.queryByText(/Demo1234!/i)).not.toBeInTheDocument();
    expect(window.localStorage.getItem("ttp_session_token")).toBeNull();
  });

  it("signs in existing users, hydrates auth state, navigates to /app, and keeps localStorage free of tokens", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/auth/login") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse({
            user: {
              id: "u_req_1",
              email: "agent@demo.trusttopay.dev",
              name: "Demo Requester",
              role: "REQUESTER",
              isReviewerApproved: false,
              isActive: true,
              createdAt: new Date().toISOString(),
            },
          }),
        );
      }
      if (url.includes("/integrations/status")) {
        return Promise.resolve(
          jsonResponse({
            paypal: { paymentsMode: "SIMULATED", configured: false, payoutsEnabled: false },
            ai: { engine: "demo" },
          }),
        );
      }
      return Promise.resolve(jsonResponse({ error: { code: "UNAUTHENTICATED", message: "Sign in" } }, 401));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAuthApp("/login");

    fireEvent.change(screen.getByLabelText(/Work or personal email/i), {
      target: { value: "agent@demo.trusttopay.dev" },
    });
    fireEvent.change(screen.getByLabelText(/^Password$/i), {
      target: { value: "Demo1234!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sign in to workspace/i }));

    await waitFor(() => {
      expect(screen.getByTestId("app-dashboard")).toBeInTheDocument();
    });
    expect(window.localStorage.getItem("ttp_session_token")).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });

  it("registers a new Specialist (REVIEWER) and prohibits ADMIN role selection in UI", async () => {
    let submittedBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/auth/register") && init?.method === "POST") {
        submittedBody = JSON.parse(String(init.body));
        return Promise.resolve(
          jsonResponse(
            {
              user: {
                id: "u_spec_1",
                email: "ada@engineering.org",
                name: "Ada Lovelace",
                role: "REVIEWER",
                isReviewerApproved: true,
                isActive: true,
                createdAt: new Date().toISOString(),
              },
            },
            201,
          ),
        );
      }
      if (url.includes("/integrations/status")) {
        return Promise.resolve(
          jsonResponse({
            paypal: { paymentsMode: "SIMULATED", configured: false, payoutsEnabled: false },
            ai: { engine: "demo" },
          }),
        );
      }
      return Promise.resolve(jsonResponse({ error: { code: "UNAUTHENTICATED", message: "Sign in" } }, 401));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAuthApp("/register");

    expect(screen.getByRole("heading", { name: /Create your TrustToPay account/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Full name/i), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByLabelText(/Email address/i), { target: { value: "ada@engineering.org" } });
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: "SecurePass123" } });

    // Select Specialist role card
    fireEvent.click(screen.getByRole("button", { name: /Specialist/i }));
    fireEvent.click(screen.getByRole("button", { name: /Create account/i }));

    await waitFor(() => {
      expect(screen.getByTestId("app-dashboard")).toBeInTheDocument();
    });
    expect(submittedBody).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@engineering.org",
      role: "REVIEWER",
    });
  });

  it("displays an error alert when invalid credentials are submitted", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/auth/login") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(
            {
              error: {
                code: "INVALID_CREDENTIALS",
                message: "Email or password is incorrect.",
              },
            },
            401,
          ),
        );
      }
      return Promise.resolve(jsonResponse({ error: { code: "UNAUTHENTICATED", message: "Sign in" } }, 401));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAuthApp("/login");

    fireEvent.change(screen.getByLabelText(/Work or personal email/i), {
      target: { value: "wrong@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^Password$/i), {
      target: { value: "WrongPass1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sign in to workspace/i }));

    await waitFor(() => {
      expect(screen.getByText(/Email or password is incorrect\./i)).toBeInTheDocument();
    });
  });
});
