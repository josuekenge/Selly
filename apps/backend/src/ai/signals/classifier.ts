// AI Signals Classifier
// Step 3B: LLM-based signal classification

import type { SerializedConversationContext } from '../../domain/conversation/serializer.js';
import type { AISignal, AISignalSet, AISignalType } from './types.js';
import { AI_SIGNALS_VERSION } from './types.js';
import { buildAISignalsPrompt } from './prompt.js';

// Placeholder model name - callers should pass opts.model in production
const DEFAULT_CLASSIFIER_MODEL = 'gpt-4o-mini';
const MAX_OUTPUT_TOKENS = 2048;
const MAX_SIGNALS = 12;
const MAX_QUOTE_LENGTH = 120;

const VALID_SIGNAL_TYPES: readonly AISignalType[] = [
    'objection_detected',
    'intent_detected',
    'topic_detected',
    'risk_flag',
    'next_question_candidate',
    'info_gap',
];

export interface LlmJsonClient {
    completeJson(args: {
        model: string;
        system: string;
        user: string;
        maxOutputTokens: number;
    }): Promise<unknown>;
}

function isValidSignalType(type: unknown): type is AISignalType {
    return typeof type === 'string' && VALID_SIGNAL_TYPES.includes(type as AISignalType);
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + '...';
}

function isQuoteInTranscript(
    quote: string,
    utterances: readonly { text: string }[]
): boolean {
    const normalizedQuote = quote.toLowerCase().trim();
    if (normalizedQuote.length === 0) return false;

    for (const u of utterances) {
        if (u.text.toLowerCase().includes(normalizedQuote)) {
            return true;
        }
    }
    return false;
}

function validateSignal(
    raw: unknown,
    ctx: SerializedConversationContext
): AISignal | null {
    if (typeof raw !== 'object' || raw === null) return null;

    const obj = raw as Record<string, unknown>;

    if (!isValidSignalType(obj.type)) return null;
    if (typeof obj.label !== 'string' || obj.label.length === 0) return null;
    if (typeof obj.confidence !== 'number') return null;

    const evidence = obj.evidence;
    if (typeof evidence !== 'object' || evidence === null) return null;

    const evidenceObj = evidence as Record<string, unknown>;
    const rawIndices = evidenceObj.utteranceIndices;
    const rawQuotes = evidenceObj.quotes;

    if (!Array.isArray(rawIndices)) return null;
    if (!Array.isArray(rawQuotes)) return null;

    const maxIndex = ctx.transcript.utterances.length - 1;
    const validIndices = rawIndices
        .filter((i): i is number => typeof i === 'number' && i >= 0 && i <= maxIndex);

    // Validate quotes are actual substrings from the transcript
    const validQuotes = rawQuotes
        .filter((q): q is string => typeof q === 'string' && q.length > 0)
        .filter((q) => isQuoteInTranscript(q, ctx.transcript.utterances))
        .map((q) => truncate(q, MAX_QUOTE_LENGTH));

    // Require at least one valid index AND at least one valid quote
    if (validIndices.length === 0) return null;
    if (validQuotes.length === 0) return null;

    return {
        type: obj.type,
        label: truncate(obj.label, 50),
        confidence: clamp(obj.confidence, 0, 1),
        createdAt: ctx.call.lastEventAt,
        evidence: {
            utteranceIndices: validIndices,
            quotes: validQuotes,
        },
    };
}

function createEmptySignalSet(
    ctx: SerializedConversationContext,
    model: string
): AISignalSet {
    return {
        call: {
            sessionId: ctx.call.sessionId,
            lastEventAt: ctx.call.lastEventAt,
        },
        signals: [],
        model,
        version: AI_SIGNALS_VERSION,
    };
}

export async function classifyAISignals(
    llm: LlmJsonClient,
    ctx: SerializedConversationContext,
    opts?: { model?: string }
): Promise<AISignalSet> {
    const model = opts?.model ?? DEFAULT_CLASSIFIER_MODEL;
    const { system, user } = buildAISignalsPrompt(ctx);

    let rawResponse: unknown;
    try {
        rawResponse = await llm.completeJson({
            model,
            system,
            user,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
        });
    } catch {
        return createEmptySignalSet(ctx, model);
    }

    if (typeof rawResponse !== 'object' || rawResponse === null) {
        return createEmptySignalSet(ctx, model);
    }

    const responseObj = rawResponse as Record<string, unknown>;
    const rawSignals = responseObj.signals;

    if (!Array.isArray(rawSignals)) {
        return createEmptySignalSet(ctx, model);
    }

    const validatedSignals: AISignal[] = [];
    for (const raw of rawSignals) {
        const validated = validateSignal(raw, ctx);
        if (validated !== null) {
            validatedSignals.push(validated);
        }
    }

    const sortedSignals = validatedSignals
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, MAX_SIGNALS);

    return {
        call: {
            sessionId: ctx.call.sessionId,
            lastEventAt: ctx.call.lastEventAt,
        },
        signals: sortedSignals,
        model,
        version: AI_SIGNALS_VERSION,
    };
}
