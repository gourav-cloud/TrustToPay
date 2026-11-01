import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  CircleDollarSign,
  Clock,
  ExternalLink,
  FlaskConical,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, StatCard, SectionHeading } from "@/components/common";
import { PaymentModeBanner } from "@/components/payment-mode-banner";
import { ModeBadge, PaymentStatusBadge, StatusBadge } from "@/components/status-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/states";
import { formatDate, formatMoney, humanize } from "@/lib/format";

export default function EarningsPage() {
  const { user } = useAuth();

  const dashboard = useQuery({
    queryKey: ["dashboard", "reviewer"],
    queryFn: api.dashboards.reviewer,
  });

  const payouts = useQuery({
    queryKey: ["payments", { type: "PAYOUT", page: 1 }],
    queryFn: () => api.payments.list({ type: "PAYOUT", pageSize: 50 }),
  });

  if (dashboard.isLoading) return <LoadingBlock label="Loading your earnings..." />;
  if (dashboard.error || !dashboard.data) {
    return (
      <ErrorState
        message={(dashboard.error as Error)?.message ?? "Earnings are unavailable."}
        onRetry={() => dashboard.refetch()}
      />
    );
  }

  const data = dashboard.data;
  const profileReady = Boolean(data.payoutProfile?.consent && data.payoutProfile?.email);
  const payoutRows = payouts.data?.items ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Reviewer earnings"
        title="Rewards and payout history"
        description="A reward becomes payable only after independent verification passes and the task is authorized. Every row is labelled Simulated or PayPal Sandbox."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/app/profile">
                <Wallet className="size-4" /> Payout profile
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/app/payments">
                Full ledger <ArrowRight className="size-4" />
              </Link>
            </Button>
          </>
        }
      />

      <PaymentModeBanner compact />

      {!profileReady ? (
        <Alert tone="warning" icon={<Wallet className="size-4" />} title="Payout details are incomplete">
          Add a PayPal email and record consent on your profile. Without both, the server will not create a payout
          and a verified reward stays authorized instead of being marked paid.
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Completed earnings"
          value={data.earnings.display}
          hint={`${data.completedPayoutCount} completed payout${data.completedPayoutCount === 1 ? "" : "s"}`}
          icon={<CircleDollarSign className="size-4" />}
          tone="success"
        />
        <StatCard
          label="Pending rewards"
          value={data.pendingRewards.display}
          hint={`${data.pendingRewardCount} authorized or processing`}
          icon={<Clock className="size-4" />}
          tone={data.pendingRewardCount > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="Active assignments"
          value={data.assignments.active}
          hint={`${data.assignments.completed} completed · ${data.assignments.total} total`}
          icon={<BadgeCheck className="size-4" />}
        />
        <StatCard
          label="Submissions"
          value={data.submissionCount}
          hint="Answers submitted for independent verification"
          icon={<ShieldCheck className="size-4" />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <SectionHeading
            title="Recent reward activity"
            description="Each task shows the current task state and its latest payout state."
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link to="/app/reviews">
                  My reviews <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            }
          />
          {data.recentPayouts.length === 0 ? (
            <EmptyState
              icon={<Banknote className="size-5" />}
              title="No reward activity yet"
              description="Accept a funded review, submit an evidenced answer, and the reward appears here after verification."
              action={
                <Button asChild size="sm">
                  <Link to="/app/marketplace">Browse marketplace</Link>
                </Button>
              }
            />
          ) : (
            <Card className="divide-y divide-border">
              {data.recentPayouts.map((row) => {
                const payout = row.payouts[0] ?? null;
                return (
                  <Link
                    key={row.taskId}
                    to={`/app/tasks/${row.taskId}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-sm font-medium">{row.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={row.status} dot={false} />
                        {payout ? <ModeBadge mode={payout.mode as "SIMULATED" | "SANDBOX"} /> : null}
                        {payout ? <PaymentStatusBadge status={payout.status} /> : null}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {row.reward ? formatMoney(row.reward.amountMinor, row.reward.currency) : "-"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {payout?.paidAt
                          ? `Paid ${formatDate(payout.paidAt)}`
                          : payout
                            ? humanize(payout.status)
                            : "No payout yet"}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </Card>
          )}

          <SectionHeading
            className="mt-6"
            title="Payout transactions"
            description="The same ledger the requester and administrators see, scoped to your payouts."
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link to="/app/payments">
                  Filter and export <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            }
          />
          {payouts.isLoading ? (
            <LoadingBlock label="Loading payouts..." />
          ) : payouts.error ? (
            <ErrorState message={(payouts.error as Error).message} onRetry={() => payouts.refetch()} />
          ) : payoutRows.length === 0 ? (
            <EmptyState
              icon={<Wallet className="size-5" />}
              title="No payout transactions"
              description="Once a verified reward is released, the payout transaction appears here with its provider reference."
            />
          ) : (
            <Card className="divide-y divide-border">
              {payoutRows.map((payment) => (
                <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <PaymentStatusBadge status={payment.status} />
                      <ModeBadge mode={payment.mode} />
                      <span className="text-[10px] text-muted-foreground">{humanize(payment.provider)}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {payment.task ? (
                        <Link to={`/app/tasks/${payment.task.id}`} className="hover:text-primary">
                          {payment.task.title}
                        </Link>
                      ) : (
                        payment.taskId
                      )}
                    </p>
                    <p className="truncate font-mono text-[9px] text-muted-foreground">
                      {payment.payoutBatchId ?? payment.id}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{payment.amountDisplay}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {payment.paidAt ? `Paid ${formatDate(payment.paidAt)}` : formatDate(payment.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card className={profileReady ? "border-emerald-500/30" : "border-amber-500/30"}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BadgeCheck className="size-4 text-primary" /> Payout profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Status</span>
                <Badge tone={profileReady ? "success" : "warning"} dot>
                  {profileReady ? "Ready" : "Incomplete"}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">PayPal email</span>
                <span className="max-w-[180px] truncate font-medium">
                  {data.payoutProfile?.email ?? "Not set"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Consent</span>
                <span className="font-medium">{data.payoutProfile?.consent ? "Recorded" : "Not given"}</span>
              </div>
              <Button asChild size="sm" variant="outline" className="mt-1 w-full">
                <Link to="/app/profile">Update payout details</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FlaskConical className="size-4 text-amber-600" /> What the labels mean
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-[11px] leading-5 text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">Simulated</span> rows were created in demo mode. No
                PayPal money moved and no Sandbox API call was made.
              </p>
              <p>
                <span className="font-semibold text-foreground">PayPal Sandbox</span> rows were created against the
                genuine Sandbox API. No real money is involved, but the provider references come from PayPal.
              </p>
              <p>
                A failed payout never deletes the verified answer. It stays visible and can be reconciled by an
                administrator.
              </p>
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardContent className="space-y-2 p-4 text-[11px] leading-5 text-muted-foreground">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <ExternalLink className="size-3.5 text-primary" /> Reviewer economy
              </p>
              <p>
                Your reward is funded by the requester before anyone can accept the task. Funding and payout are two
                separate money movements, so an unfunded task can never become payable.
              </p>
              <p className="font-mono text-[10px]">
                {data.availableCount} available · {data.assignments.total} assigned · {data.submissionCount} submitted
              </p>
              <Button asChild size="sm" variant="ghost" className="w-full">
                <Link to="/app/docs#paypal">How payments work</Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
