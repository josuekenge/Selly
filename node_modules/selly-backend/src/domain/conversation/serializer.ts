import type { ConversationState } from './state.js';

export const MIN_UTTERANCE_CONFIDENCE = 0.7;
export const MAX_UTTERANCES = 15;

export interface SerializedUtterance {
    readonly speaker: 'rep' | 'prospect';
    readonly text: string;
    readonly startedAt: number;
    readonly endedAt: number;
    readonly confidence: number;
}

export interface SerializedConversationContext {
    readonly call: {
        readonly sessionId: string;
        readonly workspaceId: string;
        readonly startedAt: number;
        readonly lastEventAt: number;
        readonly phase: 'active' | 'ended';
    };
    readonly transcript: {
        readonly utterances: readonly SerializedUtterance[];
    };
    readonly metrics: {
        readonly repMetrics: {
            readonly utteranceCount: number;
            readonly totalSpeakingTimeMs: number;
            readonly totalWordCount: number;
            readonly avgUtteranceDurationMs: number;
        };
        readonly prospectMetrics: {
            readonly utteranceCount: number;
            readonly totalSpeakingTimeMs: number;
            readonly totalWordCount: number;
            readonly avgUtteranceDurationMs: number;
        };
        readonly timing: {
            readonly callDurationMs: number;
            readonly totalSilenceMs: number;
            readonly silenceCount: number;
            readonly longestSilenceMs: number;
            readonly avgSilenceMs: number;
        };
        readonly dominance: {
            readonly repTalkRatio: number;
            readonly prospectTalkRatio: number;
            readonly currentStreak: {
                readonly speaker: 'rep' | 'prospect' | null;
                readonly count: number;
            };
            readonly longestStreak: number;
        };
        readonly confidence: {
            readonly avgConfidence: number;
            readonly minConfidence: number;
            readonly maxConfidence: number;
            readonly lowConfidenceCount: number;
            readonly highConfidenceRatio: number;
        };
    };
    readonly meta: {
        readonly eventCount: number;
    };
}

export function serializeConversationStateForAI(
    state: ConversationState
): SerializedConversationContext {
    const filteredUtterances = state.transcriptWindow.utterances.filter(
        (u) => u.confidence >= MIN_UTTERANCE_CONFIDENCE
    );

    const trimmedUtterances =
        filteredUtterances.length > MAX_UTTERANCES
            ? filteredUtterances.slice(-MAX_UTTERANCES)
            : filteredUtterances;

    const serializedUtterances: SerializedUtterance[] = trimmedUtterances.map((u) => ({
        speaker: u.speaker,
        text: u.text,
        startedAt: u.startedAt,
        endedAt: u.endedAt,
        confidence: u.confidence,
    }));

    return {
        call: {
            sessionId: state.sessionId,
            workspaceId: state.workspaceId,
            startedAt: state.startedAt,
            lastEventAt: state.lastEventAt,
            phase: state.phase,
        },
        transcript: {
            utterances: serializedUtterances,
        },
        metrics: {
            repMetrics: {
                utteranceCount: state.repMetrics.utteranceCount,
                totalSpeakingTimeMs: state.repMetrics.totalSpeakingTimeMs,
                totalWordCount: state.repMetrics.totalWordCount,
                avgUtteranceDurationMs: state.repMetrics.avgUtteranceDurationMs,
            },
            prospectMetrics: {
                utteranceCount: state.prospectMetrics.utteranceCount,
                totalSpeakingTimeMs: state.prospectMetrics.totalSpeakingTimeMs,
                totalWordCount: state.prospectMetrics.totalWordCount,
                avgUtteranceDurationMs: state.prospectMetrics.avgUtteranceDurationMs,
            },
            timing: {
                callDurationMs: state.timing.callDurationMs,
                totalSilenceMs: state.timing.totalSilenceMs,
                silenceCount: state.timing.silenceCount,
                longestSilenceMs: state.timing.longestSilenceMs,
                avgSilenceMs: state.timing.avgSilenceMs,
            },
            dominance: {
                repTalkRatio: state.dominance.repTalkRatio,
                prospectTalkRatio: state.dominance.prospectTalkRatio,
                currentStreak: {
                    speaker: state.dominance.currentStreak.speaker,
                    count: state.dominance.currentStreak.count,
                },
                longestStreak: state.dominance.longestStreak,
            },
            confidence: {
                avgConfidence: state.confidence.avgConfidence,
                minConfidence: state.confidence.minConfidence,
                maxConfidence: state.confidence.maxConfidence,
                lowConfidenceCount: state.confidence.lowConfidenceCount,
                highConfidenceRatio: state.confidence.highConfidenceRatio,
            },
        },
        meta: {
            eventCount: state.eventCount,
        },
    };
}
