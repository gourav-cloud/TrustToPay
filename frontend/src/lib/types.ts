export type Role = "REQUESTER" | "REVIEWER" | "ADMIN";

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  isReviewerApproved: boolean;
  isActive: boolean;
  createdAt: string;
  profile?: {
    headline: string | null;
    bio: string | null;
    timezone: string;
    payoutProvider: string;
    payoutEmail: string | null;
    payoutConsent: boolean;
  } | null;
  skills?: { id: string; name: string; category: string; level: number }[];
};

export type Conflict = {
  claimA: string;
  sourceA: string;
  claimB: string;
  sourceB: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  detail: string;
};

export type EvidenceItem = {
  title: string;
  url?: string | null;
  publisher?: string | null;
  strength: "STRONG" | "MODERATE" | "WEAK";
  supportsAnswer: boolean;
  excerpt: string;
};

export type AnalysisOutput = {
  summary: string;
  proposedAnswer: string;
  confidenceScore: number;
  uncertainties: string[];
  conflictingClaims: Conflict[];
  missingInformation: string[];
  evidence: EvidenceItem[];
  recommendedAction: "RESOLVE_AUTOMATICALLY" | "REQUEST_MORE_INFORMATION" | "ESCALATE_TO_HUMAN";
  escalationReason: string;
  suggestedReviewerSkills: string[];
  suggestedReward: { amountMinor: number; currency: string; rationale: string };
  reasoningSummary: string;
};

export type AnalysisRun = {
  id: string;
  sessionId: string;
  engine: "demo" | "provider";
  provider: string;
  model: string | null;
  threshold: number;
  recommendedAction: AnalysisOutput["recommendedAction"];
  confidenceScore: number;
  durationMs: number;
  createdAt: string;
  output: AnalysisOutput | null;
  demo: boolean;
};

export type EvidenceSource = {
  id: string;
  title: string;
  url: string | null;
  publisher: string | null;
  sourceType: "MANUFACTURER" | "RETAILER" | "MARKETPLACE" | "FORUM" | "DOCUMENT";
  content: string;
  isSeed: boolean;
  createdAt: string;
};

export type AgentSession = {
  id: string;
  userId: string;
  title: string;
  question: string;
  category: string;
  productModels: string[];
  specifications: string[];
  status: string;
  finalAnswer: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  analysisRuns?: AnalysisRun[];
  evidence?: EvidenceSource[];
  latestAnalysis?: AnalysisRun | null;
  latestTask?: TaskSummary | null;
  tasks?: TaskSummary[];
  _count?: { tasks: number; evidence: number };
};

export type Reward = {
  id: string;
  amountMinor: number;
  currency: string;
  amountDisplay: string;
  status: string;
  approvedAt: string | null;
  paidAt: string | null;
};

export type TaskSummary = {
  id: string;
  sessionId: string;
  title: string;
  question: string;
  category: string;
  status: string;
  riskLevel: string;
  reward: Reward | null;
  rewardMinor: number;
  currency: string;
  requiredSkills: string[];
  acceptanceCriteria: string;
  createdAt: string;
  updatedAt: string;
  fundedAt: string | null;
  verifiedAt: string | null;
  completedAt: string | null;
  isSeed: boolean;
  requester?: { id: string; name: string };
  assignment: {
    id: string;
    acceptedAt: string;
    reviewer: { id: string; name: string };
    isMine: boolean;
  } | null;
  submissionCount?: number;
};

export type VerificationCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  severity: "HARD" | "SOFT";
};

export type VerificationRun = {
  id: string;
  taskId: string;
  submissionId: string;
  status: "PASSED" | "REJECTED" | "NEEDS_MANUAL_REVIEW" | "PENDING";
  decisionReason: string;
  checksPassed: VerificationCheck[];
  checksFailed: VerificationCheck[];
  evidenceReferences: { label: string; url: string | null; quote?: string }[];
  requiresAdminReview: boolean;
  engine: "AUTOMATED" | "MANUAL";
  createdAt: string;
};

export type Submission = {
  id: string;
  taskId: string;
  reviewerId: string;
  answer: string;
  explanation: string;
  confidenceScore: number;
  sourceUrl: string | null;
  evidenceNotes: string | null;
  status: string;
  isSeed: boolean;
  createdAt: string;
  verificationRuns?: VerificationRun[];
};

export type Payment = {
  id: string;
  taskId: string;
  rewardId: string | null;
  type: "FUNDING" | "PAYOUT";
  provider: "DEMO" | "PAYPAL_SANDBOX";
  mode: "SIMULATED" | "SANDBOX";
  status: string;
  amountMinor: number;
  currency: string;
  amountDisplay: string;
  isSimulated: boolean;
  orderId: string | null;
  captureId: string | null;
  payoutBatchId: string | null;
  payoutItemId: string | null;
  recipientEmail: string | null;
  description: string;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
  capturedAt: string | null;
  paidAt: string | null;
  task?: {
    id: string;
    title: string;
    status: string;
    requester?: { id: string; name: string };
    assignment?: { reviewerId: string; reviewer: { name: string } } | null;
  };
};

export type TaskEvent = {
  id: string;
  taskId: string;
  type: string;
  message: string;
  actorId: string | null;
  metadata: unknown;
  createdAt: string;
};

export type TaskDetail = TaskSummary & {
  finalAnswer: string | null;
  fundingModel: string;
  events: TaskEvent[];
  evidence: EvidenceSource[];
  submissions: Submission[];
  verificationRuns: VerificationRun[];
  payments: Payment[];
  payoutEligible: boolean;
  payoutEmailVisible: string | null;
  reviewerPayout: { consent: boolean; email: string | null; provider: string } | null;
  session?: {
    id: string;
    title: string;
    question: string;
    productModels: string[];
    specifications: string[];
    finalAnswer: string | null;
  };
  hasOpenDispute: boolean;
};

export type IntegrationStatus = {
  ai: {
    provider: string;
    configured: boolean;
    engine: string;
    model: string;
    threshold: number;
    label: string;
  };
  paypal: {
    environment: string;
    demoMode: boolean;
    paymentsMode: "SIMULATED" | "SANDBOX";
    credentialsPresent: boolean;
    configured: boolean;
    checkoutReady: boolean;
    payoutsRequested: boolean;
    payoutsEnabled: boolean;
    webhookConfigured: boolean;
    currency: string;
    clientId: string | null;
    label: string;
  };
  demoUsersEnabled: boolean;
  database: { provider: string; label: string };
  rewardLimits: {
    minMinor: number;
    maxMinor: number;
    minDisplay: string;
    maxDisplay: string;
    currency: string;
  };
  issues: { level: "error" | "warning" | "info"; code: string; message: string; hint?: string }[];
  docs: Record<string, string>;
};

export type Paginated<T> = {
  items: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export type Notification = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};
