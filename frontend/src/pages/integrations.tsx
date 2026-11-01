import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  Clipboard,
  CreditCard,
  ExternalLink,
  FlaskConical,
  KeyRound,
  Link2,
  Lock,
  Plug,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Wallet,
  Webhook,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, SectionHeading, DataRow } from "@/components/common";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingBlock } from "@/components/ui/states";
import { formatDate, humanize } from "@/lib/format";

const ENV_SNIPPET = `# Local demo (default, no credentials, simulated payments)
DEMO_MODE=true
PAYPAL_ENV=sandbox
PAYPAL_CURRENCY=USD

# Genuine PayPal Sandbox (replace with YOUR Sandbox app credentials)
# DEMO_MODE=false
# PAYPAL_CLIENT_ID=your_sandbox_client_id
# PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
# PAYPAL_WEBHOOK_ID=your_webhook_id
# PAYPAL_PAYOUTS_ENABLED=false

# Optional OpenAI-compatible provider (server-side only)
# AI_PROVIDER=openai
# AI_API_KEY=your_provider_key
# AI_MODEL=gpt-4o-mini
# AI_BASE_URL=https://api.openai.com/v1`;

export default function IntegrationsPage() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [oauthResult, setOauthResult] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["integrations", "status"],
    queryFn: api.integrations.status,
    staleTime: 30_000,
  });

  const testOAuth = useMutation({
    mutationFn: api.integrations.testOAuth,
    onSuccess: (data) => setOauthResult(data.message),
    onError: (err) => setOauthResult(err instanceof ApiError ? err.message : "OAuth test failed."),
  });

  if (query.isLoading) return <LoadingBlock label="Loading integration status…" />;
  if (query.error || !query.data) {
    return <ErrorState message={(query.error as Error)?.message ?? "Status unavailable."} onRetry={() => query.refetch()} />;
  }

  const status = query.data;
  const { paypal, ai } = status;

  async function copyEnv() {
    await navigator.clipboard.writeText(ENV_SNIPPET);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Integrations"
        title="Configuration and live status"
        description="The server decides which AI engine and payment mode are active. The browser only renders that decision; no PayPal secret ever reaches the client."
        actions={
          <>
            <Button asChild variant="outline">
              <a href="/api-docs" target="_blank" rel="noreferrer">
                API docs <ExternalLink className="size-3.5" />
              </a>
            </Button>
            <Button variant="outline" onClick={() => query.refetch()} loading={query.isFetching}>
              <RefreshCw className="size-4" /> Refresh
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatusTile
          icon={<Bot className="size-4" />}
          label="AI engine"
          value={ai.engine === "demo" ? "Demo AI" : ai.provider}
          detail={ai.engine === "demo" ? "Deterministic, no LLM or key required" : ai.model}
          tone={ai.engine === "demo" ? "info" : "success"}
        />
        <StatusTile
          icon={<CreditCard className="size-4" />}
          label="Payments"
          value={paypal.paymentsMode === "SIMULATED" ? "Simulated" : "PayPal Sandbox"}
          detail={paypal.paymentsMode === "SIMULATED" ? "No PayPal money moves" : "Genuine Sandbox API calls"}
          tone={paypal.paymentsMode === "SIMULATED" ? "warning" : "success"}
        />
        <StatusTile
          icon={<Wallet className="size-4" />}
          label="Payouts"
          value={paypal.payoutsEnabled ? "Enabled" : "Not enabled"}
          detail={paypal.payoutsEnabled ? "Reviewer rewards can be released" : "Funding works; payouts need enablement"}
          tone={paypal.payoutsEnabled ? "success" : "neutral"}
        />
      </div>

      {status.issues.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="size-4 text-amber-600" /> Configuration notices
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {status.issues.map((issue) => (
              <Alert
                key={issue.code}
                tone={issue.level === "error" ? "danger" : issue.level === "warning" ? "warning" : "info"}
                title={issue.message}
              >
                {issue.hint ? <p>{issue.hint}</p> : null}
                <p className="mt-1 font-mono text-[10px] opacity-70">{issue.code}</p>
              </Alert>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-border pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="size-4 text-blue-600" /> PayPal Checkout funding
              </CardTitle>
              <Badge tone={paypal.checkoutReady ? "success" : "danger"} dot>
                {paypal.checkoutReady ? "Ready" : "Not ready"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <dl>
              <DataRow label="Environment">{paypal.environment}</DataRow>
              <DataRow label="Server mode">{paypal.paymentsMode}</DataRow>
              <DataRow label="Credentials present">{paypal.credentialsPresent ? "Yes" : "No"}</DataRow>
              <DataRow label="Sandbox configured">{paypal.configured ? "Yes" : "No"}</DataRow>
              <DataRow label="Client ID">{paypal.clientId ? `${paypal.clientId.slice(0, 8)}…` : "Not exposed"}</DataRow>
              <DataRow label="Currency">{paypal.currency}</DataRow>
              <DataRow label="Webhook signature check">{paypal.webhookConfigured ? "Configured" : "Not configured"}</DataRow>
            </dl>
            <div className="rounded-md border border-border bg-muted/30 p-2.5 text-[11px] leading-5 text-muted-foreground">
              Checkout uses Orders v2 create + capture. The server validates the captured amount, currency and task
              reference before marking a task funded. Duplicate create requests reuse the open local order.
            </div>
            {paypal.paymentsMode === "SANDBOX" && paypal.configured ? (
              user?.role === "ADMIN" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testOAuth.mutate()}
                  loading={testOAuth.isPending}
                >
                  <KeyRound className="size-3.5" /> Test Sandbox OAuth
                </Button>
              ) : (
                <p className="text-[11px] text-muted-foreground">An administrator can run the OAuth credential test.</p>
              )
            ) : (
              <p className="text-[11px] leading-5 text-muted-foreground">
                OAuth testing is available only in genuine Sandbox mode with credentials present.
              </p>
            )}
            {oauthResult ? (
              <Alert tone={testOAuth.isError ? "danger" : "success"}>{oauthResult}</Alert>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Wallet className="size-4 text-emerald-600" /> PayPal Payouts
              </CardTitle>
              <Badge tone={paypal.payoutsEnabled ? "success" : "warning"} dot>
                {paypal.payoutsEnabled ? "Enabled" : "Permission required"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <dl>
              <DataRow label="Requested by env">{paypal.payoutsRequested ? "PAYPAL_PAYOUTS_ENABLED=true" : "No"}</DataRow>
              <DataRow label="Provider status">{paypal.payoutsEnabled ? "Ready" : "Unavailable"}</DataRow>
              <DataRow label="Recipient consent">Required per reviewer</DataRow>
              <DataRow label="Recipient email">Required per reviewer</DataRow>
            </dl>
            <Alert tone="info">
              Payouts are separate from Checkout. A Sandbox app may be able to capture payments but still require
              Payouts enablement. When unavailable, verified rewards stay authorized and the task remains{" "}
              <code>PAYMENT_READY</code>; nothing is silently marked paid.
            </Alert>
            <p className="text-[11px] leading-5 text-muted-foreground">
              Payout creation is followed by a provider batch lookup. A payout is never recorded as paid from the
              local request alone. Unknown or timed-out outcomes block blind retries.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader className="border-b border-border pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Terminal className="size-4 text-primary" /> Environment setup
              </CardTitle>
              <Button variant="outline" size="sm" onClick={copyEnv}>
                {copied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}
                {copied ? "Copied" : "Copy template"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <pre className="overflow-x-auto rounded-md border border-border bg-slate-950 p-3 text-[10px] leading-5 text-slate-200">
              <code>{ENV_SNIPPET}</code>
            </pre>
            <div className="mt-3 space-y-2 text-[11px] leading-5 text-muted-foreground">
              <p className="flex gap-2">
                <Lock className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                Put secrets in <code>.env</code> locally or your platform&apos;s secret settings. Never send them in
                chat or commit them.
              </p>
              <p className="flex gap-2">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                The server refuses live PayPal. The adapter is hard-wired to the Sandbox API base URL.
              </p>
              <p className="flex gap-2">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                Restart the backend after changing <code>DEMO_MODE</code> or credentials so the server reloads config.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" /> Sandbox setup checklist
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {[
              {
                title: "Create a PayPal Developer account and Sandbox app",
                body: "developer.paypal.com → Apps & Credentials → Sandbox. Copy the Client ID and Secret for your app.",
                link: status.docs.paypalSetup,
              },
              {
                title: "Add a Sandbox buyer and recipient",
                body: "Use Sandbox accounts from the developer dashboard. The reviewer's payout email must be a valid Sandbox recipient.",
                link: status.docs.paypalSandbox,
              },
              {
                title: "Set server environment values",
                body: "DEMO_MODE=false, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, and optionally PAYPAL_WEBHOOK_ID. Restart the backend.",
                link: null,
              },
              {
                title: "Enable Payouts for the app",
                body: "If Payouts is not enabled, Checkout funding still works. Set PAYPAL_PAYOUTS_ENABLED=true only after the app can create payouts.",
                link: status.docs.paypalSetup,
              },
              {
                title: "Register the webhook",
                body: "Point PayPal to /api/v1/webhooks/paypal. The server verifies signatures with the configured webhook ID and deduplicates event IDs.",
                link: status.docs.paypalWebhooks,
              },
            ].map((step, index) => (
              <div key={step.title} className="flex gap-2.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {index + 1}
                </span>
                <div>
                  <p className="text-xs font-medium">{step.title}</p>
                  <p className="text-[11px] leading-5 text-muted-foreground">{step.body}</p>
                  {step.link ? (
                    <a
                      href={step.link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-primary underline underline-offset-2"
                    >
                      PayPal documentation <ArrowUpRight className="size-2.5" />
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bot className="size-4 text-primary" /> AI provider
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl>
              <DataRow label="Engine">{ai.engine === "demo" ? "Deterministic demo" : "Provider"}</DataRow>
              <DataRow label="Provider">{ai.provider}</DataRow>
              <DataRow label="Model">{ai.model}</DataRow>
              <DataRow label="Configured">{ai.configured ? "Yes" : "No — demo engine used"}</DataRow>
              <DataRow label="Escalation threshold">{Math.round(ai.threshold * 100)}%</DataRow>
            </dl>
            <p className="text-[11px] leading-5 text-muted-foreground">
              Server-side overrides are applied: a critical conflict, missing required fields or a schema-invalid
              response forces escalation. The browser cannot override the decision.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/app/docs#ai">AI configuration details</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Webhook className="size-4 text-primary" /> Webhooks and reconciliation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 text-[11px] leading-5 text-muted-foreground">
              <p className="flex gap-2">
                <Link2 className="mt-0.5 size-3.5 shrink-0" /> Endpoint: <code>POST /api/v1/webhooks/paypal</code>
              </p>
              <p className="flex gap-2">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" /> Signature verified through PayPal&apos;s{" "}
                <code>verify-webhook-signature</code> API using <code>PAYPAL_WEBHOOK_ID</code>.
              </p>
              <p className="flex gap-2">
                <FlaskConical className="mt-0.5 size-3.5 shrink-0" /> Events are stored and deduplicated by event ID
                before any state change.
              </p>
              <p className="flex gap-2">
                <RefreshCw className="mt-0.5 size-3.5 shrink-0" /> Capture and payout amounts are compared with the
                server-stored minor units. Mismatches become failures, not silent successes.
              </p>
            </div>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-5 text-amber-200">
              Without <code>PAYPAL_WEBHOOK_ID</code>, webhook requests are rejected. The payment ledger still has manual
              reconcile controls for funding and payout state.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Plug className="size-4 text-primary" /> Current evaluation mode
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniFact label="Database" value={status.database.label} />
            <MiniFact label="Demo access" value={status.demoUsersEnabled ? "Enabled" : "Disabled"} />
            <MiniFact label="Reward range" value={`${status.rewardLimits.minDisplay} – ${status.rewardLimits.maxDisplay}`} />
            <MiniFact label="PayPal currency" value={status.paypal.currency} />
          </div>
          {status.paypal.paymentsMode === "SIMULATED" ? (
            <Alert tone="warning" icon={<FlaskConical className="size-4" />} title="You are in local demo mode">
              All seeded and newly captured payments are simulated and labelled in the ledger. To evaluate genuine
              PayPal Checkout or Payouts, configure Sandbox credentials and set <code>DEMO_MODE=false</code>.
            </Alert>
          ) : status.paypal.configured ? (
            <Alert tone="success" icon={<CheckCircle2 className="size-4" />} title="Genuine PayPal Sandbox mode">
              The backend will make real HTTP calls to PayPal Sandbox. No live-money endpoint is reachable.
            </Alert>
          ) : (
            <Alert tone="danger" icon={<ShieldAlert className="size-4" />} title="Sandbox requested but not configured">
              Add credentials or return to demo mode. Payment actions will fail closed rather than pretend to work.
            </Alert>
          )}
          <p className="text-[10px] text-muted-foreground">Status refreshed {formatDate(new Date().toISOString())}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusTile({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: "info" | "success" | "warning" | "neutral";
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-sm font-semibold">{value}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>
        </div>
        <div className="rounded-md bg-muted p-2 text-muted-foreground">{icon}</div>
      </div>
      <Badge tone={tone} dot className="mt-2">
        {tone === "success" ? "Ready" : tone === "warning" ? "Simulated" : humanize(value)}
      </Badge>
    </Card>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs font-medium">{value}</p>
    </div>
  );
}
