import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  FileText,
  FlaskConical,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { api, ApiError, type CreateSessionInput } from "@/lib/api";
import type { AgentSession } from "@/lib/types";
import {
  CATEGORY_EXAMPLES,
  CATEGORY_META,
  CATEGORY_VALUES,
  categoryLabel,
  type CategoryValue,
} from "@/lib/categories";
import { PageHeader, SectionHeading } from "@/components/common";
import { PaymentModeBanner } from "@/components/payment-mode-banner";
import { StatusBadge } from "@/components/status-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/states";
import { formatDate, humanize, truncate } from "@/lib/format";
import { cn } from "@/lib/utils";

type DocumentDraft = {
  key: string;
  title: string;
  url: string;
  publisher: string;
  sourceType: CreateSessionInput["documents"][number]["sourceType"];
  content: string;
};

function makeKey() {
  return Math.random().toString(36).slice(2);
}

function emptyDocument(): DocumentDraft {
  return { key: makeKey(), title: "", url: "", publisher: "", sourceType: "DOCUMENT", content: "" };
}

export default function WorkspacePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const showForm = params.get("new") === "1";
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<CategoryValue>("CONCEPTUAL");
  const [question, setQuestion] = useState("");
  const [models, setModels] = useState("");
  const [specs, setSpecs] = useState("");
  const [documents, setDocuments] = useState<DocumentDraft[]>([emptyDocument()]);

  const sessions = useQuery({
    queryKey: ["sessions", { search }],
    queryFn: () => api.sessions.list({ q: search || undefined, pageSize: 50 }),
  });

  const create = useMutation({
    mutationFn: (input: CreateSessionInput) => api.sessions.create(input),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      navigate(`/app/sessions/${data.session.id}?analyze=1`);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not create the session."),
  });

  const filtered = useMemo(() => sessions.data?.items ?? [], [sessions.data]);

  function openForm() {
    setParams({ new: "1" });
    setError(null);
  }

  function closeForm() {
    setParams({});
    setError(null);
  }

  function loadExample(nextCategory: CategoryValue = category) {
    const example = CATEGORY_EXAMPLES[nextCategory];
    setCategory(nextCategory);
    setTitle(example.title);
    setQuestion(example.question);
    setModels(example.productModels.join(", "));
    setSpecs(example.specifications.join("\n"));
    setDocuments(
      example.documents.map((document) => ({
        key: makeKey(),
        title: document.title,
        url: document.url ?? "",
        publisher: document.publisher ?? "",
        sourceType: document.sourceType,
        content: document.content,
      })),
    );
    setError(null);
  }

  function updateDocument(key: string, patch: Partial<DocumentDraft>) {
    setDocuments((current) => current.map((document) => (document.key === key ? { ...document, ...patch } : document)));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (question.trim().length < 10) {
      setError("Enter a question of at least 10 characters.");
      return;
    }
    const cleanedDocuments = documents
      .filter((document) => document.title.trim() && document.content.trim())
      .map((document) => ({
        title: document.title.trim(),
        url: document.url.trim() || null,
        publisher: document.publisher.trim() || null,
        sourceType: document.sourceType,
        content: document.content.trim(),
      }));
    create.mutate({
      title: title.trim() || undefined,
      category,
      question: question.trim(),
      productModels: models
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      specifications: specs
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean),
      documents: cleanedDocuments,
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Agent workspace"
        title="Escalate what your agent should not guess"
        description="Submit a programming, crypto, conceptual or hardware question with its evidence. The analysis is schema-validated and the server decides whether a human review is required."
        actions={
          showForm ? (
            <Button variant="outline" onClick={closeForm}>
              <X className="size-4" /> Close form
            </Button>
          ) : (
            <Button onClick={openForm}>
              <Plus className="size-4" /> New question
            </Button>
          )
        }
      />

      <PaymentModeBanner compact />

      {showForm ? (
        <Card>
          <CardHeader className="border-b border-border">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>New agent session</CardTitle>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  No API key is needed in demo mode. Supplied documents are attached to this session only.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => loadExample()}>
                <Wand2 className="size-3.5" /> Load {CATEGORY_META[category].shortLabel.toLowerCase()} example
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <form onSubmit={submit} className="space-y-5" noValidate>
              {error ? <Alert tone="danger">{error}</Alert> : null}

              <div>
                <p className="text-xs font-medium">Question type</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {CATEGORY_VALUES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCategory(value)}
                      aria-pressed={category === value}
                      className={cn(
                        "rounded-md border px-3 py-1 text-xs font-medium transition-colors",
                        category === value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      )}
                    >
                      {CATEGORY_META[value].label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{CATEGORY_META[category].description}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Session title" htmlFor="session-title" hint="Optional. Defaults to the first part of the question.">
                  <Input
                    id="session-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={CATEGORY_EXAMPLES[category].title}
                    maxLength={160}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Product models" htmlFor="models" hint="Comma separated">
                    <Input
                      id="models"
                      value={models}
                      onChange={(event) => setModels(event.target.value)}
                      placeholder={CATEGORY_META[category].modelsPlaceholder}
                    />
                  </Field>
                  <div className="flex items-end">
                    <div className="w-full rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
                      Critical conflicts always force human review, regardless of score.
                    </div>
                  </div>
                </div>
              </div>

              <Field
                label="Question for the agent"
                htmlFor="question"
                hint="Include the decision you need and the configuration that matters."
                error={question.length > 0 && question.trim().length < 10 ? "Use at least 10 characters." : undefined}
              >
                <Textarea
                  id="question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows={4}
                  maxLength={4000}
                  placeholder={CATEGORY_META[category].questionPlaceholder}
                />
              </Field>

              <Field
                label="Specifications"
                htmlFor="specs"
                hint="One documented requirement per line. These are evidence, not assumptions."
              >
                <Textarea
                  id="specs"
                  value={specs}
                  onChange={(event) => setSpecs(event.target.value)}
                  rows={3}
                  placeholder={CATEGORY_META[category].specsPlaceholder}
                />
              </Field>

              <div className="space-y-3">
                <SectionHeading
                  title="Supplied evidence"
                  description="Add listings, datasheets, support pages or documents. The verification engine checks the reviewer's answer against what you supply."
                  actions={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setDocuments((current) => [...current, emptyDocument()])}
                    >
                      <Plus className="size-3.5" /> Add document
                    </Button>
                  }
                />
                {documents.map((document, index) => (
                  <div key={document.key} className="rounded-lg border border-border bg-background p-3.5">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-xs font-semibold">
                        <FileText className="size-3.5 text-muted-foreground" /> Document {index + 1}
                      </p>
                      {documents.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setDocuments((current) => current.filter((item) => item.key !== document.key))}
                        >
                          <Trash2 className="size-3.5" /> Remove
                        </Button>
                      ) : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Title" htmlFor={`doc-title-${document.key}`}>
                        <Input
                          id={`doc-title-${document.key}`}
                          value={document.title}
                          onChange={(event) => updateDocument(document.key, { title: event.target.value })}
                          placeholder="Manufacturer support article"
                          maxLength={250}
                        />
                      </Field>
                      <Field label="Source type" htmlFor={`doc-type-${document.key}`}>
                        <select
                          id={`doc-type-${document.key}`}
                          value={document.sourceType}
                          onChange={(event) =>
                            updateDocument(document.key, {
                              sourceType: event.target.value as DocumentDraft["sourceType"],
                            })
                          }
                          className="flex h-9 w-full rounded-md border border-input bg-card px-2.5 py-1 text-sm shadow-sm"
                        >
                          <option value="MANUFACTURER">Manufacturer</option>
                          <option value="RETAILER">Retailer</option>
                          <option value="MARKETPLACE">Marketplace</option>
                          <option value="FORUM">Forum</option>
                          <option value="DOCUMENT">Document</option>
                        </select>
                      </Field>
                      <Field label="URL" htmlFor={`doc-url-${document.key}`} hint="Optional, but useful evidence.">
                        <Input
                          id={`doc-url-${document.key}`}
                          value={document.url}
                          onChange={(event) => updateDocument(document.key, { url: event.target.value })}
                          placeholder="https://support.example.com/article"
                          maxLength={1000}
                        />
                      </Field>
                      <Field label="Publisher" htmlFor={`doc-publisher-${document.key}`}>
                        <Input
                          id={`doc-publisher-${document.key}`}
                          value={document.publisher}
                          onChange={(event) => updateDocument(document.key, { publisher: event.target.value })}
                          placeholder="VoltEdge"
                          maxLength={200}
                        />
                      </Field>
                    </div>
                    <Field label="Content" htmlFor={`doc-content-${document.key}`} className="mt-3">
                      <Textarea
                        id={`doc-content-${document.key}`}
                        value={document.content}
                        onChange={(event) => updateDocument(document.key, { content: event.target.value })}
                        rows={3}
                        maxLength={20000}
                        placeholder="Paste the relevant text. The demo AI analyses this content locally."
                      />
                    </Field>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="max-w-md text-[11px] leading-5 text-muted-foreground">
                  Your session is saved immediately. The AI analysis runs next and may ask for more information or
                  recommend a human review.
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={closeForm}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={create.isPending}>
                    <Sparkles className="size-4" /> Create & analyze
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div>
          <SectionHeading
            title="Your agent sessions"
            description="Each session keeps the question, supplied evidence and every analysis run."
            actions={
              <div className="relative w-56">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search sessions"
                  className="pl-8"
                  aria-label="Search sessions"
                />
              </div>
            }
          />

          {sessions.isLoading ? (
            <LoadingBlock label="Loading sessions…" />
          ) : sessions.error ? (
            <ErrorState
              message={(sessions.error as Error).message}
              onRetry={() => sessions.refetch()}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Bot className="size-5" />}
              title={search ? "No sessions match that search" : "Start your first agent session"}
              description={
                search
                  ? "Try a different search term, or clear the search."
                  : "Submit a question with evidence. The demo AI works without credentials and explains why it escalates."
              }
              action={
                search ? (
                  <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                    Clear search
                  </Button>
                ) : (
                  <Button size="sm" onClick={openForm}>
                    <Plus className="size-4" /> New question
                  </Button>
                )
              }
            />
          ) : (
            <div className="space-y-2.5">
              {filtered.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FlaskConical className="size-4 text-amber-400" /> How the demo AI decides
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs leading-5 text-muted-foreground">
              <p>The demo engine is deterministic and rule-based. It compares claims in your documents and flags gaps that matter for the selected question type.</p>
              <ul className="space-y-1.5">
                <li>• A critical conflict always forces escalation.</li>
                <li>• Conflicting numbers, signatures or configuration values lower confidence.</li>
                <li>• Missing runtime, chain or decision details are listed explicitly.</li>
                <li>• The server, not the browser, applies the threshold.</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardContent className="space-y-2 p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <Sparkles className="size-3.5 text-primary" /> Try a conflict case
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                Load an example for the selected type: a 45W port limit, a conflicting pool size, a replay-prone permit or a disputed throughput benchmark.
              </p>
              <Button variant="outline" size="sm" className="w-full" onClick={() => { openForm(); loadExample(); }}>
                Open {CATEGORY_META[category].shortLabel.toLowerCase()} example
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function SessionRow({ session }: { session: AgentSession }) {
  const analysis = session.latestAnalysis ?? session.analysisRuns?.[0] ?? null;
  const task = session.latestTask ?? session.tasks?.[0] ?? null;
  return (
    <Card className="transition-colors hover:border-primary/30">
      <Link to={`/app/sessions/${session.id}`} className="block p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm font-semibold">{session.title}</p>
              <StatusBadge status={session.status} dot={false} />
              <Badge tone="neutral">{categoryLabel(session.category)}</Badge>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {truncate(session.question, 190)}
            </p>
          </div>
          <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>{formatDate(session.createdAt)}</span>
          {analysis ? (
            <span className="inline-flex items-center gap-1">
              confidence <strong className="text-foreground">{Math.round(analysis.confidenceScore * 100)}%</strong>
            </span>
          ) : (
            <span>No analysis yet</span>
          )}
          {analysis ? <Badge tone="neutral">{humanize(analysis.recommendedAction)}</Badge> : null}
          {task ? (
            <span className="inline-flex items-center gap-1">
              Task <StatusBadge status={task.status} dot={false} />
            </span>
          ) : null}
        </div>
      </Link>
    </Card>
  );
}
