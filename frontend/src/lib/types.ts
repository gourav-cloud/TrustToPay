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

export type PayoutAvailability = "DEMO_SIMULATED" | "PAYOUT_UNAVAILABLE" | "SANDBOX_ENABLED";

export type TaskOffer = {
  id: string;
  taskId: string;
  specialistId: string;
  batchNumber: number;
  rank: number;
  score: number;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "SUPERSEDED";
  offeredAt: string;
  expiresAt: string;
  respondedAt: string | null;
  specialist?: {
    id: string;
    name: string;
    email: string;
  };
};

export type ArtifactManifestEntry = {
  path: string;
  sizeBytes: number;
  sha256: string;
};

export type ArtifactFileItem = {
  path: string;
  content: string;
  sizeBytes: number;
  sha256: string;
};

export type SubmissionArtifact = {
  id: string;
  submissionId: string;
  taskId: string;
  version: number;
  sha256Digest: string;
  manifest: ArtifactManifestEntry[];
  files: ArtifactFileItem[];
  patchText: string | null;
  archiveUrl: string | null;
  totalSizeBytes: number;
  fileCount: number;
  isQuarantined: boolean;
  quarantineReason: string | null;
  invalidated: boolean;
  invalidatedAt: string | null;
  createdAt: string;
};

export type SecurityGateVerdict =
  | "PASS"
  | "NEEDS_HUMAN_REVIEW"
  | "BLOCK"
  | "SAFETY_REVIEW_FAILED";

export type SecurityReviewResult = {
  verdict: SecurityGateVerdict;
  deterministic: {
    passed: boolean;
    hasHardBlock: boolean;
    hasHighRiskFinding: boolean;
    findings: {
      ruleId: string;
      severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
      category: string;
      message: string;
      filePath?: string;
      evidenceSnippet?: string;
    }[];
  };
  gemini: {
    model: string;
    verdict: SecurityGateVerdict;
    confidence: number;
    summary: string;
    findings: {
      severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
      category: string;
      description: string;
      filePath?: string;
      recommendation?: string;
    }[];
  } | null;
  summary: string;
};

export type ExecutionSummaryResult = {
  mode: "ISOLATED_WORKER" | "FIXTURE_SIMULATED";
  verdict: "PASS" | "FAIL" | "TIMEOUT" | "ERROR";
  passed: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  summary: string;
  limits: {
    timeoutMs: number;
    maxMemoryMb: number;
    maxOutputBytes: number;
    networkAccess: "DISABLED";
    secretEnvForwarded: false;
  };
};

export type AgentHandbackPayload = {
  schemaVersion: "1.0";
  taskId: string;
  sessionId: string;
  taskStatus: string;
  verifiedAt: string;
  handedOffAt: string;
  handoffIdempotencyKey: string;
  artifact: {
    submissionId: string;
    version: number;
    sha256Digest: string;
    fileCount: number;
    totalSizeBytes: number;
    manifest: ArtifactManifestEntry[];
    files: ArtifactFileItem[];
    patchText: string | null;
    archiveUrl: string | null;
  };
  verification: {
    verificationRunId: string;
    status: "PASSED";
    engine: string;
    decisionReason: string;
    securityVerdict: string | null;
    securitySummary: string | null;
    executionSummary: ExecutionSummaryResult | null;
    checksPassedCount: number;
    checksFailedCount: number;
  };
  deliverable: {
    answer: string;
    explanation: string;
    confidenceScore: number;
    sourceUrl: string | null;
    evidenceNotes: string | null;
  };
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
  requiredSkillId?: string | null;
  minimumSkillLevel?: number;
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
  myOffer?: TaskOffer | null;
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
  artifactVersion?: number | null;
  artifactSha256?: string | null;
  invalidated?: boolean;
  invalidatedAt?: string | null;
  securityVerdict?: SecurityGateVerdict | null;
  securityReview?: SecurityReviewResult | null;
  executionSummary?: ExecutionSummaryResult | null;
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
  version?: number;
  sha256Digest?: string | null;
  answer: string;
  explanation: string;
  confidenceScore: number;
  sourceUrl: string | null;
  evidenceNotes: string | null;
  status: string;
  isSeed: boolean;
  createdAt: string;
  artifact?: SubmissionArtifact | null;
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
  payoutAvailability?: PayoutAvailability;
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
  handedOffAt?: string | null;
  handedOffArtifactSha256?: string | null;
  callbackUrl?: string | null;
  callbackConfigured?: boolean;
  offers?: TaskOffer[];
  events: TaskEvent[];
  evidence: EvidenceSource[];
  submissions: Submission[];
  artifacts?: SubmissionArtifact[];
  verificationRuns: VerificationRun[];
  payments: Payment[];
  payoutEligible: boolean;
  payoutAvailability?: PayoutAvailability;
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
    payoutAvailability?: PayoutAvailability;
    indiaMerchantConstraintNote?: string;
    webhookConfigured: boolean;
    currency: string;
    clientId: string | null;
    label: string;
  };
  demoUsersEnabled: boolean;
  database: { provider: string; label: string };
  elastic?: {
    enabled: boolean;
    configured: boolean;
    indexName: string;
    jinaConfigured: boolean;
    embeddingModel: string;
    mode: "HYBRID_ELASTIC" | "DATABASE_FALLBACK";
    label: string;
  };
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

