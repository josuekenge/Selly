// Signal Extractor
// Step 3A: Deterministic signal extraction
// NO AI logic, NO LLM calls, NO inference beyond thresholding and keyword spotting

import type { SerializedConversationContext } from '../domain/conversation/serializer.js';
import type { Signal, SignalSet, SignalEvidence, UtteranceEvidence, MetricEvidence } from './types.js';
import {
    TALK_RATIO_REP_LOW,
    TALK_RATIO_REP_HIGH,
    LONG_SILENCE_MS,
    LOW_AVG_CONFIDENCE,
    MAX_SIGNALS,
    KEYWORD_WINDOW_UTTERANCES,
    FREQUENT_SILENCE_PER_MINUTE,
} from './constants.js';

const VERSION = '3A.0';

const PRICING_KEYWORDS = ['price', 'pricing', 'cost', 'budget', 'expensive', 'cheaper', 'quote'];
const COMPETITOR_KEYWORDS = ['salesforce', 'hubspot', 'zoho', 'pipedrive', 'microsoft', 'dynamics', 'sap', 'oracle'];
const INTEGRATION_KEYWORDS = ['integrate', 'integration', 'api', 'webhook', 'sync', 'connector', 'works with', 'connect to'];

function truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + '...';
}

function metricEvidence(key: string, value: number): MetricEvidence {
    return { kind: 'metric', key, value };
}

function utteranceEvidence(index: number, text: string): UtteranceEvidence {
    return { kind: 'utterance', index, snippet: truncate(text, 120) };
}

function createSignal(
    type: Signal['type'],
    confidence: number,
    createdAt: number,
    evidence: SignalEvidence[]
): Signal {
    return { type, confidence, createdAt, evidence };
}

function matchesKeywords(text: string, keywords: readonly string[]): boolean {
    const lower = text.toLowerCase();
    return keywords.some((kw) => lower.includes(kw));
}

export function extractSignals(ctx: SerializedConversationContext): SignalSet {
    const signals: Signal[] = [];
    const createdAt = ctx.call.lastEventAt;
    const { dominance, timing, confidence } = ctx.metrics;
    const utterances = ctx.transcript.utterances;

    // A) rep_talk_ratio_low
    if (dominance.repTalkRatio < TALK_RATIO_REP_LOW) {
        const conf = dominance.repTalkRatio < TALK_RATIO_REP_LOW / 2 ? 0.95 : 0.85;
        signals.push(createSignal('rep_talk_ratio_low', conf, createdAt, [
            metricEvidence('repTalkRatio', dominance.repTalkRatio),
        ]));
    }

    // B) rep_talk_ratio_high
    if (dominance.repTalkRatio > TALK_RATIO_REP_HIGH) {
        const threshold = 1 - (1 - TALK_RATIO_REP_HIGH) / 2;
        const conf = dominance.repTalkRatio > threshold ? 0.95 : 0.85;
        signals.push(createSignal('rep_talk_ratio_high', conf, createdAt, [
            metricEvidence('repTalkRatio', dominance.repTalkRatio),
        ]));
    }

    // C) long_silence
    if (timing.longestSilenceMs >= LONG_SILENCE_MS) {
        signals.push(createSignal('long_silence', 0.9, createdAt, [
            metricEvidence('longestSilenceMs', timing.longestSilenceMs),
        ]));
    }

    // D) frequent_silence
    const callMinutes = Math.max(1, timing.callDurationMs / 60000);
    const silencesPerMinute = timing.silenceCount / callMinutes;
    if (silencesPerMinute >= FREQUENT_SILENCE_PER_MINUTE) {
        const conf = Math.min(0.9, 0.8 + (silencesPerMinute - FREQUENT_SILENCE_PER_MINUTE) * 0.02);
        signals.push(createSignal('frequent_silence', conf, createdAt, [
            metricEvidence('silencesPerMinute', silencesPerMinute),
        ]));
    }

    // E) low_transcript_confidence
    if (confidence.avgConfidence < LOW_AVG_CONFIDENCE) {
        signals.push(createSignal('low_transcript_confidence', 0.9, createdAt, [
            metricEvidence('avgConfidence', confidence.avgConfidence),
        ]));
    }

    // F) transcript_sparse
    if (utterances.length < 3) {
        signals.push(createSignal('transcript_sparse', 0.9, createdAt, [
            metricEvidence('utteranceCountInWindow', utterances.length),
        ]));
    }

    // G) prospect_recently_spoke / rep_recently_spoke
    if (utterances.length >= 1) {
        const lastIdx = utterances.length - 1;
        const lastUtterance = utterances[lastIdx];
        const signalType = lastUtterance.speaker === 'prospect'
            ? 'prospect_recently_spoke'
            : 'rep_recently_spoke';
        signals.push(createSignal(signalType, 0.95, createdAt, [
            utteranceEvidence(lastIdx, lastUtterance.text),
        ]));
    }

    // H) Keyword signals
    const windowStart = Math.max(0, utterances.length - KEYWORD_WINDOW_UTTERANCES);
    const recentUtterances = utterances.slice(windowStart);

    const pricingMatches: UtteranceEvidence[] = [];
    const competitorMatches: UtteranceEvidence[] = [];
    const integrationMatches: UtteranceEvidence[] = [];

    for (let i = 0; i < recentUtterances.length; i++) {
        const u = recentUtterances[i];
        const globalIndex = windowStart + i;

        if (pricingMatches.length < 3 && matchesKeywords(u.text, PRICING_KEYWORDS)) {
            pricingMatches.push(utteranceEvidence(globalIndex, u.text));
        }
        if (competitorMatches.length < 3 && matchesKeywords(u.text, COMPETITOR_KEYWORDS)) {
            competitorMatches.push(utteranceEvidence(globalIndex, u.text));
        }
        if (integrationMatches.length < 3 && matchesKeywords(u.text, INTEGRATION_KEYWORDS)) {
            integrationMatches.push(utteranceEvidence(globalIndex, u.text));
        }
    }

    if (pricingMatches.length > 0) {
        signals.push(createSignal('mentions_pricing', 0.5, createdAt, pricingMatches));
    }
    if (competitorMatches.length > 0) {
        signals.push(createSignal('mentions_competitor', 0.5, createdAt, competitorMatches));
    }
    if (integrationMatches.length > 0) {
        signals.push(createSignal('asks_for_integration', 0.5, createdAt, integrationMatches));
    }

    // Sort by confidence desc, tie-breaker by type lexicographically
    signals.sort((a, b) => {
        if (b.confidence !== a.confidence) {
            return b.confidence - a.confidence;
        }
        return a.type.localeCompare(b.type);
    });

    // Cap to MAX_SIGNALS
    const cappedSignals = signals.slice(0, MAX_SIGNALS);

    return {
        call: {
            sessionId: ctx.call.sessionId,
            lastEventAt: ctx.call.lastEventAt,
        },
        signals: cappedSignals,
        version: VERSION,
    };
}
