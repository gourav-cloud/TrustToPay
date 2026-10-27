import { z } from "zod";

export const actionSchema = z.enum([
  "RESOLVE_AUTOMATICALLY",
  "REQUEST_MORE_INFORMATION",
  "ESCALATE_TO_HUMAN",
]);

export const conflictSeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const evidenceStrengthSchema = z.enum(["STRONG", "MODERATE", "WEAK"]);

export const analysisInputSchema = z.object({
  category: z.string().trim().max(80).optional(),
  question: z.string().trim().min(10, "Ask a question with at least 10 characters.").max(4000),
  productModels: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  specifications: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  documents: z
    .array(
      z.object({
        title: z.string().trim().min(2).max(250),
        url: z.string().trim().max(1000).optional().nullable(),
        publisher: z.string().trim().max(200).optional().nullable(),
        sourceType: z
          .enum(["MANUFACTURER", "RETAILER", "MARKETPLACE", "FORUM", "DOCUMENT"])
          .default("DOCUMENT"),
        content: z.string().trim().min(5, "Document text is too short.").max(20000),
      }),
    )
    .max(20)
    .default([]),
});

export type AnalysisInput = z.infer<typeof analysisInputSchema>;

export const conflictSchema = z.object({
  claimA: z.string().min(1).max(500),
  sourceA: z.string().min(1).max(250),
  claimB: z.string().min(1).max(500),
  sourceB: z.string().min(1).max(250),
  severity: conflictSeveritySchema,
  detail: z.string().min(1).max(1000),
});

export const evidenceItemSchema = z.object({
  title: z.string().min(1).max(250),
  url: z.string().max(1000).nullable().optional(),
  publisher: z.string().max(200).nullable().optional(),
  strength: evidenceStrengthSchema,
  supportsAnswer: z.boolean(),
  excerpt: z.string().max(1000),
});

export const analysisOutputSchema = z.object({
  summary: z.string().min(10).max(2000),
  proposedAnswer: z.string().min(5).max(4000),
  confidenceScore: z.number().min(0).max(1),
  uncertainties: z.array(z.string().max(500)).max(20),
  conflictingClaims: z.array(conflictSchema).max(20),
  missingInformation: z.array(z.string().max(500)).max(20),
  evidence: z.array(evidenceItemSchema).max(30),
  recommendedAction: actionSchema,
  escalationReason: z.string().max(2000),
  suggestedReviewerSkills: z.array(z.string().min(1).max(120)).min(1).max(10),
  suggestedReward: z.object({
    amountMinor: z.number().int().min(1).max(1000000),
    currency: z.string().length(3),
    rationale: z.string().min(1).max(1000),
  }),
  reasoningSummary: z.string().min(10).max(3000),
});

export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;
export type AnalysisAction = z.infer<typeof actionSchema>;
export type Conflict = z.infer<typeof conflictSchema>;

export type AnalysisResult = {
  output: AnalysisOutput;
  engine: "demo" | "provider";
  provider: string;
  model: string | null;
  threshold: number;
  durationMs: number;
};
