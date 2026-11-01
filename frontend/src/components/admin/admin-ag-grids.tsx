import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  FileCode2,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
  Wallet,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type {
  AdminAssessmentRow,
  AdminPaymentLedgerRow,
  AdminSpecialistRow,
  AdminTaskRow,
  AdminVerificationRow,
} from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/states";
import {
  PaymentStatusBadge,
  PayoutAvailabilityBadge,
  SecurityVerdictBadge,
  StatusBadge,
  VerificationBadge,
} from "@/components/status-badges";
import { formatDateShort, humanize } from "@/lib/format";

function GridToolbar({
  title,
  subtitle,
  quickFilter,
  onQuickFilterChange,
  onExportCsv,
  onRefresh,
  isRefreshing,
  extraActions,
  searchPlaceholder = "Quick filter rows…",
}: {
  title: string;
  subtitle: string;
  quickFilter: string;
  onQuickFilterChange: (value: string) => void;
  onExportCsv: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  extraActions?: React.ReactNode;
  searchPlaceholder?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={quickFilter}
              onChange={(event) => onQuickFilterChange(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 pl-8 text-xs"
              aria-label={searchPlaceholder}
            />
          </div>
          {extraActions}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onRefresh}
            loading={isRefreshing}
          >
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onExportCsv}
          >
            <Download className="size-3.5" /> Export CSV
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 1. Specialist Management Grid + Elastic Hybrid Discovery Panel
 */
export function SpecialistsGridTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const gridRef = useRef<AgGridReact<AdminSpecialistRow>>(null);
  const [quickFilter, setQuickFilter] = useState("");
  const [discoveryQuery, setDiscoveryQuery] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const specialistsQuery = useQuery({
    queryKey: ["admin", "specialists"],
    queryFn: () => api.admin.specialists({ pageSize: 100 }),
  });

  const elasticStatusQuery = useQuery({
    queryKey: ["admin", "elastic", "status"],
    queryFn: () => api.admin.elasticStatus(),
  });

  const updateEligibility = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { isReviewerApproved?: boolean; isActive?: boolean } }) =>
      api.admin.setEligibility(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "specialists"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setErrorMessage(null);
      setActionMessage("Specialist eligibility updated and synchronized with discovery index.");
    },
    onError: (err) => setErrorMessage(err instanceof ApiError ? err.message : "Could not update specialist."),
  });

  const reindexMutation = useMutation({
    mutationFn: () => api.admin.elasticReindex(),
    onSuccess: (res) => {
      setErrorMessage(null);
      if (!res.elasticConfigured) {
        setActionMessage(
          `Database matching active (${res.indexName}). Configure ELASTIC_ENABLED=true, ELASTICSEARCH_URL, and ELASTICSEARCH_API_KEY to enable live Elastic indexing.`,
        );
      } else {
        setActionMessage(
          `Elastic index "${res.indexName}" synchronized: ${res.indexedCount} indexed, ${res.removedCount} deactivated.`,
        );
      }
    },
    onError: (err) => setErrorMessage(err instanceof ApiError ? err.message : "Elastic reindex failed."),
  });

  const searchMutation = useMutation({
    mutationFn: (q: string) => api.admin.elasticSearch({ query: q, minimumSkillLevel: 1 }),
  });

  const rows = specialistsQuery.data?.items ?? [];
  const elasticInfo = elasticStatusQuery.data?.elastic;

  const columnDefs = useMemo<ColDef<AdminSpecialistRow>[]>(
    () => [
      {
        headerName: "Specialist",
        field: "name",
        minWidth: 190,
        flex: 1.2,
        filter: true,
        sortable: true,
        cellRenderer: (params: ICellRendererParams<AdminSpecialistRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <div className="flex flex-col justify-center py-1 leading-tight">
              <span className="truncate font-medium text-foreground">{row.name}</span>
              <span className="truncate text-[11px] text-muted-foreground">{row.email}</span>
            </div>
          );
        },
      },
      {
        headerName: "Verified Skills (L1–L3)",
        field: "verifiedSkillsSummary",
        minWidth: 220,
        flex: 1.5,
        filter: true,
        sortable: true,
        tooltipField: "verifiedSkillsSummary",
        cellRenderer: (params: ICellRendererParams<AdminSpecialistRow>) => {
          const row = params.data;
          if (!row) return null;
          if (row.verifiedSkills.length === 0) {
            return <span className="text-xs text-muted-foreground">No verified skills</span>;
          }
          return (
            <div className="flex items-center gap-1.5 overflow-hidden text-xs">
              <span className="font-semibold text-primary">Max L{row.highestSkillLevel}</span>
              <span aria-hidden="true" className="text-muted-foreground">
                ·
              </span>
              <span className="truncate text-foreground">{row.verifiedSkillsSummary}</span>
            </div>
          );
        },
      },
      {
        headerName: "Availability",
        field: "availabilityStatus",
        minWidth: 145,
        filter: true,
        sortable: true,
        cellRenderer: (params: ICellRendererParams<AdminSpecialistRow>) => {
          const status = params.data?.availabilityStatus ?? "PENDING_APPROVAL";
          const color =
            status === "AVAILABLE"
              ? "text-emerald-400"
              : status === "AT_CAPACITY"
                ? "text-amber-400"
                : status === "PENDING_APPROVAL"
                  ? "text-blue-400"
                  : "text-red-400";
          return <span className={`text-xs font-medium ${color}`}>{humanize(status)}</span>;
        },
      },
      {
        headerName: "Workload",
        field: "activeWorkload",
        minWidth: 115,
        sortable: true,
        filter: "agNumberColumnFilter",
        valueFormatter: (params) => {
          const row = params.data;
          return row ? `${row.activeWorkload} / ${row.maxWorkload} active` : "0 / 3";
        },
      },
      {
        headerName: "Success Rate",
        field: "successRate",
        minWidth: 130,
        sortable: true,
        filter: "agNumberColumnFilter",
        cellRenderer: (params: ICellRendererParams<AdminSpecialistRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <span className="text-xs">
              <strong className="font-semibold text-foreground">{row.successRate}%</strong>{" "}
              <span className="text-muted-foreground">
                ({row.acceptedSubmissions} pass / {row.rejectedSubmissions} fail)
              </span>
            </span>
          );
        },
      },
      {
        headerName: "Avg Turnaround",
        field: "avgTurnaroundMinutes",
        minWidth: 130,
        sortable: true,
        valueFormatter: (params) =>
          params.value !== null && params.value !== undefined ? `${params.value}m` : "—",
      },
      {
        headerName: "Actions",
        colId: "actions",
        minWidth: 195,
        sortable: false,
        filter: false,
        cellRenderer: (params: ICellRendererParams<AdminSpecialistRow>) => {
          const row = params.data;
          if (!row) return null;
          const isSelf = row.id === user?.id;
          return (
            <div className="flex items-center gap-1.5 py-1">
              <Button
                type="button"
                size="sm"
                variant={row.isReviewerApproved ? "outline" : "default"}
                className="h-7 px-2 text-[11px]"
                disabled={isSelf || updateEligibility.isPending}
                onClick={() =>
                  updateEligibility.mutate({
                    id: row.id,
                    input: { isReviewerApproved: !row.isReviewerApproved },
                  })
                }
              >
                {row.isReviewerApproved ? <UserX className="size-3" /> : <UserCheck className="size-3" />}
                {row.isReviewerApproved ? "Suspend" : "Approve"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                disabled={isSelf || updateEligibility.isPending}
                onClick={() =>
                  updateEligibility.mutate({
                    id: row.id,
                    input: { isActive: !row.isActive },
                  })
                }
              >
                {row.isActive ? "Deactivate" : "Reactivate"}
              </Button>
            </div>
          );
        },
      },
    ],
    [updateEligibility, user?.id],
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({
      resizable: true,
      editable: false,
    }),
    [],
  );

  return (
    <div className="space-y-4">
      {errorMessage ? <Alert tone="danger">{errorMessage}</Alert> : null}
      {actionMessage ? <Alert tone="info">{actionMessage}</Alert> : null}

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Database className="size-3.5 text-primary" />
              <span className="font-semibold text-foreground">Elastic Intelligent Specialist Discovery</span>
              <span aria-hidden="true" className="text-muted-foreground">
                ·
              </span>
              <span className="text-muted-foreground">
                Mode: <strong className="text-foreground">{elasticInfo?.mode ?? "DATABASE_FALLBACK"}</strong>
              </span>
              <span aria-hidden="true" className="text-muted-foreground">
                ·
              </span>
              <span className="text-muted-foreground">
                Embedding model: <code className="font-mono text-[11px]">{elasticInfo?.embeddingModel ?? "jina-embeddings-v3"}</code>
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Hybrid keyword + Jina vector retrieval discovers candidate specialist IDs while the relational database enforces verified skill levels, workload limits, and eligibility.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={discoveryQuery}
              onChange={(e) => setDiscoveryQuery(e.target.value)}
              placeholder="Test semantic skill discovery (e.g., constant-time token crypto)…"
              className="h-8 w-64 text-xs"
              aria-label="Test semantic skill discovery"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={discoveryQuery.trim().length < 2}
              loading={searchMutation.isPending}
              onClick={() => searchMutation.mutate(discoveryQuery)}
            >
              <Search className="size-3.5" /> Test Hybrid Search
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              loading={reindexMutation.isPending}
              onClick={() => reindexMutation.mutate()}
            >
              <RefreshCw className="size-3.5" /> Sync Elastic Index
            </Button>
          </div>
        </CardContent>
        {searchMutation.data ? (
          <div className="border-t border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
            Discovery mode: <strong className="text-foreground">{searchMutation.data.discovery.mode}</strong> ·{" "}
            Used Elastic: <strong className="text-foreground">{String(searchMutation.data.discovery.usedElastic)}</strong> ·{" "}
            {searchMutation.data.discovery.fallbackReason
              ? `Fallback reason: ${searchMutation.data.discovery.fallbackReason} (relational DB matching active)`
              : `Candidates matched: ${searchMutation.data.discovery.candidateIds?.length ?? 0}`}{" "}
            · {searchMutation.data.discovery.durationMs}ms
          </div>
        ) : null}
      </Card>

      <GridToolbar
        title="Specialist Management (AG Grid Community)"
        subtitle="Verified L1–L3 skill levels, active workload capacity, and historical verification accuracy."
        quickFilter={quickFilter}
        onQuickFilterChange={setQuickFilter}
        onRefresh={() => specialistsQuery.refetch()}
        isRefreshing={specialistsQuery.isFetching}
        onExportCsv={() => gridRef.current?.api?.exportDataAsCsv({ fileName: "trusttopay-specialists.csv" })}
        searchPlaceholder="Search specialist name, email, or skill…"
      />

      {specialistsQuery.isLoading ? (
        <LoadingBlock label="Loading specialist directory…" />
      ) : specialistsQuery.error ? (
        <ErrorState message={(specialistsQuery.error as Error).message} onRetry={() => specialistsQuery.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title="No specialists registered"
          description="Approved specialists with verified L1–L3 skills appear in this grid."
        />
      ) : (
        <div
          className="ag-theme-quartz ttp-ag-grid w-full overflow-x-auto"
          style={{ height: 440 }}
          data-testid="ag-grid-specialists"
        >
          <AgGridReact<AdminSpecialistRow>
            ref={gridRef}
            rowData={rows}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            quickFilterText={quickFilter}
            pagination={true}
            paginationPageSize={10}
            paginationPageSizeSelector={[10, 25, 50]}
            animateRows={false}
          />
        </div>
      )}
    </div>
  );
}

