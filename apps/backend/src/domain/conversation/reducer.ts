import type { DomainEvent } from '@selly/contracts';
import type {
    ConversationState,
    Utterance,
    SpeakerMetrics,
    DominanceMetrics,
    TranscriptWindow,
    ConfidenceMetrics,
    SpeakerStreak,
} from './state.js';

const DEFAULT_WINDOW_SIZE = 20;
const LOW_CONFIDENCE_THRESHOLD = 0.7;
const HIGH_CONFIDENCE_THRESHOLD = 0.9;

export function createInitialState(
    sessionId: string,
    workspaceId: string,
    timestamp: number
): ConversationState {
    const emptyMetrics: SpeakerMetrics = {
        utteranceCount: 0,
        totalSpeakingTimeMs: 0,
        totalWordCount: 0,
        avgUtteranceDurationMs: 0,
    };

    const emptyStreak: SpeakerStreak = {
        speaker: null,
        count: 0,
    };

    return {
        sessionId,
        workspaceId,
        startedAt: timestamp,
        lastEventAt: timestamp,
        transcriptWindow: {
            utterances: [],
            windowSize: DEFAULT_WINDOW_SIZE,
            totalUtteranceCount: 0,
            windowStartIndex: 0,
        },
        repMetrics: emptyMetrics,
        prospectMetrics: emptyMetrics,
        timing: {
            callDurationMs: 0,
            totalSilenceMs: 0,
            silenceCount: 0,
            longestSilenceMs: 0,
            avgSilenceMs: 0,
        },
        dominance: {
            repTalkRatio: 0,
            prospectTalkRatio: 0,
            currentStreak: emptyStreak,
            longestStreak: 0,
        },
        confidence: {
            avgConfidence: 0,
            minConfidence: 1,
            maxConfidence: 0,
            lowConfidenceCount: 0,
            highConfidenceRatio: 0,
        },
        phase: 'active',
        eventCount: 0,
    };
}

function updateSpeakerMetrics(
    prev: SpeakerMetrics,
    utterance: Utterance
): SpeakerMetrics {
    const newUtteranceCount = prev.utteranceCount + 1;
    const newTotalSpeakingTimeMs = prev.totalSpeakingTimeMs + utterance.durationMs;
    const wordCount = utterance.text
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0).length;
    const newTotalWordCount = prev.totalWordCount + wordCount;
    const newAvgDuration = newTotalSpeakingTimeMs / newUtteranceCount;

    return {
        utteranceCount: newUtteranceCount,
        totalSpeakingTimeMs: newTotalSpeakingTimeMs,
        totalWordCount: newTotalWordCount,
        avgUtteranceDurationMs: newAvgDuration,
    };
}

function updateTranscriptWindow(
    prev: TranscriptWindow,
    utterance: Utterance
): TranscriptWindow {
    const newTotal = prev.totalUtteranceCount + 1;
    const newUtterances = [...prev.utterances, utterance];

    if (newUtterances.length > prev.windowSize) {
        const overflow = newUtterances.length - prev.windowSize;
        return {
            utterances: newUtterances.slice(overflow),
            windowSize: prev.windowSize,
            totalUtteranceCount: newTotal,
            windowStartIndex: prev.windowStartIndex + overflow,
        };
    }

    return {
        utterances: newUtterances,
        windowSize: prev.windowSize,
        totalUtteranceCount: newTotal,
        windowStartIndex: prev.windowStartIndex,
    };
}

function updateConfidenceMetrics(
    prev: ConfidenceMetrics,
    confidence: number,
    totalUtteranceCount: number
): ConfidenceMetrics {
    const prevTotal = totalUtteranceCount - 1;
    const newAvg =
        prevTotal === 0
            ? confidence
            : (prev.avgConfidence * prevTotal + confidence) / totalUtteranceCount;

    const newMin = Math.min(prev.minConfidence, confidence);
    const newMax = Math.max(prev.maxConfidence, confidence);

    const newLowCount =
        confidence < LOW_CONFIDENCE_THRESHOLD
            ? prev.lowConfidenceCount + 1
            : prev.lowConfidenceCount;

    const prevHighCount = prev.highConfidenceRatio * prevTotal;
    const newHighCount =
        confidence >= HIGH_CONFIDENCE_THRESHOLD ? prevHighCount + 1 : prevHighCount;
    const newHighRatio =
        totalUtteranceCount > 0 ? newHighCount / totalUtteranceCount : 0;

    return {
        avgConfidence: newAvg,
        minConfidence: newMin,
        maxConfidence: newMax,
        lowConfidenceCount: newLowCount,
        highConfidenceRatio: newHighRatio,
    };
}

function updateDominanceMetrics(
    prev: DominanceMetrics,
    repMetrics: SpeakerMetrics,
    prospectMetrics: SpeakerMetrics
): DominanceMetrics {
    const totalSpeakingTime =
        repMetrics.totalSpeakingTimeMs + prospectMetrics.totalSpeakingTimeMs;
    const repRatio =
        totalSpeakingTime > 0 ? repMetrics.totalSpeakingTimeMs / totalSpeakingTime : 0;
    const prospectRatio =
        totalSpeakingTime > 0
            ? prospectMetrics.totalSpeakingTimeMs / totalSpeakingTime
            : 0;

    return {
        repTalkRatio: repRatio,
        prospectTalkRatio: prospectRatio,
        currentStreak: prev.currentStreak,
        longestStreak: prev.longestStreak,
    };
}

