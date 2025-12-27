// Recommendations Prompt Builder
// Step 4: Generate structured recommendations grounded in transcript and signals
// NO UI logic, NO persistence, NO state mutation

import type { SerializedConversationContext } from '../../domain/conversation/serializer.js';
import type { SignalSet } from '../../signals/types.js';
import type { AISignalSet } from '../signals/types.js';

/**
 * Builds the system and user prompts for generating recommendations.
 */
export function buildRecommendationsPrompt(args: {
    ctx: SerializedConversationContext;
    signals3a: SignalSet;
    signals3b: AISignalSet;
}): { system: string; user: string } {
    const { ctx, signals3a, signals3b } = args;

    const system = `You are a sales coach AI. Output ONLY valid JSON matching the schema below. No markdown, no explanations, no content outside JSON.

OUTPUT FORMAT (exactly this structure):
{
  "recommendations": [
    {
      "type": "next_best_response" | "discovery_question" | "objection_handling" | "positioning_point" | "next_step",
      "title": string (max 60 chars),
      "script": string (max 600 chars),
      "confidence": number (0 to 1),
      "evidence": {
        "utteranceIndices": number[],
        "quotes": string[] (each max 120 chars, exact substrings from the utterances at the specified indices)
      },
      "basedOnSignals": {
        "deterministic": string[],
        "ai": [{ "type": string, "label": string }]
      },
      "warnings": string[]
    }
  ]
}

RULES:
1. Output ONLY a JSON object with a "recommendations" array (maximum 5 recommendations).
2. Each recommendation MUST cite evidence with utteranceIndices and exact quotes from those specific utterances.
3. Quotes MUST be exact substrings from the transcript utterances at the specified utteranceIndices (case-insensitive match allowed).
4. If evidence is weak or transcript confidence is low, reduce confidence and add warnings.
5. Do NOT invent product facts.
6. Do NOT write long explanations.
7. Do NOT include markdown.
8. Do NOT include any content outside JSON.
9. If no valid recommendations can be made, output: { "recommendations": [] }`;

    const utterancesJson = JSON.stringify(
        ctx.transcript.utterances.map((u, i) => ({
            index: i,
            speaker: u.speaker,
            text: u.text,
            confidence: u.confidence,
        })),
        null,
        2
    );

    const deterministicSignalsJson = JSON.stringify(
        signals3a.signals.map((s) => ({
            type: s.type,
            confidence: s.confidence,
            evidence: s.evidence,
        })),
        null,
        2
    );

    const aiSignalsJson = JSON.stringify(
        signals3b.signals.map((s) => ({
            type: s.type,
            label: s.label,
            confidence: s.confidence,
            evidence: s.evidence,
        })),
        null,
        2
    );

    const metricsJson = JSON.stringify(
        {
            repTalkRatio: ctx.metrics.dominance.repTalkRatio,
            prospectTalkRatio: ctx.metrics.dominance.prospectTalkRatio,
            avgConfidence: ctx.metrics.confidence.avgConfidence,
            callDurationMs: ctx.metrics.timing.callDurationMs,
        },
        null,
        2
    );

    const user = `TRANSCRIPT (utterances with indices):
${utterancesJson}

DETERMINISTIC SIGNALS (Step 3A):
${deterministicSignalsJson}

AI SIGNALS (Step 3B):
${aiSignalsJson}

METRICS:
${metricsJson}

Generate up to 5 actionable recommendations for the sales rep based on the above context. Each recommendation must be grounded in the transcript with exact quotes from the specified utterance indices. Output ONLY the JSON object with "recommendations" array.`;

    return { system, user };
}
