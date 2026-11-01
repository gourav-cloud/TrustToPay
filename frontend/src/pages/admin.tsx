import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  CheckCircle2,
  FileCode2,
  Gavel,
  History,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
  Wallet,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/common";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PaymentLedgerGridTab,
  SecurityVerificationsGridTab,
  SkillAssessmentsGridTab,
  SpecialistsGridTab,
  TasksDispatchGridTab,
} from "@/components/admin/admin-ag-grids";
import { formatDate, humanize, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab =
  | "specialists"
  | "tasks"
  | "verifications"
  | "payments"
  | "assessments"
  | "users"
  | "disputes"
  | "audit";

const VALID_TABS: Tab[] = [
  "specialists",
  "tasks",
  "verifications",
  "payments",
  "assessments",
  "users",
  "disputes",
  "audit",
];

type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  isReviewerApproved: boolean;
  createdAt: string;
  profile: { payoutEmail: string | null; payoutConsent: boolean; payoutProvider: string } | null;
  skills: { id: string; name: string }[];
  stats: { requestedTasks: number; submissions: number };
};

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  createdAt: string;
  actor: { id: string; name: string; email: string; role: string } | null;
};

type DisputeRow = {
  id: string;
  status: string;
  reason: string;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  openedBy: { id: string; name: string; email: string; role: string };
  task: {
    id: string;
    title: string;
    status: string;
    reward: { amountMinor: number; currency: string } | null;
    requester: { id: string; name: string; email: string };
    assignment: { reviewer: { id: string; name: string } } | null;
  };
};

