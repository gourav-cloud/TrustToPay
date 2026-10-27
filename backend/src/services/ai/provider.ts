import { AppError } from "../../lib/errors.js";
import { config } from "../../config.js";
import { analysisOutputSchema, type AnalysisInput, type AnalysisOutput } from "./schema.js";

const SYSTEM_PROMPT = `You are the analysis engine for TrustToPay, a service that sends uncertain AI answers to qualified human reviewers.

Analyze the question and the supplied documents. Follow these rules exactly:
- Never invent specifications, model numbers, URLs, quotes, or citations.
- Use only the supplied question, specifications, product models, and documents.
- Explicitly detect missing specifications and contradictions between sources.
- Treat manufacturer/official documentation as stronger than retail listings or forums, but do not assume a source supports a claim unless its text says so.
- Your confidenceScore is a self-assessment used only as one signal. The server applies its own rule-based checks and may override your action.
- You MUST recommend ESCALATE_TO_HUMAN when a critical technical conflict remains unresolved or the evidence is too weak to decide.
- Recommend REQUEST_MORE_INFORMATION when the requester can resolve gaps cheaply, and RESOLVE_AUTOMATICALLY only when evidence is consistent and complete.
- suggestedReward.amountMinor is in integer minor units (USD cents).
- Return JSON only, matching the provided schema. No markdown fences.

JSON schema:
{
  "summary": string,
  "proposedAnswer": string,
  "confidenceScore": number 0..1,
  "uncertainties": string[],
  "conflictingClaims": [{ "claimA": string, "sourceA": string, "claimB": string, "sourceB": string, "severity": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", "detail": string }],
  "missingInformation": string[],
  "evidence": [{ "title": string, "url": string|null, "publisher": string|null, "strength": "STRONG"|"MODERATE"|"WEAK", "supportsAnswer": boolean, "excerpt": string }],
  "recommendedAction": "RESOLVE_AUTOMATICALLY"|"REQUEST_MORE_INFORMATION"|"ESCALATE_TO_HUMAN",
  "escalationReason": string,
  "suggestedReviewerSkills": string[],
  "suggestedReward": { "amountMinor": number, "currency": "USD", "rationale": string },
  "reasoningSummary": string
}`;

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return trimmed;
}

export async function runProviderAnalysis(input: AnalysisInput): Promise<{
  output: AnalysisOutput;
  provider: string;
  model: string;
}> {
  if (!config.aiConfigured) {
    throw new AppError(
      503,
      "AI_NOT_CONFIGURED",
      "The configured AI provider is missing AI_API_KEY, AI_BASE_URL, or AI_MODEL.",
    );
  }

  const documents = input.documents.map((doc) => ({
    ...doc,
    content: doc.content.slice(0, 6000),
  }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(`${config.aiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.aiApiKey}`,
      },
      body: JSON.stringify({
        model: config.aiModel,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              category: input.category ?? "CONCEPTUAL",
              question: input.question,
              productModels: input.productModels,
              specifications: input.specifications,
              documents,
              escalationThreshold: config.aiEscalationThreshold,
            }),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Read a bounded, safe error message; never echo Authorization headers.
      const text = await response.text().catch(() => "");
      const safe = text.slice(0, 300).replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]");
      throw new AppError(
        502,
        "AI_PROVIDER_ERROR",
        `The AI provider rejected the analysis request (HTTP ${response.status}). ${safe ? `Provider said: ${safe}` : ""}`.trim(),
      );
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      model?: string;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new AppError(502, "AI_PROVIDER_EMPTY", "The AI provider returned an empty response.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFence(content));
    } catch {
      throw new AppError(502, "AI_PROVIDER_INVALID_JSON", "The AI provider did not return valid JSON.");
    }

    const validated = analysisOutputSchema.safeParse(parsed);
    if (!validated.success) {
      throw new AppError(502, "AI_PROVIDER_SCHEMA_MISMATCH", "The AI provider response did not match the required schema.", {
        issues: validated.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    return {
      output: validated.data,
      provider: config.aiProvider,
      model: payload.model ?? config.aiModel,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError(504, "AI_PROVIDER_TIMEOUT", "The AI provider timed out after 45 seconds.");
    }
    throw new AppError(502, "AI_PROVIDER_UNREACHABLE", "The AI provider could not be reached.");
  } finally {
    clearTimeout(timeout);
  }
}
