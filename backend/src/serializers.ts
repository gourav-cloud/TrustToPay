import { config } from "./config.js";
import { formatMinorUnits } from "./lib/money.js";
import { parseJson } from "./lib/json.js";
import { serializePayment } from "./services/payments.js";
import type { AnalysisOutput } from "./services/ai/schema.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export function serializeAnalysisRun(run: Row) {
  const { outputJson, ...rest } = run;
  return {
    ...rest,
    output: parseJson<AnalysisOutput | null>(outputJson, null),
    demo: run.engine === "demo",
  };
}

export function serializeSession(session: Row) {
  return {
    ...session,
    productModels: parseJson<string[]>(session.productModelsJson, []),
    specifications: parseJson<string[]>(session.specificationsJson, []),
    analysisRuns: session.analysisRuns?.map(serializeAnalysisRun),
  };
}

export function parseSkills(json: string | null | undefined): string[] {
  return parseJson<string[]>(json, []);
}

export function serializeTaskSummary(task: Row, viewer?: { id: string; role: string }) {
  const reward = task.reward
    ? {
        ...task.reward,
        amountDisplay: formatMinorUnits(task.reward.amountMinor, task.reward.currency),
      }
    : null;

  return {
    id: task.id,
    sessionId: task.sessionId,
    title: task.title,
    question: task.question,
    category: task.category,
    status: task.status,
    riskLevel: task.riskLevel,
    reward,
    rewardMinor: task.rewardMinor,
    currency: task.currency,
    requiredSkills: parseSkills(task.requiredSkillsJson),
    acceptanceCriteria: task.acceptanceCriteria,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    fundedAt: task.fundedAt,
    verifiedAt: task.verifiedAt,
    completedAt: task.completedAt,
    isSeed: task.isSeed,
    requester: task.requester ? { id: task.requester.id, name: task.requester.name } : undefined,
    assignment: task.assignment
      ? {
          id: task.assignment.id,
          acceptedAt: task.assignment.acceptedAt,
          reviewer: {
            id: task.assignment.reviewer.id,
            name: task.assignment.reviewer.name,
          },
          isMine: viewer ? task.assignment.reviewerId === viewer.id : false,
        }
      : null,
    submissionCount: task._count?.submissions ?? task.submissions?.length ?? undefined,
  };
}

export function serializeTaskDetail(task: Row, viewer: { id: string; role: string }) {
  const isAdmin = viewer.role === "ADMIN";
  const isRequester = task.requesterId === viewer.id;
  const isAssignedReviewer = task.assignment?.reviewerId === viewer.id;
  const canSeeReviewDetails = isAdmin || isRequester || isAssignedReviewer;

  const payoutEmailVisible =
    isAdmin || isAssignedReviewer || isRequester ? task.assignment?.reviewer?.profile?.payoutEmail ?? null : null;

  const submissions = canSeeReviewDetails
    ? (task.submissions ?? []).map((submission: Row) => ({
        ...submission,
        verificationRuns: submission.verificationRuns?.map(serializeVerificationRun),
      }))
    : [];

  const payments = isAdmin || isRequester
    ? (task.payments ?? []).map(serializePayment)
    : isAssignedReviewer
      ? (task.payments ?? [])
          .filter((payment: Row) => payment.type === "PAYOUT")
          .map(serializePayment)
      : [];

  return {
    ...serializeTaskSummary(task, viewer),
    finalAnswer: task.finalAnswer,
    fundingModel: task.fundingModel,
    events: (task.events ?? []).map((event: Row) => ({
      ...event,
      metadata: parseJson(event.metadataJson, null),
    })),
    evidence: (task.evidence ?? []).map((evidence: Row) => ({
      ...evidence,
      isSeed: evidence.isSeed,
    })),
    submissions,
    verificationRuns: canSeeReviewDetails
      ? (task.verificationRuns ?? []).map(serializeVerificationRun)
      : [],
    payments,
    payoutEligible:
      isRequester || isAdmin
        ? task.status === "PAYMENT_READY" && task.reward?.status === "AUTHORIZED"
        : false,
    payoutEmailVisible,
    reviewerPayout:
      canSeeReviewDetails && task.assignment?.reviewer?.profile
        ? {
            consent: task.assignment.reviewer.profile.payoutConsent,
            email: payoutEmailVisible,
            provider: task.assignment.reviewer.profile.payoutProvider,
          }
        : null,
    session: task.session
      ? {
          id: task.session.id,
          title: task.session.title,
          question: task.session.question,
          productModels: parseJson<string[]>(task.session.productModelsJson, []),
          specifications: parseJson<string[]>(task.session.specificationsJson, []),
          finalAnswer: task.session.finalAnswer,
        }
      : undefined,
    hasOpenDispute: (task.disputes ?? []).some((dispute: Row) => dispute.status === "OPEN"),
  };
}

export function serializeVerificationRun(run: Row) {
  return {
    ...run,
    checksPassed: parseJson(run.checksPassedJson, []),
    checksFailed: parseJson(run.checksFailedJson, []),
    evidenceReferences: parseJson(run.evidenceReferencesJson, []),
  };
}

export function serializeUserAdmin(user: Row) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    isReviewerApproved: user.isReviewerApproved,
    createdAt: user.createdAt,
    profile: user.profile
      ? {
          payoutEmail: user.profile.payoutEmail,
          payoutConsent: user.profile.payoutConsent,
          payoutProvider: user.profile.payoutProvider,
        }
      : null,
    skills: user.skills ?? [],
    stats: {
      requestedTasks: user._count?.requestedTasks ?? 0,
      submissions: user._count?.submissions ?? 0,
    },
  };
}

export function serializeNotification(notification: Row) {
  return { ...notification };
}

export function publicIntegrationStatus() {
  return {
    ai: {
      provider: config.aiProvider,
      configured: config.aiConfigured,
      engine: config.aiConfigured ? "provider" : "demo",
      model: config.aiConfigured ? config.aiModel : "deterministic demo engine",
      threshold: config.aiEscalationThreshold,
      label: config.aiConfigured ? `AI provider (${config.aiProvider})` : "Demo AI Mode",
    },
    paypal: {
      environment: config.paypalEnv,
      demoMode: config.demoMode,
      paymentsMode: config.paymentsMode,
      credentialsPresent: config.paypalCredentialsPresent,
      configured: config.paypalConfigured,
      checkoutReady: config.paymentsMode === "SIMULATED" || config.paypalConfigured,
      payoutsRequested: config.paypalPayoutsRequested,
      payoutsEnabled: config.paypalPayoutsEnabled,
      webhookConfigured: Boolean(config.paypalWebhookId),
      currency: config.paypalCurrency,
      clientId: config.paypalConfigured ? config.paypalClientId : null,
      label:
        config.paymentsMode === "SIMULATED"
          ? "Simulated payments (no PayPal money moves)"
          : config.paypalConfigured
            ? "Genuine PayPal Sandbox"
            : "PayPal Sandbox requested but not configured",
    },
    demoUsersEnabled: config.demoUsersEnabled,
    database: { provider: "sqlite", label: "SQLite (local, persistent)" },
    rewardLimits: {
      minMinor: config.rewardMinMinor,
      maxMinor: config.rewardMaxMinor,
      minDisplay: formatMinorUnits(config.rewardMinMinor),
      maxDisplay: formatMinorUnits(config.rewardMaxMinor),
      currency: config.paypalCurrency,
    },
  };
}