export default function AdminConsolePage() {
  const [params, setParams] = useSearchParams();
  const initialTab = (params.get("tab") as Tab) || "specialists";
  const [tab, setTab] = useState<Tab>(VALID_TABS.includes(initialTab) ? initialTab : "specialists");

  function changeTab(next: string) {
    setTab(next as Tab);
    const updated = new URLSearchParams(params);
    updated.set("tab", next);
    setParams(updated, { replace: true });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Admin Operations Console"
        description="AG Grid Community operational tables, Elastic hybrid specialist discovery, security verification telemetry, read-only payment ledger, disputes, and immutable audit trail."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/app/tasks">
                <ShieldCheck className="size-4" /> All review tasks
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/app/integrations">Integration status</Link>
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="specialists" className="gap-1.5">
            <Users className="size-3.5" /> Specialists (AG Grid)
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1.5">
            <FileCode2 className="size-3.5" /> Tasks & Dispatch
          </TabsTrigger>
          <TabsTrigger value="verifications" className="gap-1.5">
            <ShieldAlert className="size-3.5" /> Security & Verification
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5">
            <Wallet className="size-3.5" /> Payment Ledger
          </TabsTrigger>
          <TabsTrigger value="assessments" className="gap-1.5">
            <Award className="size-3.5" /> Skill Assessments
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5">
            <UserCheck className="size-3.5" /> All Accounts
          </TabsTrigger>
          <TabsTrigger value="disputes" className="gap-1.5">
            <Gavel className="size-3.5" /> Disputes
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5">
            <History className="size-3.5" /> Audit trail
          </TabsTrigger>
        </TabsList>
        <TabsContent value="specialists">
          <SpecialistsGridTab />
        </TabsContent>
        <TabsContent value="tasks">
          <TasksDispatchGridTab />
        </TabsContent>
        <TabsContent value="verifications">
          <SecurityVerificationsGridTab />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentLedgerGridTab />
        </TabsContent>
        <TabsContent value="assessments">
          <SkillAssessmentsGridTab />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="disputes">
          <DisputesTab />
        </TabsContent>
        <TabsContent value="audit">
          <AuditTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UsersTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [role, setRole] = useState("");
  const [approved, setApproved] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["admin", "users", { page, role, approved, search }],
    queryFn: () => api.admin.users({ page, role: role || undefined, approved: approved || undefined, q: search || undefined }),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { isReviewerApproved?: boolean; isActive?: boolean } }) =>
      api.admin.setEligibility(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not update the user."),
  });

  const items = (query.data?.items ?? []) as unknown as AdminUser[];
  const pagination = query.data?.pagination;

  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Card>
        <CardContent className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search name or email"
              className="pl-8"
              aria-label="Search users"
            />
          </div>
          <Select
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              setPage(1);
            }}
            aria-label="Filter role"
            className="sm:w-40"
          >
            <option value="">All roles</option>
            <option value="REQUESTER">Requester</option>
            <option value="REVIEWER">Reviewer</option>
            <option value="ADMIN">Admin</option>
          </Select>
          <Select
            value={approved}
            onChange={(event) => {
              setApproved(event.target.value);
              setPage(1);
            }}
            aria-label="Filter reviewer approval"
            className="sm:w-48"
          >
            <option value="">Any approval</option>
            <option value="true">Approved reviewers</option>
            <option value="false">Pending / suspended</option>
          </Select>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <LoadingBlock label="Loading users…" />
      ) : query.error ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Users className="size-5" />} title="No users match" description="Try another search or filter." />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[1.4fr_0.7fr_0.7fr_1fr_1fr] gap-2 border-b border-border bg-muted/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
            <span>User</span>
            <span>Role</span>
            <span>Status</span>
            <span>Payout</span>
            <span className="text-right">Actions</span>
          </div>
          <div className="divide-y divide-border">
            {items.map((item) => {
              const self = item.id === user?.id;
              return (
                <div key={item.id} className="grid gap-2 px-4 py-3 lg:grid-cols-[1.4fr_0.7fr_0.7fr_1fr_1fr] lg:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{item.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{item.email}</p>
                    <p className="text-[9px] text-muted-foreground">Joined {formatDate(item.createdAt)}</p>
                  </div>
                  <div>
                    <Badge tone={item.role === "ADMIN" ? "accent" : item.role === "REVIEWER" ? "info" : "neutral"}>
                      {humanize(item.role)}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <Badge tone={item.isActive ? "success" : "danger"} dot>
                      {item.isActive ? "Active" : "Deactivated"}
                    </Badge>
                    {item.role === "REVIEWER" ? (
                      <Badge tone={item.isReviewerApproved ? "success" : "warning"} dot>
                        {item.isReviewerApproved ? "Approved" : "Not approved"}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {item.role === "REVIEWER" ? (
                      item.profile?.payoutEmail ? (
                        <>
                          <p className="truncate">{item.profile.payoutEmail}</p>
                          <p>{item.profile.payoutConsent ? "Consent recorded" : "No consent"}</p>
                        </>
                      ) : (
                        <p>No payout email</p>
                      )
                    ) : (
                      <p>{item.stats.requestedTasks} requested tasks</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 lg:justify-end">
                    {item.role === "REVIEWER" ? (
                      <Button
                        size="sm"
                        variant={item.isReviewerApproved ? "outline" : "default"}
                        className="h-7 px-2 text-[10px]"
                        disabled={self}
                        loading={update.isPending}
                        onClick={() =>
                          update.mutate({ id: item.id, input: { isReviewerApproved: !item.isReviewerApproved } })
                        }
                      >
                        {item.isReviewerApproved ? <UserX className="size-3" /> : <UserCheck className="size-3" />}
                        {item.isReviewerApproved ? "Suspend" : "Approve"}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className={cn("h-7 px-2 text-[10px]", item.isActive ? "text-destructive" : "")}
                      disabled={self}
                      onClick={() => update.mutate({ id: item.id, input: { isActive: !item.isActive } })}
                    >
                      {item.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {pagination && pagination.totalPages > 1 ? (
        <Pagination page={page} totalPages={pagination.totalPages} onChange={setPage} total={pagination.total} />
      ) : null}
    </div>
  );
}

function DisputesTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("OPEN");
  const [selected, setSelected] = useState<DisputeRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["admin", "disputes", { page, status }],
    queryFn: () => api.admin.disputes({ page, status: status || undefined }),
  });

  const resolve = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { status: "RESOLVED" | "REJECTED"; resolution: string; restoreTo?: string };
    }) => api.admin.resolveDispute(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "disputes"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["task"] });
      setSelected(null);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not resolve the dispute."),
  });

  const items = (query.data?.items ?? []) as unknown as DisputeRow[];
  const pagination = query.data?.pagination;

  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3.5">
          <p className="text-xs text-muted-foreground">
            Disputes pause verification and payment changes. Resolving one restores the task to a valid state.
          </p>
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            aria-label="Filter dispute status"
            className="w-44"
          >
            <option value="">All disputes</option>
            <option value="OPEN">Open</option>
            <option value="RESOLVED">Resolved</option>
            <option value="REJECTED">Rejected</option>
          </Select>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <LoadingBlock label="Loading disputes…" />
      ) : query.error ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Gavel className="size-5" />}
          title="No disputes match"
          description="Open disputes from a task when the requester or reviewer needs an administrator decision."
        />
      ) : (
        <div className="space-y-2">
          {items.map((dispute) => (
            <Card key={dispute.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link to={`/app/tasks/${dispute.task.id}`} className="text-sm font-semibold hover:text-primary">
                      {dispute.task.title}
                    </Link>
                    <p className="text-[10px] text-muted-foreground">
                      {dispute.openedBy.name} ({humanize(dispute.openedBy.role)}) · {formatDate(dispute.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Badge tone={dispute.status === "OPEN" ? "danger" : dispute.status === "RESOLVED" ? "success" : "neutral"} dot>
                      {humanize(dispute.status)}
                    </Badge>
                    <Badge tone="neutral">{dispute.task.status.replaceAll("_", " ")}</Badge>
                  </div>
                </div>
                <p className="rounded-md border border-border bg-muted/30 p-2.5 text-xs leading-5">{dispute.reason}</p>
                {dispute.resolution ? (
                  <p className="text-[11px] leading-5 text-muted-foreground">
                    <span className="font-semibold text-foreground">Resolution:</span> {dispute.resolution}
                  </p>
                ) : null}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-muted-foreground">
                    Reviewer: {dispute.task.assignment?.reviewer.name ?? "unassigned"} · Requester: {dispute.task.requester.name}
                  </p>
                  {dispute.status === "OPEN" ? (
                    <Button size="sm" variant="outline" onClick={() => setSelected(dispute)}>
                      Resolve <ArrowRight className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {pagination && pagination.totalPages > 1 ? (
        <Pagination page={page} totalPages={pagination.totalPages} onChange={setPage} total={pagination.total} />
      ) : null}

      <ResolveDisputeDialog
        dispute={selected}
        onClose={() => setSelected(null)}
        onSubmit={(status, resolution, restoreTo) =>
          selected ? resolve.mutate({ id: selected.id, input: { status, resolution, restoreTo } }) : undefined
        }
        loading={resolve.isPending}
      />
    </div>
  );
}

function ResolveDisputeDialog({
  dispute,
  onClose,
  onSubmit,
  loading,
}: {
  dispute: DisputeRow | null;
  onClose: () => void;
  onSubmit: (status: "RESOLVED" | "REJECTED", resolution: string, restoreTo?: string) => void;
  loading: boolean;
}) {
  const [status, setStatus] = useState<"RESOLVED" | "REJECTED">("RESOLVED");
  const [resolution, setResolution] = useState("");
  const [restoreTo, setRestoreTo] = useState("");
  return (
    <Dialog open={Boolean(dispute)} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve dispute</DialogTitle>
          <DialogDescription>
            {dispute ? dispute.task.title : ""}. The task will be restored to a valid lifecycle state and the decision
            is written to the audit trail.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Outcome" htmlFor="dispute-status">
            <Select id="dispute-status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
              <option value="RESOLVED">Resolved in favour of restoration</option>
              <option value="REJECTED">Rejected / no change</option>
            </Select>
          </Field>
          <Field label="Restore task to" htmlFor="dispute-restore" hint="Automatic uses the current payment state.">
            <Select id="dispute-restore" value={restoreTo} onChange={(event) => setRestoreTo(event.target.value)}>
              <option value="">Automatic</option>
              <option value="PAYMENT_READY">Payment ready</option>
              <option value="PAYMENT_PAID">Payment paid</option>
              <option value="VERIFICATION_REJECTED">Verification rejected</option>
            </Select>
          </Field>
        </div>
        <Field label="Resolution note" htmlFor="dispute-resolution" hint="Required; at least 10 characters.">
          <Textarea
            id="dispute-resolution"
            value={resolution}
            onChange={(event) => setResolution(event.target.value)}
            rows={3}
            placeholder="Explain the judgment and the next step for both parties."
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={loading}
            disabled={resolution.trim().length < 10}
            onClick={() => onSubmit(status, resolution, restoreTo || undefined)}
          >
            <CheckCircle2 className="size-4" /> Record resolution
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AuditTab() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["admin", "audit", { page, action }],
    queryFn: () => api.admin.audit({ page, action: action || undefined }),
  });

  const items = ((query.data?.items ?? []) as unknown as AuditRow[]).filter((item) => {
    if (!search.trim()) return true;
    const haystack = `${item.action} ${item.entityType} ${item.entityId} ${item.actor?.name ?? ""} ${item.actor?.email ?? ""}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });
  const pagination = query.data?.pagination;
  const actions = Array.from(new Set(items.map((item) => item.action)));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-2 p-3.5 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter visible audit rows"
              className="pl-8"
              aria-label="Filter audit rows"
            />
          </div>
          <Select
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
            aria-label="Filter audit action"
            className="sm:w-64"
          >
            <option value="">All actions</option>
            {(actions.length ? actions : ["TASK_CREATED", "TASK_ACCEPTED", "FUNDING_CAPTURED", "PAYOUT_COMPLETED"]).map((option) => (
              <option key={option} value={option}>
                {humanize(option)}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <LoadingBlock label="Loading audit trail…" />
      ) : query.error ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={<History className="size-5" />} title="No audit entries" description="Administrative and lifecycle actions appear here." />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[1.2fr_0.8fr_1.2fr_1.4fr_0.7fr] gap-2 border-b border-border bg-muted/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
            <span>Actor</span>
            <span>Action</span>
            <span>Entity</span>
            <span>Metadata</span>
            <span className="text-right">When</span>
          </div>
          <div className="divide-y divide-border">
            {items.map((item) => (
              <div key={item.id} className="grid gap-1 px-4 py-2.5 lg:grid-cols-[1.2fr_0.8fr_1.2fr_1.4fr_0.7fr] lg:items-start">
                <div>
                  <p className="text-xs font-medium">{item.actor?.name ?? "System"}</p>
                  <p className="text-[9px] text-muted-foreground">{item.actor?.role ?? "automation"}</p>
                </div>
                <div>
                  <Badge tone="accent">{humanize(item.action)}</Badge>
                </div>
                <div>
                  <p className="text-[10px] font-medium">{item.entityType}</p>
                  <p className="truncate font-mono text-[9px] text-muted-foreground">{item.entityId}</p>
                </div>
                <p className="line-clamp-2 break-all font-mono text-[9px] leading-4 text-muted-foreground">
                  {item.metadata ? JSON.stringify(item.metadata) : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground lg:text-right">{timeAgo(item.createdAt)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {pagination && pagination.totalPages > 1 ? (
        <Pagination page={page} totalPages={pagination.totalPages} onChange={setPage} total={pagination.total} />
      ) : null}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
  total,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  total: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ArrowLeft className="size-3.5" /> Previous
      </Button>
      <p className="text-xs text-muted-foreground">
        Page {page} of {totalPages} · {total} records
      </p>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next <ArrowRight className="size-3.5" />
      </Button>
    </div>
  );
}
