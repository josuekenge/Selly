// AI Signals Prompt Builder
// Step 3B: Builds prompts for LLM signal classification

import type { SerializedConversationContext } from '../../domain/conversation/serializer.js';

const SYSTEM_PROMPT = `You are a sales call analyzer. Your ONLY job is to identify signals in a conversation transcript.

OUTPUT FORMAT:
You MUST respond with ONLY valid JSON matching this exact schema:
{
  "signals": [
    {
      "type": "<one of: objection_detected | intent_detected | topic_detected | risk_flag | next_question_candidate | info_gap>",
      "label": "<short descriptive label, max 50 chars>",
      "confidence": <number 0.0 to 1.0>,
      "evidence": {
        "utteranceIndices": [<indices into the transcript array>],
        "quotes": ["<exact quote from transcript, max 120 chars each>"]
      }
    }
  ]
}

STRICT RULES:
1. Output ONLY JSON. No explanations, no markdown, no commentary.
2. Do NOT generate recommendations, pitches, or next-best-action text.
3. Do NOT suggest what the rep should say.
4. Each signal MUST cite evidence with utterance indices and exact quotes.
5. Keep confidence conservative. Only use 0.8+ for very clear signals.
6. Maximum 12 signals. Prioritize highest confidence.
7. Quotes must be exact substrings from the transcript, max 120 chars.
8. Use ONLY the allowed signal types listed above.

SIGNAL TYPE DEFINITIONS:
- objection_detected: Prospect raised concern, hesitation, or pushback
- intent_detected: Prospect expressed interest, buying signal, or next step intent
- topic_detected: A specific topic emerged (pricing, timeline, features, etc)
- risk_flag: Something concerning for deal health (competitor mention, budget issue, etc)
- next_question_candidate: Prospect asked or implied a question that may need response
- info_gap: Missing information that would help the conversation`;

export function buildAISignalsPrompt(
    ctx: SerializedConversationContext
): { system: string; user: string } {
    const transcriptLines = ctx.transcript.utterances.map((u, i) =>
        `[${i}] ${u.speaker.toUpperCase()}: "${u.text}"`
    ).join('\n');

    const user = `Analyze this sales call transcript and identify signals.

CALL METADATA:
- Session: ${ctx.call.sessionId}
- Duration: ${Math.round(ctx.metrics.timing.callDurationMs / 1000)}s
- Rep talk ratio: ${(ctx.metrics.dominance.repTalkRatio * 100).toFixed(1)}%

TRANSCRIPT (${ctx.transcript.utterances.length} utterances):
${transcriptLines || '(no utterances)'}

Return ONLY the JSON signals array as specified.`;

    return { system: SYSTEM_PROMPT, user };
}