/**
 * 2. Task & Dispatch Management Grid
 */
export function TasksDispatchGridTab() {
  const queryClient = useQueryClient();
  const gridRef = useRef<AgGridReact<AdminTaskRow>>(null);
  const [quickFilter, setQuickFilter] = useState("");
  const [dispatchMessage, setDispatchMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const tasksQuery = useQuery({
    queryKey: ["admin", "tasks-grid"],
    queryFn: () => api.admin.tasks({ pageSize: 100 }),
  });

  const dispatchOffers = useMutation({
    mutationFn: (taskId: string) => api.tasks.dispatchOffers(taskId, { forceNextBatch: true }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "tasks-grid"] });
      setErrorMessage(null);
      setDispatchMessage(
        `Dispatched ${res.dispatchedCount} offer(s) in batch #${res.batchNumber} (task status: ${res.status}).`,
      );
    },
    onError: (err) => setErrorMessage(err instanceof ApiError ? err.message : "Could not dispatch specialist offers."),
  });

  const rows = tasksQuery.data?.items ?? [];

  const columnDefs = useMemo<ColDef<AdminTaskRow>[]>(
    () => [
      {
        headerName: "Task",
        field: "title",
        minWidth: 220,
        flex: 1.5,
        filter: true,
        sortable: true,
        tooltipField: "title",
        cellRenderer: (params: ICellRendererParams<AdminTaskRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <div className="flex flex-col justify-center py-1 leading-tight">
              <Link to={`/app/tasks/${row.id}`} className="truncate font-medium text-primary hover:underline">
                {row.title}
              </Link>
              <span className="truncate text-[11px] text-muted-foreground">
                {row.category} · Min L{row.minimumSkillLevel}
              </span>
            </div>
          );
        },
      },
      {
        headerName: "Status",
        field: "status",
        minWidth: 165,
        filter: true,
        sortable: true,
        cellRenderer: (params: ICellRendererParams<AdminTaskRow>) =>
          params.data ? <StatusBadge status={params.data.status} /> : null,
      },
      {
        headerName: "Required Skills",
        field: "requiredSkillsSummary",
        minWidth: 180,
        flex: 1,
        filter: true,
        sortable: true,
        tooltipField: "requiredSkillsSummary",
      },
      {
        headerName: "Offers (Active / Total)",
        field: "totalOffers",
        minWidth: 155,
        sortable: true,
        cellRenderer: (params: ICellRendererParams<AdminTaskRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <span className="text-xs">
              <strong className="font-semibold text-foreground">{row.pendingOffers}</strong> active ·{" "}
              <span className="text-muted-foreground">
                {row.acceptedOffers} accepted / {row.expiredOffers} expired
              </span>
            </span>
          );
        },
      },
      {
        headerName: "Assigned Specialist",
        field: "assignedSpecialistName",
        minWidth: 155,
        filter: true,
        sortable: true,
        valueFormatter: (params) => params.value || "Unassigned",
      },
      {
        headerName: "Reward",
        field: "rewardMinor",
        minWidth: 130,
        sortable: true,
        cellRenderer: (params: ICellRendererParams<AdminTaskRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <span className="text-xs font-medium">
              {row.rewardDisplay}{" "}
              <span className="text-[11px] text-muted-foreground">({humanize(row.rewardStatus)})</span>
            </span>
          );
        },
      },
      {
        headerName: "Deadline / Created",
        field: "createdAt",
        minWidth: 140,
        sortable: true,
        valueFormatter: (params) => {
          const row = params.data;
          if (!row) return "—";
          return row.expiresAt ? `Due ${formatDateShort(row.expiresAt)}` : formatDateShort(row.createdAt);
        },
      },
      {
        headerName: "Actions",
        colId: "actions",
        minWidth: 185,
        sortable: false,
        filter: false,
        cellRenderer: (params: ICellRendererParams<AdminTaskRow>) => {
          const row = params.data;
          if (!row) return null;
          const canDispatch = ["FUNDED", "OFFERED", "OFFER_EXPIRED", "NO_MATCH", "MATCHING"].includes(row.status);
          return (
            <div className="flex items-center gap-1.5 py-1">
              {canDispatch ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  loading={dispatchOffers.isPending}
                  onClick={() => dispatchOffers.mutate(row.id)}
                >
                  <Send className="size-3" /> Dispatch Top 5
                </Button>
              ) : null}
              <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[11px]">
                <Link to={`/app/tasks/${row.id}`}>
                  Inspect <ExternalLink className="size-3" />
                </Link>
              </Button>
            </div>
          );
        },
      },
    ],
    [dispatchOffers],
  );

  return (
    <div className="space-y-4">
      {errorMessage ? <Alert tone="danger">{errorMessage}</Alert> : null}
      {dispatchMessage ? <Alert tone="success">{dispatchMessage}</Alert> : null}

      <GridToolbar
        title="Task & Dispatch Management (AG Grid Community)"
        subtitle="Track task lifecycle states, required skills, top-five parallel offer broadcast, and assigned specialists."
        quickFilter={quickFilter}
        onQuickFilterChange={setQuickFilter}
        onRefresh={() => tasksQuery.refetch()}
        isRefreshing={tasksQuery.isFetching}
        onExportCsv={() => gridRef.current?.api?.exportDataAsCsv({ fileName: "trusttopay-tasks.csv" })}
        searchPlaceholder="Filter tasks by title, status, skill, or specialist…"
      />

      {tasksQuery.isLoading ? (
        <LoadingBlock label="Loading tasks & offer dispatch state…" />
      ) : tasksQuery.error ? (
        <ErrorState message={(tasksQuery.error as Error).message} onRetry={() => tasksQuery.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FileCode2 className="size-5" />}
          title="No review tasks found"
          description="Escalated AI tasks and specialist offer dispatches appear here."
        />
      ) : (
        <div
          className="ag-theme-quartz ttp-ag-grid w-full overflow-x-auto"
          style={{ height: 440 }}
          data-testid="ag-grid-tasks"
        >
          <AgGridReact<AdminTaskRow>
            ref={gridRef}
            rowData={rows}
            columnDefs={columnDefs}
            defaultColDef={{ resizable: true, editable: false }}
            quickFilterText={quickFilter}
            pagination={true}
            paginationPageSize={10}
            paginationPageSizeSelector={[10, 25, 50]}
            animateRows={false}
          />
        </div>
      )}
    </div>
  );
}

