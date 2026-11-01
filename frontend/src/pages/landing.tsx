import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  Bot,
  CheckCircle2,
  Code2,
  Database,
  Layers,
  Menu,
  Pause,
  Play,
  ShieldCheck,
  Terminal,
  X,
} from "lucide-react";
import { TrustToPayLogoMark } from "@/components/layout/public-layout";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { HERO_STAGES, WORKFLOW_STEPS } from "./landing-data";
import "./landing.css";

const NAV_ITEMS = [
  { label: "Product", href: "/#product" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Developers", href: "/#developers" },
  { label: "Documentation", href: "/app/docs" },
] as const;

const FARE_NOTES = [
  {
    key: "Elastic + PG",
    value: "Hybrid semantic discovery with relational L1–L3 revalidation.",
  },
  {
    key: "SHA-256 + Gemini",
    value: "Deterministic secret scan, semantic gate, and isolated runner.",
  },
  {
    key: "PayPal + HMAC",
    value: "Orders v2 escrow, Payouts v1 settlement, and a signed handback.",
  },
] as const;

const WORKSPACES = [
  { id: "requester", label: "Requester", icon: Bot },
  { id: "specialist", label: "Specialist", icon: Code2 },
  { id: "admin", label: "Admin · AG Grid", icon: Layers },
] as const;

const TASK_FLOW = ["AWAITING_FUNDING", "FUNDED", "REVIEWER_ASSIGNED", "PAYMENT_READY", "HANDED_OFF"] as const;

type WorkspaceKey = (typeof WORKSPACES)[number]["id"];

function StationHeader() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="ttp-header">
      <div className="ttp-wrap ttp-header__inner">
        <Link to="/" className="ttp-brand" onClick={() => setMenuOpen(false)}>
          <TrustToPayLogoMark className="ttp-brand__mark" />
          <span className="ttp-brand__text">
            <span className="ttp-brand__name">TrustToPay</span>
            <span className="ttp-brand__sub">Human escalation desk</span>
          </span>
        </Link>

        <nav aria-label="Primary navigation" className="ttp-nav">
          {NAV_ITEMS.map((item) => (
            <Link key={item.label} to={item.href} className="ttp-nav__link">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ttp-header__actions">
          <Link to="/login" className="ttp-header__signin">
            Sign in
          </Link>
          <Link to={user ? "/app" : "/register"} className="ttp-btn ttp-btn--signal">
            {user ? "Open console" : "Get started"} <ArrowRight />
          </Link>
        </div>

        <button
          type="button"
          className="ttp-menu-btn"
          aria-expanded={menuOpen}
          aria-controls="ttp-mobile-menu"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {menuOpen ? (
        <div id="ttp-mobile-menu" className="ttp-menu ttp-menu--open">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              to={item.href}
              className="ttp-menu__link"
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <div className="ttp-menu__actions">
            <Link to="/login" className="ttp-btn ttp-btn--outline" onClick={() => setMenuOpen(false)}>
              Sign in
            </Link>
            <Link
              to={user ? "/app" : "/register"}
              className="ttp-btn ttp-btn--signal"
              onClick={() => setMenuOpen(false)}
            >
              {user ? "Open console" : "Get started"}
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function TicketStub() {
  const { user } = useAuth();

  return (
    <aside className="ttp-ticket" aria-label="Open a TrustToPay ticket">
      <div className="ttp-ticket__top">
        <span>Platform ticket</span>
        <span>Nº 09</span>
      </div>
      <p className="ttp-ticket__title">Admit one</p>
      <dl className="ttp-ticket__rows">
        <div className="ttp-ticket__row">
          <dt>From</dt>
          <dd>Uncertain agent</dd>
        </div>
        <div className="ttp-ticket__row">
          <dt>To</dt>
          <dd>Verified human</dd>
        </div>
        <div className="ttp-ticket__row">
          <dt>Fare</dt>
          <dd>Escrowed reward</dd>
        </div>
        <div className="ttp-ticket__row">
          <dt>Gate</dt>
          <dd>Security scan + isolated runner</dd>
        </div>
      </dl>
      <Link to={user ? "/app" : "/register"} className="ttp-btn ttp-btn--signal">
        {user ? "Open the console" : "Open the ticket window"} <ArrowRight />
      </Link>
      <a href="#how-it-works" className="ttp-ticket__secondary">
        Read the nine-station protocol <ArrowDown />
      </a>
      <p className="ttp-ticket__fine">PayPal Sandbox · demo payments are simulated</p>
    </aside>
  );
}

function HeroBoard() {
  const [stageIndex, setStageIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const current = HERO_STAGES[stageIndex];

  useEffect(() => {
    if (!playing) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      setStageIndex((index) => (index + 1) % HERO_STAGES.length);
    }, 4800);

    return () => window.clearInterval(timer);
  }, [playing]);

  function selectStage(index: number) {
    setStageIndex(index);
    setPlaying(false);
  }

  return (
    <section className="ttp-hero" aria-label="TrustToPay departure board">
      <div className="ttp-wrap">
        <div className="ttp-board">
          <div className="ttp-board__bar">
            <span className="ttp-board__bar-group">
              <span className="ttp-live" aria-hidden="true" />
              Departures
            </span>
            <span className="ttp-board__line">Human-in-the-loop line · all services</span>
            <button
              type="button"
              className="ttp-board__toggle"
              aria-pressed={playing}
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? <Pause /> : <Play />}
              {playing ? "Auto" : "Paused"}
            </button>
          </div>

          <div className="ttp-board__lead">
            <div>
              <h1 className="ttp-h1">
                <span className="ttp-h1__intro">Give your agent a</span>
                <span className="ttp-h1__mark">human connection.</span>
              </h1>
              <p className="ttp-dek">AI doesn&apos;t have to solve everything alone.</p>
              <p className="ttp-lede">
                When an agent hits conflicting evidence, a missing specification, or a high-risk code path,
                TrustToPay turns the blocker into a funded task, matches a verified specialist, runs the security
                gates in isolation, settles through PayPal, and returns a signed handback.
              </p>
            </div>
            <TicketStub />
          </div>

          <div className="ttp-board__table">
            <div className="ttp-row ttp-row--head" aria-hidden="true">
              <span>Nº</span>
              <span>Service</span>
              <span>Operator</span>
              <span>Status</span>
            </div>
            {HERO_STAGES.map((stage, index) => {
              const active = index === stageIndex;
              return (
                <button
                  key={stage.index}
                  type="button"
                  className={cn("ttp-row ttp-row--data", active && "ttp-row--active")}
                  aria-pressed={active}
                  aria-controls="ttp-stage-detail"
                  onClick={() => selectStage(index)}
                >
                  <span className="ttp-row__num">{String(stage.index).padStart(2, "0")}</span>
                  <span className="ttp-row__service">
                    <span className="ttp-row__dot" aria-hidden="true" />
                    <span>{stage.shortTitle.replace(/^\d+\.\s*/, "")}</span>
                  </span>
                  <span className="ttp-row__operator">{stage.actor}</span>
                  <span className="ttp-row__status">{stage.statusTag.split(" · ")[0]}</span>
                </button>
              );
            })}
          </div>

          <div className="ttp-detail" id="ttp-stage-detail">
            <div className="ttp-detail__main">
              <div className="ttp-detail__inner" key={current.index}>
                <p className="ttp-detail__status">{current.statusTag}</p>
                <h2 className="ttp-detail__title">{current.title}</h2>
                <code className="ttp-detail__endpoint">{current.endpoint}</code>
                <p className="ttp-detail__summary">{current.summary}</p>
                <dl className="ttp-detail__metrics">
                  {current.metrics.map((metric) => (
                    <div key={metric.label} className="ttp-detail__metric">
                      <dt>{metric.label}</dt>
                      <dd>{metric.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            <div className="ttp-detail__log">
              <div className="ttp-detail__log-head">
                <span>Service log</span>
                <span>
                  Stage {current.index} / {HERO_STAGES.length}
                </span>
              </div>
              <p className="ttp-detail__log-actor">Actor · {current.actor}</p>
              <div className="ttp-detail__lines">
                {current.terminalLines.map((line, index) => (
                  <p
                    key={`${line.prefix}-${index}`}
                    className={cn(
                      "ttp-log-line",
                      line.highlight === "amber" && "ttp-log-line--amber",
                      line.highlight === "emerald" && "ttp-log-line--emerald",
                      line.highlight === "blue" && "ttp-log-line--blue",
                    )}
                  >
                    <span className="ttp-log-line__prefix">{line.prefix}</span>
                    <span className="ttp-log-line__text">{line.text}</span>
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="ttp-fares">
          {FARE_NOTES.map((note) => (
            <div key={note.key} className="ttp-fares__cell">
              <p className="ttp-fares__key">{note.key}</p>
              <p className="ttp-fares__val">{note.value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RouteMap() {
  const [activeIndex, setActiveIndex] = useState(0);
  const current = WORKFLOW_STEPS[activeIndex];

  function goTo(index: number) {
    const next = (index + WORKFLOW_STEPS.length) % WORKFLOW_STEPS.length;
    setActiveIndex(next);
    window.requestAnimationFrame(() => {
      document.getElementById(`ttp-station-tab-${WORKFLOW_STEPS[next].number}`)?.focus();
    });
  }

  function handleKeyDown(event: import("react").KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      goTo(index + 1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      goTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      goTo(WORKFLOW_STEPS.length - 1);
    }
  }

  return (
    <section id="how-it-works" className="ttp-section">
      <div className="ttp-wrap">
        <div className="ttp-section__head">
          <div>
            <h2 className="ttp-h2">Nine stations from stuck to signed.</h2>
            <div className="ttp-rule" aria-hidden="true">
              <span className="ttp-rule__node" />
            </div>
          </div>
          <p className="ttp-copy">
            Every task runs the same server-enforced line. Select a station to read its inputs, the guards it cannot
            bypass, and the exact API route it calls.
          </p>
        </div>

        <div className="ttp-route__grid">
          <div className="ttp-station-mobile">
            <div className="ttp-station-track" aria-hidden="true">
              {WORKFLOW_STEPS.map((step, index) => (
                <span
                  key={step.number}
                  className={cn(
                    "ttp-track-node",
                    index < activeIndex && "is-done",
                    index === activeIndex && "is-active",
                  )}
                >
                  {step.number}
                </span>
              ))}
            </div>
            <label className="ttp-station-select">
              <span>Choose a station</span>
              <select value={activeIndex} onChange={(event) => setActiveIndex(Number(event.target.value))}>
                {WORKFLOW_STEPS.map((step, index) => (
                  <option key={step.number} value={index}>
                    {step.tabLabel}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div
            role="tablist"
            aria-orientation="vertical"
            aria-label="TrustToPay 9-step workflow"
            className="ttp-line"
          >
            {WORKFLOW_STEPS.map((step, index) => {
              const selected = index === activeIndex;
              return (
                <button
                  key={step.number}
                  id={`ttp-station-tab-${step.number}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="ttp-station-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveIndex(index)}
                  onKeyDown={(event) => handleKeyDown(event, index)}
                  className={cn(
                    "ttp-station",
                    selected && "ttp-station--active",
                    index < activeIndex && "ttp-station--done",
                  )}
                >
                  <span className="ttp-station__node">{step.number}</span>
                  <span className="ttp-station__text">
                    <span className="ttp-station__label">{step.tabLabel}</span>
                    <span className="ttp-station__phase">{step.phase}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div
            id="ttp-station-panel"
            role="tabpanel"
            aria-labelledby={`ttp-station-tab-${current.number}`}
            className="ttp-station-panel"
          >
            <div className="ttp-station-panel__bar">
              <span>
                Station {current.number} · {current.phase}
              </span>
              <code>{current.endpoint}</code>
            </div>
            <div className="ttp-station-panel__body">
              <h3 className="ttp-station-panel__title">{current.title}</h3>
              <p className="ttp-station-panel__desc">{current.description}</p>
              <ul className="ttp-conditions">
                {current.invariants.map((invariant) => (
                  <li key={invariant}>
                    <CheckCircle2 aria-hidden="true" />
                    <span>{invariant}</span>
                  </li>
                ))}
              </ul>
              <div className="ttp-payload">
                <div className="ttp-payload__bar">
                  <strong>{current.payloadTitle}</strong>
                  <span>{current.actor}</span>
                </div>
                <pre>
                  <code>{current.payloadCode}</code>
                </pre>
              </div>
            </div>
            <div className="ttp-station-panel__nav">
              <button
                type="button"
                className="ttp-btn ttp-btn--outline"
                disabled={activeIndex === 0}
                onClick={() => goTo(activeIndex - 1)}
              >
                Previous station
              </button>
              <span className="ttp-station-panel__count">
                Station {activeIndex + 1} of {WORKFLOW_STEPS.length}
              </span>
              <button
                type="button"
                className="ttp-btn ttp-btn--ink"
                disabled={activeIndex === WORKFLOW_STEPS.length - 1}
                onClick={() => goTo(activeIndex + 1)}
              >
                Next station <ArrowRight />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkspacePreview({ workspace }: { workspace: WorkspaceKey }) {
  if (workspace === "requester") {
    return (
      <>
        <div className="ttp-preview__head">
          <span>Session · Worker pool concurrency &amp; AbortController timeout</span>
          <span className="ttp-preview__tag">Escalate_to_human</span>
        </div>
        <dl className="ttp-preview__grid">
          <div className="ttp-preview__cell">
            <dt>Confidence</dt>
            <dd className="is-signal">41% · threshold 75%</dd>
          </div>
          <div className="ttp-preview__cell">
            <dt>Escrow funding</dt>
            <dd className="is-ok">$25.00 USD · Orders v2</dd>
          </div>
          <div className="ttp-preview__cell">
            <dt>Handback digest</dt>
            <dd>sha256:8f94d2c1… · HMAC</dd>
          </div>
        </dl>
        <p className="ttp-preview__flag">Critical conflict flagged · escalation threshold 0.75</p>
        <dl className="ttp-preview__conflict">
          <div>
            <dt>Source A</dt>
            <dd>
              <code>src/worker-pool.ts</code>
              <span>MAX_WORKERS = 4, no AbortController timeout</span>
            </dd>
          </div>
          <div>
            <dt>Source B</dt>
            <dd>
              <code>production-runbook.md</code>
              <span>12 workers with a 30,000ms request abort bound</span>
            </dd>
          </div>
        </dl>
        <div className="ttp-preview__flow" aria-label="Task state path">
          {TASK_FLOW.map((state, index) => (
            <span key={state} className="ttp-preview__flow-item">
              {index > 0 ? <ArrowRight aria-hidden="true" /> : null}
              {state}
            </span>
          ))}
        </div>
      </>
    );
  }

  if (workspace === "specialist") {
    return (
      <>
        <div className="ttp-preview__head">
          <span>Specialist offer · Batch #1 · Rank #1 (96 pts)</span>
          <span className="ttp-preview__tag">L3 verified · $25.00 USD</span>
        </div>
        <p className="ttp-preview__note">
          <strong>Artifact v1 · src/worker-pool.ts</strong>
          <br />
          SHA-256: 8f94d2c1b7e04a31…
        </p>
        <pre className="ttp-preview__code">
          <code>{`+ const controller = new AbortController();
+ const timer = setTimeout(() => controller.abort(), 30_000);
+ try {
+   return await fetch(job.endpoint, { signal: controller.signal });
+ } finally {
+   clearTimeout(timer);
+ }`}</code>
        </pre>
        <p className="ttp-preview__note">
          Security gate: CLEAN · Gemini: APPROVE
          <br />
          Isolated runner: PASS (exit 0)
        </p>
        <div className="ttp-preview__tester">
          <span>Submission artifact</span>
          <code>unified diff · src/worker-pool.ts</code>
          <span>1 file · 412 bytes · immutable v1</span>
        </div>
        <p className="ttp-preview__foot">Top-5 offer wave · atomic first-accept · 4 siblings superseded</p>
      </>
    );
  }

  return (
    <>
      <div className="ttp-preview__head">
        <span>AG Grid Community · Security &amp; verification telemetry</span>
        <span className="ttp-preview__tag">Elastic hybrid synced</span>
      </div>
      <div className="ttp-preview__scroll">
        <table className="ttp-preview__table">
          <thead>
            <tr>
              <th>Artifact SHA-256</th>
              <th>Scanner</th>
              <th>Gemini gate</th>
              <th>Runner</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>8f94d2c1b7e0…</td>
              <td className="is-ok">CLEAN (0)</td>
              <td className="is-ok">APPROVE</td>
              <td className="is-ok">PASS (0)</td>
              <td className="is-ok">PASSED</td>
            </tr>
            <tr>
              <td>3c19a7e402b1…</td>
              <td className="is-warn">REVIEW (1)</td>
              <td className="is-warn">NEEDS_REVIEW</td>
              <td className="is-ok">PASS (0)</td>
              <td className="is-warn">MANUAL_REVIEW</td>
            </tr>
            <tr>
              <td>d041e8f9a11c…</td>
              <td className="is-bad">BLOCK (2)</td>
              <td className="is-bad">REJECT</td>
              <td>SKIPPED</td>
              <td className="is-bad">REJECTED</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="ttp-preview__tester">
        <span>Hybrid discovery tester</span>
        <code>worker-pool concurrency</code>
        <span>14 candidates · jina-embeddings-v3 + BM25</span>
      </div>
      <p className="ttp-preview__foot">5 AG Grid tables · instant CSV export · read-only ledger</p>
    </>
  );
}

const WORKSPACE_COPY: Record<
  WorkspaceKey,
  {
    no: string;
    title: string;
    description: string;
    points: string[];
    cta: string;
    href: string;
  }
> = {
  requester: {
    no: "Platform 01 · Requester",
    title: "Fund the escalation, then resume the agent.",
    description:
      "Submit technical questions or connect autonomous agents with scoped bearer keys. When analysis flags a conflict, fund a bounded review through PayPal Orders v2 and resume only after independent verification passes.",
    points: [
      "Deterministic conflict detection and explicit escalation thresholds",
      "Upfront PayPal Orders v2 reward funding before dispatch",
      "Cryptographically signed X-TrustToPay-Signature handback",
    ],
    cta: "Open agent workspace",
    href: "/app/workspace",
  },
  specialist: {
    no: "Platform 02 · Specialist",
    title: "Earn the badge, claim the task, sign your work.",
    description:
      "Specialists unlock sequential Foundation (L1), Practitioner (L2), and Advanced (L3) badges by passing timed technical assessments. Claim funded tasks atomically, upload code files or unified git diffs, and track PayPal Payouts in real time.",
    points: [
      "Sequential L1 → L2 → L3 verification; no self-reported badges",
      "Top-five parallel offers with atomic first-accept locking",
      "Immutable SHA-256 artifact and unified git diff workbench",
    ],
    cta: "Explore specialist workbench",
    href: "/app/marketplace",
  },
  admin: {
    no: "Platform 03 · Administration",
    title: "Watch the whole line from one signal box.",
    description:
      "Inspect specialists, task offer waves, deterministic and Gemini security verdicts, L1–L3 assessment attempts, and the read-only PayPal payment ledger with sorting, filtering, quick search, and CSV export.",
    points: [
      "5 AG Grid Community operational tables with instant CSV export",
      "Live Elastic hybrid discovery tester and index synchronization controls",
      "Read-only financial ledger with explicit provider reconciliation",
    ],
    cta: "Open admin console",
    href: "/app/admin",
  },
};

function Platforms() {
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceKey>("requester");
  const copy = WORKSPACE_COPY[workspace];
  const ctaHref = user ? copy.href : workspace === "admin" ? "/login" : "/register";

  return (
    <section id="product" className="ttp-section ttp-platforms">
      <div className="ttp-wrap">
        <div className="ttp-section__head">
          <div>
            <h2 className="ttp-h2">Three platforms in one departure hall.</h2>
            <div className="ttp-rule" aria-hidden="true">
              <span className="ttp-rule__node" />
            </div>
          </div>
          <div>
            <p className="ttp-copy">
              Requester, specialist, and administrator each get a role-scoped workspace over the same ledger: an agent
              console, a code workbench, and AG Grid operations.
            </p>
            <div className="ttp-platforms__tabs" role="group" aria-label="Workspace preview">
              {WORKSPACES.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="ttp-platform-tab"
                    aria-pressed={workspace === item.id}
                    onClick={() => setWorkspace(item.id)}
                  >
                    <Icon aria-hidden="true" /> {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="ttp-platform-panel">
          <div className="ttp-platform-panel__copy">
            <p className="ttp-platform-panel__no">{copy.no}</p>
            <h3 className="ttp-platform-panel__title">{copy.title}</h3>
            <p className="ttp-platform-panel__desc">{copy.description}</p>
            <ul className="ttp-platform-panel__list">
              {copy.points.map((point) => (
                <li key={point}>
                  <CheckCircle2 aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <div className="ttp-platform-panel__cta">
              <Link to={ctaHref} className="ttp-btn ttp-btn--ink">
                {copy.cta} <ArrowRight />
              </Link>
            </div>
          </div>
          <div className="ttp-platform-panel__preview">
            <WorkspacePreview workspace={workspace} />
          </div>
        </div>
      </div>
    </section>
  );
}

const AGENT_QUICKSTART = [
  { step: "01", route: "POST /api/v1/sessions/:id/analyze" },
  { step: "02", route: "POST /api/v1/tasks" },
  { step: "03", route: "GET /api/v1/tasks/:id/handback" },
] as const;

const DEVELOPER_FEATURES = [
  {
    icon: Terminal,
    title: "Versioned REST API (/api/v1) & OpenAPI spec",
    detail: "Structured JSON responses, idempotent task and payment endpoints, and live Swagger docs at /api-docs.",
  },
  {
    icon: ShieldCheck,
    title: "Cryptographic artifact & handback integrity",
    detail: "Canonical SHA-256 digests over submitted files and unified diffs, signed with HMAC-SHA256.",
  },
  {
    icon: Database,
    title: "Elastic hybrid search with relational fallback",
    detail: "Uses @elastic/elasticsearch for semantic + keyword specialist retrieval while preserving DB constraints.",
  },
] as const;

const HANDBACK_VERIFICATION_CODE = `import crypto from "node:crypto";

// 1. Fetch the verified specialist handback payload
const res = await fetch(\`https://trusttopay.internal/api/v1/tasks/\${taskId}/handback\`, {
  headers: { Authorization: \`Bearer \${process.env.TTP_AGENT_API_KEY}\` },
});

const signatureHeader = res.headers.get("x-trusttopay-signature") ?? "";
const rawBody = await res.text();

// 2. Verify X-TrustToPay-Signature (t=<timestamp>,v1=<hmac>)
const [tPart, v1Part] = signatureHeader.split(",");
const timestamp = tPart.replace("t=", "");
const expectedHmac = crypto
  .createHmac("sha256", process.env.TTP_HANDBACK_SECRET!)
  .update(\`\${timestamp}.\${rawBody}\`)
  .digest("hex");

if (!crypto.timingSafeEqual(Buffer.from(v1Part.replace("v1=", "")), Buffer.from(expectedHmac))) {
  throw new Error("Untrusted handback signature");
}

// 3. Apply verified artifact & resume agent session
const { handback } = JSON.parse(rawBody);
console.log("Verified artifact SHA-256:", handback.artifact.sha256Digest);`;

function SignalBox() {
  return (
    <section id="developers" className="ttp-section ttp-signalbox">
      <div className="ttp-wrap">
        <div className="ttp-signalbox__grid">
          <div>
            <h2 className="ttp-h2">Verify the handback before your agent moves.</h2>
            <div className="ttp-rule" aria-hidden="true">
              <span className="ttp-rule__node" />
            </div>
            <p className="ttp-copy">
              Authenticate autonomous agents with scoped <code>ttp_ak_…</code> bearer keys or session tokens. Every
              human deliverable arrives with <code>X-TrustToPay-Signature</code>, so a patch is applied only after the
              HMAC checks out.
            </p>

            <div className="ttp-signal-list">
              {DEVELOPER_FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="ttp-signal-item">
                    <Icon aria-hidden="true" />
                    <div>
                      <h3>{feature.title}</h3>
                      <p>{feature.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="ttp-signalbox__actions">
              <Link to="/app/docs" className="ttp-btn ttp-btn--signal">
                Read technical documentation <ArrowRight />
              </Link>
              <a
                href="/api-docs"
                target="_blank"
                rel="noreferrer"
                className="ttp-btn ttp-btn--outline"
              >
                OpenAPI / Swagger spec
              </a>
            </div>
          </div>

          <div className="ttp-code">
            <div className="ttp-code__bar">
              <span>verify-handback.ts · Agent resumption verification</span>
              <span>HMAC-SHA256</span>
            </div>
            <pre>
              <code>{HANDBACK_VERIFICATION_CODE}</code>
            </pre>
            <div className="ttp-code__foot">
              {AGENT_QUICKSTART.map((item) => (
                <div key={item.route} className="ttp-code__foot-item">
                  <span>{item.step}</span>
                  <code>{item.route}</code>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TicketOffice() {
  const { user } = useAuth();

  return (
    <section className="ttp-office" aria-labelledby="ttp-office-title">
      <div className="ttp-wrap ttp-office__inner">
        <div>
          <h2 id="ttp-office-title" className="ttp-h2">
            The next stuck agent is one ticket away.
          </h2>
          <p>
            Create a requester or specialist account, or walk the full nine-station protocol first. Demo mode runs on
            PayPal Sandbox with simulated payments.
          </p>
        </div>
        <div className="ttp-office__actions">
          <Link to={user ? "/app" : "/register"} className="ttp-btn ttp-btn--ink ttp-btn--lg">
            {user ? "Go to workspace" : "Create account"} <ArrowRight />
          </Link>
          <Link to="/login" className="ttp-btn ttp-btn--outline ttp-btn--lg">
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="ttp-footer">
      <div className="ttp-wrap">
        <div className="ttp-footer__top">
          <div>
            <span className="ttp-footer__mark">
              <TrustToPayLogoMark />
            </span>
            <p className="ttp-footer__brand-name">TrustToPay</p>
            <p className="ttp-footer__tagline">
              Human escalation, on the record. Every blocker funded, every handback signed.
            </p>
          </div>
          <div className="ttp-footer__col">
            <h3>Product</h3>
            <a href="#product">Workspaces</a>
            <a href="#how-it-works">Nine-station protocol</a>
            <Link to="/app/docs">Documentation</Link>
          </div>
          <div className="ttp-footer__col">
            <h3>Developers</h3>
            <a href="#developers">Agent integration</a>
            <a href="/api-docs" target="_blank" rel="noreferrer">
              OpenAPI spec
            </a>
            <Link to="/app/docs">Verify a handback</Link>
          </div>
          <div className="ttp-footer__col">
            <h3>Ticket office</h3>
            <Link to="/register">Create account</Link>
            <Link to="/login">Sign in</Link>
            <Link to="/app">Open console</Link>
          </div>
        </div>
        <div className="ttp-footer__bottom">
          <span>© 2026 TrustToPay · PayPal Sandbox only · demo payments are simulated.</span>
          <span>Elastic + PG · SHA-256 + Gemini · PayPal + HMAC</span>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  useEffect(() => {
    const body = document.body;
    const root = document.documentElement;
    const previous = {
      background: body.style.backgroundColor,
      color: body.style.color,
      colorScheme: root.style.colorScheme,
    };

    body.style.backgroundColor = "#f3f7fc";
    body.style.color = "#071b3b";
    root.style.colorScheme = "light";

    return () => {
      body.style.backgroundColor = previous.background;
      body.style.color = previous.color;
      root.style.colorScheme = previous.colorScheme;
    };
  }, []);

  return (
    <div className="ttp">
      <a className="ttp__skip" href="#ttp-main">
        Skip to content
      </a>
      <StationHeader />
      <main id="ttp-main">
        <HeroBoard />
        <RouteMap />
        <Platforms />
        <SignalBox />
        <TicketOffice />
      </main>
      <LandingFooter />
    </div>
  );
}
