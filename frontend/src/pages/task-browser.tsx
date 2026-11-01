import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Filter,
  LayoutGrid,
  ListFilter,
  Search,
  Sparkles,
  Store,
  X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { TaskSummary } from "@/lib/types";
import { PageHeader } from "@/components/common";
import { PaymentModeBanner } from "@/components/payment-mode-banner";
import { TaskCard } from "@/components/task-card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/states";
import { formatDate, formatMoney } from "@/lib/format";
import { CATEGORY_META, CATEGORY_VALUES } from "@/lib/categories";
import { cn } from "@/lib/utils";

type BrowserMode = "marketplace" | "reviews" | "requests" | "all";

const MODE_COPY: Record<
  BrowserMode,
  { eyebrow: string; title: string; description: string; scope: "available" | "assigned" | "requested" | "all" }
> = {
  marketplace: {
    eyebrow: "Reviewer marketplace",
    title: "Funded questions that need a human",
    description:
      "Every task here has an approved reward and confirmed funding. Top-5 ranked specialists receive expiring parallel offers; acceptance is atomic and exclusive.",
    scope: "available",
  },
  reviews: {
    eyebrow: "My reviews",
    title: "Your assigned reviews",
    description:
      "Tasks you accepted, from submission and verification through payout. Open a task to correct a rejected answer or track the reward.",
    scope: "assigned",
  },
  requests: {
    eyebrow: "My requests",
    title: "Reviews you requested",
    description:
      "Track funding, reviewer assignment, independent verification and the reviewer payout for every task your agent escalated.",
    scope: "requested",
  },
  all: {
    eyebrow: "Task administration",
    title: "Every review task",
    description:
      "Administrative view of all review tasks, including failed funding, manual verification queues, disputes and payout status.",
    scope: "all",
  },
};

const STATUS_OPTIONS = [
  "AWAITING_FUNDING",
  "FUNDING_FAILED",
  "FUNDED",
  "OFFERED",
  "REVIEWER_ASSIGNED",
  "VERIFICATION_PENDING",
  "VERIFICATION_REJECTED",
  "NEEDS_MANUAL_REVIEW",
  "PAYMENT_READY",
  "PAYMENT_PROCESSING",
  "PAYMENT_PAID",
  "PAYOUT_FAILED",
  "HANDED_OFF",
  "COMPLETED",
  "DISPUTED",
  "CANCELLED",
];

