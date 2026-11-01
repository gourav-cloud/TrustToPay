import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CreditCard,
  Database,
  ExternalLink,
  FileCheck2,
  FlaskConical,
  KeyRound,
  Layers,
  Lock,
  Plug,
  Server,
  ShieldCheck,
  Terminal,
  Webhook,
  Workflow,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/common";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "quickstart", label: "Quick start", icon: Terminal },
  { id: "architecture", label: "Architecture", icon: Layers },
  { id: "ai", label: "AI analysis", icon: Bot },
  { id: "paypal", label: "PayPal", icon: CreditCard },
  { id: "security", label: "Security", icon: Lock },
  { id: "api", label: "API", icon: Server },
  { id: "demo", label: "Demo walkthrough", icon: FlaskConical },
  { id: "limitations", label: "Limitations", icon: ShieldCheck },
];

export default function DocsPage() {
  const [active, setActive] = useState("quickstart");
  const status = useQuery({
    queryKey: ["integrations", "status"],
    queryFn: api.integrations.status,
    staleTime: 60_000,
  });

  useEffect(() => {
    const sections = SECTIONS.map((section) => document.getElementById(section.id)).filter(
      (element): element is HTMLElement => Boolean(element),
    );
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: [0, 1] },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const paypal = status.data?.paypal;
  const ai = status.data?.ai;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Documentation"
        title="Setup, architecture and operating notes"
        description="A practical guide to running the demo, wiring PayPal Sandbox, understanding the escalation and verification rules, and knowing what this build does not do."
        actions={
          <>
            <Button asChild variant="outline">
              <a href="/api-docs" target="_blank" rel="noreferrer">
                Swagger <ExternalLink className="size-4" />
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link to="/app/integrations">
                <Plug className="size-4" /> Integration status
              </Link>
            </Button>
          </>
        }
      />

      {status.data ? (
        <Card className="border-primary/20">
          <CardContent className="flex flex-wrap items-center gap-2 p-3.5 text-xs">
            <Badge tone={paypal?.paymentsMode === "SIMULATED" ? "warning" : "success"} dot>
              {paypal?.paymentsMode === "SIMULATED" ? "Simulated payments" : "PayPal Sandbox"}
            </Badge>
            <Badge tone={ai?.engine === "demo" ? "info" : "success"} dot>
              {ai?.engine === "demo" ? "Deterministic demo AI" : `${ai?.provider} · ${ai?.model}`}
            </Badge>
            <Badge tone={paypal?.payoutsEnabled ? "success" : "neutral"} dot>
              Payouts {paypal?.payoutsEnabled ? "enabled" : "not enabled"}
            </Badge>
            <span className="text-muted-foreground">
              Current server configuration. The browser only renders this decision.
            </span>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[210px_1fr]">
        <nav aria-label="Documentation sections" className="hidden lg:block">
          <div className="sticky top-20 space-y-0.5">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  onClick={() => setActive(section.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                    active === section.id
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" /> {section.label}
                </a>
              );
            })}
          </div>
        </nav>

        <div className="prose-docs min-w-0 max-w-3xl">
          <section id="quickstart" className="scroll-mt-24">
            <h2 className="mt-0">Quick start</h2>
            <p>
              The default configuration is local demo mode. It requires no PayPal credentials and no AI key. Payments
              are simulated, clearly labelled, and never sent to PayPal.
            </p>
            <Card className="not-prose my-4">
              <CardContent className="space-y-3 p-4">
                <pre className="overflow-x-auto rounded-md bg-slate-950 p-3 text-[11px] leading-5 text-slate-200">
                  <code>{`npm install
npm run setup     # .env, Prisma migrate, demo seed
npm run dev       # API :4000 and web :5173`}</code>
                </pre>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="neutral">Node 20+</Badge>
                  <Badge tone="neutral">SQLite</Badge>
                  <Badge tone="neutral">No credentials required</Badge>
                </div>
                <p className="text-[11px] leading-5 text-muted-foreground">
                  Open <code>http://localhost:5173</code>. API docs are at{" "}
                  <code>/api-docs</code>, health is <code>/health</code>, and the versioned API
                  base is <code>/api/v1</code>.
                </p>
              </CardContent>
            </Card>

            <h3>Workspace roles</h3>
            <ul>
              <li>
                <strong>Requester / Agent Operator</strong> — creates agent sessions, runs confidence analysis, funds
                PayPal escrow orders, and consumes signed handback payloads.
              </li>
              <li>
                <strong>Specialist (Reviewer)</strong> — completes L1–L3 skill assessments, accepts top-5 parallel task
                offers, submits verified patches/answers, and receives PayPal Payouts.
              </li>
              <li>
                <strong>Administrator</strong> — manages specialist eligibility, monitors AG Grid operations &amp;
                Elastic hybrid discovery, resolves disputes, and audits security verification runs.
              </li>
            </ul>

            <h3>Environment variables</h3>
            <div className="not-prose overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Variable</th>
                    <th className="px-3 py-2">Purpose</th>
                    <th className="px-3 py-2">Default</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[
                    ["DEMO_MODE", "true = simulated payments, deterministic demo AI, demo access", "true"],
                    ["DATABASE_URL", "SQLite file used by Prisma", 'file:./dev.db'],
                    ["SESSION_SECRET", "JWT signing secret; setup generates one", "generated"],
                    ["DEMO_USERS_ENABLED", "Allows one-click seeded logins", "true"],
                    ["AI_PROVIDER", "demo or openai-compatible", "demo"],
                    ["AI_API_KEY", "Server-side provider key; never exposed to the browser", "empty"],
                    ["AI_BASE_URL / AI_MODEL", "OpenAI-compatible endpoint and model", "api.openai.com/v1"],
                    ["AI_ESCALATION_THRESHOLD", "Server-side confidence threshold", "0.75"],
                    ["PAYPAL_CLIENT_ID / SECRET", "Sandbox app credentials", "empty"],
                    ["PAYPAL_PAYOUTS_ENABLED", "Request Payouts use after app enablement", "false"],
                    ["PAYPAL_WEBHOOK_ID", "Webhook signature verification ID", "empty"],
                    ["PAYPAL_CURRENCY", "Server-enforced currency", "USD"],
                    ["REWARD_MIN_MINOR / MAX_MINOR", "Reward bounds in minor units", "500 / 10000"],
                  ].map(([name, purpose, fallback]) => (
                    <tr key={name}>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px]">{name}</td>
                      <td className="px-3 py-2 leading-5 text-muted-foreground">{purpose}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px] text-muted-foreground">
                        {fallback}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3">
              Put secrets in <code>.env</code> or your platform&apos;s secret store. Restart the backend after changing
              payment mode or credentials. Secrets are never accepted in chat or committed to the repository.
            </p>
          </section>

          <section id="architecture" className="scroll-mt-24">
            <h2>Architecture</h2>
            <p>
              A React SPA talks to an Express API. Prisma owns persistence in SQLite. The API is the only component
              that holds secrets and the only component that can transition task state.
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-slate-950 p-4 text-[11px] leading-5 text-slate-200">
              <code>{`Browser (React + Vite)
   |  httpOnly cookie, /api/v1 only
   v
Express API  ---- AI engine (demo rules or provider)
   |      |
   |      +---- verification engine (independent checks)
   |      +---- state machine (allowed transitions)
   |      +---- PayPal adapter (Sandbox orders / payouts / webhook verify)
   v
Prisma -> SQLite (users, sessions, evidence, tasks, submissions,
                  verification runs, payments, webhooks, disputes, audit)`}</code>
            </pre>
            <h3>Task lifecycle</h3>
            <p>
              The state machine rejects invalid transitions rather than relying on the UI. A task can only be accepted
              when it is funded, and only the first acceptance succeeds.
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-[11px] leading-6">
              <code>{`AWAITING_FUNDING
  -> FUNDED -> REVIEWER_ASSIGNED -> VERIFICATION_PENDING
       -> VERIFICATION_REJECTED  (reviewer may correct and resubmit)
       -> NEEDS_MANUAL_REVIEW    (administrator decides)
       -> PAYMENT_READY -> PAYMENT_PROCESSING -> PAYMENT_PAID -> COMPLETED
                                              -> PAYOUT_FAILED (reconcile; answer preserved)
Any eligible state -> DISPUTED -> restored by administrator
Any pre-paid state -> CANCELLED`}</code>
            </pre>
            <p>
              Funding failures are explicit (<code>FUNDING_FAILED</code>), not silent. A payout that cannot be proven
              becomes <code>PAYOUT_FAILED</code> and blocks blind retries until reconciliation resolves the provider
              state.
            </p>
          </section>

          <section id="ai" className="scroll-mt-24">
            <h2>AI analysis</h2>
            <p>
              The analysis output is schema-validated. The model must return a summary, proposed answer, confidence,
              uncertainties, conflicting claims, missing information, evidence assessments, a recommended action,
              reviewer skills and a suggested reward.
            </p>
            <h3>Category-aware demo engine</h3>
            <p>
              With <code>AI_PROVIDER=demo</code> (the default), a rule-based engine handles four question
              domains: <code>PROGRAMMING</code>, <code>CRYPTO</code>, <code>CONCEPTUAL</code> and{" "}
              <code>HARDWARE</code>. Hardware questions use the original USB-C checks for wattage, voltage,
              protocol and per-port claims. The other domains compare numeric configuration values, security-sensitive
              claims (chain ID, nonce, signature, replay, authentication) and missing runtime, chain or decision
              details. It does not use an LLM confidence estimate.
            </p>
            <ul>
              <li>A critical unresolved conflict always forces <code>ESCALATE_TO_HUMAN</code>.</li>
              <li>A headline wattage never overrides a documented per-port or per-cable limit.</li>
              <li>Conflicting pool sizes, throughput figures or chain-validation claims also lower confidence.</li>
              <li>Missing runtime, network, protocol or evidence details lower the heuristic score.</li>
              <li>The server applies the threshold and overrides; the browser cannot change the decision.</li>
            </ul>
            <h3>Provider mode</h3>
            <p>
              Set <code>AI_PROVIDER=openai-compatible</code> and provide <code>AI_BASE_URL</code>,{" "}
              <code>AI_MODEL</code> and <code>AI_API_KEY</code> on the server. The provider must return JSON matching
              the analysis schema. Invalid JSON, missing required fields, or a critical conflict is escalated instead
              of trusted.
            </p>
            <Alert tone="info">
              Demo mode is deliberately not described as "AI reasoning". It is a transparent heuristic that makes the
              escalation behaviour reproducible for evaluation.
            </Alert>
          </section>

          <section id="paypal" className="scroll-mt-24">
            <h2>PayPal integration</h2>
            <p>
              PayPal is central to the lifecycle, but funding and payout are separate events. The adapter is
              hard-wired to the Sandbox API base URL; this build cannot reach PayPal live endpoints.
            </p>
            <div className="not-prose grid gap-3 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <CreditCard className="size-4 text-blue-400" /> Funding - Checkout
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-[11px] leading-5 text-muted-foreground">
                  <p>Orders v2 create, browser approval through the official JS SDK, server capture.</p>
                  <p>
                    The server compares the captured amount, currency and reference with the stored reward before
                    marking the task funded.
                  </p>
                  <p>Duplicate create requests recover the open local transaction instead of double-charging.</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <CreditCard className="size-4 text-emerald-400" /> Reward - Payouts
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-[11px] leading-5 text-muted-foreground">
                  <p>Payouts v1 batch creation, then a provider batch lookup before the local row is marked paid.</p>
                  <p>Requires reviewer consent, a valid PayPal email, and Payouts enablement on the app.</p>
                  <p>Unknown outcomes are never auto-retried; reconciliation is explicit.</p>
                </CardContent>
              </Card>
            </div>

            <h3>Enable genuine Sandbox calls</h3>
            <ol>
              <li>
                Create a Sandbox app at{" "}
                <a href="https://developer.paypal.com/" target="_blank" rel="noreferrer">
                  developer.paypal.com
                </a>{" "}
                and copy its Client ID and Secret.
              </li>
              <li>
                Set <code>DEMO_MODE=false</code>, <code>PAYPAL_CLIENT_ID</code>, and{" "}
                <code>PAYPAL_CLIENT_SECRET</code> in the server environment.
              </li>
              <li>
                Add a Sandbox buyer for checkout and a Sandbox recipient email in your reviewer profile.
              </li>
              <li>
                Optionally register a webhook pointing to <code>/api/v1/webhooks/paypal</code> and set{" "}
                <code>PAYPAL_WEBHOOK_ID</code>.
              </li>
              <li>
                Enable Payouts on the app, then set <code>PAYPAL_PAYOUTS_ENABLED=true</code>. Checkout can work
                without Payouts; verified rewards stay authorized if Payouts is unavailable.
              </li>
              <li>Restart the backend and use the admin-only OAuth test on Integrations.</li>
            </ol>
            <Alert tone="warning">
              Credentials are not bundled and genuine Sandbox calls cannot be pre-verified without your PayPal app.
              The OAuth button only obtains a token; it moves no money. A successful OAuth check does not prove
              Checkout or Payouts permissions.
            </Alert>

            <h3>Webhooks and reconciliation</h3>
            <p>
              The webhook endpoint verifies signatures through PayPal&apos;s{" "}
              <code>verify-webhook-signature</code> API using <code>PAYPAL_WEBHOOK_ID</code>, stores the event, and
              deduplicates by event ID. Without a webhook ID, requests are rejected. The ledger also exposes manual
              reconcile actions so an operator can resolve a known provider reference.
            </p>
          </section>

          <section id="security" className="scroll-mt-24">
            <h2>Security model</h2>
            <ul>
              <li>JWT session stored in an httpOnly, SameSite=Lax cookie; bcrypt password hashing.</li>
              <li>Role checks on the server for requester, reviewer and admin actions.</li>
              <li>Origin checks, Helmet headers, request size limits and endpoint-specific rate limits.</li>
              <li>Idempotent funding creation and a transaction-safe exclusive acceptance.</li>
              <li>Reviewers cannot verify their own submission; manual overrides are admin-only and require a note.</li>
              <li>Audit events record lifecycle and administrative actions; sensitive payloads are redacted.</li>
              <li>Secrets stay server-side. Only the Sandbox Client ID is exposed, and only for the PayPal JS SDK.</li>
            </ul>
            <Alert tone="info">
              All financial operations in this environment are restricted to simulated ledger records or PayPal Sandbox
              endpoints; live-money PayPal endpoints are disabled by configuration guardrails.
            </Alert>
          </section>

          <section id="api" className="scroll-mt-24">
            <h2>API</h2>
            <p>
              All application routes are under <code>/api/v1</code>. Authentication uses the session cookie. Errors
              return a stable shape: <code>{`{ error: { code, message, details? } }`}</code>.
            </p>
            <div className="not-prose overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Area</th>
                    <th className="px-3 py-2">Routes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[
                    ["Auth", "POST /auth/register, /auth/login, /auth/demo-login, /auth/logout; GET /auth/me, /auth/notifications"],
                    ["Sessions", "POST/GET /sessions; GET /sessions/:id; POST /sessions/:id/analyze, /sessions/:id/resume"],
                    ["Tasks", "POST/GET /tasks; GET /tasks/:id; POST accept, submit, verify, cancel, disputes; PATCH reward"],
                    ["Payments", "POST /payments/paypal/orders, /paypal/orders/:id/capture, /payouts; GET /payments; POST /:id/reconcile, /:id/retry"],
                    ["Dashboards", "GET /dashboard/agent, /dashboard/reviewer, /dashboard/admin"],
                    ["Admin", "GET /admin/users, /admin/audit, /admin/disputes; PATCH eligibility; POST dispute resolution"],
                    ["Integrations", "GET /integrations/status; POST /integrations/paypal/test-oauth (admin)"],
                    ["Webhooks", "POST /webhooks/paypal (signature verified)"],
                  ].map(([area, routes]) => (
                    <tr key={area}>
                      <td className="whitespace-nowrap px-3 py-2 align-top font-medium">{area}</td>
                      <td className="px-3 py-2 font-mono text-[10px] leading-5 text-muted-foreground">{routes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3">
              The OpenAPI document is served by the backend. Start the app and open{" "}
              <a href="/api-docs" target="_blank" rel="noreferrer">
                /api-docs
              </a>
              .
            </p>
          </section>

          <section id="demo" className="scroll-mt-24">
            <h2>Demo walkthrough</h2>
            <p>
              The seeded data contains scenarios A-J covering hardware, programming, crypto and conceptual
              questions, plus funding, assignment, verification, manual review and payout failures. Scenario A is
              ready to fund end to end; I and J are funded marketplace tasks in the new domains.
            </p>
            <ol>
              <li>Sign in as the requester and open Agent workspace. Select a question type and load its example.</li>
              <li>
                Run the analysis, or open the existing run. Inspect the conflict and escalation reason.
              </li>
              <li>Open a review task and fund its reward. In demo mode this is a labelled simulation.</li>
              <li>Sign in as a reviewer, accept a task in the marketplace, and submit the demo-evidenced answer.</li>
              <li>Watch independent verification run immediately and produce a check-by-check result.</li>
              <li>Release the reward as the requester. In demo mode the payout is simulated.</li>
              <li>Resume the AI session and inspect the verified final answer, ledger and timeline.</li>
              <li>As an administrator, inspect the audit trail and the seeded manual-review/dispute scenarios.</li>
            </ol>
            <div className="not-prose grid gap-3 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Workflow className="size-4 text-primary" /> Seeded scenarios
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-[11px] leading-5 text-muted-foreground">
                  <p>A - 65W charger conflict, ready to fund.</p>
                  <p>B - 96W dock / 100W laptop conflict.</p>
                  <p>C - rejected submission with correction path.</p>
                  <p>D - session awaiting more information.</p>
                  <p>E - funding failure.</p>
                  <p>F - verified answer with a failed payout.</p>
                  <p>G - completed review with simulated payout.</p>
                  <p>H - programming worker-pool conflict, ready to fund.</p>
                  <p>I - funded crypto permit replay review.</p>
                  <p>J - funded conceptual queue-vs-HTTP review.</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Database className="size-4 text-primary" /> Data and labels
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-[11px] leading-5 text-muted-foreground">
                  <p>Seeded records are marked <code>isSeed</code> in the UI.</p>
                  <p>Seeded payments are simulated, not Sandbox transactions.</p>
                  <p>Example URLs use reserved documentation domains, not real retailers.</p>
                  <p>Re-running the seed resets the demo database and changes record IDs.</p>
                </CardContent>
              </Card>
            </div>
          </section>

          <section id="limitations" className="scroll-mt-24">
            <h2>Limitations and honest status</h2>
            <ul>
              <li>
                <strong>No live PayPal.</strong> The adapter only targets the Sandbox base URL. There is no code path
                to PayPal live endpoints.
              </li>
              <li>
                <strong>No bundled credentials.</strong> Genuine Checkout, capture, Payouts and webhook verification
                require your own Sandbox app and cannot be verified before you configure it.
              </li>
              <li>
                <strong>Payouts may be unavailable.</strong> Some Sandbox apps cannot create payouts until enablement.
                The system fails closed and leaves the reward authorized.
              </li>
              <li>
                <strong>External pages are not fetched.</strong> The verifier checks whether the submission contains a
                safe HTTPS URL and a quoted excerpt; it does not crawl or attest the external page.
              </li>
              <li>
                <strong>Deterministic demo AI.</strong> The default engine is a transparent rule engine, not a
                general-purpose LLM.
              </li>
              <li>
                <strong>Single-node SQLite.</strong> This is appropriate for a demo, not for concurrent production
                traffic. Real deployment would need Postgres and a queue.
              </li>
            </ul>
            <div className="not-prose mt-4 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/app/integrations">
                  <Plug className="size-3.5" /> Check live configuration
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/app/workspace">
                  <Bot className="size-3.5" /> Try the demo
                </Link>
              </Button>
            </div>
          </section>

          <div className="not-prose mt-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4">
            <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              <span>
                MIT licensed. Sandbox-only. Demo payments are simulated and labelled in every ledger view.
              </span>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/">
                Back to overview <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