/**
 * 3. Security & Verification Grid
 */
export function SecurityVerificationsGridTab() {
  const gridRef = useRef<AgGridReact<AdminVerificationRow>>(null);
  const [quickFilter, setQuickFilter] = useState("");

  const verificationsQuery = useQuery({
    queryKey: ["admin", "verifications-grid"],
    queryFn: () => api.admin.verifications({ pageSize: 100 }),
  });

  const rows = verificationsQuery.data?.items ?? [];

  const columnDefs = useMemo<ColDef<AdminVerificationRow>[]>(
    () => [
      {
        headerName: "Task & Specialist",
        field: "taskTitle",
        minWidth: 210,
        flex: 1.4,
        filter: true,
        sortable: true,
        cellRenderer: (params: ICellRendererParams<AdminVerificationRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <div className="flex flex-col justify-center py-1 leading-tight">
              <Link
                to={`/app/tasks/${row.taskId}/verification`}
                className="truncate font-medium text-primary hover:underline"
              >
                {row.taskTitle}
              </Link>
              <span className="truncate text-[11px] text-muted-foreground">
                By {row.reviewerName} · Artifact v{row.artifactVersion}
              </span>
            </div>
          );
        },
      },
      {
        headerName: "Artifact SHA-256",
        field: "artifactSha256",
        minWidth: 155,
        filter: true,
        sortable: true,
        tooltipField: "artifactSha256",
        cellRenderer: (params: ICellRendererParams<AdminVerificationRow>) => {
          const sha = params.data?.artifactSha256;
          if (!sha) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <code className="font-mono text-[11px] text-foreground" title={sha}>
              {sha.slice(0, 14)}…
            </code>
          );
        },
      },
      {
        headerName: "Deterministic Scanner",
        field: "deterministicVerdict",
        minWidth: 165,
        filter: true,
        sortable: true,
        cellRenderer: (params: ICellRendererParams<AdminVerificationRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <div className="flex items-center gap-1.5">
              <SecurityVerdictBadge verdict={row.deterministicVerdict} />
              <span className="text-[11px] text-muted-foreground">({row.deterministicFindingCount} findings)</span>
            </div>
          );
        },
      },
      {
        headerName: "Gemini Gate Verdict",
        field: "geminiVerdict",
        minWidth: 155,
        filter: true,
        sortable: true,
        cellRenderer: (params: ICellRendererParams<AdminVerificationRow>) => {
          const row = params.data;
          if (!row) return null;
          return <SecurityVerdictBadge verdict={row.geminiVerdict} />;
        },
      },
      {
        headerName: "Risk",
        field: "riskLevel",
        minWidth: 105,
        filter: true,
        sortable: true,
        cellRenderer: (params: ICellRendererParams<AdminVerificationRow>) => {
          const risk = params.data?.riskLevel ?? "LOW";
          const toneClass =
            risk === "CRITICAL" || risk === "HIGH"
              ? "text-red-400 font-semibold"
              : risk === "MEDIUM"
                ? "text-amber-400 font-medium"
                : "text-emerald-400";
          return <span className={`text-xs ${toneClass}`}>{risk}</span>;
        },
      },
      {
        headerName: "Isolated Runner",
        field: "testPassed",
        minWidth: 170,
        sortable: true,
        cellRenderer: (params: ICellRendererParams<AdminVerificationRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <span className="text-xs">
              <strong className={row.testPassed ? "text-emerald-400" : "text-red-400"}>
                {row.testPassed ? "PASS" : `EXIT ${row.testExitCode}`}
              </strong>{" "}
              <span className="text-[11px] text-muted-foreground">({row.testRunnerMode})</span>
            </span>
          );
        },
      },
      {
        headerName: "Verification",
        field: "verificationStatus",
        minWidth: 150,
        filter: true,
        sortable: true,
        cellRenderer: (params: ICellRendererParams<AdminVerificationRow>) =>
          params.data ? <VerificationBadge status={params.data.verificationStatus} /> : null,
      },
      {
        headerName: "Actions",
        colId: "actions",
        minWidth: 120,
        sortable: false,
        filter: false,
        cellRenderer: (params: ICellRendererParams<AdminVerificationRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[11px]">
              <Link to={`/app/tasks/${row.taskId}/verification`}>
                Review <ExternalLink className="size-3" />
              </Link>
            </Button>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <GridToolbar
        title="Security & Verification Gate (AG Grid Community)"
        subtitle="Immutable artifact SHA-256 digests, deterministic secret/injection scanner verdicts, Gemini security review, and isolated runner outcomes."
        quickFilter={quickFilter}
        onQuickFilterChange={setQuickFilter}
        onRefresh={() => verificationsQuery.refetch()}
        isRefreshing={verificationsQuery.isFetching}
        onExportCsv={() => gridRef.current?.api?.exportDataAsCsv({ fileName: "trusttopay-verifications.csv" })}
        searchPlaceholder="Filter by artifact SHA-256, verdict, risk, or task…"
      />

      {verificationsQuery.isLoading ? (
        <LoadingBlock label="Loading security & verification runs…" />
      ) : verificationsQuery.error ? (
        <ErrorState
          message={(verificationsQuery.error as Error).message}
          onRetry={() => verificationsQuery.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="size-5" />}
          title="No verification runs recorded"
          description="Submitted artifacts evaluated by the deterministic scanner, Gemini security gate, and isolated runner appear here."
        />
      ) : (
        <div
          className="ag-theme-quartz ttp-ag-grid w-full overflow-x-auto"
          style={{ height: 440 }}
          data-testid="ag-grid-verifications"
        >
          <AgGridReact<AdminVerificationRow>
            ref={gridRef}
            rowData={rows}
            columnDefs={columnDefs}
            defaultColDef={{ resizable: true, editable: false }}
            quickFilterText={quickFilter}
            pagination={true}
            paginationPageSize={10}
            paginationPageSizeSelector={[10, 25, 50]}
            animateRows={false}
          />
        </div>
      )}
    </div>
  );
}