export default function TaskBrowserPage({ mode }: { mode: BrowserMode }) {
  const copy = MODE_COPY[mode];
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [skill, setSkill] = useState(params.get("skill") ?? "");
  const [sort, setSort] = useState<"newest" | "reward_desc" | "reward_asc">("newest");
  const [minReward, setMinReward] = useState("");
  const [maxReward, setMaxReward] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [offerActionError, setOfferActionError] = useState<string | null>(null);

  const minMinor = minReward ? Math.round(Number(minReward) * 100) : undefined;
  const maxMinor = maxReward ? Math.round(Number(maxReward) * 100) : undefined;

  const query = useQuery({
    queryKey: ["tasks", mode, { page, search, status, category, skill, sort, minMinor, maxMinor }],
    queryFn: () =>
      api.tasks.list({
        scope: copy.scope,
        page,
        pageSize: 12,
        q: search || undefined,
        status: status || undefined,
        category: category || undefined,
        skill: skill || undefined,
        sort,
        minReward: Number.isFinite(minMinor) ? minMinor : undefined,
        maxReward: Number.isFinite(maxMinor) ? maxMinor : undefined,
      }),
  });

  const acceptOffer = useMutation({
    mutationFn: (taskId: string) => api.tasks.accept(taskId),
    onSuccess: async (data) => {
      setOfferActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      navigate(`/app/tasks/${data.task.id}`);
    },
    onError: (err) => {
      setOfferActionError(err instanceof ApiError ? err.message : "Could not accept the task offer.");
    },
  });

  const declineOffer = useMutation({
    mutationFn: (taskId: string) => api.tasks.declineOffer(taskId),
    onSuccess: async () => {
      setOfferActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => {
      setOfferActionError(err instanceof ApiError ? err.message : "Could not decline the task offer.");
    },
  });

  const items = query.data?.items ?? [];
  const pendingOfferedTasks = useMemo(
    () => items.filter((item) => item.myOffer?.status === "PENDING"),
    [items],
  );
  const pagination = query.data?.pagination;
  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;
  const hasFilters = Boolean(search || status || category || skill || minReward || maxReward);

  function resetFilters() {
    setSearch("");
    setStatus("");
    setCategory("");
    setSkill("");
    setMinReward("");
    setMaxReward("");
    setPage(1);
    setParams({}, { replace: true });
  }

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        actions={
          <>
            {mode === "marketplace" ? (
              <Button asChild variant="outline">
                <Link to="/app/reviews">
                  <ListFilter className="size-4" /> My assigned reviews
                </Link>
              </Button>
            ) : null}
            {mode === "reviews" ? (
              <Button asChild variant="outline">
                <Link to="/app/marketplace">
                  <Store className="size-4" /> Browse marketplace
                </Link>
              </Button>
            ) : null}
            {mode === "requests" ? (
              <Button asChild variant="outline">
                <Link to="/app/workspace">
                  <LayoutGrid className="size-4" /> Agent workspace
                </Link>
              </Button>
            ) : null}
            <Button
              variant={showFilters ? "secondary" : "outline"}
              onClick={() => setShowFilters((value) => !value)}
            >
              <Filter className="size-4" /> Filters
              {hasFilters ? <span className="size-1.5 rounded-full bg-primary" aria-hidden /> : null}
            </Button>
          </>
        }
      />

      <PaymentModeBanner compact />

      {offerActionError ? <Alert tone="danger">{offerActionError}</Alert> : null}

      {mode === "marketplace" && pendingOfferedTasks.length > 0 ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="size-4 text-primary" /> Pending Top-5 Specialist Offers ({pendingOfferedTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <p className="text-xs text-muted-foreground">
              You were ranked in the top-5 specialists for these funded tasks. The first specialist to accept claims the assignment atomically and supersedes remaining offers.
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {pendingOfferedTasks.map((task) => {
                const offer = task.myOffer!;
                return (
                  <div
                    key={offer.id}
                    className="flex flex-col justify-between gap-2.5 rounded-md border border-border bg-card p-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge tone="accent" dot>
                          Batch #{offer.batchNumber} · Rank #{offer.rank} ({offer.score} pts)
                        </Badge>
                        <span className="text-xs font-semibold tabular-nums">
                          {formatMoney(task.rewardMinor, task.currency)}
                        </span>
                      </div>
                      <Link to={`/app/tasks/${task.id}`} className="block text-sm font-semibold hover:text-primary">
                        {task.title}
                      </Link>
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="size-3" /> Expires {formatDate(offer.expiresAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        loading={acceptOffer.isPending}
                        onClick={() => acceptOffer.mutate(task.id)}
                      >
                        <CheckCircle2 className="size-3.5" /> Accept offer
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        loading={declineOffer.isPending}
                        onClick={() => declineOffer.mutate(task.id)}
                      >
                        Decline
                      </Button>
                      <Button asChild size="sm" variant="ghost" className="ml-auto h-7 text-xs">
                        <Link to={`/app/tasks/${task.id}`}>Details</Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-3.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                  updateParam("q", event.target.value);
                }}
                placeholder="Search titles, questions and acceptance criteria"
                className="pl-8"
                aria-label="Search tasks"
              />
            </div>
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as typeof sort);
                setPage(1);
              }}
              className="h-9 rounded-md border border-input bg-card px-2.5 text-sm"
              aria-label="Sort tasks"
            >
              <option value="newest">Newest first</option>
              <option value="reward_desc">Highest reward</option>
              <option value="reward_asc">Lowest reward</option>
            </select>
          </div>

          {showFilters ? (
            <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="space-y-1 text-xs font-medium">
                Category
                <select
                  value={category}
                  onChange={(event) => {
                    setCategory(event.target.value);
                    setPage(1);
                    updateParam("category", event.target.value);
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm font-normal"
                >
                  <option value="">Any category</option>
                  {CATEGORY_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {CATEGORY_META[value].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium">
                Status
                <select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value);
                    setPage(1);
                    updateParam("status", event.target.value);
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm font-normal"
                  disabled={copy.scope === "available"}
                >
                  <option value="">Any status</option>
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium">
                Skill
                <Input
                  value={skill}
                  onChange={(event) => {
                    setSkill(event.target.value);
                    setPage(1);
                    updateParam("skill", event.target.value);
                  }}
                  placeholder="Node.js"
                  className="font-normal"
                />
              </label>
              <label className="space-y-1 text-xs font-medium">
                Minimum reward (USD)
                <Input
                  value={minReward}
                  onChange={(event) => {
                    setMinReward(event.target.value);
                    setPage(1);
                  }}
                  placeholder="5"
                  inputMode="decimal"
                  className="font-normal"
                />
              </label>
              <label className="space-y-1 text-xs font-medium">
                Maximum reward (USD)
                <Input
                  value={maxReward}
                  onChange={(event) => {
                    setMaxReward(event.target.value);
                    setPage(1);
                  }}
                  placeholder="50"
                  inputMode="decimal"
                  className="font-normal"
                />
              </label>
            </div>
          ) : null}

          {hasFilters ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <span className="text-[11px] text-muted-foreground">Active filters:</span>
              {search ? <FilterChip label={`“${search}”`} onClear={() => { setSearch(""); updateParam("q", ""); }} /> : null}
              {status ? <FilterChip label={status.replaceAll("_", " ")} onClear={() => { setStatus(""); updateParam("status", ""); }} /> : null}
              {category ? <FilterChip label={CATEGORY_META[category as keyof typeof CATEGORY_META]?.label ?? category} onClear={() => { setCategory(""); updateParam("category", ""); }} /> : null}
              {skill ? <FilterChip label={skill} onClear={() => { setSkill(""); updateParam("skill", ""); }} /> : null}
              {minReward ? <FilterChip label={`≥ $${minReward}`} onClear={() => setMinReward("")} /> : null}
              {maxReward ? <FilterChip label={`≤ $${maxReward}`} onClear={() => setMaxReward("")} /> : null}
              <button type="button" onClick={resetFilters} className="ml-auto text-[11px] font-medium underline underline-offset-2">
                Clear all
              </button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {query.isLoading ? "Loading tasks…" : `${total} task${total === 1 ? "" : "s"}${hasFilters ? " match your filters" : ""}`}
        </p>
        {pagination && totalPages > 1 ? (
          <p className="text-xs text-muted-foreground">
            Page {pagination.page} of {totalPages}
          </p>
        ) : null}
      </div>

      {query.isLoading ? (
        <LoadingBlock label="Loading review tasks…" />
      ) : query.error ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Store className="size-5" />}
          title={
            mode === "marketplace"
              ? "No funded tasks are available"
              : mode === "reviews"
                ? "No reviews assigned yet"
                : mode === "requests"
                  ? "You have not requested a review yet"
                  : "No tasks match these filters"
          }
          description={
            mode === "marketplace"
              ? "New funded questions appear here. If funding is pending on a task you own, open it from My requests."
              : mode === "reviews"
                ? "Browse the marketplace and accept a funded task. Acceptance is exclusive and transaction-safe."
                : mode === "requests"
                  ? "Run an agent session, analyse the question, and create a review task when the AI recommends escalation."
                  : "Adjust the search or clear the filters to see more tasks."
          }
          action={
            hasFilters ? (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : mode === "marketplace" ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/app/reviews">My reviews</Link>
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link to="/app/workspace">Agent workspace</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((task) => (
            <TaskCard key={task.id} task={task} showRequester={mode !== "requests"} />
          ))}
        </div>
      )}

      {pagination && totalPages > 1 ? (
        <div className="flex items-center justify-between border-t border-border pt-4">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            <ArrowLeft className="size-3.5" /> Previous
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 7) }).map((_, index) => {
              const candidate = Math.max(1, Math.min(totalPages - 6, page - 3)) + index;
              if (candidate > totalPages) return null;
              return (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => setPage(candidate)}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md border text-xs",
                    candidate === page
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-muted",
                  )}
                >
                  {candidate}
                </button>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            Next <ArrowRight className="size-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] font-medium">
      {label}
      <button type="button" onClick={onClear} aria-label={`Clear ${label}`} className="text-muted-foreground hover:text-foreground">
        <X className="size-3" />
      </button>
    </span>
  );
}
