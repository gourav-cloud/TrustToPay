import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingBlock } from "@/components/ui/states";
import LandingPage from "@/pages/landing";
import AuthPage from "@/pages/auth";
import DashboardPage from "@/pages/dashboard";
import WorkspacePage from "@/pages/workspace";
import SessionDetailPage from "@/pages/session-detail";
import TaskBrowserPage from "@/pages/task-browser";
import TaskDetailPage from "@/pages/task-detail";
import VerificationCenterPage from "@/pages/verification-center";
import PaymentsPage from "@/pages/payments";
import EarningsPage from "@/pages/earnings";
import AdminConsolePage from "@/pages/admin";
import IntegrationsPage from "@/pages/integrations";
import ProfilePage from "@/pages/profile";
import DocsPage from "@/pages/docs";
import PrivacyPage from "@/pages/privacy";
import ContactPage from "@/pages/contact";
import NotFoundPage from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  },
});

function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <LoadingBlock className="w-full max-w-md" label="Checking your session..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/contact" element={<ContactPage />} />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="workspace" element={<WorkspacePage />} />
        <Route path="sessions/:id" element={<SessionDetailPage />} />
        <Route path="requests" element={<TaskBrowserPage mode="requests" />} />
        <Route
          path="marketplace"
          element={
            <ProtectedRoute roles={["REVIEWER", "ADMIN"]}>
              <TaskBrowserPage mode="marketplace" />
            </ProtectedRoute>
          }
        />
        <Route
          path="reviews"
          element={
            <ProtectedRoute roles={["REVIEWER", "ADMIN"]}>
              <TaskBrowserPage mode="reviews" />
            </ProtectedRoute>
          }
        />
        <Route
          path="tasks"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <TaskBrowserPage mode="all" />
            </ProtectedRoute>
          }
        />
        <Route path="tasks/:id" element={<TaskDetailPage />} />
        <Route path="tasks/:id/verification" element={<VerificationCenterPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route
          path="earnings"
          element={
            <ProtectedRoute roles={["REVIEWER", "ADMIN"]}>
              <EarningsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <AdminConsolePage />
            </ProtectedRoute>
          }
        />
        <Route path="integrations" element={<IntegrationsPage />} />
        <Route path="docs" element={<DocsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="/app/*" element={<NotFoundPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
