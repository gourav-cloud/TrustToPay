import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  BrainCircuit,
  CheckCircle2,
  CreditCard,
  FileSearch,
  FlaskConical,
  Gauge,
  GraduationCap,
  Handshake,
  Layers,
  Lock,
  MessageSquare,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Store,
  UserCheck,
  Wallet,
} from "lucide-react";
import { api } from "@/lib/api";
import { PublicHeader, MarketingFooter } from "@/components/layout/public-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    id: "analyze",
    label: "AI analyzes",
    icon: BrainCircuit,
    title: "The agent submits a question and its evidence",
    body: "TrustToPay runs a schema-validated analysis over the question and supplied documents — whether the question is about code, crypto, an architecture trade-off or a USB-C charger. The demo engine is deterministic and rule-based; an optional provider can be configured server-side.",
    detail: [
      "Extracts numeric, code, protocol and configuration claims",
      "Compares documented limits, signatures and trade-off constraints",
      "Flags contradictions, missing fields and weak sources",
    ],
  },
  {
    id: "escalate",
    label: "Uncertainty detected",
    icon: Gauge,
    title: "Confidence is a heuristic, not a vibe",
    body: "A critical unresolved conflict always forces escalation. Otherwise the server compares the heuristic score with a configurable threshold (0.75 by default) and may ask for more information instead.",
    detail: [
      "Critical conflicts cannot be resolved automatically",
      "The browser cannot override the server decision",
      "Missing runtime, chain, protocol or decision detail lowers confidence",
    ],
  },
  {
    id: "review",
    label: "Human reviews",
    icon: UserCheck,
    title: "A qualified reviewer accepts a narrowly scoped task",
    body: "The escalated question becomes a review task with explicit acceptance criteria, a server-validated reward, and the evidence attached. Exclusive assignment is transaction-safe, so two reviewers cannot claim the same task.",
    detail: [
      "Filter by skill, category, reward and status",
      "Answer, explanation, confidence and evidence required",
      "Approved reviewers only; requester cannot self-assign",
    ],
  },
  {
    id: "verify",
    label: "Independent check",
    icon: FileSearch,
    title: "Evidence is checked, not taken on trust",
    body: "A separate verification service checks the answer against the question, acceptance criteria, category-appropriate technical specifics, quoted evidence and risk rules. A URL alone is not proof. Reviewers cannot verify their own submission.",
    detail: [
      "Hard checks reject unsupported answers",
      "Soft risk checks route to an administrator",
      "Verification is separate from payment approval",
    ],
  },
  {
    id: "pay",
    label: "PayPal settles",
    icon: Wallet,
    title: "Funding and reviewer payout are separate money events",
    body: "The requester funds the reward with PayPal Checkout. After independent verification the reward is authorized, then the reviewer payout is released through PayPal Payouts where the account has access. Demo mode simulates both, clearly labelled.",
    detail: [
      "Checkout capture is validated against the stored amount",
      "Payouts require enablement and recipient consent",
      "Webhooks are verified, deduplicated and reconciled",
    ],
  },
  {
    id: "resume",
    label: "Agent resumes",
    icon: Bot,
    title: "The original AI session receives a verified answer",
    body: "The verified human answer is written back to the original agent session, with the full decision and financial timeline preserved. The agent continues with grounded evidence instead of a guess.",
    detail: [
      "Final answer stored on the session",
      "Verified answer preserved even if payout fails",
      "Every step recorded in the audit trail",
    ],
  },
] as const;