/**
 * 4. Payment Ledger Grid (Strictly Read-Only)
 */
export function PaymentLedgerGridTab() {
  const gridRef = useRef<AgGridReact<AdminPaymentLedgerRow>>(null);
  const [quickFilter, setQuickFilter] = useState("");

  const paymentsQuery = useQuery({
    queryKey: ["admin", "payments-grid"],
    queryFn: () => api.admin.payments({ pageSize: 100 }),
  });

  const rows = paymentsQuery.data?.items ?? [];

  const columnDefs = useMemo<ColDef<AdminPaymentLedgerRow>[]>(
    () => [
      {
        headerName: "Task",
        field: "taskTitle",
        minWidth: 200,
        flex: 1.3,
        filter: true,
        sortable: true,
        editable: false,
        cellRenderer: (params: ICellRendererParams<AdminPaymentLedgerRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <div className="flex flex-col justify-center py-1 leading-tight">
              <Link to={`/app/tasks/${row.taskId}`} className="truncate font-medium text-primary hover:underline">
                {row.taskTitle}
              </Link>
              <span className="truncate text-[11px] text-muted-foreground">
                Requester: {row.requesterName}
                {row.reviewerName ? ` · Specialist: ${row.reviewerName}` : ""}
              </span>
            </div>
          );
        },
      },
      {
        headerName: "Direction / Mode",
        field: "type",
        minWidth: 155,
        filter: true,
        sortable: true,
        editable: false,
        cellRenderer: (params: ICellRendererParams<AdminPaymentLedgerRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <span className="text-xs">
              <strong className="font-semibold text-foreground">{row.type}</strong>{" "}
              <span className="text-muted-foreground">· {row.mode}</span>
            </span>
          );
        },
      },
      {
        headerName: "PayPal Order / Batch ID",
        field: "orderId",
        minWidth: 185,
        filter: true,
        sortable: true,
        editable: false,
        valueGetter: (params) => params.data?.orderId ?? params.data?.payoutBatchId ?? "—",
        cellRenderer: (params: ICellRendererParams<AdminPaymentLedgerRow>) => {
          const refId = params.data?.orderId ?? params.data?.payoutBatchId;
          if (!refId) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <code className="font-mono text-[11px] text-foreground" title={refId}>
              {refId}
            </code>
          );
        },
      },
      {
        headerName: "Amount & Currency",
        field: "amountMinor",
        minWidth: 135,
        sortable: true,
        editable: false,
        cellRenderer: (params: ICellRendererParams<AdminPaymentLedgerRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <span className="font-mono text-xs font-semibold text-foreground">
              {row.amountDisplay} <span className="text-[11px] text-muted-foreground">{row.currency}</span>
            </span>
          );
        },
      },
      {
        headerName: "Status",
        field: "status",
        minWidth: 135,
        filter: true,
        sortable: true,
        editable: false,
        cellRenderer: (params: ICellRendererParams<AdminPaymentLedgerRow>) =>
          params.data ? <PaymentStatusBadge status={params.data.status} /> : null,
      },
      {
        headerName: "Payout Availability",
        field: "payoutAvailability",
        minWidth: 165,
        filter: true,
        sortable: true,
        editable: false,
        cellRenderer: (params: ICellRendererParams<AdminPaymentLedgerRow>) =>
          params.data ? <PayoutAvailabilityBadge availability={params.data.payoutAvailability} /> : null,
      },
      {
        headerName: "Recorded",
        field: "createdAt",
        minWidth: 125,
        sortable: true,
        editable: false,
        valueFormatter: (params) => formatDateShort(params.value),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <GridToolbar
        title="Payment Ledger (Read-Only AG Grid Community)"
        subtitle="Immutable audit view of PayPal Sandbox / Simulated orders, captures, and decoupled payouts. Financial states cannot be manually edited."
        quickFilter={quickFilter}
        onQuickFilterChange={setQuickFilter}
        onRefresh={() => paymentsQuery.refetch()}
        isRefreshing={paymentsQuery.isFetching}
        onExportCsv={() => gridRef.current?.api?.exportDataAsCsv({ fileName: "trusttopay-payment-ledger.csv" })}
        searchPlaceholder="Filter by PayPal Order ID, status, mode, or task…"
      />

      {paymentsQuery.isLoading ? (
        <LoadingBlock label="Loading read-only payment ledger…" />
      ) : paymentsQuery.error ? (
        <ErrorState message={(paymentsQuery.error as Error).message} onRetry={() => paymentsQuery.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Wallet className="size-5" />}
          title="No payment transactions recorded"
          description="PayPal Sandbox and simulated funding orders and payouts appear here."
        />
      ) : (
        <div
          className="ag-theme-quartz ttp-ag-grid w-full overflow-x-auto"
          style={{ height: 440 }}
          data-testid="ag-grid-payments"
        >
          <AgGridReact<AdminPaymentLedgerRow>
            ref={gridRef}
            rowData={rows}
            columnDefs={columnDefs}
            defaultColDef={{ resizable: true, editable: false }}
            quickFilterText={quickFilter}
            pagination={true}
            paginationPageSize={10}
            paginationPageSizeSelector={[10, 25, 50]}
            animateRows={false}
          />
        </div>
      )}
    </div>
  );
}

