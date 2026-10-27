import { config } from "../../config.js";
import { runDemoAnalysis } from "./demoEngine.js";
import { runProviderAnalysis } from "./provider.js";
import {
  analysisInputSchema,
  analysisOutputSchema,
  type AnalysisInput,
  type AnalysisOutput,
  type AnalysisResult,
} from "./schema.js";

/**
 * Public AI entry point. The returned output is schema-validated and then
 * passed through server-side escalation rules. Those rules are authoritative;
 * neither an LLM's self-reported confidence nor the browser can bypass them.
 */
export async function analyzeTask(rawInput: unknown): Promise<AnalysisResult> {
  const started = Date.now();
  const input = analysisInputSchema.parse(rawInput);

  let output: AnalysisOutput;
  let engine: "demo" | "provider";
  let provider: string;
  let model: string | null;

  if (config.aiConfigured) {
    const result = await runProviderAnalysis(input);
    output = result.output;
    engine = "provider";
    provider = result.provider;
    model = result.model;
  } else {
    output = runDemoAnalysis(input);
    engine = "demo";
    provider = "demo";
    model = null;
  }

  output = applyServerRules(output);
  output = analysisOutputSchema.parse(output);

  return {
    output,
    engine,
    provider,
    model,
    threshold: config.aiEscalationThreshold,
    durationMs: Date.now() - started,
  };
}

export function applyServerRules(output: AnalysisOutput): AnalysisOutput {
  const next: AnalysisOutput = {
    ...output,
    suggestedReviewerSkills:
      output.suggestedReviewerSkills.length > 0 ? output.suggestedReviewerSkills : ["Technical document review"],
    suggestedReward: {
      ...output.suggestedReward,
      amountMinor: Math.min(
        config.rewardMaxMinor,
        Math.max(config.rewardMinMinor, Math.round(output.suggestedReward.amountMinor)),
      ),
      currency: "USD",
    },
    confidenceScore: Math.max(0, Math.min(1, Number(output.confidenceScore.toFixed(2)))),
  };

  const hasCriticalConflict = next.conflictingClaims.some((conflict) => conflict.severity === "CRITICAL");

  // Critical conflicts always require a human, regardless of what the model said.
  if (hasCriticalConflict) {
    next.recommendedAction = "ESCALATE_TO_HUMAN";
    if (!next.escalationReason.trim()) {
      next.escalationReason =
        "A critical unresolved conflict was detected in the supplied evidence, so the answer must be verified by a human.";
    }
  }

  if (next.confidenceScore < config.aiEscalationThreshold && next.recommendedAction === "RESOLVE_AUTOMATICALLY") {
    next.recommendedAction = "ESCALATE_TO_HUMAN";
    if (!next.escalationReason.trim()) {
      next.escalationReason = `Heuristic confidence ${next.confidenceScore.toFixed(2)} is below the escalation threshold ${config.aiEscalationThreshold.toFixed(2)}.`;
    }
  }

  // A resolution with no evidence at all is not a resolution.
  if (next.recommendedAction === "RESOLVE_AUTOMATICALLY" && next.evidence.length === 0) {
    next.recommendedAction = "REQUEST_MORE_INFORMATION";
  }

  if (next.recommendedAction !== "RESOLVE_AUTOMATICALLY" && !next.escalationReason.trim()) {
    next.escalationReason =
      next.recommendedAction === "REQUEST_MORE_INFORMATION"
        ? "Required technical details are missing from the supplied material."
        : "The available evidence is not sufficient for an autonomous answer.";
  }

  return next;
}
