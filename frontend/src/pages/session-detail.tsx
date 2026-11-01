import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bot,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Flag,
  Gauge,
  Layers,
  Loader2,
  MessageSquare,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Wallet,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { AnalysisOutput, Conflict, EvidenceSource } from "@/lib/types";
import { PageHeader, SectionHeading, DataRow } from "@/components/common";
import { PaymentModeBanner } from "@/components/payment-mode-banner";
import { StatusBadge, ModeBadge } from "@/components/status-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/states";
import { formatDate, formatMoney, humanize, parseMoneyToMinor, timeAgo } from "@/lib/format";
import { categoryLabel, defaultCriteriaFor, normalizeCategoryValue } from "@/lib/categories";
import { cn } from "@/lib/utils";

export default function SessionDetailPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const autoAnalyzed = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const query = useQuery({
    queryKey: ["session", id],
    queryFn: () => api.sessions.get(id),
    enabled: Boolean(id),
  });

  const analyze = useMutation({
    mutationFn: () => api.sessions.analyze(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["session", id] });
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard", "agent"] });
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Analysis failed."),
  });

  const resume = useMutation({
    mutationFn: () => api.sessions.resume(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["session", id] });
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard", "agent"] });
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Resume failed."),
  });

  const createTask = useMutation({
    mutationFn: (input: Parameters<typeof api.tasks.create>[0]) => api.tasks.create(input),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["session", id] });
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard", "agent"] });
      navigate(`/app/tasks/${data.task.id}`);
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Could not create the review task."),
  });

  const session = query.data?.session;
  const latest = session?.analysisRuns?.[0] ?? null;
  const output = latest?.output ?? null;
  const task = session?.tasks?.[0] ?? null;
  const activeTask = task && task.status !== "CANCELLED" ? task : null;
  const canAnalyze = Boolean(session) && !activeTask;
  const canResume = task
    ? ["VERIFIED", "PAYMENT_READY", "PAYMENT_PAID", "PAYOUT_FAILED", "ORIGINAL_TASK_RESUMED", "COMPLETED"].includes(
        task.status,
      )
    : false;

  useEffect(() => {
    if (!session || autoAnalyzed.current) return;
    if (params.get("analyze") === "1" && !latest && canAnalyze) {
      autoAnalyzed.current = true;
      analyze.mutate();
    }
  }, [session, latest, canAnalyze, params, analyze]);

  useEffect(() => {
    setActionError(null);
    setShowCreate(false);
  }, [id]);

  if (query.isLoading) return <LoadingBlock label="Loading agent session…" />;
  if (query.error || !session) {
    return (
      <ErrorState
        message={(query.error as Error)?.message ?? "Session not found."}
        onRetry={() => query.refetch()}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Agent session"
        breadcrumbs={[
          { label: "Agent workspace", to: "/app/workspace" },
          { label: session.title },
        ]}
        title={session.title}
        description={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={session.status} />
            <Badge tone="neutral">{categoryLabel(session.category)}</Badge>
            {latest ? <ModeBadge mode={latest.demo ? "SIMULATED" : "SANDBOX"} /> : null}
            <span className="text-xs">Created {formatDate(session.createdAt)}</span>
          </div>
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/app/workspace">
                <ArrowLeft className="size-4" /> Workspace
              </Link>
            </Button>
            {canAnalyze ? (
              <Button onClick={() => analyze.mutate()} loading={analyze.isPending || (params.get("analyze") === "1" && !latest)}>
                <Sparkles className="size-4" />
                {latest ? "Re-run analysis" : "Run analysis"}
              </Button>
            ) : null}
          </>
        }
      />

      <PaymentModeBanner compact />

      {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
      {analyze.isPending ? (
        <Alert tone="info" icon={<Loader2 className="size-4 animate-spin" />}>
          Running the deterministic analysis over your documents…
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader className="border-b border-border pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <CircleHelp className="size-4 text-primary" /> The question
                </CardTitle>
                {latest ? (
                  <span className="text-[11px] text-muted-foreground">
                    {latest.engine === "demo" ? "Demo AI engine" : `Provider: ${latest.provider}`} · {latest.durationMs}ms
                  </span>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <p className="text-sm leading-6">{session.question}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Product models</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(session.productModels ?? []).length === 0 ? (
                      <span className="text-xs text-muted-foreground">None supplied</span>
                    ) : (
                      session.productModels.map((model) => (
                        <Badge key={model} tone="neutral">
                          {model}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Specifications</p>
                  {(session.specifications ?? []).length === 0 ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">None supplied</p>
                  ) : (
                    <ul className="mt-1.5 space-y-1 text-xs leading-5">
                      {session.specifications.map((spec) => (
                        <li key={spec}>• {spec}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {latest && output ? (
            <AnalysisCard output={output} latest={latest} />
          ) : (
            <EmptyState
              icon={<Sparkles className="size-5" />}
              title="No analysis yet"
              description="Run the analysis to see the confidence reasoning, conflicts, missing information and escalation decision."
              action={
                canAnalyze ? (
                  <Button size="sm" onClick={() => analyze.mutate()} loading={analyze.isPending}>
                    <Sparkles className="size-4" /> Run analysis
                  </Button>
                ) : null
              }
            />
          )}

          <EvidenceCard evidence={session.evidence ?? []} />
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ClipboardCheck className="size-4 text-primary" /> Review task
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {task ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={task.status} />
                    <span className="text-xs text-muted-foreground">{formatMoney(task.rewardMinor, task.currency)}</span>
                  </div>
                  <dl>
                    <DataRow label="Reward">{formatMoney(task.rewardMinor, task.currency)}</DataRow>
                    <DataRow label="Reviewer">{task.assignment?.reviewer.name ?? "Unassigned"}</DataRow>
                    <DataRow label="Updated">{timeAgo(task.updatedAt)}</DataRow>
                  </dl>
                  <Button asChild className="w-full" size="sm">
                    <Link to={`/app/tasks/${task.id}`}>
                      Open review task <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                  {task.status === "AWAITING_FUNDING" || task.status === "FUNDING_FAILED" ? (
                    <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-5 text-amber-200">
                      The reward still needs funding. The task cannot be accepted until the capture is confirmed.
                    </p>
                  ) : null}
                </>
              ) : output?.recommendedAction === "ESCALATE_TO_HUMAN" ? (
                <>
                  <p className="text-xs leading-5 text-muted-foreground">
                    The AI recommended a human review. Create a narrowly scoped task with an approved reward.
                  </p>
                  <Button size="sm" className="w-full" onClick={() => setShowCreate((value) => !value)}>
                    <Flag className="size-3.5" /> {showCreate ? "Hide task form" : "Create review task"}
                  </Button>
                </>
              ) : (
                <p className="text-xs leading-5 text-muted-foreground">
                  No review task yet. A task can only be created after the AI recommends escalation.
                </p>
              )}
            </CardContent>
          </Card>

          {output?.recommendedAction === "ESCALATE_TO_HUMAN" && !task && showCreate ? (
            <CreateTaskCard
              sessionId={session.id}
              category={session.category}
              output={output}
              productModels={session.productModels ?? []}
              onSubmit={(input) => createTask.mutate(input)}
              loading={createTask.isPending}
            />
          ) : null}

          <Card className={session.finalAnswer ? "border-emerald-500/30" : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Bot className="size-4 text-primary" /> Resume the agent
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {session.finalAnswer ? (
                <>
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-100">
                    <p className="font-semibold text-emerald-300">Verified answer delivered</p>
                    <p className="mt-1 whitespace-pre-line">{session.finalAnswer}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Resolved {formatDate(session.resolvedAt)}</p>
                </>
              ) : (
                <>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Once verification passes, the human answer can be written back to this session. The verified
                    answer is preserved even if the payout is unresolved.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => resume.mutate()}
                    loading={resume.isPending}
                    disabled={!canResume}
                  >
                    <PlayCircle className="size-3.5" /> Resume with verified answer
                  </Button>
                  {!canResume ? (
                    <p className="text-[11px] leading-5 text-muted-foreground">
                      Available after independent verification passes.
                    </p>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          {latest ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Decision context</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="text-xs">
                  <DataRow label="Engine">{latest.engine === "demo" ? "Deterministic demo" : latest.provider}</DataRow>
                  <DataRow label="Model">{latest.model ?? "Rule-based (no LLM)"}</DataRow>
                  <DataRow label="Threshold">{Math.round(latest.threshold * 100)}%</DataRow>
                  <DataRow label="Confidence">{Math.round(latest.confidenceScore * 100)}%</DataRow>
                  <DataRow label="Action">{humanize(latest.recommendedAction)}</DataRow>
                  <DataRow label="Run at">{formatDate(latest.createdAt)}</DataRow>
                </dl>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function AnalysisCard({
  output,
  latest,
}: {
  output: AnalysisOutput;
  latest: NonNullable<Awaited<ReturnType<typeof api.sessions.get>>["session"]["analysisRuns"]>[number];
}) {
  const confidence = Math.round(output.confidenceScore * 100);
  const actionTone =
    output.recommendedAction === "ESCALATE_TO_HUMAN"
      ? "warning"
      : output.recommendedAction === "REQUEST_MORE_INFORMATION"
        ? "info"
        : "success";

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Gauge className="size-4 text-primary" /> AI analysis
          </CardTitle>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={actionTone} dot>
              {humanize(output.recommendedAction)}
            </Badge>
            <Badge tone={latest.demo ? "warning" : "success"}>{latest.demo ? "Demo AI" : "Configured provider"}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <p className="text-sm leading-6">{output.summary}</p>

        <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Heuristic confidence</p>
            <p
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums",
                confidence >= 75 ? "text-emerald-400" : confidence >= 50 ? "text-amber-400" : "text-red-400",
              )}
            >
              {confidence}%
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className={cn(
                  "h-full rounded-full",
                  confidence >= 75 ? "bg-emerald-600" : confidence >= 50 ? "bg-amber-500" : "bg-red-600",
                )}
                style={{ width: `${Math.max(3, confidence)}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">threshold {Math.round(latest.threshold * 100)}%</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Why this action</p>
            <p className="mt-1 text-xs leading-5">{output.escalationReason}</p>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{output.reasoningSummary}</p>
          </div>
        </div>

        {output.proposedAnswer ? (
          <div>
            <SectionHeading title="Proposed answer" description="The demo engine's own draft, before human verification." />
            <div className="rounded-md border border-border bg-background p-3 text-xs leading-6">{output.proposedAnswer}</div>
          </div>
        ) : null}

        {output.conflictingClaims.length > 0 ? (
          <div>
            <SectionHeading title="Conflicting claims" description="These conflicts are the main reason for escalation." />
            <div className="space-y-2">
              {output.conflictingClaims.map((conflict, index) => (
                <ConflictRow key={`${conflict.claimA}-${index}`} conflict={conflict} />
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
              <AlertTriangle className="size-3.5 text-amber-600" /> Uncertainties
            </p>
            {output.uncertainties.length === 0 ? (
              <p className="text-xs text-muted-foreground">None listed.</p>
            ) : (
              <ul className="space-y-1 text-xs leading-5 text-muted-foreground">
                {output.uncertainties.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
              <CircleHelp className="size-3.5 text-blue-600" /> Missing information
            </p>
            {output.missingInformation.length === 0 ? (
              <p className="text-xs text-muted-foreground">None listed.</p>
            ) : (
              <ul className="space-y-1 text-xs leading-5 text-muted-foreground">
                {output.missingInformation.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-md border border-border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Suggested reward</p>
              <p className="text-sm font-semibold">
                {formatMoney(output.suggestedReward.amountMinor, output.suggestedReward.currency)}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {output.suggestedReviewerSkills.map((skill) => (
                <Badge key={skill} tone="accent">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{output.suggestedReward.rationale}</p>
        </div>

        {output.evidence.length > 0 ? (
          <div>
            <SectionHeading title="Evidence assessment" description="A URL alone is not proof. Strength and excerpt matter." />
            <div className="space-y-1.5">
              {output.evidence.map((item, index) => (
                <div key={`${item.title}-${index}`} className="rounded-md border border-border bg-background p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium">{item.title}</p>
                    <div className="flex gap-1">
                      <Badge
                        tone={
                          item.strength === "STRONG" ? "success" : item.strength === "MODERATE" ? "warning" : "danger"
                        }
                      >
                        {item.strength}
                      </Badge>
                      <Badge tone={item.supportsAnswer ? "success" : "neutral"}>
                        {item.supportsAnswer ? "Supports" : "Does not support"}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{item.excerpt}</p>
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[10px] text-primary underline underline-offset-2"
                    >
                      {item.publisher ?? item.url} <ExternalLink className="size-2.5" />
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ConflictRow({ conflict }: { conflict: Conflict }) {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-amber-200">Conflict · {conflict.severity}</p>
        {conflict.severity === "CRITICAL" ? <Badge tone="danger">Forces escalation</Badge> : null}
      </div>
      <p className="mt-1 text-[11px] leading-5 text-amber-100/90">{conflict.detail}</p>
      <div className="mt-2 grid gap-2 text-[11px] leading-5 sm:grid-cols-2">
        <div className="rounded border border-amber-500/25 bg-[#080C14]/80 p-2">
          <p className="font-semibold text-amber-200">{conflict.sourceA}</p>
          <p className="text-amber-100/80">“{conflict.claimA}”</p>
        </div>
        <div className="rounded border border-amber-500/25 bg-[#080C14]/80 p-2">
          <p className="font-semibold text-amber-200">{conflict.sourceB}</p>
          <p className="text-amber-100/80">“{conflict.claimB}”</p>
        </div>
      </div>
    </div>
  );
}

function EvidenceCard({ evidence }: { evidence: EvidenceSource[] }) {
  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-4 text-primary" /> Supplied evidence ({evidence.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-4">
        {evidence.length === 0 ? (
          <p className="text-xs text-muted-foreground">No evidence documents were supplied.</p>
        ) : (
          evidence.map((item) => (
            <details key={item.id} className="group rounded-md border border-border bg-background p-3">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  <Layers className="size-3.5 text-muted-foreground" /> {item.title}
                  {item.isSeed ? <Badge tone="neutral">Seeded</Badge> : null}
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-normal text-muted-foreground">
                  {humanize(item.sourceType)} · {item.publisher ?? "Unknown publisher"}
                </span>
              </summary>
              <p className="mt-2 whitespace-pre-line text-[11px] leading-5 text-muted-foreground">{item.content}</p>
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[10px] text-primary underline underline-offset-2"
                >
                  {item.url} <ExternalLink className="size-2.5" />
                </a>
              ) : null}
            </details>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function CreateTaskCard({
  sessionId,
  category,
  output,
  productModels,
  onSubmit,
  loading,
}: {
  sessionId: string;
  category: string;
  output: AnalysisOutput;
  productModels: string[];
  onSubmit: (input: Parameters<typeof api.tasks.create>[0]) => void;
  loading: boolean;
}) {
  const defaultCriteria = useMemo(() => {
    const subject = productModels[0] ?? "the question";
    return defaultCriteriaFor(category, subject);
  }, [category, productModels]);

  const [criteria, setCriteria] = useState(defaultCriteria);
  const [skills, setSkills] = useState(output.suggestedReviewerSkills.join(", "));
  const [reward, setReward] = useState(
    (output.suggestedReward.amountMinor / 100).toFixed(2),
  );
  const [risk, setRisk] = useState<"STANDARD" | "HIGH">("STANDARD");
  const [localError, setLocalError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setLocalError(null);
    const amount = parseMoneyToMinor(reward);
    if (!amount || amount < 100) {
      setLocalError("Enter a reward of at least $1.00.");
      return;
    }
    if (criteria.trim().length < 20) {
      setLocalError("Acceptance criteria must be at least 20 characters.");
      return;
    }
    onSubmit({
      sessionId,
      acceptanceCriteria: criteria.trim(),
      requiredSkills: skills
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      rewardMinor: amount,
      rewardApproved: true,
      riskLevel: risk,
      category: normalizeCategoryValue(category),
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Flag className="size-4 text-primary" /> Create review task
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3" noValidate>
          {localError ? <Alert tone="danger">{localError}</Alert> : null}
          <Field label="Acceptance criteria" htmlFor="acceptance-criteria" hint="One requirement per line. Verification checks textual coverage.">
            <Textarea
              id="acceptance-criteria"
              value={criteria}
              onChange={(event) => setCriteria(event.target.value)}
              rows={5}
              maxLength={4000}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Reward (USD)" htmlFor="reward-amount" hint="Server validated">
              <Input
                id="reward-amount"
                value={reward}
                onChange={(event) => setReward(event.target.value)}
                inputMode="decimal"
                placeholder="15.00"
              />
            </Field>
            <Field label="Risk level" htmlFor="risk-level">
              <select
                id="risk-level"
                value={risk}
                onChange={(event) => setRisk(event.target.value as "STANDARD" | "HIGH")}
                className="flex h-9 w-full rounded-md border border-input bg-card px-2.5 py-1 text-sm shadow-sm"
              >
                <option value="STANDARD">Standard</option>
                <option value="HIGH">High (manual review)</option>
              </select>
            </Field>
          </div>
          <Field label="Required skills" htmlFor="required-skills" hint="Comma separated. Defaults to the AI suggestion.">
            <Input
              id="required-skills"
              value={skills}
              onChange={(event) => setSkills(event.target.value)}
              placeholder="Software debugging, Node.js runtime"
            />
          </Field>
          <Button type="submit" size="sm" className="w-full" loading={loading}>
            <Flag className="size-3.5" /> Create task (awaiting funding)
          </Button>
          <p className="text-[10px] leading-4 text-muted-foreground">
            Creating the task does not move money. The reward must be funded separately with PayPal Checkout.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
