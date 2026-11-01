import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Compass, LayoutDashboard, SearchX } from "lucide-react";
import { PublicHeader, MarketingFooter } from "@/components/layout/public-layout";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFoundPage() {
  const { user } = useAuth();
  const location = useLocation();
  const insideApp = location.pathname.startsWith("/app");

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {!insideApp ? <PublicHeader /> : null}
      <main className="container flex min-h-[65vh] max-w-2xl items-center py-12">
        <Card className="w-full border-border bg-card">
          <CardContent className="space-y-5 p-8 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground">
              <SearchX className="size-6" />
            </div>
            <div className="space-y-1.5">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                404 · Route Not Found
              </p>
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                That page or record does not exist
              </h1>
              <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
                The requested URL does not match an active route, or the referenced task/session identifier is no longer
                present in the current database.
              </p>
              <p className="break-all font-mono text-[11px] text-muted-foreground">{location.pathname}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <Button asChild variant="outline">
                <Link to={user ? "/app" : "/"}>
                  <ArrowLeft className="size-4" /> {user ? "Back to workspace" : "Back to home"}
                </Link>
              </Button>
              {user ? (
                <Button asChild>
                  <Link to="/app/workspace">
                    <Compass className="size-4" /> Agent workspace
                  </Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link to="/login">
                    <LayoutDashboard className="size-4" /> Sign in
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
      {!insideApp ? <MarketingFooter /> : null}
    </div>
  );
}
