import { useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BookOpen,
  Bot,
  ChevronDown,
  CreditCard,
  ExternalLink,
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
import { cn } from "@/lib/utils";
import { humanize, initials, timeAgo } from "@/lib/format";

type NavItem = { to: string; label: string; icon: typeof Bot; end?: boolean };

function navFor(role: string | undefined): { primary: NavItem[]; secondary: NavItem[] } {
  if (role === "ADMIN") {
    return {
      primary: [
        { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
        { to: "/app/admin", label: "Admin Console", icon: ShieldCheck },
        { to: "/app/tasks", label: "All Tasks", icon: Search },
        { to: "/app/payments", label: "Payment Ledger", icon: Wallet },
      ],
      secondary: [
        { to: "/app/profile", label: "Profile & Settings", icon: UserRound },
        { to: "/app/integrations", label: "Integrations", icon: Plug },
        { to: "/app/docs", label: "Documentation", icon: BookOpen },
      ],
    };
  }
  if (role === "REVIEWER") {
    return {
      primary: [
        { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
        { to: "/app/marketplace", label: "Available Offers", icon: Store },
        { to: "/app/reviews", label: "Active Tasks", icon: Bot },
        { to: "/app/earnings", label: "Earnings & Payouts", icon: Wallet },
      ],
      secondary: [
        { to: "/app/profile", label: "Skills & Profile", icon: UserRound },
        { to: "/app/integrations", label: "Integrations", icon: Plug },
        { to: "/app/docs", label: "Documentation", icon: BookOpen },
      ],
    };
  }
  return {
    primary: [
      { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
      { to: "/app/workspace", label: "Agent Workspace", icon: Bot },
      { to: "/app/requests", label: "My Requests", icon: Search },
      { to: "/app/payments", label: "Payments", icon: CreditCard },
    ],
    secondary: [
      { to: "/app/profile", label: "Profile & API Keys", icon: UserRound },
      { to: "/app/integrations", label: "Integrations", icon: Plug },
      { to: "/app/docs", label: "Documentation", icon: BookOpen },
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
          <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-primary font-mono text-[9px] font-semibold text-white">
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
          <div className="absolute right-0 top-11 z-50 w-[22rem] rounded-lg border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="font-display text-sm font-semibold text-foreground">Notifications</p>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
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
                data.items.slice(0, 10).map((notification) => {
                  const itemClasses = cn(
                    "block border-b border-border/60 px-4 py-3 transition-colors last:border-0 hover:bg-secondary/60",
                    !notification.readAt && "bg-primary/5",
                  );
                  const content = (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-foreground">{notification.title}</p>
                        <time className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                          {timeAgo(notification.createdAt)}
                        </time>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {notification.body}
                      </p>
                    </>
                  );

                  return notification.link ? (
                    <Link
                      key={notification.id}
                      to={notification.link}
                      onClick={() => setOpen(false)}
                      className={itemClasses}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div key={notification.id} className={itemClasses}>
                      {content}
                    </div>
                  );
                })
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
    setMenuOpen(false);
    await logout();
    navigate("/login");
  }

  const mode = integrations.data?.paypal.paymentsMode;
  const roleLabel =
    user?.role === "ADMIN"
      ? "Administrator"
      : user?.role === "REVIEWER"
        ? "Verified Specialist"
        : "Requester / Agent Operator";

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
        <div className="flex items-center gap-2.5">
          <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu className="size-4" />
          </Button>
          <Brand />
        </div>
        <div className="flex items-center gap-1.5">
          <NotificationBell />
        </div>
      </div>

      <div className="flex min-h-dvh">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-[#0A0F1A] transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
            mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          )}
        >
          <div className="flex h-16 items-center justify-between border-b border-border/70 px-5">
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

          <div className="px-4 pt-4 pb-2">
            <div className="rounded-md border border-border bg-secondary/40 px-3 py-2.5">
              <p className="text-[11px] font-medium text-muted-foreground">Active Workspace</p>
              <p className="mt-0.5 truncate font-display text-xs font-semibold text-foreground">{roleLabel}</p>
            </div>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3 scrollbar-thin" aria-label="Main">
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
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                      isActive || (item.to === "/app/admin" && location.pathname.startsWith("/app/admin"))
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                    )
                  }
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}

            <div className="pt-5">
              <p className="px-3 pb-1.5 text-[11px] font-medium text-muted-foreground">
                Platform
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
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                        isActive
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                      )
                    }
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </nav>

          <div className="space-y-2.5 border-t border-border/70 p-3">
            <div className="rounded-md border border-border bg-secondary/30 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Payment Environment</span>
                <span className="font-mono text-[11px] font-semibold text-foreground">
                  {mode === "SIMULATED" ? "Simulated" : "PayPal Sandbox"}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                {mode === "SIMULATED"
                  ? "Simulated transactions · No money moves"
                  : "PayPal Sandbox checkout & payouts"}
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 lg:hidden">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">{user?.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{user?.email}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="shrink-0 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
              >
                <LogOut className="size-3.5" /> Sign out
              </Button>
            </div>
          </div>
        </aside>

        {mobileOpen ? (
          <button
            type="button"
            aria-label="Close navigation overlay"
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Desktop top bar */}
          <header className="sticky top-0 z-30 hidden h-16 items-center justify-between border-b border-border bg-[#080C14]/90 px-6 backdrop-blur lg:flex">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{roleLabel}</span>
              <span aria-hidden="true">·</span>
              <a
                href="/api-docs"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
              >
                OpenAPI Reference <ExternalLink className="size-3" />
              </a>
            </div>

            <div className="flex items-center gap-2">
              <NotificationBell />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((value) => !value)}
                  className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm transition-colors hover:bg-secondary"
                  aria-expanded={menuOpen}
                >
                  <span className="flex size-6 items-center justify-center rounded bg-primary/15 font-mono text-[11px] font-semibold text-primary">
                    {initials(user?.name ?? "TP")}
                  </span>
                  <span className="hidden max-w-36 truncate text-xs font-medium text-foreground xl:block">
                    {user?.name}
                  </span>
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
                    <div className="absolute right-0 top-11 z-50 w-60 rounded-lg border border-border bg-card p-1.5 shadow-2xl">
                      <div className="border-b border-border px-3 py-2.5">
                        <p className="truncate text-xs font-semibold text-foreground">{user?.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{user?.email}</p>
                        <p className="mt-1 text-[11px] font-medium text-primary">{humanize(user?.role)}</p>
                      </div>
                      <Link
                        to="/app/profile"
                        onClick={() => setMenuOpen(false)}
                        className="mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-xs text-foreground hover:bg-secondary"
                      >
                        <UserRound className="size-3.5 text-muted-foreground" /> Profile &amp; Settings
                      </Link>
                      <Link
                        to="/app/integrations"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-foreground hover:bg-secondary"
                      >
                        <Plug className="size-3.5 text-muted-foreground" /> System Integrations
                      </Link>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/10"
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

          <footer className="border-t border-border/70 px-6 py-4 text-xs text-muted-foreground">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
              <span>TrustToPay · Human-in-the-Loop Escalation &amp; Settlement</span>
              <span>
                {mode === "SIMULATED"
                  ? "Simulated payment mode — no money moves."
                  : "PayPal Sandbox mode — no live-money transactions."}
              </span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
