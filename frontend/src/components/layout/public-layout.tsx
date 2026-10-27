import { Link, NavLink } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="TrustToPay home">
      <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
        <ShieldCheck className="size-4.5" aria-hidden />
      </span>
      {!compact ? (
        <span className="text-[15px] font-semibold tracking-tight">
          Trust<span className="text-primary">ToPay</span>
        </span>
      ) : null}
    </Link>
  );
}

export function PublicHeader() {
  const { user } = useAuth();
  const appHome = user?.role === "ADMIN" ? "/app/admin" : user?.role === "REVIEWER" ? "/app/marketplace" : "/app";

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Brand />
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="/#how-it-works" className="transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="/#example" className="transition-colors hover:text-foreground">
              Example case
            </a>
            <a href="/#paypal" className="transition-colors hover:text-foreground">
              PayPal
            </a>
            <NavLink
              to="/app/docs"
              className={({ isActive }) => cn("transition-colors hover:text-foreground", isActive && "text-foreground")}
            >
              Docs
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <Button asChild size="sm">
              <Link to={appHome}>
                Open app <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/login?mode=register">
                  Get started <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="container grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Brand />
          <p className="max-w-xs text-xs leading-5 text-muted-foreground">
            Confidence-triggered human verification with evidence-based checks and conditional PayPal
            rewards.
          </p>
        </div>
        <div className="space-y-2 text-xs">
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Product</p>
          <Link to="/app" className="block text-muted-foreground hover:text-foreground">
            Agent workspace
          </Link>
          <Link to="/app/marketplace" className="block text-muted-foreground hover:text-foreground">
            Reviewer marketplace
          </Link>
          <Link to="/app/docs" className="block text-muted-foreground hover:text-foreground">
            Documentation
          </Link>
        </div>
        <div className="space-y-2 text-xs">
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Developers</p>
          <a
            href="http://localhost:4000/api-docs"
            target="_blank"
            rel="noreferrer"
            className="block text-muted-foreground hover:text-foreground"
          >
            API reference (Swagger)
          </a>
          <Link to="/app/integrations" className="block text-muted-foreground hover:text-foreground">
            Integration status
          </Link>
          <a
            href="https://developer.paypal.com/api/rest/"
            target="_blank"
            rel="noreferrer"
            className="block text-muted-foreground hover:text-foreground"
          >
            PayPal REST documentation
          </a>
        </div>
        <div className="space-y-2 text-xs">
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Trust</p>
          <Link to="/privacy" className="block text-muted-foreground hover:text-foreground">
            Privacy notice
          </Link>
          <Link to="/contact" className="block text-muted-foreground hover:text-foreground">
            Contact
          </Link>
          <p className="text-muted-foreground">MIT licensed · Sandbox only</p>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="container flex flex-col gap-1 py-4 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} TrustToPay. Hackathon project.</p>
          <p>
            Demo mode uses simulated payments. Genuine mode uses PayPal Sandbox only — never live money.
          </p>
        </div>
      </div>
    </footer>
  );
}
