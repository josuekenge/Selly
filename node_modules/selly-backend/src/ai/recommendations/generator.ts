// Recommendations Generator
// Step 4: Generate structured recommendations grounded in transcript and signals
// NO UI logic, NO persistence, NO state mutation

import type { SerializedConversationContext } from '../../domain/conversation/serializer.js';
import type { SignalSet } from '../../signals/types.js';
import type { AISignalSet } from '../signals/types.js';
import type {
    Recommendation,
    RecommendationEvidence,
    RecommendationSet,
    RecommendationType,
} from './types.js';
import { RECOMMENDATIONS_VERSION } from './types.js';
import { buildRecommendationsPrompt } from './prompt.js';

// ============================================
// LLM CLIENT INTERFACE
// ============================================

export interface LlmJsonClient {
    completeJson(args: { system: string; user: string; model?: string }): Promise<unknown>;
}

// ============================================
// CONSTANTS
// ============================================

const MAX_RECOMMENDATIONS = 5;
const MAX_QUOTE_LENGTH = 120;
const MAX_TITLE_LENGTH = 60;
const MAX_SCRIPT_LENGTH = 600;
/** Placeholder model name; actual routing depends on injected LlmJsonClient. */
const DEFAULT_RECOMMENDER_MODEL = 'gpt-4o';

const VALID_TYPES: ReadonlySet<RecommendationType> = new Set([
    'next_best_response',
    'discovery_question',
    'objection_handling',
    'positioning_point',
    'next_step',
]);

// ============================================
// VALIDATION HELPERS
// ============================================

function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function isValidType(type: unknown): type is RecommendationType {
    return typeof type === 'string' && VALID_TYPES.has(type as RecommendationType);
}

function isQuoteInUtterances(
    quote: string,
    utterances: readonly { text: string }[],
    indices: readonly number[]
): boolean {
    const quoteLower = quote.toLowerCase();
    return indices.some((i) => {
        const utterance = utterances[i];
        return utterance && utterance.text.toLowerCase().includes(quoteLower);
    });
}

function areIndicesInBounds(indices: readonly number[], maxIndex: number): boolean {
    return indices.every((i) => typeof i === 'number' && i >= 0 && i <= maxIndex);
}

function validateEvidence(
    evidence: unknown,
    utterances: readonly { text: string }[]
): RecommendationEvidence | null {
    if (!evidence || typeof evidence !== 'object') return null;

    const ev = evidence as Record<string, unknown>;

    // Validate utteranceIndices
    if (!Array.isArray(ev.utteranceIndices) || ev.utteranceIndices.length === 0) return null;
    const rawIndices = ev.utteranceIndices.filter((i): i is number => typeof i === 'number');
    if (rawIndices.length === 0) return null;

    // Deduplicate and sort ascending
    const indices = [...new Set(rawIndices)].sort((a, b) => a - b);

    // Bounds check with deduped indices
    if (!areIndicesInBounds(indices, utterances.length - 1)) return null;

    // Validate quotes
    if (!Array.isArray(ev.quotes) || ev.quotes.length === 0) return null;
    const rawQuotes = ev.quotes.filter((q): q is string => typeof q === 'string' && q.length > 0);
    if (rawQuotes.length === 0) return null;

    // Truncate quotes first, then validate against utterances at specified indices
    const validQuotes: string[] = [];
    for (const q of rawQuotes) {
        // Truncate without ellipsis to preserve substring truth
        const truncated = truncate(q, MAX_QUOTE_LENGTH);
        // Validate using the truncated portion against specified indices
        if (isQuoteInUtterances(truncated, utterances, indices)) {
            validQuotes.push(truncated);
        }
    }

    if (validQuotes.length === 0) return null;

    return {
        utteranceIndices: indices,
        quotes: validQuotes,
    };
}

function validateBasedOnSignals(basedOn: unknown): {
    deterministic: readonly string[];
    ai: ReadonlyArray<{ readonly type: string; readonly label: string }>;
} {
    const result: {
        deterministic: string[];
        ai: Array<{ type: string; label: string }>;
    } = {
        deterministic: [],
        ai: [],
    };

    if (!basedOn || typeof basedOn !== 'object') return result;

    const bo = basedOn as Record<string, unknown>;

    if (Array.isArray(bo.deterministic)) {
        result.deterministic = bo.deterministic.filter((s): s is string => typeof s === 'string');
    }

    if (Array.isArray(bo.ai)) {
        result.ai = bo.ai
            .filter(
                (s): s is { type: string; label: string } =>
                    s !== null &&
                    typeof s === 'object' &&
                    typeof (s as Record<string, unknown>).type === 'string' &&
                    typeof (s as Record<string, unknown>).label === 'string'
            )
            .map((s) => ({ type: s.type, label: s.label }));
    }

    return result;
}

