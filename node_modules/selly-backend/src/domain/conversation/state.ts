// ConversationState
// Deterministic, AI-free state of a real-time sales call
// Built exclusively from structured agent events
// All fields are explainable via math, aggregation, timestamps, or simple counters
//
// SCOPE: Step 2 only — raw state accumulation
// Signal interpretation (questions, intent, insights) belongs in Step 3

// ============================================
// UTTERANCE TYPES
// ============================================

/** A single transcribed utterance from a speaker */
export interface Utterance {
    /** Unique identifier for this utterance */
    readonly id: string;

    /** Speaker identifier: 'rep' (salesperson) or 'prospect' */
    readonly speaker: 'rep' | 'prospect';

    /** Transcribed text content */
    readonly text: string;

    /** Unix timestamp when utterance started (ms) */
    readonly startedAt: number;

    /** Unix timestamp when utterance ended (ms) */
    readonly endedAt: number;

    /** Duration of this utterance in milliseconds */
    readonly durationMs: number;

    /** Transcription confidence score (0-1) from transcription provider */
    readonly confidence: number;
}

// ============================================
// SPEAKER METRICS
// ============================================

/** Aggregated metrics for a single speaker (raw counters only) */
export interface SpeakerMetrics {
    /** Total number of utterances by this speaker */
    readonly utteranceCount: number;

    /** Total speaking time in milliseconds */
    readonly totalSpeakingTimeMs: number;

    /** Total word count (whitespace-split) */
    readonly totalWordCount: number;

    /** Average utterance duration in milliseconds */
    readonly avgUtteranceDurationMs: number;
}

// ============================================
// TIMING METRICS
// ============================================

/** Call timing and pacing metrics (raw measurements only) */
export interface TimingMetrics {
    /** Total call duration in milliseconds */
    readonly callDurationMs: number;

    /** Total silence duration in milliseconds (gaps > 500ms) */
    readonly totalSilenceMs: number;

    /** Number of silence gaps (pauses > 500ms between utterances) */
    readonly silenceCount: number;

    /** Longest single silence gap in milliseconds */
    readonly longestSilenceMs: number;

    /** Average silence duration in milliseconds */
    readonly avgSilenceMs: number;
}

// ============================================
// SPEAKER STREAK
// ============================================

/** Current consecutive utterance streak by same speaker */
export interface SpeakerStreak {
    /** Speaker with current streak, null if no utterances yet */
    readonly speaker: 'rep' | 'prospect' | null;

    /** Number of consecutive utterances by this speaker */
    readonly count: number;
}

// ============================================
// DOMINANCE METRICS
// ============================================

/** Speaker balance metrics (ratios derived from raw counters) */
export interface DominanceMetrics {
    /** Rep talk ratio: rep speaking time / total speaking time (0-1) */
    readonly repTalkRatio: number;

    /** Prospect talk ratio: prospect speaking time / total speaking time (0-1) */
    readonly prospectTalkRatio: number;

    /** Current speaker streak */
    readonly currentStreak: SpeakerStreak;

    /** Longest streak of consecutive utterances by same speaker */
    readonly longestStreak: number;
}

// ============================================
// TRANSCRIPT WINDOW
// ============================================

/** Sliding window of recent utterances for context */
export interface TranscriptWindow {
    /** Recent utterances (most recent last), capped at windowSize */
    readonly utterances: readonly Utterance[];

    /** Maximum number of utterances to retain in window */
    readonly windowSize: number;

    /** Total utterances seen (including those outside window) */
    readonly totalUtteranceCount: number;

    /** Index of first utterance in window relative to all utterances */
    readonly windowStartIndex: number;
}

// ============================================
// CONFIDENCE AGGREGATION
// ============================================

/** Aggregated transcription confidence metrics (single source of truth) */
export interface ConfidenceMetrics {
    /** Average confidence across all utterances (0-1) */
    readonly avgConfidence: number;

    /** Minimum confidence seen (0-1) */
    readonly minConfidence: number;

    /** Maximum confidence seen (0-1) */
    readonly maxConfidence: number;

    /** Count of low-confidence utterances (< 0.7) */
    readonly lowConfidenceCount: number;

    /** Percentage of utterances with high confidence (>= 0.9) */
    readonly highConfidenceRatio: number;
}

// ============================================
// CONVERSATION STATE (MAIN INTERFACE)
// ============================================

/** 
 * Deterministic state of a real-time sales call.
 * 
 * Built exclusively from structured agent events.
 * All fields are derived via math, aggregation, timestamps, or simple counters.
 * Contains NO AI-derived insights, question detection, or intent classification.
 * 
 * Phase rules:
 * - 'active': Call is in progress (events being received)
 * - 'ended': Call has terminated (no more events expected)
 */
export interface ConversationState {
    /** Unique session identifier */
    readonly sessionId: string;

    /** Workspace this conversation belongs to */
    readonly workspaceId: string;

    /** Unix timestamp when call started (ms) */
    readonly startedAt: number;

    /** Unix timestamp of last event processed (ms) */
    readonly lastEventAt: number;

    /** Sliding window of recent utterances */
    readonly transcriptWindow: TranscriptWindow;

    /** Aggregated metrics for the sales rep */
    readonly repMetrics: SpeakerMetrics;

    /** Aggregated metrics for the prospect */
    readonly prospectMetrics: SpeakerMetrics;

    /** Call timing and pacing metrics */
    readonly timing: TimingMetrics;

    /** Speaker balance and dominance metrics */
    readonly dominance: DominanceMetrics;

    /** Transcription confidence aggregation (single source of truth) */
    readonly confidence: ConfidenceMetrics;

    /** 
     * Current call phase (deterministic):
     * - 'active': receiving events
     * - 'ended': call terminated
     */
    readonly phase: 'active' | 'ended';

    /** Total events processed to build this state */
    readonly eventCount: number;
}
