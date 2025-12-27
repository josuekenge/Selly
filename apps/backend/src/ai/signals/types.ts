// AI Signal Types
// Step 3B: AI classification of signals
// NO sales pitches, NO recommendations, structured classification only

import type { SerializedConversationContext } from '../../domain/conversation/serializer.js';

export const AI_SIGNALS_VERSION = '3B.0';

// ============================================
// AI SIGNAL TYPE ENUMERATION
// ============================================

export type AISignalType =
    | 'objection_detected'
    | 'intent_detected'
    | 'topic_detected'
    | 'risk_flag'
    | 'next_question_candidate'
    | 'info_gap';

// ============================================
// AI SIGNAL
// ============================================

export interface AISignal {
    readonly type: AISignalType;
    readonly label: string;
    readonly confidence: number;
    readonly createdAt: number;
    readonly evidence: {
        readonly utteranceIndices: readonly number[];
        readonly quotes: readonly string[];
    };
}

// ============================================
// AI SIGNAL SET
// ============================================

export interface AISignalSet {
    readonly call: {
        readonly sessionId: string;
        readonly lastEventAt: number;
    };
    readonly signals: readonly AISignal[];
    readonly model: string;
    readonly version: string;
}