export default function LandingPage() {
  const [activeStep, setActiveStep] = useState(0);
  const active = STEPS[activeStep];

  const { data: status } = useQuery({
    queryKey: ["integrations", "status"],
    queryFn: api.integrations.status,
    staleTime: 60_000,
  });

  const mode = status?.paypal.paymentsMode ?? "SIMULATED";

  const modeLabel = useMemo(() => {
    if (mode === "SIMULATED") return "Demo mode · payments simulated";
    return status?.paypal.configured
      ? "PayPal Sandbox mode · genuine API calls"
      : "PayPal Sandbox requested · not configured";
  }, [mode, status?.paypal.configured]);

  return (
    <div className="min-h-dvh bg-background">
      <PublicHeader />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 surface-grid opacity-40" aria-hidden />
        <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-blue-50/70 to-transparent" aria-hidden />
        <div className="container relative py-16 lg:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <Badge tone="info" dot>
                  PayPal AI Hackathon · sandbox build
                </Badge>
                <Badge tone={mode === "SIMULATED" ? "warning" : "success"} dot>
                  {modeLabel}
                </Badge>
              </div>
              <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
                When AI Isn&apos;t Certain, <span className="text-primary">It Knows Who to Ask.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
                TrustToPay is the human-verification layer for AI agents. When documents conflict, a
                configuration is ambiguous or a conceptual trade-off is unresolved, the agent escalates to a
                qualified human, an independent check validates the evidence, and PayPal settles the reward.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link to="/app/workspace">
                    Open agent workspace <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/app/marketplace">
                    <Store className="size-4" /> Browse reviewer marketplace
                  </Link>
                </Button>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-emerald-600" /> Runs with zero credentials
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-emerald-600" /> Real PayPal Sandbox adapter
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-emerald-600" /> MIT licensed
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {["Programming", "Crypto & blockchain", "Conceptual", "Hardware compatibility"].map((label) => (
                  <Badge key={label} tone="neutral">
                    {label}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Example case card */}
            <Card className="overflow-hidden border-border/80 shadow-lg">
              <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <FlaskConical className="size-4 text-amber-600" />
                  Seeded example · hardware compatibility
                </div>
                <Badge tone="warning" dot>
                  Escalated
                </Badge>
              </div>
              <CardContent className="space-y-4 p-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Agent question
                  </p>
                  <p className="mt-1 text-sm font-medium leading-6">
                    “Is this 65W USB-C charger compatible with the specified laptop?”
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-border bg-background p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Heuristic confidence</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-amber-700">0.36</p>
                    <p className="text-[10px] text-muted-foreground">threshold 0.75</p>
                  </div>
                  <div className="rounded-md border border-border bg-background p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Critical conflict</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-red-700">1</p>
                    <p className="text-[10px] text-muted-foreground">45W port vs 65W need</p>
                  </div>
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3 text-xs leading-5 text-amber-900">
                  <span className="font-semibold">Why escalate?</span> The listed USB-C port tops out at 45W
                  while the laptop requires 65W. Headline “65W” marketing may describe combined output.
                </div>
                <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Reward after verification</span>
                  <span className="font-semibold">$15.00 USD</span>
                </div>
                <p className="text-[11px] leading-5 text-muted-foreground">
                  Seeded sample data. No real company, product or PayPal transaction is represented.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Capabilities strip */}
      <section className="border-b border-border bg-card">
        <div className="container grid gap-4 py-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: BrainCircuit, title: "Four question domains", body: "Programming, crypto, conceptual and hardware" },
            { icon: FileSearch, title: "Independent verification", body: "Evidence and criteria checked separately" },
            { icon: CreditCard, title: "PayPal Checkout", body: "Orders v2 create + capture, amount validated" },
            { icon: Wallet, title: "PayPal Payouts", body: "Separate adapter, permission-gated" },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <item.icon className="size-4.5" />
              </span>
              <div>
                <p className="text-xs font-semibold">{item.title}</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive workflow */}
      <section id="how-it-works" className="border-b border-border py-16">
        <div className="container">
          <div className="mb-8 max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">How it works</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Confidence-triggered intervention, end to end
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Select a step to see what the system does. Every transition is enforced server-side and recorded
              in the task timeline.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {STEPS.map((step, index) => {
                const Icon = step.icon;
                const selected = index === activeStep;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setActiveStep(index)}
                    aria-pressed={selected}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                      selected
                        ? "border-primary/40 bg-primary/5"
                        : "border-border bg-card hover:bg-muted/50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-md border",
                        selected
                          ? "border-primary/30 bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Step {index + 1}
                      </span>
                      <span className="block text-sm font-medium">{step.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <Card className="min-h-[320px]">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <active.icon className="size-5" />
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Step {activeStep + 1} of {STEPS.length}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold tracking-tight">{active.title}</h3>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">{active.body}</p>
                <ul className="mt-4 space-y-2">
                  {active.detail.map((line) => (
                    <li key={line} className="flex items-start gap-2 text-sm">
                      <BadgeCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to="/app/workspace">Try it in the workspace</Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/app/docs">Read the docs</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Example walkthrough */}
      <section id="example" className="border-b border-border bg-card py-16">
        <div className="container">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Example verification case</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                A 65W label that does not survive the datasheet
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                The seeded case pairs a retailer listing, a marketplace blurb, a manufacturer support article
                and the laptop&apos;s charging requirements. The listing says 65W; the manufacturer documents a
                45W USB-C port when the second port is in use.
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The demo also ships programming, crypto and conceptual examples: a conflicting worker-pool size,
                a replay-prone permit signature and a disputed queue-throughput benchmark.
              </p>
              <div className="mt-5 space-y-3">
                {[
                  {
                    icon: MessageSquare,
                    title: "AI finds the contradiction",
                    body: "The documented USB-C maximum (45W) is below the laptop requirement (65W at 20V/3.25A).",
                  },
                  {
                    icon: UserCheck,
                    title: "Reviewer verifies the power budget",
                    body: "The reviewer must state the per-port limit, explain the single-port ambiguity, and quote the manufacturer.",
                  },
                  {
                    icon: FileSearch,
                    title: "Verification checks the evidence",
                    body: "The answer must include wattage, protocol detail, a safe HTTPS source and a verbatim quote.",
                  },
                  {
                    icon: Wallet,
                    title: "PayPal settles after checks",
                    body: "The requester funds $15.00 first; the reward is authorized only after verification passes.",
                  },
                ].map((item) => (
                  <div key={item.title} className="flex gap-3 rounded-lg border border-border bg-background p-3.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <item.icon className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <Card>
                <div className="border-b border-border px-5 py-3">
                  <p className="text-xs font-semibold">Evidence supplied by the requester</p>
                </div>
                <CardContent className="divide-y divide-border p-0">
                  {[
                    {
                      source: "Retailer listing",
                      claim: "“65W dual-port charger… USB-C 20V/2.25A… limited to 45W when both ports are in use.”",
                      tone: "Moderate",
                    },
                    {
                      source: "Marketplace listing",
                      claim: "“65W USB-C fast charger. PD compatible. Output up to 65W.”",
                      tone: "Weak",
                    },
                    {
                      source: "Manufacturer support",
                      claim: "“USB-C1 maximum is 45W when the USB-A port is in use… a 65W single-port mode is not documented.”",
                      tone: "Strong",
                    },
                    {
                      source: "Laptop documentation",
                      claim: "“Requires 65W or higher USB Power Delivery at 20V/3.25A.”",
                      tone: "Strong",
                    },
                  ].map((row) => (
                    <div key={row.source} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium">{row.source}</p>
                        <Badge
                          tone={row.tone === "Strong" ? "success" : row.tone === "Weak" ? "warning" : "neutral"}
                        >
                          {row.tone} evidence
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.claim}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4">
                <p className="flex items-center gap-2 text-xs font-semibold text-blue-900">
                  <Sparkles className="size-4" /> The important distinction
                </p>
                <p className="mt-1.5 text-xs leading-5 text-blue-900/80">
                  A headline claim is not proof. TrustToPay asks a human to check the exact configuration —
                  the port the laptop uses, the runtime a bug depends on, or the chain a signature executes on —
                  then verifies that the answer proves it.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="border-b border-border py-16">
        <div className="container grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Bot className="size-5" />
                </span>
                <div>
                  <h3 className="text-base font-semibold">For AI developers</h3>
                  <p className="text-xs text-muted-foreground">Ship grounded answers without guessing</p>
                </div>
              </div>
              <ul className="mt-5 space-y-3 text-sm">
                {[
                  "Structured escalation output you can gate on, not a vague chat reply",
                  "Evidence and acceptance criteria travel with the task",
                  "Verified answer returns to the original session with an audit trail",
                  "Server-enforced rewards and PayPal funding you can reason about",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    <span className="leading-6">{line}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <GraduationCap className="size-5" />
                </span>
                <div>
                  <h3 className="text-base font-semibold">For reviewers</h3>
                  <p className="text-xs text-muted-foreground">Get paid for evidence-backed expertise</p>
                </div>
              </div>
              <ul className="mt-5 space-y-3 text-sm">
                {[
                  "Narrow, well-scoped questions instead of open-ended freelancing",
                  "Clear acceptance criteria and supplied evidence up front",
                  "A transparent checklist showing why a submission passed or failed",
                  "PayPal Sandbox payouts after independent verification",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <Handshake className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    <span className="leading-6">{line}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* PayPal */}
      <section id="paypal" className="border-b border-border bg-card py-16">
        <div className="container">
          <div className="mb-8 max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">PayPal-powered rewards</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Two money movements, never conflated
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The requester funds a reward with Checkout. The reviewer is paid later with Payouts, only after
              verification. Both adapters validate local amounts and reconcile provider state.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-blue-200/70">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <CreditCard className="size-4 text-blue-600" /> Funding · Checkout
                  </span>
                  <Badge tone="info">Orders v2</Badge>
                </div>
                <ol className="mt-4 space-y-3 text-xs leading-5 text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="font-mono text-[10px] text-blue-700">01</span>
                    Server validates the stored reward (integer minor units) and currency.
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-[10px] text-blue-700">02</span>
                    Order is created with an idempotency key; duplicate requests reuse the open order.
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-[10px] text-blue-700">03</span>
                    Sandbox buyer approves through the official PayPal JS SDK.
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-[10px] text-blue-700">04</span>
                    Server captures and compares amount, currency and reference before funding the task.
                  </li>
                </ol>
              </CardContent>
            </Card>
            <Card className="border-emerald-200/70">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Wallet className="size-4 text-emerald-600" /> Reviewer payout · Payouts
                  </span>
                  <Badge tone="success">Permission-gated</Badge>
                </div>
                <ol className="mt-4 space-y-3 text-xs leading-5 text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="font-mono text-[10px] text-emerald-700">01</span>
                    Only a verified, authorized reward is payable.
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-[10px] text-emerald-700">02</span>
                    Recipient consent and a valid PayPal email are required.
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-[10px] text-emerald-700">03</span>
                    Payout is reconciled against PayPal before being marked paid.
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-[10px] text-emerald-700">04</span>
                    Uncertain outcomes block blind retries; the verified answer is preserved.
                  </li>
                </ol>
              </CardContent>
            </Card>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-background px-4 py-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-3.5" /> Secrets stay server-side
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ReceiptText className="size-3.5" /> Webhooks verified and deduplicated
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Layers className="size-3.5" /> Amounts stored as integer minor units
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FlaskConical className="size-3.5" /> Demo mode never claims to move money
            </span>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="container">
          <div className="rounded-xl border border-border bg-card p-8 shadow-sm sm:p-10">
            <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
              <div className="max-w-2xl">
                <h2 className="text-2xl font-semibold tracking-tight">
                  Explore the seeded demo or bring your own Sandbox credentials
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  The app runs with no credentials. Add PayPal Sandbox keys when you want genuine Orders and
                  Payouts calls. Nothing in this build can move real money.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/login">
                    Sign in / demo access <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/app/integrations">Integration status</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
