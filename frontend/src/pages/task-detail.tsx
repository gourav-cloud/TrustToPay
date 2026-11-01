import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Check,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Clock,
  Code2,
  ExternalLink,
  FileCheck2,
  FileCode2,
  FileText,
  Flag,
  Gavel,
  HandCoins,
  Loader2,
  Lock,
  MessageSquarePlus,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { AgentHandbackPayload, Submission, TaskDetail, VerificationRun } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, SectionHeading, DataRow } from "@/components/common";
import { PaymentModeBanner } from "@/components/payment-mode-banner";
import {
  StatusBadge,
  ModeBadge,
  VerificationBadge,
  PaymentStatusBadge,
  PayoutAvailabilityBadge,
  SecurityVerdictBadge,
  SkillLevelBadge,
  RiskBadge,
} from "@/components/status-badges";
import { TaskTimeline } from "@/components/task-timeline";
import { PayPalCheckout } from "@/components/paypal-checkout";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ErrorState, LoadingBlock } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatMoney, humanize, parseMoneyToMinor, timeAgo } from "@/lib/format";
import { categoryLabel, normalizeCategoryValue } from "@/lib/categories";
import { cn } from "@/lib/utils";

export default function TaskDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rewardOpen, setRewardOpen] = useState(false);
  const [handbackPreview, setHandbackPreview] = useState<{
    handback: AgentHandbackPayload;
    signature: { header: string; timestamp: string; algorithm: string };
    idempotentReplay: boolean;
  } | null>(null);

  const query = useQuery({
    queryKey: ["task", id],
    queryFn: () => api.tasks.get(id),
    enabled: Boolean(id),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["task", id] });
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    await queryClient.invalidateQueries({ queryKey: ["payments"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["sessions"] });
  };

  const accept = useMutation({
    mutationFn: () => api.tasks.accept(id),
    onSuccess: async () => {
      await invalidate();
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not accept the task."),
  });

  const declineOffer = useMutation({
    mutationFn: () => api.tasks.declineOffer(id),
    onSuccess: async () => {
      await invalidate();
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not decline the task offer."),
  });

  const dispatchOffers = useMutation({
    mutationFn: () => api.tasks.dispatchOffers(id),
    onSuccess: async () => {
      await invalidate();
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not dispatch specialist offers."),
  });

  const fetchHandback = useMutation({
    mutationFn: () => api.tasks.handback(id),
    onSuccess: async (data) => {
      setHandbackPreview(data);
      await invalidate();
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not retrieve verified agent handback."),
  });

  const submit = useMutation({
    mutationFn: (input: Parameters<typeof api.tasks.submit>[1]) => api.tasks.submit(id, input),
    onSuccess: async () => {
      await invalidate();
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not submit the answer."),
  });

  const verify = useMutation({
    mutationFn: (input: Parameters<typeof api.tasks.verify>[1]) => api.tasks.verify(id, input),
    onSuccess: async () => {
      await invalidate();
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Verification action failed."),
  });

  const payout = useMutation({
    mutationFn: () => api.payments.payout(id),
    onSuccess: async () => {
      await invalidate();
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Payout failed."),
  });

  const reconcile = useMutation({
    mutationFn: (paymentId: string) => api.payments.reconcile(paymentId),
    onSuccess: async () => {
      await invalidate();
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Reconciliation failed."),
  });

  const retry = useMutation({
    mutationFn: (paymentId: string) => api.payments.retry(paymentId),
    onSuccess: async () => {
      await invalidate();
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Retry failed."),
  });

  const cancel = useMutation({
    mutationFn: () => api.tasks.cancel(id),
    onSuccess: async () => {
      await invalidate();
      setCancelOpen(false);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Cancel failed."),
  });

  const updateReward = useMutation({
    mutationFn: (rewardMinor: number) => api.tasks.updateReward(id, rewardMinor),
    onSuccess: async () => {
      await invalidate();
      setRewardOpen(false);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not update the reward."),
  });

  const task = query.data?.task;

  if (query.isLoading) return <LoadingBlock label="Loading review task…" />;
  if (query.error || !task) {
    return (
      <ErrorState
        message={(query.error as Error)?.message ?? "Task not found."}
        onRetry={() => query.refetch()}
      />
    );
  }

  const isRequester = task.requester?.id === user?.id;
  const isReviewer = user?.role === "REVIEWER";
  const isAdmin = user?.role === "ADMIN";
  const isAssignedReviewer = Boolean(task.assignment?.isMine);
  const isOpenMarket = ["FUNDED", "OFFERED"].includes(task.status) && !task.assignment && isReviewer;
  const latestSubmission = task.submissions?.[0] ?? null;
  const latestVerification = task.verificationRuns?.[0] ?? null;
  const failedPayout = task.payments?.find((payment) => payment.type === "PAYOUT" && payment.status === "FAILED");
  const processingPayout = task.payments?.find(
    (payment) => payment.type === "PAYOUT" && ["PROCESSING", "PENDING"].includes(payment.status),
  );
  const canSubmit =
    isAssignedReviewer &&
    ["REVIEWER_ASSIGNED", "ASSIGNED", "IN_PROGRESS", "VERIFICATION_REJECTED", "NEEDS_REVISION"].includes(task.status);
  const canDispute =
    (isRequester || isAssignedReviewer || isAdmin) &&
    !["COMPLETED", "CANCELLED", "DISPUTED", "PAYMENT_PAID", "EXPIRED"].includes(task.status);
  const canCancel =
    (isRequester || isAdmin) &&
    !["PAYMENT_PROCESSING", "PAYMENT_PAID", "COMPLETED", "CANCELLED", "DISPUTED", "EXPIRED", "PAYOUT_FAILED"].includes(
      task.status,
    );
  const canEditReward = (isRequester || isAdmin) && ["AWAITING_FUNDING", "FUNDING_FAILED"].includes(task.status);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Review task"
        breadcrumbs={[
          isAdmin ? { label: "All review tasks", to: "/app/tasks" } : isReviewer ? { label: "Marketplace", to: "/app/marketplace" } : { label: "My requests", to: "/app/requests" },
          { label: task.title },
        ]}
        title={task.title}
        description={
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={task.status} />
            <RiskBadge risk={task.riskLevel} />
            <PayoutAvailabilityBadge availability={task.payoutAvailability} />
            {task.minimumSkillLevel ? <SkillLevelBadge level={task.minimumSkillLevel} /> : null}
            {task.isSeed ? <Badge tone="neutral">Seeded demo task</Badge> : null}
            {task.hasOpenDispute ? <Badge tone="danger">Open dispute</Badge> : null}
            <span className="text-xs">· {formatMoney(task.rewardMinor, task.currency)} reward</span>
          </div>
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link to={`/app/tasks/${task.id}/verification`}>
                <FileCheck2 className="size-4" /> Verification
              </Link>
            </Button>
            {task.session ? (
              <Button asChild variant="outline">
                <Link to={`/app/sessions/${task.session.id}`}>
                  <Sparkles className="size-4" /> AI session
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <PaymentModeBanner compact />

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {task.hasOpenDispute ? (
        <Alert tone="warning" icon={<Gavel className="size-4" />} title="This task is disputed">
          Payment and verification changes are paused until an administrator resolves the dispute.
        </Alert>
      ) : null}
      {(task.status === "VERIFICATION_REJECTED" || task.status === "NEEDS_REVISION") && isAssignedReviewer ? (
        <Alert tone="danger" icon={<XCircle className="size-4" />} title="Your submission was rejected">
          Read the failed checks below, correct the gap and resubmit. No reward was authorized.
        </Alert>
      ) : null}
      {task.status === "PAYOUT_FAILED" ? (
        <Alert tone="danger" icon={<Wallet className="size-4" />} title="Payout failed — the verified answer is preserved">
          {isAdmin
            ? "Reconcile the failed payout. Automatic retry is blocked unless reconciliation proves the payout did not succeed."
            : "An administrator must reconcile the payout. The verified answer can still be delivered to the agent session once the task allows resume."}
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader className="border-b border-border pb-3">
              <CardTitle className="flex items-center gap-2">
                <MessageSquarePlus className="size-4 text-primary" /> Request and scope
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {task.session ? (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Original question</p>
                  <p className="mt-1 text-sm leading-6">{task.session.question}</p>
                </div>
              ) : (
                <p className="text-sm leading-6">{task.question}</p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Acceptance criteria</p>
                  <ul className="mt-1.5 space-y-1 text-xs leading-5">
                    {task.acceptanceCriteria
                      .split(/\n|;/)
                      .filter(Boolean)
                      .map((line, index) => (
                        <li key={`${line}-${index}`} className="flex gap-1.5">
                          <Check className="mt-0.5 size-3 shrink-0 text-primary" />
                          <span>{line.replace(/^[\s\-*\d.]+/, "")}</span>
                        </li>
                      ))}
                  </ul>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Required skills</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {task.requiredSkills.length === 0 ? (
                      <span className="text-xs text-muted-foreground">None specified</span>
                    ) : (
                      task.requiredSkills.map((skill) => (
                        <Badge key={skill} tone="accent">
                          {skill}
                        </Badge>
                      ))
                    )}
                    {task.minimumSkillLevel ? (
                      <SkillLevelBadge level={task.minimumSkillLevel} />
                    ) : null}
                  </div>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Requester</p>
                  <p className="text-xs">{task.requester?.name ?? "Unknown"}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Assigned reviewer</p>
                  <p className="text-xs">{task.assignment?.reviewer.name ?? "Not assigned yet"}</p>
                </div>
              </div>

              {task.evidence.length > 0 ? (
                <div>
                  <SectionHeading title="Supplied evidence" description="The reviewer's claim is checked against these documents." />
                  <div className="space-y-1.5">
                    {task.evidence.map((item) => (
                      <details key={item.id} className="rounded-md border border-border bg-background p-2.5">
                        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-xs font-medium">
                          <span className="flex items-center gap-1.5">
                            <FileText className="size-3.5 text-muted-foreground" /> {item.title}
                            {item.isSeed ? <Badge tone="neutral">Seeded</Badge> : null}
                          </span>
                          <span className="text-[10px] font-normal text-muted-foreground">
                            {humanize(item.sourceType)}
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
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {latestSubmission ? (
            <SubmissionCard
              submission={latestSubmission}
              verification={latestVerification}
              canSubmit={canSubmit}
              onSubmit={(input) => submit.mutate(input)}
              submitting={submit.isPending}
              task={task}
            />
          ) : canSubmit ? (
            <SubmissionForm
              task={task}
              onSubmit={(input) => submit.mutate(input)}
              submitting={submit.isPending}
              title="Submit your evidenced answer & code artifact"
            />
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ClipboardCheck className="size-4 text-primary" /> Verification
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs leading-5 text-muted-foreground">
                  {isAssignedReviewer
                    ? "Your submission will appear here with an independent checklist once submitted."
                    : isOpenMarket
                      ? "Accept this task to submit an answer. Verification is independent of payment approval."
                      : "No submission has been recorded yet. The reviewer must accept and submit an answer."}
                </p>
              </CardContent>
            </Card>
          )}

          {latestVerification ? (
            <VerificationCard
              verification={latestVerification}
              isAdmin={isAdmin}
              taskStatus={task.status}
              onVerify={(input) => verify.mutate(input)}
              verifying={verify.isPending}
            />
          ) : null}

          {handbackPreview ? (
            <Card className="border-emerald-500/30">
              <CardHeader className="border-b border-border pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <ShieldCheck className="size-4 text-emerald-400" /> Verified Agent Handback Payload
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    <Badge tone="success" dot>
                      {handbackPreview.signature.algorithm}
                    </Badge>
                    {handbackPreview.idempotentReplay ? <Badge tone="neutral">Idempotent Replay</Badge> : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-4 text-xs">
                <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-2.5">
                  <div>
                    <span className="font-semibold text-muted-foreground">Artifact v{handbackPreview.handback.artifact.version} SHA-256: </span>
                    <span className="break-all font-mono text-[11px]">{handbackPreview.handback.artifact.sha256Digest}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-muted-foreground">X-TrustToPay-Signature: </span>
                    <span className="break-all font-mono text-[11px]">{handbackPreview.signature.header}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-muted-foreground">Handoff Idempotency Key: </span>
                    <span className="break-all font-mono text-[11px]">{handbackPreview.handback.handoffIdempotencyKey}</span>
                  </div>
                </div>
                <details className="rounded-md border border-border bg-background p-2.5">
                  <summary className="cursor-pointer font-semibold">Inspect Signed Handback JSON</summary>
                  <pre className="mt-2 max-h-60 overflow-auto rounded bg-muted/40 p-2.5 font-mono text-[10px]">
                    {JSON.stringify(handbackPreview.handback, null, 2)}
                  </pre>
                </details>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="size-4 text-primary" /> Task timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TaskTimeline events={task.events} />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <ActionCard
            task={task}
            userRole={user?.role}
            isRequester={isRequester}
            isReviewer={isReviewer}
            isAdmin={isAdmin}
            isAssignedReviewer={isAssignedReviewer}
            isOpenMarket={isOpenMarket}
            processingPayout={processingPayout}
            failedPayout={failedPayout}
            onAccept={() => accept.mutate()}
            accepting={accept.isPending}
            onDeclineOffer={() => declineOffer.mutate()}
            decliningOffer={declineOffer.isPending}
            onDispatchOffers={() => dispatchOffers.mutate()}
            dispatchingOffers={dispatchOffers.isPending}
            onFetchHandback={() => fetchHandback.mutate()}
            fetchingHandback={fetchHandback.isPending}
            onPayout={() => payout.mutate()}
            paying={payout.isPending}
            onReconcile={(paymentId) => reconcile.mutate(paymentId)}
            reconciling={reconcile.isPending}
            onRetry={(paymentId) => retry.mutate(paymentId)}
            retrying={retry.isPending}
            onDispute={() => setDisputeOpen(true)}
            onCancel={() => setCancelOpen(true)}
            onEditReward={() => setRewardOpen(true)}
            onFunded={invalidate}
            onResume={async () => {
              if (!task.session) return;
              try {
                await api.sessions.resume(task.session.id);
                await invalidate();
                navigate(`/app/sessions/${task.session.id}`);
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "Could not resume the session.");
              }
            }}
          />

          <PaymentsCard
            task={task}
            isAdmin={isAdmin}
            isRequester={isRequester}
            onReconcile={(paymentId) => reconcile.mutate(paymentId)}
            reconciling={reconcile.isPending}
            onRetry={(paymentId) => retry.mutate(paymentId)}
            retrying={retry.isPending}
          />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Task facts</CardTitle>
            </CardHeader>
            <CardContent>
              <dl>
                <DataRow label="Category">{categoryLabel(task.category)}</DataRow>
                <DataRow label="Reward">{formatMoney(task.rewardMinor, task.currency)}</DataRow>
                <DataRow label="Reward status">
                  {task.reward ? <Badge tone="neutral">{humanize(task.reward.status)}</Badge> : "—"}
                </DataRow>
                <DataRow label="Payout mode">
                  <PayoutAvailabilityBadge availability={task.payoutAvailability} />
                </DataRow>
                <DataRow label="Created">{formatDate(task.createdAt)}</DataRow>
                <DataRow label="Funded">{task.fundedAt ? formatDate(task.fundedAt) : "Not yet"}</DataRow>
                <DataRow label="Verified">{task.verifiedAt ? formatDate(task.verifiedAt) : "Not yet"}</DataRow>
                <DataRow label="Handed off">{task.handedOffAt ? formatDate(task.handedOffAt) : "Not yet"}</DataRow>
                <DataRow label="Completed">{task.completedAt ? formatDate(task.completedAt) : "Not yet"}</DataRow>
                <DataRow label="Task ID" mono>
                  {task.id}
                </DataRow>
              </dl>
            </CardContent>
          </Card>

          {task.reviewerPayout ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <HandCoins className="size-4 text-primary" /> Reviewer payout profile
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {task.reviewerPayout.consent && task.reviewerPayout.email ? (
                  <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-emerald-200">
                    <BadgeCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                    <div>
                      <p className="font-medium text-emerald-100">Payout consent recorded</p>
                      <p className="mt-0.5 break-all">{task.reviewerPayout.email}</p>
                    </div>
                  </div>
                ) : (
                  <Alert tone="warning">Payout details are incomplete. The reviewer must add a PayPal email and consent.</Alert>
                )}
                <p className="text-[11px] text-muted-foreground">Provider: {task.reviewerPayout.provider}</p>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>

      <DisputeDialog
        open={disputeOpen}
        onOpenChange={setDisputeOpen}
        onSubmit={(reason) => {
          api.tasks
            .dispute(id, reason)
            .then(async () => {
              setDisputeOpen(false);
              await invalidate();
            })
            .catch((err) => setError(err instanceof ApiError ? err.message : "Could not open a dispute."));
        }}
      />

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this review task?</DialogTitle>
            <DialogDescription>
              The task will be marked cancelled and the reward will no longer be payable. Captured funding is not
              automatically refunded by this application.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep task
            </Button>
            <Button variant="destructive" onClick={() => cancel.mutate()} loading={cancel.isPending}>
              Cancel task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RewardDialog
        open={rewardOpen}
        onOpenChange={setRewardOpen}
        currentMinor={task.rewardMinor}
        onSubmit={(amount) => updateReward.mutate(amount)}
        loading={updateReward.isPending}
      />
    </div>
  );
}

function ActionCard({
  task,
  userRole,
  isRequester,
  isReviewer,
  isAdmin,
  isAssignedReviewer,
  isOpenMarket,
  processingPayout,
  failedPayout,
  onAccept,
  accepting,
  onDeclineOffer,
  decliningOffer,
  onDispatchOffers,
  dispatchingOffers,
  onFetchHandback,
  fetchingHandback,
  onPayout,
  paying,
  onReconcile,
  reconciling,
  onRetry,
  retrying,
  onDispute,
  onCancel,
  onEditReward,
  onFunded,
  onResume,
}: {
  task: TaskDetail;
  userRole?: string;
  isRequester: boolean;
  isReviewer: boolean;
  isAdmin: boolean;
  isAssignedReviewer: boolean;
  isOpenMarket: boolean;
  processingPayout?: TaskDetail["payments"][number];
  failedPayout?: TaskDetail["payments"][number];
  onAccept: () => void;
  accepting: boolean;
  onDeclineOffer: () => void;
  decliningOffer: boolean;
  onDispatchOffers: () => void;
  dispatchingOffers: boolean;
  onFetchHandback: () => void;
  fetchingHandback: boolean;
  onPayout: () => void;
  paying: boolean;
  onReconcile: (paymentId: string) => void;
  reconciling: boolean;
  onRetry: (paymentId: string) => void;
  retrying: boolean;
  onDispute: () => void;
  onCancel: () => void;
  onEditReward: () => void;
  onFunded: () => Promise<void>;
  onResume: () => Promise<void>;
}) {
  const payable = (isRequester || isAdmin) && task.payoutEligible;
  const resumeAllowed = [
    "VERIFIED",
    "PAYMENT_READY",
    "PAYMENT_PAID",
    "PAYOUT_FAILED",
    "HANDED_OFF",
    "ORIGINAL_TASK_RESUMED",
  ].includes(task.status);
  const handbackAllowed =
    (isRequester || isAdmin) &&
    [
      "VERIFIED",
      "PAYMENT_READY",
      "PAYMENT_PROCESSING",
      "PAYMENT_PAID",
      "PAYOUT_FAILED",
      "HANDED_OFF",
      "ORIGINAL_TASK_RESUMED",
      "COMPLETED",
    ].includes(task.status);
  const canDispute =
    (isRequester || isAssignedReviewer || isAdmin) &&
    !["COMPLETED", "CANCELLED", "DISPUTED", "PAYMENT_PAID", "EXPIRED"].includes(task.status);
  const pendingMyOffer = task.myOffer?.status === "PENDING" ? task.myOffer : null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Flag className="size-4 text-primary" /> Next action
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {["AWAITING_FUNDING", "FUNDING_FAILED"].includes(task.status) && (isRequester || isAdmin) ? (
          <>
            <p className="text-xs leading-5 text-muted-foreground">
              Fund the reward to make this task available. In demo mode the payment is clearly simulated; in Sandbox
              mode the server calls PayPal Orders v2.
            </p>
            {task.status === "FUNDING_FAILED" ? (
              <Alert tone="warning">
                The previous funding attempt failed. Create a new order after reconciling the old transaction below.
              </Alert>
            ) : null}
            <PayPalCheckout
              taskId={task.id}
              amountDisplay={formatMoney(task.rewardMinor, task.currency)}
              currency={task.currency}
              onCompleted={onFunded}
              label={`Fund ${formatMoney(task.rewardMinor, task.currency)}`}
            />
            <Button variant="outline" size="sm" className="w-full" onClick={onEditReward}>
              <CircleDollarSign className="size-3.5" /> Change reward before funding
            </Button>
          </>
        ) : null}

        {["FUNDED", "OFFERED"].includes(task.status) && (isRequester || isAdmin) && !task.assignment ? (
          <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5 text-xs">
            <p className="font-semibold">Specialist Offer Broadcast</p>
            <p className="text-muted-foreground">
              {task.offers && task.offers.length > 0
                ? `${task.offers.filter((o) => o.status === "PENDING").length} pending expiring offer(s) active.`
                : "Rank qualified specialists (L1–L3) and dispatch up to 5 parallel expiring offers."}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={onDispatchOffers}
              loading={dispatchingOffers}
            >
              <Sparkles className="size-3.5" /> Dispatch top-5 specialist offers
            </Button>
          </div>
        ) : null}

        {isOpenMarket ? (
          <>
            {pendingMyOffer ? (
              <div className="space-y-1.5 rounded-md border border-primary/40 bg-primary/5 p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-primary">
                    Top-5 Offer #{pendingMyOffer.rank} ({pendingMyOffer.score} pts)
                  </span>
                  <Badge tone="accent">Batch #{pendingMyOffer.batchNumber}</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Expires {formatDate(pendingMyOffer.expiresAt)}. First specialist to accept wins atomically.
                </p>
              </div>
            ) : (
              <p className="text-xs leading-5 text-muted-foreground">
                This funded task is available. Acceptance is exclusive and transaction-safe: only the first reviewer
                can claim it.
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={onAccept} loading={accepting}>
                <ClipboardCheck className="size-3.5" /> Accept review task
              </Button>
              {pendingMyOffer ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onDeclineOffer}
                  loading={decliningOffer}
                >
                  Decline
                </Button>
              ) : null}
            </div>
          </>
        ) : null}

        {["FUNDED", "OFFERED"].includes(task.status) && isAssignedReviewer ? (
          <p className="text-xs leading-5 text-muted-foreground">
            You accepted this task. Submit your answer and evidence below.
          </p>
        ) : null}

        {task.status === "VERIFICATION_PENDING" ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin text-primary" /> Independent verification is running…
          </div>
        ) : null}

        {payable ? (
          <>
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs leading-5 text-emerald-100">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <p className="font-semibold text-emerald-300">Verified and authorized</p>
                <PayoutAvailabilityBadge availability={task.payoutAvailability} />
              </div>
              <p className="mt-1">
                Release {formatMoney(task.rewardMinor, task.currency)} to {task.assignment?.reviewer.name ?? "the reviewer"}.
                {" "}
                {task.payoutAvailability === "DEMO_SIMULATED"
                  ? "In demo mode this is a labelled simulated payout."
                  : task.payoutAvailability === "PAYOUT_UNAVAILABLE"
                    ? "PayPal Payouts is disabled for Indian Sandbox merchant accounts unless PAYPAL_PAYOUTS_ENABLED=true or DEMO_MODE=true."
                    : "Calls PayPal Sandbox Payouts v1."}
              </p>
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={onPayout}
              loading={paying}
              disabled={task.payoutAvailability === "PAYOUT_UNAVAILABLE"}
            >
              <Wallet className="size-3.5" />{" "}
              {task.payoutAvailability === "PAYOUT_UNAVAILABLE"
                ? "Payout Unavailable (Sandbox Restriction)"
                : task.payoutAvailability === "DEMO_SIMULATED"
                  ? "Release Simulated Payout"
                  : "Release Reviewer Payout"}
            </Button>
            {task.payoutAvailability === "PAYOUT_UNAVAILABLE" ? (
              <Alert tone="warning">
                PayPal Sandbox Checkout works with Indian merchant accounts, but Payouts requires separate regional approval (`PAYPAL_PAYOUTS_ENABLED=false`). The verified deliverable and Agent Handback remain available below.
              </Alert>
            ) : null}
            {!task.reviewerPayout?.consent || !task.reviewerPayout.email ? (
              <Alert tone="warning">The reviewer has not completed payout consent and a PayPal email.</Alert>
            ) : null}
          </>
        ) : null}

        {task.status === "PAYMENT_PROCESSING" ? (
          <>
            <p className="text-xs leading-5 text-muted-foreground">
              PayPal is processing the payout. Reconcile before retrying or resuming the session.
            </p>
            {processingPayout ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => onReconcile(processingPayout.id)}
                loading={reconciling}
              >
                <RefreshCw className="size-3.5" /> Reconcile payout
              </Button>
            ) : null}
          </>
        ) : null}

        {task.status === "PAYMENT_PAID" ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-100">
            <p className="font-semibold text-emerald-300">Reviewer paid</p>
            <p className="mt-0.5">The verified answer can now be delivered to the AI session.</p>
          </div>
        ) : null}

        {handbackAllowed ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onFetchHandback}
            loading={fetchingHandback}
          >
            <ShieldCheck className="size-3.5" /> Retrieve signed Agent Handback
          </Button>
        ) : null}

        {resumeAllowed && task.session ? (
          <Button size="sm" className="w-full" onClick={onResume}>
            <CheckCircle2 className="size-3.5" /> Resume AI session
          </Button>
        ) : null}

        {task.status === "PAYOUT_FAILED" ? (
          <>
            <div className="rounded-md border border-border bg-muted/30 p-2.5 text-xs leading-5 text-muted-foreground">
              The answer is verified. The payout is unresolved; automatic retry requires reconciliation.
            </div>
            {failedPayout ? (
              <div className="grid gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onReconcile(failedPayout.id)}
                  loading={reconciling}
                >
                  <RefreshCw className="size-3.5" /> Reconcile failed payout
                </Button>
                {isAdmin ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRetry(failedPayout.id)}
                    loading={retrying}
                  >
                    <Wallet className="size-3.5" /> Retry payout (admin)
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {["NEEDS_MANUAL_REVIEW", "VERIFICATION_REJECTED", "NEEDS_REVISION"].includes(task.status) ? (
          <div className="rounded-md border border-border bg-muted/30 p-2.5 text-xs leading-5 text-muted-foreground">
            {task.status === "NEEDS_MANUAL_REVIEW"
              ? "An administrator must decide whether to pass or reject the submission."
              : "Reviewer can correct and resubmit. Verification failed, so no reward is authorized."}
          </div>
        ) : null}

        {task.status === "COMPLETED" ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs leading-5 text-emerald-100">
            <p className="font-semibold text-emerald-300">Task completed</p>
            <p>The verified answer was delivered to the AI session.</p>
          </div>
        ) : null}

        {task.status === "CANCELLED" ? (
          <div className="rounded-md border border-border bg-muted/30 p-2.5 text-xs leading-5 text-muted-foreground">
            This task was cancelled. It cannot be accepted or paid.
          </div>
        ) : null}

        <div className="border-t border-border pt-3">
          <div className="flex flex-wrap gap-2">
            {task.payoutEligible || task.status === "PAYMENT_READY" ? (
              <Button asChild variant="ghost" size="sm">
                <Link to={`/app/tasks/${task.id}/verification`}>
                  <FileCheck2 className="size-3.5" /> Evidence checks
                </Link>
              </Button>
            ) : null}
            {task.session?.finalAnswer ? (
              <Button asChild variant="ghost" size="sm">
                <Link to={`/app/sessions/${task.session.id}`}>
                  <Sparkles className="size-3.5" /> Final answer
                </Link>
              </Button>
            ) : null}
            {isAssignedReviewer ? (
              <Button asChild variant="ghost" size="sm">
                <Link to="/app/profile">
                  <ShieldCheck className="size-3.5" /> Payout profile
                </Link>
              </Button>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {canDispute ? (
              <Button variant="outline" size="sm" onClick={onDispute}>
                <Gavel className="size-3.5" /> Open dispute
              </Button>
            ) : null}
            {userRole === "ADMIN" || isRequester ? (
              <Button variant="ghost" size="sm" className="text-destructive" onClick={onCancel}>
                Cancel task
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentsCard({
  task,
  isAdmin,
  isRequester,
  onReconcile,
  reconciling,
  onRetry,
  retrying,
}: {
  task: TaskDetail;
  isAdmin: boolean;
  isRequester: boolean;
  onReconcile: (id: string) => void;
  reconciling: boolean;
  onRetry: (id: string) => void;
  retrying: boolean;
}) {
  const visible = task.payments ?? [];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Banknote className="size-4 text-primary" /> Payment ledger
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {visible.length === 0 ? (
          <p className="text-xs text-muted-foreground">No payment transactions yet.</p>
        ) : (
          visible.map((payment) => (
            <div key={payment.id} className="rounded-md border border-border bg-background p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold">{humanize(payment.type)}</span>
                  <PaymentStatusBadge status={payment.status} />
                  <ModeBadge mode={payment.mode} />
                  {payment.type === "PAYOUT" ? (
                    <PayoutAvailabilityBadge
                      availability={
                        payment.payoutAvailability ?? (payment.mode === "SIMULATED" ? "DEMO_SIMULATED" : undefined)
                      }
                    />
                  ) : null}
                </div>
                <span className="text-xs font-semibold tabular-nums">{payment.amountDisplay}</span>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {payment.provider} · {formatDate(payment.createdAt)}
              </p>
              {payment.orderId ? (
                <p className="truncate font-mono text-[10px] text-muted-foreground">Order {payment.orderId}</p>
              ) : null}
              {payment.payoutBatchId ? (
                <p className="truncate font-mono text-[10px] text-muted-foreground">Batch {payment.payoutBatchId}</p>
              ) : null}
              {payment.failureMessage ? (
                <p className="mt-1 text-[10px] leading-4 text-red-400">{payment.failureMessage}</p>
              ) : null}
              {(isAdmin || isRequester) && ["FAILED", "PROCESSING", "PENDING"].includes(payment.status) ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => onReconcile(payment.id)}
                    loading={reconciling}
                  >
                    <RefreshCw className="size-3" /> Reconcile
                  </Button>
                  {isAdmin && payment.status === "FAILED" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => onRetry(payment.id)}
                      loading={retrying}
                    >
                      Retry
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function VerificationCard({
  verification,
  isAdmin,
  taskStatus,
  onVerify,
  verifying,
}: {
  verification: VerificationRun;
  isAdmin: boolean;
  taskStatus: string;
  onVerify: (input: { decision?: "PASS" | "REJECT"; note?: string }) => void;
  verifying: boolean;
}) {
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState<"PASS" | "REJECT">("PASS");

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <FileCheck2 className="size-4 text-primary" /> Independent verification
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <VerificationBadge status={verification.status} />
            {verification.securityVerdict ? (
              <SecurityVerdictBadge verdict={verification.securityVerdict} />
            ) : null}
            {verification.artifactVersion ? (
              <Badge tone="neutral">Artifact v{verification.artifactVersion}</Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <p className="text-sm leading-6">{verification.decisionReason}</p>

        {verification.artifactSha256 ? (
          <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
            <span className="font-semibold text-muted-foreground">Artifact SHA-256: </span>
            <span className="break-all font-mono text-[11px]">{verification.artifactSha256}</span>
          </div>
        ) : null}

        {verification.securityReview ? (
          <div className="rounded-md border border-border bg-muted/20 p-3 text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-primary" /> Layered Security Gate
              </p>
              <SecurityVerdictBadge verdict={verification.securityReview.verdict} />
            </div>
            <p className="text-muted-foreground">{verification.securityReview.summary}</p>
            {verification.securityReview.gemini ? (
              <p className="text-[11px] text-muted-foreground">
                Gemini model: <span className="font-mono">{verification.securityReview.gemini.model}</span> · Confidence:{" "}
                {Math.round(verification.securityReview.gemini.confidence * 100)}%
              </p>
            ) : null}
          </div>
        ) : null}

        {verification.executionSummary ? (
          <div className="rounded-md border border-border bg-muted/20 p-3 text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold flex items-center gap-1.5">
                <Terminal className="size-3.5 text-primary" /> Isolated Execution Runner
              </p>
              <div className="flex items-center gap-1.5">
                <Badge tone={verification.executionSummary.passed ? "success" : "danger"} dot>
                  {verification.executionSummary.verdict}
                </Badge>
                <Badge tone="neutral">{verification.executionSummary.mode}</Badge>
              </div>
            </div>
            <p className="text-muted-foreground">{verification.executionSummary.summary}</p>
            {verification.executionSummary.stdout ? (
              <pre className="max-h-32 overflow-auto rounded border border-border bg-background p-2 font-mono text-[10px]">
                {verification.executionSummary.stdout}
              </pre>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Passed checks ({verification.checksPassed.length})
            </p>
            <div className="space-y-1.5">
              {verification.checksPassed.map((check) => (
                <div key={check.id} className="flex gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 p-2">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                  <div>
                    <p className="text-[11px] font-medium text-emerald-100">{check.label}</p>
                    <p className="text-[10px] leading-4 text-emerald-200/80">{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Failed checks ({verification.checksFailed.length})
            </p>
            {verification.checksFailed.length === 0 ? (
              <p className="rounded border border-border bg-muted/30 p-2 text-[11px] text-muted-foreground">
                No failed checks.
              </p>
            ) : (
              <div className="space-y-1.5">
                {verification.checksFailed.map((check) => (
                  <div
                    key={check.id}
                    className={cn(
                      "flex gap-1.5 rounded border p-2",
                      check.severity === "HARD"
                        ? "border-red-500/30 bg-red-500/10"
                        : "border-amber-500/30 bg-amber-500/10",
                    )}
                  >
                    <ShieldAlert
                      className={cn(
                        "mt-0.5 size-3.5 shrink-0",
                        check.severity === "HARD" ? "text-red-400" : "text-amber-400",
                      )}
                    />
                    <div>
                      <p className="text-[11px] font-medium text-foreground">{check.label}</p>
                      <p className="text-[10px] leading-4 text-muted-foreground">{check.detail}</p>
                      <Badge tone={check.severity === "HARD" ? "danger" : "warning"} className="mt-1">
                        {check.severity === "HARD" ? "Required" : "Risk review"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {verification.evidenceReferences.length > 0 ? (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Evidence references</p>
            <div className="space-y-1">
              {verification.evidenceReferences.map((reference, index) => (
                <div key={`${reference.label}-${index}`} className="rounded border border-border bg-background p-2 text-[11px]">
                  <p className="font-medium">{reference.label}</p>
                  {reference.url ? (
                    <a
                      href={reference.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-primary underline underline-offset-2"
                    >
                      {reference.url} <ExternalLink className="size-2.5" />
                    </a>
                  ) : null}
                  {reference.quote ? <p className="mt-0.5 text-muted-foreground">“{reference.quote}”</p> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {isAdmin && taskStatus === "NEEDS_MANUAL_REVIEW" ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-200">
              <ShieldAlert className="size-3.5 text-amber-400" /> Administrator decision required
            </p>
            <p className="mt-1 text-[11px] leading-5 text-amber-100/90">
              The automated checks passed, but a risk check requires a human decision. A note is mandatory.
            </p>
            <div className="mt-3 space-y-2">
              <Field label="Decision note" htmlFor="admin-verification-note">
                <Textarea
                  id="admin-verification-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={2}
                  placeholder="Explain what you reviewed and why this decision is appropriate."
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => onVerify({ decision, note })}
                  loading={verifying}
                  disabled={note.trim().length < 10}
                >
                  <CheckCircle2 className="size-3.5" /> {decision === "PASS" ? "Approve submission" : "Reject submission"}
                </Button>
                <select
                  value={decision}
                  onChange={(event) => setDecision(event.target.value as "PASS" | "REJECT")}
                  className="flex h-8 rounded-md border border-input bg-card px-2 text-xs"
                  aria-label="Admin verification decision"
                >
                  <option value="PASS">PASS</option>
                  <option value="REJECT">REJECT</option>
                </select>
              </div>
            </div>
          </div>
        ) : null}

        {isAdmin && ["VERIFICATION_PENDING", "NEEDS_MANUAL_REVIEW"].includes(taskStatus) ? (
          <Button variant="outline" size="sm" onClick={() => onVerify({})} loading={verifying}>
            <RefreshCw className="size-3.5" /> Re-run automated verification
          </Button>
        ) : null}

        <p className="text-[10px] leading-4 text-muted-foreground">
          Engine: {verification.engine === "MANUAL" ? "Administrator manual decision" : "Automated independent check"} ·
          Created {formatDate(verification.createdAt)}
        </p>
      </CardContent>
    </Card>
  );
}

function SubmissionCard({
  submission,
  verification,
  canSubmit,
  onSubmit,
  submitting,
  task,
}: {
  submission: Submission;
  verification: VerificationRun | null;
  canSubmit: boolean;
  onSubmit: (input: Parameters<typeof api.tasks.submit>[1]) => void;
  submitting: boolean;
  task: TaskDetail;
}) {
  const artifact = submission.artifact ?? task.artifacts?.[0] ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="size-4 text-primary" /> Reviewer submission{" "}
              {submission.version ? `v${submission.version}` : ""}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              {verification ? <VerificationBadge status={verification.status} /> : null}
              {artifact ? <Badge tone="info">Artifact v{artifact.version}</Badge> : null}
              <Badge tone="neutral">{submission.confidenceScore}% confidence</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {artifact ? (
            <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 font-semibold">
                  <FileCode2 className="size-3.5 text-primary" /> Immutable Code Artifact (v{artifact.version})
                </p>
                <span className="text-[11px] text-muted-foreground">
                  {artifact.fileCount} file{artifact.fileCount === 1 ? "" : "s"} · {artifact.totalSizeBytes} bytes
                </span>
              </div>
              <p className="break-all font-mono text-[10px] text-muted-foreground">
                SHA-256: {artifact.sha256Digest}
              </p>
              {artifact.files && artifact.files.length > 0 ? (
                <div className="space-y-1.5 pt-1">
                  {artifact.files.map((file) => (
                    <details key={file.path} className="rounded border border-border bg-background p-2">
                      <summary className="flex cursor-pointer items-center justify-between gap-2 font-mono text-[11px] font-medium">
                        <span>{file.path}</span>
                        <span className="text-[10px] text-muted-foreground">{file.sizeBytes} B</span>
                      </summary>
                      <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted/40 p-2 font-mono text-[11px]">
                        {file.content}
                      </pre>
                    </details>
                  ))}
                </div>
              ) : null}
              {artifact.patchText ? (
                <details className="rounded border border-border bg-background p-2">
                  <summary className="cursor-pointer font-mono text-[11px] font-medium">
                    Unified Git Diff Patch
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted/40 p-2 font-mono text-[11px]">
                    {artifact.patchText}
                  </pre>
                </details>
              ) : null}
            </div>
          ) : null}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Answer</p>
            <p className="mt-1 whitespace-pre-line text-sm leading-6">{submission.answer}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Explanation</p>
            <p className="mt-1 whitespace-pre-line text-xs leading-5 text-muted-foreground">{submission.explanation}</p>
          </div>
          {submission.sourceUrl ? (
            <a
              href={submission.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
            >
              {submission.sourceUrl} <ExternalLink className="size-3" />
            </a>
          ) : null}
          {submission.evidenceNotes ? (
            <div className="rounded-md border border-border bg-muted/30 p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Evidence notes</p>
              <p className="mt-1 whitespace-pre-line text-xs leading-5">{submission.evidenceNotes}</p>
            </div>
          ) : null}
          <p className="text-[10px] text-muted-foreground">Submitted {formatDate(submission.createdAt)}</p>
        </CardContent>
      </Card>

      {canSubmit ? (
        <SubmissionForm
          task={task}
          onSubmit={onSubmit}
          submitting={submitting}
          title="Correct and resubmit (creates new artifact version)"
          initial={submission}
        />
      ) : null}
    </div>
  );
}

function sampleAnswerFor(task: TaskDetail) {
  const haystack = `${task.title} ${task.question} ${task.acceptanceCriteria}`.toLowerCase();
  const criteria = task.acceptanceCriteria.replace(/\n/g, "; ");
  let answer: string;
  let explanation: string;
  let sourceUrl: string;
  let quote: string;

  const category = normalizeCategoryValue(task.category);

  if (category === "PROGRAMMING") {
    const programmingQuote =
      "The AbortController interface represents a controller object that allows you to abort one or more web requests as and when desired.";
    return {
      answer:
        "The root cause is an unbounded await fetch inside each worker combined with a pool size of 4 workers, so the queue stops draining after four jobs. I recommend adding an AbortController timeout and a concurrency cap; with a 30 second timeout the retry limit of 3 attempts stays safe.",
      explanation:
        "I compared the worker-pool.ts excerpt with the deployment runbook. The configuration disagrees about the pool size: 4 workers versus 12 workers, and the missing timeout leaves every worker waiting indefinitely. The relevant runtime version is Node 20.11, where fetch inherits the event loop. The concrete fix is to abort the request and release the worker. The next diagnostic step is to reproduce the stall with a bounded timeout. This directly answers the acceptance criteria: " +
        criteria,
      confidenceScore: 89,
      sourceUrl: "https://nodejs.org/api/globals.html",
      evidenceNotes: `Independent source, quoted excerpt: "${programmingQuote}" I checked the runtime version and configuration against the supplied worker-pool.ts excerpt, then traced the await call that has no timeout.`,
      filePath: "src/worker-pool.ts",
      fileContent: `export async function fetchWithTimeout(url: string, timeoutMs = 30_000): Promise<Response> {\n  const controller = new AbortController();\n  const timer = setTimeout(() => controller.abort(), timeoutMs);\n  try {\n    return await fetch(url, { signal: controller.signal });\n  } finally {\n    clearTimeout(timer);\n  }\n}\n`,
      patchText: `--- a/src/worker-pool.ts\n+++ b/src/worker-pool.ts\n@@ -12,3 +12,6 @@\n-  const response = await fetch(job.endpoint);\n+  const controller = new AbortController();\n+  const timer = setTimeout(() => controller.abort(), 30_000);\n+  const response = await fetch(job.endpoint, { signal: controller.signal }).finally(() => clearTimeout(timer));\n`,
    };
  }

  if (category === "CRYPTO") {
    const cryptoQuote =
      "The domain separator is computed from the chain id and the verifying contract address.";
    return {
      answer:
        "The permit is unsafe across chain forks because the contract does not validate chainId against block.chainid before accepting a signature. An attacker can replay the same permit on a forked chain while the nonce remains unused. I recommend binding the domain separator to block.chainid and consuming the nonce on every transfer.",
      explanation:
        "I compared the audit notes with the deployment checklist. The two sources contradict each other about chain ID validation and nonce consumption, so the signature is not safely replay-protected. The relevant chain is Ethereum mainnet, and the contract accepts signatures from a relayer. The safe design assumption is that the domain separator is recomputed per chain, and this contract does not satisfy that assumption. The custody and replay risk remains until the nonce is consumed and the key-management path recomputes the domain separator. This directly answers the acceptance criteria: " +
        criteria,
      confidenceScore: 92,
      sourceUrl: "https://eips.ethereum.org/EIPS/eip-2612",
      evidenceNotes: `Independent source, quoted excerpt: "${cryptoQuote}" I checked the chain ID, signature, nonce and replay details in the supplied Vault.sol audit notes against the deployment checklist.`,
      filePath: "",
      fileContent: "",
      patchText: "",
    };
  }

  if (category === "CONCEPTUAL") {
    const conceptualQuote =
      "A message queue decouples producers from consumers but adds operational ownership and delivery semantics.";
    return {
      answer:
        "We should not replace direct HTTP calls with a message queue yet. Peak throughput is 1,000 messages per second, well below the 5,000 messages per second where the queue becomes worthwhile, and both options add 40 ms of latency. I recommend revisiting the decision once volume grows and dedicated ownership exists.",
      explanation:
        "I compared the architecture notes with the vendor benchmark. The trade-off favours direct HTTP at the current volume, and the deciding constraint is that the team has no dedicated platform engineer. The conditions under which the recommendation changes are sustained higher throughput plus funded ownership of delivery semantics and backpressure. This directly answers the acceptance criteria: " +
        criteria,
      confidenceScore: 87,
      sourceUrl: "https://aws.amazon.com/message-queue/",
      evidenceNotes: `Independent source, quoted excerpt: "${conceptualQuote}" I checked the throughput, latency and operational cost figures against the supplied benchmark before recommending against the queue.`,
      filePath: "",
      fileContent: "",
      patchText: "",
    };
  }

  if (haystack.includes("dock") && (haystack.includes("96w") || haystack.includes("passthrough") || haystack.includes("pass-through"))) {
    answer =
      "The 96W dock cannot sustain 100W to the laptop. The dock reserves roughly 11W for its own operation and exposes an 85W host passthrough limit, which is below the laptop's 100W USB-C Power Delivery requirement at 20V/5A. The laptop should charge slowly or may not charge at full speed under load.";
    explanation =
      "I compared the dock's total 96W input with its documented 85W host passthrough. USB Power Delivery negotiation uses the lower of the adapter, dock and cable limits, so the laptop sees 85W rather than 100W. The 96W figure includes dock overhead and is not the host port budget. This directly answers the acceptance criteria: " +
      criteria;
    sourceUrl = "https://www.usb.org/usb-charger";
    quote = "USB Power Delivery negotiates voltage and current up to the cable and port limits.";
  } else if (haystack.includes("travel") || (haystack.includes("45w") && haystack.includes("aerobook"))) {
    answer =
      "The 45W travel adapter is not compatible with the AeroBook 14 for full-speed charging. The laptop requires 65W USB Power Delivery at 20V/3.25A, while the adapter provides only 45W at 20V/2.25A. That is 20W below the documented requirement, so the adapter is insufficient for full-speed charging.";
    explanation =
      "I compared the adapter's 45W rating with the AeroBook's 65W requirement at the same 20V voltage. USB Power Delivery will negotiate a lower power level, but the adapter cannot supply the current the laptop needs at full speed. The wattage gap is 20W. This directly answers the acceptance criteria: " +
      criteria;
    sourceUrl = "https://www.usb.org/usb-charger";
    quote = "USB Power Delivery negotiates voltage and current up to the cable and port limits.";
  } else if (haystack.includes("cable") && (haystack.includes("240w") || haystack.includes("epr"))) {
    answer =
      "A 100W USB-C cable is insufficient for 240W charging. USB Power Delivery Extended Power Range requires an EPR-rated cable rated for 240W at 50V/5A, while a 100W cable is limited to 20V/5A. Using the lower-rated cable will cause the charger and laptop to negotiate a lower power level or refuse the EPR contract.";
    explanation =
      "I compared the cable's 100W rating with the 240W EPR requirement. The cable is part of the negotiated power path, so its rating caps the contract even if the charger supports 240W. A 240W EPR cable is required. This directly answers the acceptance criteria: " +
      criteria;
    sourceUrl = "https://www.usb.org/usb-charger";
    quote = "USB Power Delivery negotiates voltage and current up to the cable and port limits.";
  } else if (haystack.includes("85w") || haystack.includes("100w")) {
    answer =
      "The 85W passthrough is not enough for the 100W laptop. The dock's 96W input includes overhead for the dock itself, and the host port is limited to 85W at 20V/4.25A, below the laptop's 100W requirement at 20V/5A. The total dock power is not the same as the host passthrough power, so the laptop will not receive full-speed charging.";
    explanation =
      "I separated the dock's total input rating from its host passthrough rating. USB Power Delivery negotiation uses the lower available limit, so the laptop sees 85W rather than 100W. The 96W total does not compensate for the 15W gap at the host port. This directly answers the acceptance criteria: " +
      criteria;
    sourceUrl = "https://www.usb.org/usb-charger";
    quote = "USB Power Delivery negotiates voltage and current up to the cable and port limits.";
  } else if (haystack.includes("65w") && (haystack.includes("minipc") || haystack.includes("mini pc") || haystack.includes("45w"))) {
    answer =
      "The 65W USB-C Power Delivery charger is compatible with the 45W MiniPC X1. The charger supplies 65W at 20V/3.25A over USB-C Power Delivery 3.0, while the mini PC requires 45W at 20V/2.25A. The 65W rating exceeds the requirement and leaves 20W of headroom, so it should power the mini PC at full speed.";
    explanation =
      "I compared the charger's per-port USB-C PD wattage and voltage rating with the mini PC's documented 45W requirement. 65W exceeds 45W, and both use USB-C Power Delivery at 20V, so the adapter is sufficient. The charger is a single-port unit, avoiding shared-output ambiguity. This directly answers the acceptance criteria: " +
      criteria;
    sourceUrl = "https://www.usb.org/usb-charger";
    quote = "USB Power Delivery negotiates voltage and current up to the cable and port limits.";
  } else {
    answer =
      "The charger is compatible at the required USB-C Power Delivery rating. It supplies 65W at 20V/3.25A, which meets the device's documented 65W requirement at 20V/3.25A over USB-C Power Delivery. The per-port output is not shared with another port, so the device receives the full rating.";
    explanation =
      "I compared the charger's per-port wattage and voltage with the device requirement. The 65W USB-C PD output meets or exceeds the documented 65W requirement, and both use the same 20V USB Power Delivery profile, so the adapter is sufficient. This directly answers the acceptance criteria: " +
      criteria;
    sourceUrl = "https://www.usb.org/usb-charger";
    quote = "USB Power Delivery negotiates voltage and current up to the cable and port limits.";
  }

  return {
    answer,
    explanation,
    confidenceScore: 88,
    sourceUrl,
    evidenceNotes: `Independent source, quoted excerpt: "${quote}" I checked the rated per-port output against the device requirement and did not rely on a headline wattage alone.`,
    filePath: "",
    fileContent: "",
    patchText: "",
  };
}

function SubmissionForm({
  task,
  onSubmit,
  submitting,
  title,
  initial,
}: {
  task: TaskDetail;
  onSubmit: (input: Parameters<typeof api.tasks.submit>[1]) => void;
  submitting: boolean;
  title: string;
  initial?: Submission;
}) {
  const sample = useMemo(() => sampleAnswerFor(task), [task]);
  const category = normalizeCategoryValue(task.category);
  const isProgramming = category === "PROGRAMMING";
  const isCrypto = category === "CRYPTO";
  const isConceptual = category === "CONCEPTUAL";
  const initialFile = initial?.artifact?.files?.[0];
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [confidence, setConfidence] = useState(initial?.confidenceScore ?? 80);
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? "");
  const [evidenceNotes, setEvidenceNotes] = useState(initial?.evidenceNotes ?? "");
  const [filePath, setFilePath] = useState(initialFile?.path ?? "");
  const [fileContent, setFileContent] = useState(initialFile?.content ?? "");
  const [patchText, setPatchText] = useState(initial?.artifact?.patchText ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setLocalError(null);
    const hasCodeFile = Boolean(filePath.trim() && fileContent.trim());
    const hasPatch = Boolean(patchText.trim());
    if (!hasCodeFile && !hasPatch && answer.trim().length < 20) {
      setLocalError("The answer must be at least 20 characters when no code files or unified diff patch are attached.");
      return;
    }
    if (explanation.trim().length < 20) {
      setLocalError("The explanation must be at least 20 characters.");
      return;
    }
    onSubmit({
      answer: answer.trim() || fileContent.trim() || patchText.trim(),
      explanation: explanation.trim(),
      confidenceScore: confidence,
      sourceUrl: sourceUrl.trim() || undefined,
      evidenceNotes: evidenceNotes.trim() || undefined,
      files: hasCodeFile ? [{ path: filePath.trim(), content: fileContent }] : undefined,
      patchText: hasPatch ? patchText : undefined,
    });
  }

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Send className="size-4 text-primary" /> {title}
          </CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setAnswer(sample.answer);
              setExplanation(sample.explanation);
              setConfidence(sample.confidenceScore);
              setSourceUrl(sample.sourceUrl);
              setEvidenceNotes(sample.evidenceNotes);
              if (sample.filePath) setFilePath(sample.filePath);
              if (sample.fileContent) setFileContent(sample.fileContent);
              if (sample.patchText) setPatchText(sample.patchText);
              setLocalError(null);
            }}
          >
            <Sparkles className="size-3.5" /> Load demo answer
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <form onSubmit={submit} className="space-y-3" noValidate>
          {localError ? <Alert tone="danger">{localError}</Alert> : null}
          <Field label="Answer" htmlFor="submission-answer" hint="State the conclusion clearly. At least 80 characters is safest.">
            <Textarea
              id="submission-answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={4}
              maxLength={6000}
              placeholder={
                isProgramming
                  ? "State the root cause and the fix."
                  : isCrypto
                    ? "State whether the property is safe and under which assumptions."
                    : isConceptual
                      ? "State your recommendation and the deciding constraint."
                      : "State whether the product is compatible and why."
              }
            />
          </Field>
          <Field label="Explanation" htmlFor="submission-explanation" hint="Describe the technical reasoning and the key trade-off.">
            <Textarea
              id="submission-explanation"
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
              rows={4}
              maxLength={6000}
              placeholder={
                isProgramming
                  ? "Explain the runtime, configuration and the evidence for the root cause."
                  : isCrypto
                    ? "Explain the chain, contract and signature details that drive the risk."
                    : isConceptual
                      ? "Explain the trade-off, measurable constraints and failure semantics."
                      : "Explain the wattage, voltage and protocol comparison."
              }
            />
          </Field>

          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <Code2 className="size-3.5 text-primary" /> Code Deliverable & Unified Diff Artifact (Optional)
            </p>
            <Field
              label="Code file path"
              htmlFor="submission-file-path"
              hint="Relative path (e.g. src/worker-pool.ts). Path traversal and executables are rejected."
            >
              <Input
                id="submission-file-path"
                value={filePath}
                onChange={(event) => setFilePath(event.target.value)}
                placeholder="src/worker-pool.ts"
                className="font-mono text-xs"
              />
            </Field>
            <Field label="Code file content" htmlFor="submission-file-content" hint="Canonicalized into the immutable SHA-256 artifact digest.">
              <Textarea
                id="submission-file-content"
                value={fileContent}
                onChange={(event) => setFileContent(event.target.value)}
                rows={4}
                placeholder="export async function fetchWithTimeout(...) { ... }"
                className="font-mono text-xs"
              />
            </Field>
            <Field label="Unified git diff patch" htmlFor="submission-patch" hint="Optional unified diff patch (--- a/... +++ b/...).">
              <Textarea
                id="submission-patch"
                value={patchText}
                onChange={(event) => setPatchText(event.target.value)}
                rows={3}
                placeholder="--- a/src/worker-pool.ts&#10;+++ b/src/worker-pool.ts"
                className="font-mono text-xs"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <Field label="Evidence source URL" htmlFor="submission-source" hint="Must be a public HTTPS URL. A bare link is not proof.">
              <Input
                id="submission-source"
                type="url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder={
                  isProgramming
                    ? "https://nodejs.org/api/globals.html"
                    : isCrypto
                      ? "https://eips.ethereum.org/EIPS/eip-2612"
                      : isConceptual
                        ? "https://aws.amazon.com/message-queue/"
                        : "https://www.usb.org/usb-charger"
                }
                maxLength={1000}
              />
            </Field>
            <Field label="Confidence" htmlFor="submission-confidence" hint={`${confidence}%`}>
              <input
                id="submission-confidence"
                type="range"
                min={0}
                max={100}
                step={1}
                value={confidence}
                onChange={(event) => setConfidence(Number(event.target.value))}
                className="mt-2 w-full accent-primary"
              />
            </Field>
          </div>
          <Field
            label="Evidence notes"
            htmlFor="submission-evidence"
            hint='Include a verbatim quote in double quotes (15+ characters). The app does not fetch the page.'
          >
            <Textarea
              id="submission-evidence"
              value={evidenceNotes}
              onChange={(event) => setEvidenceNotes(event.target.value)}
              rows={3}
              maxLength={4000}
              placeholder='Independent source, quoted excerpt: "…"'
            />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="max-w-md text-[10px] leading-4 text-muted-foreground">
              Submitting computes an immutable SHA-256 artifact digest and runs deterministic scanners, the Gemini security gate, and the isolated runner immediately.
            </p>
            <Button type="submit" loading={submitting}>
              <Send className="size-3.5" /> Submit for verification
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function DisputeDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open a dispute</DialogTitle>
          <DialogDescription>
            A dispute pauses verification and payment changes until an administrator resolves it. Explain the specific
            problem with the task, evidence or payment.
          </DialogDescription>
        </DialogHeader>
        <Field label="Reason" htmlFor="dispute-reason" hint="At least 20 characters.">
          <Textarea
            id="dispute-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Describe the conflict and what you need an administrator to decide."
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(reason)} disabled={reason.trim().length < 20}>
            <Gavel className="size-4" /> Open dispute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RewardDialog({
  open,
  onOpenChange,
  currentMinor,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMinor: number;
  onSubmit: (rewardMinor: number) => void;
  loading: boolean;
}) {
  const [value, setValue] = useState((currentMinor / 100).toFixed(2));
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change the reward</DialogTitle>
          <DialogDescription>
            The reward can only change before funding is captured. The server validates the amount against the
            configured limits.
          </DialogDescription>
        </DialogHeader>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Reward (USD)" htmlFor="edit-reward">
          <Input
            id="edit-reward"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            inputMode="decimal"
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={loading}
            onClick={() => {
              const amount = parseMoneyToMinor(value);
              if (!amount) {
                setError("Enter a valid dollar amount.");
                return;
              }
              onSubmit(amount);
            }}
          >
            Update reward
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