export type SkillStageSummary = {
  id: string;
  level: number;
  levelName: string;
  title: string;
  description: string;
  version: string;
  passingScore: number;
  cooldownMinutes: number;
  questionCount: number;
  status: "PASSED" | "AVAILABLE" | "COOLDOWN" | "LOCKED";
  unlocked: boolean;
  passed: boolean;
  cooldownUntil: string | null;
  latestAttempt: {
    id: string;
    status: string;
    score: number;
    startedAt: string;
    completedAt: string | null;
  } | null;
};

export type SkillCatalogItem = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  version: string;
  verifiedLevel: number;
  verifiedLevelName: string | null;
  verifiedAt: string | null;
  stages: SkillStageSummary[];
};

export type SkillAssessmentQuestion = {
  id: string;
  type: "MULTIPLE_CHOICE" | "CODE_TASK";
  prompt: string;
  starterCode?: string;
  options?: { id: string; text: string }[];
  weight: number;
};

export type SkillAssessmentAttemptResult = {
  id: string;
  skillId: string;
  skillSlug: string;
  skillName: string;
  level: number;
  levelName: string;
  status: string;
  passed: boolean;
  score: number;
  passingScore: number;
  verifiedLevel: number;
  verifiedLevelName: string | null;
  cooldownUntil: string | null;
  completedAt: string | null;
  evaluations: {
    questionId: string;
    passed: boolean;
    earnedWeight: number;
    maxWeight: number;
    feedback: string;
  }[];
};

export type AdminSpecialistRow = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  isReviewerApproved: boolean;
  availabilityStatus: "AVAILABLE" | "AT_CAPACITY" | "PENDING_APPROVAL" | "DEACTIVATED";
  verifiedSkills: {
    skillId: string;
    slug: string;
    name: string;
    category: string;
    level: number;
    levelName: string;
    score: number;
  }[];
  verifiedSkillsSummary: string;
  highestSkillLevel: number;
  activeWorkload: number;
  maxWorkload: number;
  completedCount: number;
  acceptedSubmissions: number;
  rejectedSubmissions: number;
  successRate: number;
  avgTurnaroundMinutes: number | null;
  payoutConsent: boolean;
  createdAt: string;
};

export type AdminTaskRow = {
  id: string;
  title: string;
  status: string;
  category: string;
  riskLevel: string;
  requiredSkills: string[];
  requiredSkillsSummary: string;
  minimumSkillLevel: number;
  rewardMinor: number;
  currency: string;
  rewardDisplay: string;
  rewardStatus: string;
  requesterName: string;
  assignedSpecialistName: string | null;
  assignedSpecialistId: string | null;
  totalOffers: number;
  pendingOffers: number;
  acceptedOffers: number;
  expiredOffers: number;
  declinedOffers: number;
  expiresAt: string | null;
  createdAt: string;
};

export type AdminVerificationRow = {
  id: string;
  taskId: string;
  taskTitle: string;
  taskStatus: string;
  submissionId: string;
  reviewerName: string;
  artifactVersion: number;
  artifactSha256: string | null;
  deterministicVerdict: "PASS" | "BLOCK";
  deterministicFindingCount: number;
  geminiVerdict: string;
  securityEngine: string;
  riskLevel: string;
  testRunnerMode: string;
  testPassed: boolean;
  testExitCode: number;
  testDurationMs: number;
  verificationStatus: string;
  engine: string;
  requiresAdminReview: boolean;
  decisionReason: string;
  createdAt: string;
};

export type AdminPaymentLedgerRow = {
  id: string;
  taskId: string;
  taskTitle: string;
  taskStatus: string;
  requesterName: string;
  reviewerName: string | null;
  type: "FUNDING" | "PAYOUT";
  mode: "SIMULATED" | "SANDBOX";
  provider: string;
  orderId: string | null;
  captureId: string | null;
  payoutBatchId: string | null;
  amountMinor: number;
  amountDisplay: string;
  currency: string;
  status: string;
  payoutAvailability: PayoutAvailability;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  capturedAt: string | null;
  paidAt: string | null;
};

export type AdminAssessmentRow = {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  isReviewerApproved: boolean;
  skillId: string;
  skillSlug: string;
  skillName: string;
  category: string;
  level: number;
  levelName: string;
  stageTitle: string;
  version: string;
  status: string;
  score: number;
  passingScore: number;
  passed: boolean;
  startedAt: string;
  completedAt: string | null;
};

