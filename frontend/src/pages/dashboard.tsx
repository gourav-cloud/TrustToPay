import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Bot,
  CircleDollarSign,
  Clock,
  CreditCard,
  FileCheck2,
  Gauge,
  Plus,
  ShieldCheck,
  Store,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, StatCard, SectionHeading, DataRow } from "@/components/common";
import { PaymentModeBanner } from "@/components/payment-mode-banner";
import { TaskCard } from "@/components/task-card";
import { StatusBadge } from "@/components/status-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/states";
import { formatDate, formatMoney, humanize, timeAgo, truncate } from "@/lib/format";

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle>{title}</CardTitle>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </CardHeader>
      <CardContent className="h-[190px] pt-2">{children}</CardContent>
    </Card>
  );
}

const CHART_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#38BDF8", "#EF4444", "#64748B"];

function RequesterDashboard() {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ["dashboard", "agent"], queryFn: api.dashboards.agent });

  if (query.isLoading) return <LoadingBlock label="Loading your agent workspace…" />;
  if (query.error || !query.data) {
    return <ErrorState message={(query.error as Error)?.message ?? "Dashboard unavailable."} onRetry={() => query.refetch()} />;
  }

  const data = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Requester workspace"
        title={`Welcome back, ${user?.name.split(" ")[0] ?? "operator"}`}
        description="Your agents escalate when evidence conflicts or specifications are missing. Fund a review, follow verification, and resume the original session with a verified answer."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/app/workspace">
                <Bot className="size-4" /> Agent workspace
              </Link>
            </Button>
            <Button asChild>
              <Link to="/app/workspace?new=1">
                <Plus className="size-4" /> New question
              </Link>
            </Button>
          </>
        }
      />

      <PaymentModeBanner />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active review tasks"
          value={data.tasks.active}
          hint={`${data.tasks.total} total task${data.tasks.total === 1 ? "" : "s"}`}
          icon={<FileCheck2 className="size-4" />}
        />
        <StatCard
          label="Awaiting funding"
          value={data.tasks.awaitingFunding}
          hint="Reviewers cannot accept until funded"
          icon={<CreditCard className="size-4" />}
          tone={data.tasks.awaitingFunding > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="Captured funding"
          value={data.funding.display}
          hint={`${data.fundingCount} completed transaction${data.fundingCount === 1 ? "" : "s"}`}
          icon={<Banknote className="size-4" />}
        />
        <StatCard
          label="Authorized rewards"
          value={data.approvedRewards.display}
          hint={`${data.approvedRewardCount} approved for payout`}
          icon={<Wallet className="size-4" />}
          tone="success"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div>
          <SectionHeading
            title="Recent review tasks"
            description="Funding, review, verification and payment status in one place."
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link to="/app/requests">
                  View all <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            }
          />
          {data.recentTasks.length === 0 ? (
            <EmptyState
              title="No review tasks yet"
              description="Run an analysis in the agent workspace. If the AI is uncertain, you can turn it into a funded human review."
              action={
                <Button asChild size="sm">
                  <Link to="/app/workspace?new=1">Analyze a question</Link>
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.recentTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <ChartCard title="Sessions by status" subtitle="Agent sessions across your workspace">
            {data.sessions.byStatus.length === 0 ? (
              <p className="flex h-full items-center justify-center text-xs text-muted-foreground">No sessions yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.sessions.byStatus} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1E2B42" />
                  <XAxis
                    dataKey="status"
                    tickFormatter={(value: string) => humanize(value).split(" ")[0]}
                    tick={{ fontSize: 9, fill: "#94A3B8" }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(value: number) => [`${value}`, "Sessions"]}
                    labelFormatter={(label: string) => humanize(label)}
                    contentStyle={{
                      fontSize: 11,
                      borderRadius: 8,
                      borderColor: "#1E2B42",
                      backgroundColor: "#0E1522",
                      color: "#F1F5F9",
                    }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {data.sessions.byStatus.map((entry, index) => (
                      <Cell key={entry.status} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Recent sessions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.recentSessions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No sessions yet.</p>
              ) : (
                data.recentSessions.map((session) => (
                  <Link
                    key={session.id}
                    to={`/app/sessions/${session.id}`}
                    className="block rounded-md border border-border bg-background px-3 py-2 transition-colors hover:border-primary/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-xs font-medium">{session.title}</p>
                      <StatusBadge status={session.status} dot={false} />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <span>
                        {session.confidence !== null
                          ? `confidence ${session.confidence.toFixed(2)}`
                          : "no analysis"}
                        {session.action ? ` · ${humanize(session.action)}` : ""}
                      </span>
                      <span>{timeAgo(session.createdAt)}</span>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <DemoScenarioGuide />
    </div>
  );
}

function DemoScenarioGuide() {
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          <CardTitle>Suggested demo path</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          Seeded scenario A is ready for funding. Follow it end to end in about two minutes; scenarios I and J are funded reviews in the crypto and conceptual domains.
        </p>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          {[
            "Open Agent workspace and select a seeded question (hardware, programming, crypto or conceptual).",
            "Fund the $15.00 reward (simulated or PayPal Sandbox).",
            "Sign in as the reviewer, accept the task, and submit the evidenced answer.",
            "Watch verification pass, release the reward, and resume the AI session.",
          ].map((step, index) => (
            <li key={step} className="flex gap-2 rounded-md border border-border bg-background p-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                {index + 1}
              </span>
              <span className="leading-5 text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/app/workspace">Open workspace</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link to="/app/docs">Read the demo script</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewerDashboard() {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ["dashboard", "reviewer"], queryFn: api.dashboards.reviewer });

  if (query.isLoading) return <LoadingBlock label="Loading reviewer workspace…" />;
  if (query.error || !query.data) {
    return <ErrorState message={(query.error as Error)?.message ?? "Dashboard unavailable."} onRetry={() => query.refetch()} />;
  }
  const data = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reviewer workspace"
        title={`Good to see you, ${user?.name.split(" ")[0] ?? "reviewer"}`}
        description="Accept a narrowly scoped task, answer with evidence, and track independent verification and your PayPal reward."
        actions={
          <Button asChild>
            <Link to="/app/marketplace">
              <Store className="size-4" /> Browse marketplace
            </Link>
          </Button>
        }
      />

      <PaymentModeBanner />

      {!data.approval.approved ? (
        <Alert tone="warning" icon={<AlertTriangle className="size-4" />} title="Reviewer approval pending">
          An administrator must approve your reviewer account before you can accept tasks. In demo mode seeded
          reviewers are already approved.
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Available tasks"
          value={data.availableCount}
          hint="Funded and unassigned"
          icon={<Store className="size-4" />}
          tone={data.availableCount > 0 ? "info" : "neutral"}
        />
        <StatCard label="Active assignments" value={data.assignments.active} hint={`${data.assignments.total} total`} icon={<Bot className="size-4" />} />
        <StatCard
          label="Simulated / Sandbox earnings"
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
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div>
          <SectionHeading
            title="Available now"
            description="Funded tasks you can accept. First acceptance wins."
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link to="/app/marketplace">
                  See all <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            }
          />
          {data.availableTasks.length === 0 ? (
            <EmptyState
              title="No open tasks right now"
              description="New funded reviews appear here. You can also check your assigned reviews."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link to="/app/reviews">My reviews</Link>
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.availableTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Payout readiness</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {data.payoutProfile?.consent && data.payoutProfile.email ? (
                <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-emerald-200">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                  <div>
                    <p className="font-medium text-emerald-100">PayPal payouts ready</p>
                    <p className="mt-0.5 break-all text-emerald-200/90">{data.payoutProfile.email}</p>
                  </div>
                </div>
              ) : (
                <>
                  <Alert tone="warning">Add a PayPal email and record consent before a reward can be paid.</Alert>
                  <Button asChild size="sm" variant="outline" className="w-full">
                    <Link to="/app/profile">Set up payout profile</Link>
                  </Button>
                </>
              )}
              {data.skills.length > 0 ? (
                <div>
                  <p className="font-medium">Skills</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {data.skills.map((skill) => (
                      <Badge key={skill} tone="neutral">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Add reviewer skills so requesters can see your expertise.{" "}
                  <Link to="/app/profile" className="text-primary underline underline-offset-2">
                    Edit profile
                  </Link>
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Recent reward activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.recentPayouts.length === 0 ? (
                <p className="text-xs text-muted-foreground">No rewards yet.</p>
              ) : (
                data.recentPayouts.map((row) => (
                  <Link
                    key={row.taskId}
                    to={`/app/tasks/${row.taskId}`}
                    className="block rounded-md border border-border bg-background px-3 py-2 hover:border-primary/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-xs font-medium">{row.title}</p>
                      <span className="shrink-0 text-xs font-semibold tabular-nums">
                        {row.reward ? formatMoney(row.reward.amountMinor, row.reward.currency) : "—"}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                      <StatusBadge status={row.status} dot={false} />
                      <span>
                        {row.payouts[0]
                          ? `${row.payouts[0].mode === "SIMULATED" ? "Simulated" : "Sandbox"} · ${humanize(row.payouts[0].status)}`
                          : "No payout"}
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const query = useQuery({ queryKey: ["dashboard", "admin"], queryFn: api.dashboards.admin });

  if (query.isLoading) return <LoadingBlock label="Loading administrative metrics…" />;
  if (query.error || !query.data) {
    return <ErrorState message={(query.error as Error)?.message ?? "Dashboard unavailable."} onRetry={() => query.refetch()} />;
  }
  const data = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="System overview"
        description="Database-backed metrics, payment ledger health, and tasks that need attention. All values come from the local database."
        actions={
          <Button asChild variant="outline">
            <Link to="/app/integrations">
              <ShieldCheck className="size-4" /> Integration status
            </Link>
          </Button>
        }
      />

      <PaymentModeBanner />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Review tasks"
          value={data.tasks.total}
          hint={`${data.submissions} submission${data.submissions === 1 ? "" : "s"} · ${data.verifications.total} verification run${data.verifications.total === 1 ? "" : "s"}`}
          icon={<FileCheck2 className="size-4" />}
        />
        <StatCard
          label="Completed funding"
          value={data.funding.completed.display}
          hint={`${data.funding.simulatedCount} simulated · ${data.funding.sandboxCount} sandbox`}
          icon={<CreditCard className="size-4" />}
        />
        <StatCard
          label="Completed payouts"
          value={data.payouts.completed.display}
          hint={`${data.payouts.completedCount} paid · ${data.payouts.processingCount} processing`}
          icon={<Wallet className="size-4" />}
          tone="success"
        />
        <StatCard
          label="Needs attention"
          value={data.failedPayments + data.openDisputes + data.users.pendingReviewerApprovals}
          hint={`${data.failedPayments} failed payments · ${data.openDisputes} disputes · ${data.users.pendingReviewerApprovals} pending reviewers`}
          icon={<AlertTriangle className="size-4" />}
          tone={data.failedPayments + data.openDisputes > 0 ? "danger" : "neutral"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <ChartCard title="Tasks by status" subtitle="Current lifecycle distribution">
          {data.tasks.byStatus.length === 0 ? (
            <p className="flex h-full items-center justify-center text-xs text-muted-foreground">No tasks yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.tasks.byStatus} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1E2B42" />
                <XAxis
                  dataKey="status"
                  tickFormatter={(value: string) => humanize(value).split(" ")[0]}
                  tick={{ fontSize: 8, fill: "#94A3B8" }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={46}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value: number) => [`${value}`, "Tasks"]}
                  labelFormatter={(label: string) => humanize(label)}
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 8,
                    borderColor: "#1E2B42",
                    backgroundColor: "#0E1522",
                    color: "#F1F5F9",
                  }}
                />
                <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Ledger split</CardTitle>
            <p className="text-xs text-muted-foreground">Simulated vs genuine Sandbox transactions</p>
          </CardHeader>
          <CardContent>
            <dl className="space-y-1">
              <DataRow label="Simulated funding">
                <span className="font-semibold">{data.funding.simulated.display}</span>{" "}
                <span className="text-xs text-muted-foreground">({data.funding.simulatedCount})</span>
              </DataRow>
              <DataRow label="Sandbox funding">
                <span className="font-semibold">{data.funding.sandbox.display}</span>{" "}
                <span className="text-xs text-muted-foreground">({data.funding.sandboxCount})</span>
              </DataRow>
              <DataRow label="Approved rewards">
                {data.approvedRewards.display}{" "}
                <span className="text-xs text-muted-foreground">({data.approvedRewardCount})</span>
              </DataRow>
              <DataRow label="Paid out">{data.payouts.completed.display}</DataRow>
              <DataRow label="Users">
                {data.users.total}{" "}
                <span className="text-xs text-muted-foreground">
                  ({data.users.byRole.map((row) => `${row.count} ${humanize(row.role).toLowerCase()}`).join(", ")})
                </span>
              </DataRow>
              <DataRow label="Webhook events">
                {data.webhooks.total}{" "}
                <span className="text-xs text-muted-foreground">
                  ({data.webhooks.byStatus.map((row) => `${row.count} ${row.status.toLowerCase()}`).join(", ") || "none"})
                </span>
              </DataRow>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/app/payments">Payment ledger</Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link to="/app/admin?tab=users">
                  <Users className="size-3.5" /> Users
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <SectionHeading title="Tasks needing attention" description="Failed payments, disputes, and manual verification." />
          {data.attentionTasks.length === 0 ? (
            <EmptyState title="Nothing needs attention" description="No failed payments, open disputes, or manual reviews." />
          ) : (
            <div className="space-y-2">
              {data.attentionTasks.map((task) => (
                <Card key={task.id} className="p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link to={`/app/tasks/${task.id}`} className="line-clamp-1 text-sm font-medium hover:text-primary">
                        {task.title}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {task.requester.name} · reward {task.reward ? task.reward.amountDisplay : "—"}
                      </p>
                    </div>
                    <StatusBadge status={task.status} />
                  </div>
                  {task.failedPayments.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {task.failedPayments.map((payment) => (
                        <p key={payment.id} className="flex items-start gap-1.5 text-[11px] text-red-400">
                          <XCircle className="mt-0.5 size-3 shrink-0" />
                          <span>
                            {payment.type} · {payment.mode === "SIMULATED" ? "simulated" : "sandbox"} ·{" "}
                            {truncate(payment.message ?? "Failed", 120)}
                          </span>
                        </p>
                      ))}
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Recent audit events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentAudit.map((entry) => (
              <div key={entry.id} className="border-b border-border/60 pb-2 last:border-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-medium">{humanize(entry.action)}</p>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{formatDate(entry.createdAt)}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {entry.actor?.name ?? "System"} · {entry.entityType}
                </p>
              </div>
            ))}
            <Button asChild size="sm" variant="ghost" className="w-full">
              <Link to="/app/admin?tab=audit">Full audit trail</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  if (user?.role === "ADMIN") return <AdminDashboard />;
  if (user?.role === "REVIEWER") return <ReviewerDashboard />;
  return <RequesterDashboard />;
}