/**
 * 5. Skill Assessments Grid
 */
export function SkillAssessmentsGridTab() {
  const gridRef = useRef<AgGridReact<AdminAssessmentRow>>(null);
  const [quickFilter, setQuickFilter] = useState("");

  const assessmentsQuery = useQuery({
    queryKey: ["admin", "assessments-grid"],
    queryFn: () => api.admin.assessments({ pageSize: 100 }),
  });

  const rows = assessmentsQuery.data?.items ?? [];

  const columnDefs = useMemo<ColDef<AdminAssessmentRow>[]>(
    () => [
      {
        headerName: "Candidate",
        field: "candidateName",
        minWidth: 190,
        flex: 1.2,
        filter: true,
        sortable: true,
        cellRenderer: (params: ICellRendererParams<AdminAssessmentRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <div className="flex flex-col justify-center py-1 leading-tight">
              <span className="truncate font-medium text-foreground">{row.candidateName}</span>
              <span className="truncate text-[11px] text-muted-foreground">{row.candidateEmail}</span>
            </div>
          );
        },
      },
      {
        headerName: "Skill",
        field: "skillName",
        minWidth: 165,
        flex: 1,
        filter: true,
        sortable: true,
        cellRenderer: (params: ICellRendererParams<AdminAssessmentRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <span className="text-xs">
              <strong className="font-medium text-foreground">{row.skillName}</strong>{" "}
              <span className="text-muted-foreground">· {row.category}</span>
            </span>
          );
        },
      },
      {
        headerName: "Stage Level",
        field: "level",
        minWidth: 145,
        filter: true,
        sortable: true,
        cellRenderer: (params: ICellRendererParams<AdminAssessmentRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <span className="text-xs font-semibold text-primary">
              L{row.level} · {row.levelName}
            </span>
          );
        },
      },
      {
        headerName: "Score",
        field: "score",
        minWidth: 130,
        sortable: true,
        filter: "agNumberColumnFilter",
        cellRenderer: (params: ICellRendererParams<AdminAssessmentRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <span className="font-mono text-xs">
              <strong>{row.score}%</strong>{" "}
              <span className="text-muted-foreground">(min {row.passingScore}%)</span>
            </span>
          );
        },
      },
      {
        headerName: "Result",
        field: "status",
        minWidth: 135,
        filter: true,
        sortable: true,
        cellRenderer: (params: ICellRendererParams<AdminAssessmentRow>) => {
          const row = params.data;
          if (!row) return null;
          if (row.status === "IN_PROGRESS") {
            return <span className="text-xs font-medium text-blue-400">In Progress</span>;
          }
          return (
            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${row.passed ? "text-emerald-400" : "text-red-400"}`}>
              {row.passed ? <CheckCircle2 className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
              {row.passed ? "PASSED" : "FAILED"}
            </span>
          );
        },
      },
      {
        headerName: "Completed",
        field: "completedAt",
        minWidth: 135,
        sortable: true,
        valueFormatter: (params) => formatDateShort(params.value ?? params.data?.startedAt),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <GridToolbar
        title="Skill Assessments L1–L3 (AG Grid Community)"
        subtitle="Sequential Foundation (L1), Practitioner (L2), and Expert (L3) assessment attempts, scores, and earned badges."
        quickFilter={quickFilter}
        onQuickFilterChange={setQuickFilter}
        onRefresh={() => assessmentsQuery.refetch()}
        isRefreshing={assessmentsQuery.isFetching}
        onExportCsv={() => gridRef.current?.api?.exportDataAsCsv({ fileName: "trusttopay-skill-assessments.csv" })}
        searchPlaceholder="Filter by candidate, skill, level, or result…"
      />

      {assessmentsQuery.isLoading ? (
        <LoadingBlock label="Loading skill assessment attempts…" />
      ) : assessmentsQuery.error ? (
        <ErrorState
          message={(assessmentsQuery.error as Error).message}
          onRetry={() => assessmentsQuery.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Award className="size-5" />}
          title="No skill assessments recorded yet"
          description="Candidate L1–L3 skill assessment attempts and scores appear here."
        />
      ) : (
        <div
          className="ag-theme-quartz ttp-ag-grid w-full overflow-x-auto"
          style={{ height: 440 }}
          data-testid="ag-grid-assessments"
        >
          <AgGridReact<AdminAssessmentRow>
            ref={gridRef}
            rowData={rows}
            columnDefs={columnDefs}
            defaultColDef={{ resizable: true, editable: false }}
            quickFilterText={quickFilter}
            pagination={true}
            paginationPageSize={10}
            paginationPageSizeSelector={[10, 25, 50]}
            animateRows={false}
          />
        </div>
      )}
    </div>
  );
}
