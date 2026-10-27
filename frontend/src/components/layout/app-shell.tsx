import { useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BookOpen,
  Bot,
  ChevronDown,
  CreditCard,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Plug,
  Search,
  ShieldCheck,
  Store,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Brand } from "@/components/layout/public-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { humanize, initials, timeAgo } from "@/lib/format";

type NavItem = { to: string; label: string; icon: typeof Bot; end?: boolean };

function navFor(role: string | undefined): { primary: NavItem[]; secondary: NavItem[] } {
  if (role === "ADMIN") {
    return {
      primary: [
        { to: "/app/admin", label: "Admin console", icon: ShieldCheck },
        { to: "/app/tasks", label: "All review tasks", icon: LayoutDashboard },
        { to: "/app/payments", label: "Payments & ledger", icon: Wallet },
      ],
      secondary: [
        { to: "/app/integrations", label: "Integrations", icon: Plug },
        { to: "/app/docs", label: "Docs & setup", icon: BookOpen },
      ],
    };
  }
  if (role === "REVIEWER") {
    return {
      primary: [
        { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
        { to: "/app/marketplace", label: "Marketplace", icon: Store },
        { to: "/app/reviews", label: "My reviews", icon: Bot },
        { to: "/app/earnings", label: "Earnings", icon: Wallet },
      ],
      secondary: [
        { to: "/app/profile", label: "Reviewer profile", icon: UserRound },
        { to: "/app/integrations", label: "Integrations", icon: Plug },
        { to: "/app/docs", label: "Docs & setup", icon: BookOpen },
      ],
    };
  }
  return {
    primary: [
      { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
      { to: "/app/workspace", label: "Agent workspace", icon: Bot },
      { to: "/app/requests", label: "My requests", icon: Search },
      { to: "/app/payments", label: "Payments", icon: CreditCard },
    ],
    secondary: [
      { to: "/app/profile", label: "Profile", icon: UserRound },
      { to: "/app/integrations", label: "Integrations", icon: Plug },
      { to: "/app/docs", label: "Docs & setup", icon: BookOpen },
    ],
  };
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: api.auth.notifications,
    refetchInterval: 60_000,
  });
  const unread = data?.items.filter((item) => !item.readAt).length ?? 0;

  const markAll = useMutation({
    mutationFn: api.auth.markAllRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative"
      >
        <Bell className="size-4" />
        {unread > 0 ? (
          <span className="absolute right-2 top-2 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-11 z-50 w-[22rem] rounded-lg border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
              <button
                type="button"
                className="text-xs font-medium text-primary disabled:opacity-50"
                disabled={unread === 0 || markAll.isPending}
                onClick={() => markAll.mutate()}
              >
                Mark all read
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto scrollbar-thin">
              {!data || data.items.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-muted-foreground">No notifications yet.</p>
              ) : (
                data.items.slice(0, 10).map((notification) => (
                  <Link
                    key={notification.id}
                    to={notification.link ?? "#"}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "block border-b border-border/60 px-4 py-3 transition-colors last:border-0 hover:bg-muted/60",
                      !notification.readAt && "bg-blue-50/40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold">{notification.title}</p>
                      <time className="shrink-0 text-[10px] text-muted-foreground">
                        {timeAgo(notification.createdAt)}
                      </time>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {notification.body}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const integrations = useQuery({
    queryKey: ["integrations", "status"],
    queryFn: api.integrations.status,
    staleTime: 60_000,
  });

  const nav = useMemo(() => navFor(user?.role), [user?.role]);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  const mode = integrations.data?.paypal.paymentsMode;

  return (
    <div className="min-h-dvh bg-background">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu className="size-4" />
          </Button>
          <Brand />
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
        </div>
      </div>

      <div className="flex min-h-dvh">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
            mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          )}
        >
          <div className="flex h-16 items-center justify-between px-5">
            <Brand />
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="px-4 pb-3">
            <div className="rounded-md border border-border bg-muted/50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Workspace
              </p>
              <p className="mt-0.5 truncate text-xs font-medium">
                {user?.role === "ADMIN" ? "Administration" : user?.role === "REVIEWER" ? "Reviewer" : "AI agent operator"}
              </p>
            </div>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4 scrollbar-thin" aria-label="Main">
            {nav.primary.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive || (item.to === "/app/admin" && location.pathname.startsWith("/app/admin"))
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )
                  }
                >
                  <Icon className="size-4" aria-hidden />
                  {item.label}
                </NavLink>
              );
            })}

            <div className="pt-4">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                System
              </p>
              {nav.secondary.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )
                    }
                  >
                    <Icon className="size-4" aria-hidden />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </nav>

          <div className="border-t border-border p-3">
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Payment mode
                </p>
                {mode === "SIMULATED" ? (
                  <Badge tone="warning" dot>
                    Simulated
                  </Badge>
                ) : mode === "SANDBOX" ? (
                  <Badge tone="info" dot>
                    Sandbox
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
                {mode === "SIMULATED" ? (
                  <>
                    <FlaskConical className="size-3" /> No PayPal money moves
                  </>
                ) : (
                  <>
                    <ShieldCheck className="size-3" /> Genuine Sandbox API calls
                  </>
                )}
              </p>
            </div>
          </div>
        </aside>

        {mobileOpen ? (
          <button
            type="button"
            aria-label="Close navigation overlay"
            className="fixed inset-0 z-40 bg-slate-950/30 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Desktop top bar */}
          <header className="sticky top-0 z-30 hidden h-14 items-center justify-between border-b border-border bg-card/90 px-6 backdrop-blur lg:flex">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
                API connected
              </span>
              <a
                href="http://localhost:4000/api-docs"
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-border bg-background px-2.5 py-1 hover:text-foreground"
              >
                API docs
              </a>
              {integrations.data?.ai.engine === "demo" ? (
                <span className="rounded-full border border-border bg-background px-2.5 py-1">
                  Demo AI mode
                </span>
              ) : (
                <span className="rounded-full border border-border bg-background px-2.5 py-1">
                  AI: {integrations.data?.ai.provider}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <NotificationBell />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((value) => !value)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  aria-expanded={menuOpen}
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                    {initials(user?.name ?? "HF")}
                  </span>
                  <span className="hidden max-w-32 truncate text-xs font-medium xl:block">{user?.name}</span>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </button>
                {menuOpen ? (
                  <>
                    <button
                      type="button"
                      aria-label="Close menu"
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-11 z-50 w-56 rounded-lg border border-border bg-card p-1.5 shadow-xl">
                      <div className="border-b border-border px-2.5 py-2">
                        <p className="truncate text-xs font-semibold">{user?.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{user?.email}</p>
                        <Badge tone="neutral" className="mt-1.5">
                          {humanize(user?.role)}
                        </Badge>
                      </div>
                      <Link
                        to="/app/profile"
                        onClick={() => setMenuOpen(false)}
                        className="mt-1 flex items-center gap-2 rounded-md px-2.5 py-2 text-xs hover:bg-muted"
                      >
                        <UserRound className="size-3.5" /> Profile settings
                      </Link>
                      <Link
                        to="/app/integrations"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 rounded-md px-2.5 py-2 text-xs hover:bg-muted"
                      >
                        <Plug className="size-3.5" /> Integrations
                      </Link>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-destructive hover:bg-destructive/5"
                      >
                        <LogOut className="size-3.5" /> Sign out
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-6xl">
              <Outlet />
            </div>
          </main>

          <footer className="border-t border-border px-6 py-4 text-[11px] text-muted-foreground">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
              <span>TrustToPay · hackathon build · MIT</span>
              <span>
                {mode === "SIMULATED"
                  ? "Simulated payments — no PayPal money moves."
                  : "PayPal Sandbox only — no live-money transactions."}
              </span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
