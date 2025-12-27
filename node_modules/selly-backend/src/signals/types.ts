// Signal Types
// Step 3A: Deterministic signal extraction types
// NO AI logic, NO LLM calls, NO sales recommendations

import type { SerializedConversationContext } from '../domain/conversation/serializer.js';

// ============================================
// SIGNAL TYPE ENUMERATION
// ============================================

export type SignalType =
    | 'rep_talk_ratio_low'
    | 'rep_talk_ratio_high'
    | 'long_silence'
    | 'frequent_silence'
    | 'low_transcript_confidence'
    | 'transcript_sparse'
    | 'prospect_recently_spoke'
    | 'rep_recently_spoke'
    | 'mentions_pricing'
    | 'mentions_competitor'
    | 'asks_for_integration';

// ============================================
// SIGNAL EVIDENCE
// ============================================

export interface UtteranceEvidence {
    readonly kind: 'utterance';
    readonly index: number;
    readonly snippet: string;
}

export interface MetricEvidence {
    readonly kind: 'metric';
    readonly key: string;
    readonly value: number;
}

export type SignalEvidence = UtteranceEvidence | MetricEvidence;

// ============================================
// SIGNAL
// ============================================

export interface Signal {
    readonly type: SignalType;
    readonly confidence: number;
    readonly createdAt: number;
    readonly evidence: readonly SignalEvidence[];
}

// ============================================
// SIGNAL SET
// ============================================

export interface SignalSet {
    readonly call: {
        readonly sessionId: string;
        readonly lastEventAt: number;
    };
    readonly signals: readonly Signal[];
    readonly version: string;
}
