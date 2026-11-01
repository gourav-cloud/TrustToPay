import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, ExternalLink, Menu, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Original TrustToPay Geometric Mark (PRESERVED EXACTLY):
 * Represents an automated AI agent trajectory (left cobalt path) and a verified
 * human specialist trajectory (right slate/platinum path) converging at a central
 * cryptographic verification node (emerald core).
 */
export function TrustToPayLogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-8 shrink-0", className)}
      aria-hidden="true"
    >
      <rect width="36" height="36" rx="8" fill="#0A0F1D" />
      <rect x="0.75" y="0.75" width="34.5" height="34.5" rx="7.25" stroke="#1E293B" strokeWidth="1.5" />
      {/* AI Agent Trajectory */}
      <path
        d="M8.5 12.5H15.5L19.5 18L15.5 23.5H8.5"
        stroke="#3B82F6"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Human Specialist Trajectory */}
      <path
        d="M27.5 12.5H20.5L16.5 18L20.5 23.5H27.5"
        stroke="#E2E8F0"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Terminal Nodes */}
      <circle cx="8.5" cy="12.5" r="2" fill="#3B82F6" />
      <circle cx="8.5" cy="23.5" r="2" fill="#3B82F6" />
      <circle cx="27.5" cy="12.5" r="2" fill="#E2E8F0" />
      <circle cx="27.5" cy="23.5" r="2" fill="#10B981" />
      {/* Central Verification Gate */}
      <circle cx="18" cy="18" r="3.25" fill="#10B981" stroke="#0A0F1D" strokeWidth="1.5" />
    </svg>
  );
}

export function Brand({
  to = "/",
  compact = false,
  tone = "default",
  className,
}: {
  to?: string;
  compact?: boolean;
  tone?: "default" | "inverse";
  className?: string;
}) {
  return (
    <Link
      to={to}
      aria-label="TrustToPay home"
      className={cn("group inline-flex items-center gap-2.5 whitespace-nowrap shrink-0", className)}
    >
      <TrustToPayLogoMark className="transition-transform duration-150 group-hover:scale-[1.03]" />
      {!compact ? (
        <span
          className={cn(
            "font-display text-base font-bold tracking-tight whitespace-nowrap shrink-0",
            tone === "inverse" ? "text-white" : "text-foreground",
          )}
        >
          TrustToPay
        </span>
      ) : null}
    </Link>
  );
}

const PUBLIC_NAV_ITEMS = [
  { label: "Product", href: "/#product", isHash: true },
  { label: "How It Works", href: "/#how-it-works", isHash: true },
  { label: "Developers", href: "/#developers", isHash: true },
  { label: "Documentation", href: "/app/docs", isHash: false },
] as const;

export function PublicHeader() {
  const { user } = useAuth();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 12);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.hash]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-colors duration-150",
        scrolled
          ? "border-b border-border bg-[#080C14]/95 backdrop-blur-md"
          : "border-b border-border/70 bg-[#080C14]/85 backdrop-blur-sm",
      )}
    >
      <div className="container flex h-16 items-center justify-between gap-8">
        {/* Zone 1: Brand wordmark */}
        <Brand />

        {/* Zone 2: Concise single-line navigation links */}
        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex"
        >
          {PUBLIC_NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              to={item.href}
              className="whitespace-nowrap shrink-0 transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Zone 3: Primary action */}
        <div className="hidden items-center gap-3 shrink-0 md:flex">
          {user ? (
            <Button asChild size="sm">
              <Link to="/app">
                Open Console <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          ) : (
            <>
              <Link
                to="/login"
                className="px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground whitespace-nowrap shrink-0"
              >
                Sign In
              </Link>
              <Button asChild size="sm">
                <Link to="/register">
                  Get Started <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <div className="flex items-center gap-2 md:hidden">
          {user ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/app">Console</Link>
            </Button>
          ) : (
            <Link
              to="/login"
              className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0"
            >
              Sign In
            </Link>
          )}
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
          >
            {mobileMenuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Mobile navigation drawer */}
      {mobileMenuOpen ? (
        <div className="border-t border-border bg-card px-6 py-4 md:hidden">
          <nav aria-label="Mobile navigation" className="flex flex-col space-y-1">
            {PUBLIC_NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                to={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
            {user ? (
              <Button asChild className="w-full">
                <Link to="/app" onClick={() => setMobileMenuOpen(false)}>
                  Open Console <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                    Sign In
                  </Link>
                </Button>
                <Button asChild className="w-full">
                  <Link to="/register" onClick={() => setMobileMenuOpen(false)}>
                    Get Started <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-[#060911] text-muted-foreground">
      <div className="container py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="space-y-3">
            <Brand tone="inverse" />
            <p className="max-w-sm text-xs leading-6 text-muted-foreground">
              Human-in-the-loop task delegation infrastructure for AI agents. When an AI agent gets stuck,
              TrustToPay finds the right human specialist, verifies their work, and enables a trusted handoff.
            </p>
            <p className="text-xs text-muted-foreground">
              PayPal Sandbox &amp; Isolated Verification Enforced
            </p>
          </div>

          <div>
            <p className="font-display text-xs font-semibold text-foreground">
              Product
            </p>
            <ul className="mt-3 space-y-2.5 text-xs">
              <li>
                <Link to="/#product" className="transition-colors hover:text-foreground">
                  Platform Overview
                </Link>
              </li>
              <li>
                <Link to="/#how-it-works" className="transition-colors hover:text-foreground">
                  How It Works
                </Link>
              </li>
              <li>
                <Link to="/app/workspace" className="transition-colors hover:text-foreground">
                  Agent Workspace
                </Link>
              </li>
              <li>
                <Link to="/app/marketplace" className="transition-colors hover:text-foreground">
                  Specialist Marketplace
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="font-display text-xs font-semibold text-foreground">
              Developers
            </p>
            <ul className="mt-3 space-y-2.5 text-xs">
              <li>
                <Link to="/#developers" className="transition-colors hover:text-foreground">
                  API &amp; Webhooks
                </Link>
              </li>
              <li>
                <Link to="/app/docs" className="transition-colors hover:text-foreground">
                  Documentation &amp; Setup
                </Link>
              </li>
              <li>
                <a
                  href="/api-docs"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                >
                  OpenAPI Reference <ExternalLink className="size-3" />
                </a>
              </li>
              <li>
                <Link to="/app/integrations" className="transition-colors hover:text-foreground">
                  System &amp; Adapter Status
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="font-display text-xs font-semibold text-foreground">
              Account &amp; Governance
            </p>
            <ul className="mt-3 space-y-2.5 text-xs">
              <li>
                <Link to="/login" className="transition-colors hover:text-foreground">
                  Sign In
                </Link>
              </li>
              <li>
                <Link to="/register" className="transition-colors hover:text-foreground">
                  Create Account
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="transition-colors hover:text-foreground">
                  Privacy &amp; Data Handling
                </Link>
              </li>
              <li>
                <Link to="/contact" className="transition-colors hover:text-foreground">
                  Support &amp; Security
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} TrustToPay. Licensed under MIT.</p>
          <p>Verified human handoff · PayPal Sandbox checkout &amp; payouts</p>
        </div>
      </div>
    </footer>
  );
}