function validateWarnings(warnings: unknown): readonly string[] {
    if (!Array.isArray(warnings)) return [];
    return warnings.filter((w): w is string => typeof w === 'string');
}

function validateRecommendation(
    raw: unknown,
    utterances: readonly { text: string }[],
    createdAt: number
): Recommendation | null {
    if (!raw || typeof raw !== 'object') return null;

    const r = raw as Record<string, unknown>;

    // Validate type
    if (!isValidType(r.type)) return null;

    // Validate title
    if (typeof r.title !== 'string' || r.title.length === 0) return null;

    // Validate script
    if (typeof r.script !== 'string' || r.script.length === 0) return null;

    // Validate confidence
    const confidence = typeof r.confidence === 'number' ? clamp(r.confidence, 0, 1) : 0.5;

    // Validate evidence
    const evidence = validateEvidence(r.evidence, utterances);
    if (!evidence) return null;

    // Validate basedOnSignals
    const basedOnSignals = validateBasedOnSignals(r.basedOnSignals);

    // Validate warnings
    const warnings = validateWarnings(r.warnings);

    return {
        type: r.type,
        title: truncate(r.title, MAX_TITLE_LENGTH),
        script: truncate(r.script, MAX_SCRIPT_LENGTH),
        confidence,
        createdAt,
        evidence,
        basedOnSignals,
        warnings,
    };
}

// ============================================
// SORTING
// ============================================

const TYPE_ORDER: Record<RecommendationType, number> = {
    next_best_response: 0,
    discovery_question: 1,
    objection_handling: 2,
    positioning_point: 3,
    next_step: 4,
};

function compareRecommendations(a: Recommendation, b: Recommendation): number {
    // Primary: highest confidence first
    if (a.confidence !== b.confidence) {
        return b.confidence - a.confidence;
    }
    // Secondary: by type order
    if (a.type !== b.type) {
        return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    }
    // Tertiary: by title alphabetically
    return a.title.localeCompare(b.title);
}

// ============================================
// MAIN GENERATOR
// ============================================

function createEmptyRecommendationSet(
    sessionId: string,
    lastEventAt: number,
    model: string
): RecommendationSet {
    return {
        call: {
            sessionId,
            lastEventAt,
        },
        recommendations: [],
        model,
        version: RECOMMENDATIONS_VERSION,
    };
}

export async function generateRecommendations(
    llm: LlmJsonClient,
    args: {
        ctx: SerializedConversationContext;
        signals3a: SignalSet;
        signals3b: AISignalSet;
    },
    opts?: { model?: string }
): Promise<RecommendationSet> {
    const { ctx, signals3a, signals3b } = args;
    const model = opts?.model ?? DEFAULT_RECOMMENDER_MODEL;
    const sessionId = ctx.call.sessionId;
    const lastEventAt = ctx.call.lastEventAt;

    try {
        // Build prompts
        const { system, user } = buildRecommendationsPrompt({
            ctx,
            signals3a,
            signals3b,
        });

        // Call LLM
        const rawResponse = await llm.completeJson({ system, user, model });

        // Parse response - accept ONLY { recommendations: [...] } object shape
        if (
            !rawResponse ||
            typeof rawResponse !== 'object' ||
            !('recommendations' in rawResponse) ||
            !Array.isArray((rawResponse as Record<string, unknown>).recommendations)
        ) {
            return createEmptyRecommendationSet(sessionId, lastEventAt, model);
        }

        const rawArray = (rawResponse as Record<string, unknown>).recommendations as unknown[];

        // Validate each recommendation
        const utterances = ctx.transcript.utterances;
        const validated: Recommendation[] = [];

        for (const raw of rawArray) {
            const rec = validateRecommendation(raw, utterances, lastEventAt);
            if (rec) {
                validated.push(rec);
            }
        }

        // Sort and cap
        validated.sort(compareRecommendations);
        const capped = validated.slice(0, MAX_RECOMMENDATIONS);

        return {
            call: {
                sessionId,
                lastEventAt,
            },
            recommendations: capped,
            model,
            version: RECOMMENDATIONS_VERSION,
        };
    } catch {
        // If anything fails, return empty set
        return createEmptyRecommendationSet(sessionId, lastEventAt, model);
    }
}
