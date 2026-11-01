import { useEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AppShell } from "@/components/layout/app-shell";
import { MarketingFooter, PublicHeader } from "@/components/layout/public-layout";
import { LoadingBlock } from "@/components/ui/states";
import LandingPage from "@/pages/landing";
import AuthPage from "@/pages/auth";
import PrivacyPage from "@/pages/privacy";
import ContactPage from "@/pages/contact";
import NotFoundPage from "@/pages/not-found";
import DashboardPage from "@/pages/dashboard";
import WorkspacePage from "@/pages/workspace";
import SessionDetailPage from "@/pages/session-detail";
import TaskBrowserPage from "@/pages/task-browser";
import TaskDetailPage from "@/pages/task-detail";
import VerificationCenterPage from "@/pages/verification-center";
import PaymentsPage from "@/pages/payments";
import EarningsPage from "@/pages/earnings";
import ProfilePage from "@/pages/profile";
import AdminPage from "@/pages/admin";
import DocsPage from "@/pages/docs";
import IntegrationsPage from "@/pages/integrations";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function ScrollToHash() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const id = hash.replace(/^#/, "");
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname, hash]);

  return null;
}

function ProtectedOrPublicDocsShell() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const isPublicFriendlyRoute =
    location.pathname === "/app/docs" || location.pathname === "/app/integrations";

  if (isLoading) {
    return (
      <div className="container py-12">
        <LoadingBlock label="Loading your workspace..." />
      </div>
    );
  }
  if (!user) {
    if (isPublicFriendlyRoute) {
      return (
        <div className="flex min-h-dvh flex-col bg-background text-foreground">
          <PublicHeader />
          <main className="container flex-1 py-10">
            <Outlet />
          </main>
          <MarketingFooter />
        </div>
      );
    }
    return <Navigate to="/login" replace />;
  }
  return <AppShell />;
}

function AdminRoute({ children }: { children: JSX.Element }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingBlock label="Checking permissions..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "ADMIN") return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <ScrollToHash />
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/how-it-works" element={<LandingPage />} />
            <Route path="/developers" element={<LandingPage />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/register" element={<AuthPage initialMode="register" />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/contact" element={<ContactPage />} />

            <Route path="/app" element={<ProtectedOrPublicDocsShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="workspace" element={<WorkspacePage />} />
              <Route path="sessions/:id" element={<SessionDetailPage />} />
              <Route path="marketplace" element={<TaskBrowserPage mode="marketplace" />} />
              <Route path="reviews" element={<TaskBrowserPage mode="reviews" />} />
              <Route path="requests" element={<TaskBrowserPage mode="requests" />} />
              <Route path="tasks" element={<TaskBrowserPage mode="all" />} />
              <Route path="tasks/:id" element={<TaskDetailPage />} />
              <Route path="tasks/:id/verification" element={<VerificationCenterPage />} />
              <Route path="tasks/:id/verify" element={<VerificationCenterPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="earnings" element={<EarningsPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="integrations" element={<IntegrationsPage />} />
              <Route path="docs" element={<DocsPage />} />
              <Route
                path="admin"
                element={
                  <AdminRoute>
                    <AdminPage />
                  </AdminRoute>
                }
              />
            </Route>

            <Route path="/docs" element={<Navigate to="/app/docs" replace />} />
            <Route path="/integrations" element={<Navigate to="/app/integrations" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
