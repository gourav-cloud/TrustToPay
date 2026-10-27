import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bug,
  Lock,
  Mail,
  Plug,
  ShieldAlert,
  Terminal,
} from "lucide-react";
import { PublicHeader, MarketingFooter } from "@/components/layout/public-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ContactPage() {
  return (
    <div className="min-h-dvh bg-background">
      <PublicHeader />
      <main className="container max-w-3xl py-12">
        <Badge tone="info">Support</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Contact and support</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          TrustToPay is a hackathon reference build. There is no hosted production service and no monitored
          support inbox. The guidance below helps you route a question without exposing secrets.
        </p>

        <div className="mt-8 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Terminal className="size-4 text-primary" /> Setup or evaluation questions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>
                Start with the in-app documentation and the live integration status. Most setup problems are a missing
                environment variable, a backend that has not been restarted after a config change, or a seed that has
                not been run.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/app/docs">
                    <BookOpen className="size-3.5" /> Read the docs
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/app/integrations">
                    <Plug className="size-3.5" /> Integration status
                  </Link>
                </Button>
              </div>
              <p className="rounded-md border border-border bg-muted/30 p-3 text-[11px] leading-5">
                For a hackathon submission, use the submission channel provided to reviewers or judges. This page does
                not publish a maintainer email address because none is bundled with the project.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Bug className="size-4 text-primary" /> Bug reports
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>
                If you fork or publish this project, add the repository&apos;s issue tracker to this page. A useful
                report includes the command you ran, the environment, the exact error, and whether you were in demo or
                Sandbox mode. Remove cookies, credentials, client secrets and personal data before posting logs.
              </p>
            </CardContent>
          </Card>

          <Card className="border-amber-200">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldAlert className="size-4 text-amber-700" /> Security disclosure
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>
                Do not open a public issue containing a secret, an exploit against a live deployment, or personal data.
                Report the issue privately through the channel used to distribute this build, and include a minimal
                reproduction.
              </p>
              <p>
                This build is Sandbox-only and deliberately rejects live PayPal endpoints. A report that only claims
                &quot;the demo moved no money&quot; is expected behaviour, not a vulnerability.
              </p>
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/70 p-3 text-[11px] leading-5 text-amber-900">
                <Lock className="mt-0.5 size-3.5 shrink-0" />
                Never send API secrets, PayPal credentials or session cookies in chat, screenshots or issue comments.
              </div>
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="size-4 text-primary" />
                Prefer to explore first? The demo requires no credentials.
              </div>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/">
                    <ArrowLeft className="size-3.5" /> Home
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/login">
                    Open demo <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
