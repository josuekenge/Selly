// Smoke Test Endpoint
// Exercises the full backend pipeline with synthetic events
// NO real LLM calls - uses mock clients for deterministic testing

import { Router } from 'express';
import type {
    CallStartedEvent,
    TranscriptFinalizedEvent,
    SpeakerTurnDetectedEvent,
    SilenceDetectedEvent,
    DomainEvent,
} from '@selly/contracts';
import { createInitialState, reduceConversationState } from '../domain/conversation/reducer.js';
import { serializeConversationStateForAI } from '../domain/conversation/serializer.js';
import { extractSignals } from '../signals/extractor.js';
import { classifyAISignals } from '../ai/signals/classifier.js';
import type { LlmJsonClient as ClassifierLlmClient } from '../ai/signals/classifier.js';
import { generateRecommendations } from '../ai/recommendations/generator.js';
import type { LlmJsonClient as RecommenderLlmClient } from '../ai/recommendations/generator.js';

const router = Router();

// ============================================
// SYNTHETIC EVENT GENERATORS
// ============================================

function createCallStartedEvent(sessionId: string, workspaceId: string, timestamp: number): CallStartedEvent {
    return {
        type: 'call.started',
        payload: {
            callId: sessionId,
            workspaceId,
            userId: 'smoke-test-user',
            timestamp,
        },
    };
}

