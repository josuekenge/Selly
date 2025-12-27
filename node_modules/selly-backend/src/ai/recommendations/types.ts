import type { SerializedConversationContext } from '../../domain/conversation/serializer.js';
import type { SignalSet } from '../../signals/types.js';
import type { AISignalSet } from '../signals/types.js';

/**
 * Version of the recommendations output schema.
 */
export const RECOMMENDATIONS_VERSION = '4.0';

/**
 * Union of all supported recommendation types.
 */
export type RecommendationType =
    | 'next_best_response'
    | 'discovery_question'
    | 'objection_handling'
    | 'positioning_point'
    | 'next_step';

/**
 * Evidence supporting a recommendation, linking back to transcript content.
 */
export interface RecommendationEvidence {
    /** Indices of utterances in the transcript that support this recommendation. */
    readonly utteranceIndices: readonly number[];
    /** Direct quotes from the transcript (each max 120 chars). */
    readonly quotes: readonly string[];
}

/**
 * A single actionable recommendation for the sales rep.
 */
export interface Recommendation {
    /** The category of this recommendation. */
    readonly type: RecommendationType;
    /** Short title summarizing the recommendation (max 60 chars). */
    readonly title: string;
    /** Suggested script or talking point (max 600 chars). */
    readonly script: string;
    /** Confidence score from 0 to 1. */
    readonly confidence: number;
    /** Timestamp when this recommendation was created (must equal ctx.call.lastEventAt at runtime). */
    readonly createdAt: number;
    /** Evidence from the transcript supporting this recommendation. */
    readonly evidence: RecommendationEvidence;
    /** Signals that informed this recommendation. */
    readonly basedOnSignals: {
        /** Deterministic signal identifiers. */
        readonly deterministic: readonly string[];
        /** AI-derived signals with type and label. */
        readonly ai: ReadonlyArray<{ readonly type: string; readonly label: string }>;
    };
    /** Warnings such as low transcript confidence. */
    readonly warnings: readonly string[];
}

/**
 * Complete set of recommendations for a call.
 */
export interface RecommendationSet {
    /** Call identifiers. */
    readonly call: {
        readonly sessionId: string;
        readonly lastEventAt: number;
    };
    /** Ordered list of recommendations. */
    readonly recommendations: readonly Recommendation[];
    /** Model used to generate recommendations. */
    readonly model: string;
    /** Schema version of this output. */
    readonly version: string;
}