export function reduceConversationState(
    prevState: ConversationState | null,
    event: DomainEvent
): ConversationState {
    switch (event.type) {
        case 'call.started': {
            if (!event.payload.workspaceId) {
                throw new Error('call.started event missing required workspaceId');
            }
            const state = createInitialState(
                event.payload.callId,
                event.payload.workspaceId,
                event.payload.timestamp
            );
            return {
                ...state,
                eventCount: 1,
            };
        }

        case 'call.ended': {
            if (prevState === null) {
                throw new Error('Cannot process call.ended without initialized state');
            }
            const callDurationMs = event.payload.timestamp - prevState.startedAt;
            return {
                ...prevState,
                lastEventAt: event.payload.timestamp,
                timing: {
                    ...prevState.timing,
                    callDurationMs,
                },
                phase: 'ended',
                eventCount: prevState.eventCount + 1,
            };
        }

        case 'transcript.finalized': {
            if (prevState === null) {
                throw new Error('Cannot process transcript.finalized without initialized state');
            }

            const utterance: Utterance = {
                id: event.payload.utteranceId,
                speaker: event.payload.speaker,
                text: event.payload.text,
                startedAt: event.payload.startedAt,
                endedAt: event.payload.endedAt,
                durationMs: event.payload.endedAt - event.payload.startedAt,
                confidence: event.payload.confidence,
            };

            const newWindow = updateTranscriptWindow(prevState.transcriptWindow, utterance);

            const newRepMetrics =
                event.payload.speaker === 'rep'
                    ? updateSpeakerMetrics(prevState.repMetrics, utterance)
                    : prevState.repMetrics;

            const newProspectMetrics =
                event.payload.speaker === 'prospect'
                    ? updateSpeakerMetrics(prevState.prospectMetrics, utterance)
                    : prevState.prospectMetrics;

            const newConfidence = updateConfidenceMetrics(
                prevState.confidence,
                utterance.confidence,
                newWindow.totalUtteranceCount
            );

            const newDominance = updateDominanceMetrics(
                prevState.dominance,
                newRepMetrics,
                newProspectMetrics
            );

            const callDurationMs = event.payload.endedAt - prevState.startedAt;

            return {
                ...prevState,
                lastEventAt: event.payload.endedAt,
                transcriptWindow: newWindow,
                repMetrics: newRepMetrics,
                prospectMetrics: newProspectMetrics,
                timing: {
                    ...prevState.timing,
                    callDurationMs,
                },
                dominance: newDominance,
                confidence: newConfidence,
                eventCount: prevState.eventCount + 1,
            };
        }

        case 'speaker.turn_detected': {
            if (prevState === null) {
                throw new Error('Cannot process speaker.turn_detected without initialized state');
            }

            const prevStreak = prevState.dominance.currentStreak;
            const newStreak: SpeakerStreak =
                prevStreak.speaker === event.payload.speaker
                    ? { speaker: event.payload.speaker, count: prevStreak.count + 1 }
                    : { speaker: event.payload.speaker, count: 1 };

            const newLongestStreak = Math.max(prevState.dominance.longestStreak, newStreak.count);

            return {
                ...prevState,
                lastEventAt: event.payload.timestamp,
                dominance: {
                    ...prevState.dominance,
                    currentStreak: newStreak,
                    longestStreak: newLongestStreak,
                },
                eventCount: prevState.eventCount + 1,
            };
        }

        case 'silence.detected': {
            if (prevState === null) {
                throw new Error('Cannot process silence.detected without initialized state');
            }

            const callDurationMs = event.payload.timestamp - prevState.startedAt;
            const newTotalSilence = prevState.timing.totalSilenceMs + event.payload.durationMs;
            const newSilenceCount = prevState.timing.silenceCount + 1;
            const newLongestSilence = Math.max(
                prevState.timing.longestSilenceMs,
                event.payload.durationMs
            );
            const newAvgSilence = newSilenceCount > 0 ? newTotalSilence / newSilenceCount : 0;

            return {
                ...prevState,
                lastEventAt: event.payload.timestamp,
                timing: {
                    ...prevState.timing,
                    callDurationMs,
                    totalSilenceMs: newTotalSilence,
                    silenceCount: newSilenceCount,
                    longestSilenceMs: newLongestSilence,
                    avgSilenceMs: newAvgSilence,
                },
                eventCount: prevState.eventCount + 1,
            };
        }

        case 'transcript.received': {
            if (prevState === null) {
                throw new Error('Cannot process transcript.received without initialized state');
            }
            return {
                ...prevState,
                lastEventAt: event.payload.timestamp,
                eventCount: prevState.eventCount + 1,
            };
        }

        case 'audio.capture.started': {
            if (prevState === null) {
                throw new Error('Cannot process audio.capture.started without initialized state');
            }
            return {
                ...prevState,
                lastEventAt: event.payload.timestamp,
                eventCount: prevState.eventCount + 1,
            };
        }

        case 'audio.capture.stopped': {
            if (prevState === null) {
                throw new Error('Cannot process audio.capture.stopped without initialized state');
            }
            return {
                ...prevState,
                lastEventAt: event.payload.timestamp,
                eventCount: prevState.eventCount + 1,
            };
        }

        case 'question.detected':
        case 'suggestion.generated': {
            if (prevState === null) {
                throw new Error(`Cannot process ${event.type} without initialized state`);
            }
            return prevState;
        }

        default: {
            const _exhaustive: never = event;
            throw new Error(`Unhandled event type: ${(_exhaustive as DomainEvent).type}`);
        }
    }
}