function createTranscriptFinalizedEvent(
    callId: string,
    speaker: 'rep' | 'prospect',
    text: string,
    startedAt: number,
    endedAt: number,
    confidence: number
): TranscriptFinalizedEvent {
    return {
        type: 'transcript.finalized',
        payload: {
            callId,
            utteranceId: `utt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            speaker,
            text,
            startedAt,
            endedAt,
            confidence,
        },
    };
}

function createSpeakerTurnEvent(callId: string, speaker: 'rep' | 'prospect', timestamp: number): SpeakerTurnDetectedEvent {
    return {
        type: 'speaker.turn_detected',
        payload: {
            callId,
            speaker,
            timestamp,
        },
    };
}

function createSilenceEvent(callId: string, durationMs: number, timestamp: number): SilenceDetectedEvent {
    return {
        type: 'silence.detected',
        payload: {
            callId,
            durationMs,
            timestamp,
        },
    };
}

// ============================================
// MOCK LLM CLIENTS
// ============================================

function createMockClassifierClient(utteranceTexts: string[]): ClassifierLlmClient {
    return {
        async completeJson() {
            // Return mock AI signals with valid evidence
            return {
                signals: [
                    {
                        type: 'objection_detected',
                        label: 'Price concern',
                        confidence: 0.85,
                        evidence: {
                            utteranceIndices: [1],
                            quotes: [utteranceTexts[1]?.slice(0, 50) ?? 'mock quote'],
                        },
                    },
                    {
                        type: 'intent_detected',
                        label: 'Interest in product',
                        confidence: 0.75,
                        evidence: {
                            utteranceIndices: [2],
                            quotes: [utteranceTexts[2]?.slice(0, 50) ?? 'mock quote'],
                        },
                    },
                ],
            };
        },
    };
}

function createMockRecommenderClient(utteranceTexts: string[]): RecommenderLlmClient {
    return {
        async completeJson() {
            // Return mock recommendations with valid evidence
            return {
                recommendations: [
                    {
                        type: 'objection_handling',
                        title: 'Address price concern',
                        script: 'I understand budget is important. Let me share how our ROI typically works out for similar companies.',
                        confidence: 0.9,
                        evidence: {
                            utteranceIndices: [1],
                            quotes: [utteranceTexts[1]?.slice(0, 50) ?? 'mock quote'],
                        },
                        basedOnSignals: {
                            deterministic: ['mentions_pricing'],
                            ai: [{ type: 'objection_detected', label: 'Price concern' }],
                        },
                        warnings: [],
                    },
                    {
                        type: 'discovery_question',
                        title: 'Explore integration needs',
                        script: 'What systems are you currently using that we would need to integrate with?',
                        confidence: 0.8,
                        evidence: {
                            utteranceIndices: [2],
                            quotes: [utteranceTexts[2]?.slice(0, 50) ?? 'mock quote'],
                        },
                        basedOnSignals: {
                            deterministic: [],
                            ai: [{ type: 'intent_detected', label: 'Interest in product' }],
                        },
                        warnings: [],
                    },
                ],
            };
        },
    };
}

// ============================================
// SMOKE TEST ENDPOINT
// ============================================

router.get('/', async (_req, res) => {
    const sessionId = `smoke-${Date.now()}`;
    const workspaceId = 'smoke-test-workspace';
    const baseTime = Date.now();

    // Synthetic utterance texts
    const utteranceTexts = [
        "Hi, thanks for taking my call. I wanted to tell you about our sales acceleration platform.",
        "That sounds interesting, but I'm concerned about the price. What's the cost?",
        "We're looking for something that can integrate with our existing CRM system.",
    ];

    // Generate synthetic events
    const events: DomainEvent[] = [
        createCallStartedEvent(sessionId, workspaceId, baseTime),
        createTranscriptFinalizedEvent(sessionId, 'rep', utteranceTexts[0], baseTime + 1000, baseTime + 5000, 0.95),
        createSpeakerTurnEvent(sessionId, 'prospect', baseTime + 5500),
        createTranscriptFinalizedEvent(sessionId, 'prospect', utteranceTexts[1], baseTime + 6000, baseTime + 10000, 0.92),
        createSilenceEvent(sessionId, 1500, baseTime + 10500),
        createSpeakerTurnEvent(sessionId, 'prospect', baseTime + 12000),
        createTranscriptFinalizedEvent(sessionId, 'prospect', utteranceTexts[2], baseTime + 12500, baseTime + 17000, 0.88),
    ];

    const report: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        sessionId,
    };

    try {
        // Step 2: Process events through reducer
        report.step2_events = events.map((e) => e.type);

        let state = createInitialState(sessionId, workspaceId, baseTime);
        for (const event of events) {
            state = reduceConversationState(state, event);
        }
        report.step2_state = {
            phase: state.phase,
            eventCount: state.eventCount,
            utteranceCount: state.transcriptWindow.totalUtteranceCount,
            repTalkRatio: state.dominance.repTalkRatio,
            silenceCount: state.timing.silenceCount,
        };

        // Step 2.5: Serialize for AI
        const ctx = serializeConversationStateForAI(state);
        report.step2_5_context = {
            utteranceCount: ctx.transcript.utterances.length,
            avgConfidence: ctx.metrics.confidence.avgConfidence,
            callDurationMs: ctx.metrics.timing.callDurationMs,
        };

        // Step 3A: Deterministic signals
        const signals3a = extractSignals(ctx);
        report.step3a_signals = {
            count: signals3a.signals.length,
            types: signals3a.signals.map((s) => s.type),
        };

        // Step 3B: AI signals (mock)
        const mockClassifier = createMockClassifierClient(utteranceTexts);
        const signals3b = await classifyAISignals(mockClassifier, ctx);
        report.step3b_aiSignals = {
            count: signals3b.signals.length,
            types: signals3b.signals.map((s) => ({ type: s.type, label: s.label })),
            model: signals3b.model,
        };

        // Step 4: Recommendations (mock)
        const mockRecommender = createMockRecommenderClient(utteranceTexts);
        const recommendations = await generateRecommendations(mockRecommender, {
            ctx,
            signals3a,
            signals3b,
        });
        report.step4_recommendations = {
            count: recommendations.recommendations.length,
            types: recommendations.recommendations.map((r) => ({ type: r.type, title: r.title })),
            model: recommendations.model,
            version: recommendations.version,
        };

        // Success summary
        report.success = true;
        report.summary = {
            eventsProcessed: events.length,
            utterancesExtracted: ctx.transcript.utterances.length,
            deterministicSignals: signals3a.signals.length,
            aiSignals: signals3b.signals.length,
            recommendations: recommendations.recommendations.length,
        };
    } catch (error) {
        report.success = false;
        report.error = error instanceof Error ? error.message : String(error);
    }

    res.json(report);
});

export default router;
