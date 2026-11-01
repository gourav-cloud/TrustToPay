import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bug,
  Lock,
  Plug,
  ShieldAlert,
  Terminal,
} from "lucide-react";
import { PublicHeader, MarketingFooter } from "@/components/layout/public-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ContactPage() {
  return (
    <div className="min-h-dvh bg-[#080C14] text-[#F1F5F9]">
      <PublicHeader />
      <main className="container max-w-3xl py-12">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3B82F6]">
          Support &amp; Security Operations
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#F1F5F9]">
          Operational diagnostics &amp; security disclosure
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
          TrustToPay is a self-hosted developer infrastructure platform. Use the resources below to inspect live
          integration telemetry, troubleshoot environment configuration, and follow safe security disclosure practices.
        </p>

        <div className="mt-8 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Terminal className="size-4 text-[#3B82F6]" /> Environment &amp; integration diagnostics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-[#94A3B8]">
              <p>
                Start with the technical documentation and live integration status console. Most configuration issues
                are caused by missing environment variables, a server process that needs a restart after updating{" "}
                <code className="font-mono text-xs text-[#F1F5F9]">.env</code>, or unconfigured PayPal Sandbox
                credentials.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/app/docs">
                    <BookOpen className="size-3.5" /> Read technical docs
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/app/integrations">
                    <Plug className="size-3.5" /> Integration status
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Bug className="size-4 text-[#3B82F6]" /> Issue reporting guidelines
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-[#94A3B8]">
              <p>
                When filing an engineering issue in your deployment repository, include the exact API route or CLI
                command, the active payment mode (<code className="font-mono text-xs text-[#F1F5F9]">SIMULATED</code>{" "}
                or <code className="font-mono text-xs text-[#F1F5F9]">SANDBOX</code>), and the structured error code.
                Always redact session tokens, API keys, and PayPal client secrets before sharing logs.
              </p>
            </CardContent>
          </Card>

          <Card className="border-amber-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-amber-300">
                <ShieldAlert className="size-4 text-amber-400" /> Security disclosure policy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-[#94A3B8]">
              <p>
                Never open a public issue containing active credentials, session tokens, or exploit payloads against a
                hosted environment. Route vulnerability reports privately to the deployment operator with a minimal
                reproduction.
              </p>
              <p>
                This platform enforces strict PayPal Sandbox guardrails and rejects live-money endpoints by design.
              </p>
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-5 text-amber-200">
                <Lock className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
                Never transmit API secrets, PayPal credentials, or session tokens in screenshots or issue comments.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="text-xs text-[#94A3B8]">
                Ready to inspect the platform workflow or configure your workspace?
              </div>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/">
                    <ArrowLeft className="size-3.5" /> Home
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/login">
                    Sign in <ArrowRight className="size-3.5" />
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
