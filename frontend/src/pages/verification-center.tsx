import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  FileSearch,
  Gavel,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { TaskDetail, VerificationRun } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, SectionHeading, DataRow } from "@/components/common";
import { VerificationBadge, SecurityVerdictBadge } from "@/components/status-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/input";
import { ErrorState, LoadingBlock } from "@/components/ui/states";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function VerificationCenterPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["task", id],
    queryFn: () => api.tasks.get(id),
    enabled: Boolean(id),
  });

  const verify = useMutation({
    mutationFn: (input: Parameters<typeof api.tasks.verify>[1]) => api.tasks.verify(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["task", id] });
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Verification action failed."),
  });

  const task = query.data?.task;
  if (query.isLoading) return <LoadingBlock label="Loading verification record…" />;
  if (query.error || !task) {
    return <ErrorState message={(query.error as Error)?.message ?? "Task not found."} onRetry={() => query.refetch()} />;
  }

  const runs = task.verificationRuns ?? [];
  const latest = runs[0] ?? null;
  const submission = task.submissions?.[0] ?? null;
  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Verification center"
        breadcrumbs={[
          { label: "Review task", to: `/app/tasks/${task.id}` },
          { label: "Verification" },
        ]}
        title="Independent verification record"
        description="Verification is separate from payment approval. It checks the answer against the task, acceptance criteria, technical specifics, deterministic scanners, Gemini security gate and isolated execution."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to={`/app/tasks/${task.id}`}>
                <ArrowLeft className="size-4" /> Review task
              </Link>
            </Button>
            {isAdmin ? (
              <Button variant="outline" onClick={() => verify.mutate({})} loading={verify.isPending}>
                <RefreshCw className="size-4" /> Re-run checks
              </Button>
            ) : null}
          </>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          {latest ? (
            <>
              <Card>
                <CardHeader className="border-b border-border pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <FileSearch className="size-4 text-primary" /> Latest verification
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <VerificationBadge status={latest.status} />
                      {latest.securityVerdict ? (
                        <SecurityVerdictBadge verdict={latest.securityVerdict} />
                      ) : null}
                      {latest.artifactVersion ? (
                        <Badge tone="neutral">Artifact v{latest.artifactVersion}</Badge>
                      ) : null}
                      <Badge tone="neutral">{latest.engine === "MANUAL" ? "Administrator decision" : "Automated"}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <p className="text-sm leading-6">{latest.decisionReason}</p>
                  {latest.artifactSha256 ? (
                    <div className="rounded-md border border-border bg-muted/30 p-2.5 text-xs">
                      <span className="font-semibold text-muted-foreground">Immutable Artifact SHA-256: </span>
                      <span className="break-all font-mono text-[11px]">{latest.artifactSha256}</span>
                    </div>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Metric label="Passed" value={latest.checksPassed.length} tone="success" />
                    <Metric label="Failed" value={latest.checksFailed.length} tone={latest.checksFailed.length > 0 ? "danger" : "neutral"} />
                    <Metric
                      label="Required failures"
                      value={latest.checksFailed.filter((check) => check.severity === "HARD").length}
                      tone={latest.checksFailed.some((check) => check.severity === "HARD") ? "danger" : "neutral"}
                    />
                  </div>
                </CardContent>
              </Card>

              {latest.securityReview ? (
                <Card>
                  <CardHeader className="border-b border-border pb-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <ShieldCheck className="size-4 text-primary" /> Layered Security Gate (Deterministic + Gemini)
                      </CardTitle>
                      <SecurityVerdictBadge verdict={latest.securityReview.verdict} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-3 text-xs">
                    <p className="leading-5">{latest.securityReview.summary}</p>
                    {latest.securityReview.gemini ? (
                      <div className="rounded-md border border-border bg-muted/20 p-2.5">
                        <p className="font-semibold">
                          Gemini Security Review ({latest.securityReview.gemini.model}) ·{" "}
                          {Math.round(latest.securityReview.gemini.confidence * 100)}% confidence
                        </p>
                        <p className="mt-1 text-muted-foreground">{latest.securityReview.gemini.summary}</p>
                      </div>
                    ) : null}
                    {latest.securityReview.deterministic.findings.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Deterministic Scanner Findings ({latest.securityReview.deterministic.findings.length})
                        </p>
                        {latest.securityReview.deterministic.findings.map((finding, idx) => (
                          <div key={`${finding.ruleId}-${idx}`} className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-amber-100">
                            <p className="font-semibold text-amber-200">
                              [{finding.severity}] {finding.ruleId} — {finding.message}
                            </p>
                            {finding.filePath ? (
                              <p className="font-mono text-[10px] text-muted-foreground">File: {finding.filePath}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              {latest.executionSummary ? (
                <Card>
                  <CardHeader className="border-b border-border pb-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="size-4 text-primary" /> Isolated Execution Runner
                      </CardTitle>
                      <div className="flex items-center gap-1.5">
                        <Badge tone={latest.executionSummary.passed ? "success" : "danger"} dot>
                          {latest.executionSummary.verdict}
                        </Badge>
                        <Badge tone="neutral">{latest.executionSummary.mode}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2.5 pt-3 text-xs">
                    <p>{latest.executionSummary.summary}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Exit code: {latest.executionSummary.exitCode ?? "—"} · Duration: {latest.executionSummary.durationMs}ms · Network:{" "}
                      {latest.executionSummary.limits.networkAccess} · Memory cap: {latest.executionSummary.limits.maxMemoryMb}MB
                    </p>
                    {latest.executionSummary.stdout ? (
                      <pre className="max-h-40 overflow-auto rounded-md border border-border bg-muted/40 p-2.5 font-mono text-[11px]">
                        {latest.executionSummary.stdout}
                      </pre>
                    ) : null}
                    {latest.executionSummary.stderr ? (
                      <pre className="max-h-40 overflow-auto rounded-md border border-red-500/30 bg-red-500/10 p-2.5 font-mono text-[11px] text-red-200">
                        {latest.executionSummary.stderr}
                      </pre>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              <CheckList run={latest} />

              {latest.evidenceReferences.length > 0 ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <ShieldCheck className="size-4 text-primary" /> Evidence references
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {latest.evidenceReferences.map((reference, index) => (
                      <div key={`${reference.label}-${index}`} className="rounded-md border border-border bg-background p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold">{reference.label}</p>
                          {reference.url ? (
                            <a
                              href={reference.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-primary underline underline-offset-2"
                            >
                              Open source <ExternalLink className="size-2.5" />
                            </a>
                          ) : null}
                        </div>
                        {reference.quote ? (
                          <blockquote className="mt-1.5 rounded border border-border bg-muted/20 p-2 text-[11px] italic leading-5 text-muted-foreground">
                            “{reference.quote}”
                          </blockquote>
                        ) : null}
                        {reference.url ? (
                          <p className="mt-1 break-all font-mono text-[9px] text-muted-foreground">{reference.url}</p>
                        ) : null}
                      </div>
                    ))}
                    <p className="text-[10px] leading-4 text-muted-foreground">
                      The application records the supplied quote but does not fetch or independently validate the
                      external page. A URL alone is never treated as proof.
                    </p>
                  </CardContent>
                </Card>
              ) : null}

              {isAdmin && task.status === "NEEDS_MANUAL_REVIEW" ? (
                <AdminDecisionCard
                  loading={verify.isPending}
                  onSubmit={(decision, note) => verify.mutate({ decision, note })}
                />
              ) : null}

              {runs.length > 1 ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Verification history</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {runs.slice(1).map((run) => (
                      <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background p-2.5">
                        <div className="flex items-center gap-2">
                          <VerificationBadge status={run.status} />
                          <span className="text-[10px] text-muted-foreground">{run.engine}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{formatDate(run.createdAt)}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}
            </>
          ) : (
            <Alert tone="info">No verification run exists for this task yet. The assigned reviewer must submit an answer.</Alert>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Task under review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm font-medium">{task.title}</p>
              <dl className="text-xs">
                <DataRow label="Task status">{task.status.replaceAll("_", " ")}</DataRow>
                <DataRow label="Reward">{formatMoney(task.rewardMinor, task.currency)}</DataRow>
                <DataRow label="Reviewer">{task.assignment?.reviewer.name ?? "Unassigned"}</DataRow>
                <DataRow label="Requester">{task.requester?.name ?? "Unknown"}</DataRow>
              </dl>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to={`/app/tasks/${task.id}`}>Open review task</Link>
              </Button>
            </CardContent>
          </Card>

          {submission ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Submitted answer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="whitespace-pre-line text-xs leading-5">{submission.answer}</p>
                <div className="border-t border-border pt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Evidence notes</p>
                  <p className="mt-1 whitespace-pre-line text-[11px] leading-5 text-muted-foreground">
                    {submission.evidenceNotes ?? "None supplied."}
                  </p>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Self-assessed confidence {submission.confidenceScore}% · {formatDate(submission.createdAt)}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "success" | "danger" | "neutral" }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-xl font-semibold tabular-nums",
          tone === "success" ? "text-emerald-400" : tone === "danger" ? "text-red-400" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function CheckList({ run }: { run: VerificationRun }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileCheck2 className="size-4 text-primary" /> Checks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <SectionHeading title="Passed" description="These checks are satisfied by the submission." />
          <div className="space-y-1.5">
            {run.checksPassed.length === 0 ? (
              <p className="text-xs text-muted-foreground">No passed checks.</p>
            ) : (
              run.checksPassed.map((check) => (
                <div key={check.id} className="flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                  <div>
                    <p className="text-xs font-medium text-emerald-100">{check.label}</p>
                    <p className="text-[10px] leading-4 text-emerald-200/80">{check.detail}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <SectionHeading title="Failed" description="Hard failures reject; soft failures route to an administrator." />
          <div className="space-y-1.5">
            {run.checksFailed.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
                <CheckCircle2 className="size-4 text-emerald-400" /> No failed checks.
              </div>
            ) : (
              run.checksFailed.map((check) => (
                <div
                  key={check.id}
                  className={cn(
                    "flex gap-2 rounded-md border p-2.5",
                    check.severity === "HARD"
                      ? "border-red-500/30 bg-red-500/10"
                      : "border-amber-500/30 bg-amber-500/10",
                  )}
                >
                  {check.severity === "HARD" ? (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
                  ) : (
                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
                  )}
                  <div>
                    <p className="text-xs font-medium text-foreground">{check.label}</p>
                    <p className="text-[10px] leading-4 text-muted-foreground">{check.detail}</p>
                    <Badge tone={check.severity === "HARD" ? "danger" : "warning"} className="mt-1">
                      {check.severity === "HARD" ? "Required check" : "Risk check"}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminDecisionCard({
  loading,
  onSubmit,
}: {
  loading: boolean;
  onSubmit: (decision: "PASS" | "REJECT", note: string) => void;
}) {
  const [decision, setDecision] = useState<"PASS" | "REJECT">("PASS");
  const [note, setNote] = useState("");
  return (
    <Card className="border-amber-500/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Gavel className="size-4 text-amber-400" /> Administrator manual decision
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert tone="warning">
          A risk check needs a human decision. The automated hard checks passed, but this submission cannot settle
          without an explicit administrator note.
        </Alert>
        <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
          <Field label="Decision" htmlFor="decision-select">
            <select
              id="decision-select"
              value={decision}
              onChange={(event) => setDecision(event.target.value as "PASS" | "REJECT")}
              className="flex h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm"
            >
              <option value="PASS">PASS</option>
              <option value="REJECT">REJECT</option>
            </select>
          </Field>
          <Field label="Decision note" htmlFor="decision-note" hint="Required; at least 10 characters.">
            <Textarea
              id="decision-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="Explain what was reviewed and why the decision is appropriate."
            />
          </Field>
        </div>
        <Button
          size="sm"
          onClick={() => onSubmit(decision, note)}
          loading={loading}
          disabled={note.trim().length < 10}
          variant={decision === "PASS" ? "default" : "destructive"}
        >
          {decision === "PASS" ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
          Record {decision} decision
        </Button>
      </CardContent>
    </Card>
  );
}
