// Live Recommendations Service
// Generates real-time recommendations during active calls
// Optimized for <3 second latency with caching and debouncing
// NO full state rebuild, uses lightweight context

import type { SerializedConversationContext } from '../domain/conversation/serializer.js';
import type { SignalSet } from '../signals/types.js';
import type { AISignalSet } from '../ai/signals/types.js';
import type { RecommendationSet } from '../ai/recommendations/types.js';
import { generateRecommendations, type LlmJsonClient } from '../ai/recommendations/generator.js';
import { extractSignals } from '../signals/extractor.js';
import { classifyAISignals } from '../ai/signals/classifier.js';
import type { TranscriptRecord } from '../api/store.js';
import { retrievalService } from '../modules/retrieval/index.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ============================================
// TYPES
// ============================================

export interface LiveRecommendationRequest {
    sessionId: string;
    workspaceId: string;
    question: string;
    recentTranscript: TranscriptRecord[];
    timestamp: number;
}

export interface LiveRecommendationResponse {
    ok: boolean;
    sessionId: string;
    recommendations: RecommendationSet;
    cached: boolean;
    generatedAt: number;
    latencyMs: number;
    error?: string;
}

interface CacheEntry {
    questionHash: string;
    recommendations: RecommendationSet;
    generatedAt: number;
}

interface PendingRequest {
    promise: Promise<LiveRecommendationResponse>;
    timestamp: number;
}

// ============================================
// SESSION-SCOPED STORAGE
// ============================================

// Cache recommendations per session to avoid duplicate LLM calls
const sessionCache = new Map<string, Map<string, CacheEntry>>();

// Track pending requests to avoid duplicate processing
const pendingRequests = new Map<string, PendingRequest>();

// Store live recommendations per session (in-memory)
const liveRecommendationsStore = new Map<string, RecommendationSet[]>();

// ============================================
// CONFIGURATION
// ============================================

const CACHE_TTL_MS = 60_000; // 1 minute cache
const DEBOUNCE_WINDOW_MS = 500; // Wait 500ms before processing if similar question
const MAX_CONTEXT_UTTERANCES = 10; // Use last 10 utterances for fast context
const REQUEST_TIMEOUT_MS = 3000; // Fail fast after 3 seconds
const FAST_MODEL = 'gpt-4o-mini'; // Use faster model for real-time

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Simple hash for question deduplication
 */
function hashQuestion(question: string): string {
    return question.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

/**
 * Create LLM client with timeout
 */
function createLLMClient(timeoutMs: number): LlmJsonClient {
    return {
        async completeJson(args: { system: string; user: string; model?: string }): Promise<unknown> {
            if (!OPENAI_API_KEY) {
                throw new Error('OpenAI API key not configured');
            }

            const model = args.model ?? FAST_MODEL;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${OPENAI_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model,
                        messages: [
                            { role: 'system', content: args.system },
                            { role: 'user', content: args.user },
                        ],
                        response_format: { type: 'json_object' },
                        temperature: 0.3,
                        max_tokens: 1000, // Limit tokens for speed
                    }),
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    console.error('[live-recs] OpenAI request failed:', response.status);
                    throw new Error(`OpenAI request failed: ${response.status}`);
                }

                const result = await response.json() as {
                    choices: Array<{ message: { content: string } }>;
                };

                const content = result.choices[0]?.message?.content;
                if (!content) {
                    throw new Error('Empty response from OpenAI');
                }

                return JSON.parse(content);
            } catch (error) {
                clearTimeout(timeoutId);
                if ((error as Error).name === 'AbortError') {
                    throw new Error('Request timeout');
                }
                throw error;
            }
        },
    };
}

/**
 * Build lightweight context from recent transcript
 */
function buildLightweightContext(
    sessionId: string,
    recentTranscript: TranscriptRecord[],
    timestamp: number
): SerializedConversationContext {
    // Take only the most recent utterances for speed
    const utterances = recentTranscript.slice(-MAX_CONTEXT_UTTERANCES);

    // Calculate basic metrics
    const repUtterances = utterances.filter(u => u.speaker === 'rep');
    const prospectUtterances = utterances.filter(u => u.speaker === 'prospect');
    const totalWords = utterances.reduce((sum, u) => sum + u.text.split(/\s+/).length, 0);
    const repWords = repUtterances.reduce((sum, u) => sum + u.text.split(/\s+/).length, 0);
    const prospectWords = prospectUtterances.reduce((sum, u) => sum + u.text.split(/\s+/).length, 0);

    const repTalkRatio = totalWords > 0 ? repWords / totalWords : 0;
    const prospectTalkRatio = totalWords > 0 ? prospectWords / totalWords : 0;
    const avgConfidence = utterances.length > 0
        ? utterances.reduce((sum, u) => sum + u.confidence, 0) / utterances.length
        : 0;

    const callDurationMs = utterances.length > 0
        ? utterances[utterances.length - 1].endedAt - utterances[0].startedAt
        : 0;

    return {
        call: {
            sessionId,
            lastEventAt: timestamp,
        },
        transcript: {
            utterances: utterances.map((u, i) => ({
                speaker: u.speaker,
                text: u.text,
                confidence: u.confidence,
                startedAt: u.startedAt,
                endedAt: u.endedAt,
                index: i,
            })),
            totalUtteranceCount: utterances.length,
        },
        metrics: {
            dominance: {
                repTalkRatio,
                prospectTalkRatio,
            },
            confidence: {
                avgConfidence,
                lowConfidenceUtteranceCount: utterances.filter(u => u.confidence < 0.7).length,
            },
            timing: {
                callDurationMs,
            },
        },
    };
}

/**
 * Get or create session cache
 */
function getSessionCache(sessionId: string): Map<string, CacheEntry> {
    let cache = sessionCache.get(sessionId);
    if (!cache) {
        cache = new Map();
        sessionCache.set(sessionId, cache);
    }
    return cache;
}

/**
 * Check cache for existing recommendation
 */
function getCachedRecommendation(
    sessionId: string,
    questionHash: string
): CacheEntry | null {
    const cache = getSessionCache(sessionId);
    const entry = cache.get(questionHash);

    if (!entry) {
        return null;
    }

    // Check if cache is still valid
    const age = Date.now() - entry.generatedAt;
    if (age > CACHE_TTL_MS) {
        cache.delete(questionHash);
        return null;
    }

    return entry;
}

/**
 * Store recommendation in cache
 */
function cacheRecommendation(
    sessionId: string,
    questionHash: string,
    recommendations: RecommendationSet,
    generatedAt: number
): void {
    const cache = getSessionCache(sessionId);
    cache.set(questionHash, {
        questionHash,
        recommendations,
        generatedAt,
    });
}

/**
 * Store live recommendations for session
 */
function storeLiveRecommendation(
    sessionId: string,
    recommendations: RecommendationSet
): void {
    let sessionRecs = liveRecommendationsStore.get(sessionId);
    if (!sessionRecs) {
        sessionRecs = [];
        liveRecommendationsStore.set(sessionId, sessionRecs);
    }
    sessionRecs.push(recommendations);
}

/**
 * Get all live recommendations for a session
 */
export function getLiveRecommendations(sessionId: string): RecommendationSet[] {
    return liveRecommendationsStore.get(sessionId) ?? [];
}

/**
 * Clear session data (call when call ends)
 */
export function clearSessionData(sessionId: string): void {
    sessionCache.delete(sessionId);
    pendingRequests.delete(sessionId);
    liveRecommendationsStore.delete(sessionId);
}

// ============================================
// MAIN GENERATION FUNCTION
// ============================================

/**
 * Generate live recommendations for a question
 * Handles caching, debouncing, and timeout
 */
async function generateLiveRecommendationsInternal(
    request: LiveRecommendationRequest
): Promise<LiveRecommendationResponse> {
    const { sessionId, question, recentTranscript, timestamp } = request;
    const startTime = Date.now();

    try {
        // Step 1: Check cache
        const questionHash = hashQuestion(question);
        const cached = getCachedRecommendation(sessionId, questionHash);

        if (cached) {
            console.log(`[live-recs] Cache hit for session ${sessionId}`);
            return {
                ok: true,
                sessionId,
                recommendations: cached.recommendations,
                cached: true,
                generatedAt: cached.generatedAt,
                latencyMs: Date.now() - startTime,
            };
        }

        // Step 2: Build lightweight context
        const context = buildLightweightContext(sessionId, recentTranscript, timestamp);

        // Step 3: Extract signals (deterministic, fast)
        const signals3a = extractSignals(context);

        // Step 4: Classify AI signals (uses LLM, but fast model)
        const llmClient = createLLMClient(REQUEST_TIMEOUT_MS);
        const signals3b = await classifyAISignals(llmClient, context);

        // Step 4.5: Retrieve relevant knowledge chunks
        const knowledgeChunks = await retrievalService.retrieveContext(
            request.workspaceId,
            question,
            { limit: 3, minSimilarity: 0.3 }
        );

        // Step 5: Generate recommendations (with knowledge context)
        const recommendations = await generateRecommendations(
            llmClient,
            {
                ctx: context,
                signals3a,
                signals3b,
                knowledgeChunks,
            },
            { model: FAST_MODEL }
        );

        const generatedAt = Date.now();
        const latencyMs = generatedAt - startTime;

        // Step 6: Cache result
        cacheRecommendation(sessionId, questionHash, recommendations, generatedAt);

        // Step 7: Store in session history
        storeLiveRecommendation(sessionId, recommendations);

        console.log(`[live-recs] Generated recommendations for session ${sessionId} in ${latencyMs}ms`);

        return {
            ok: true,
            sessionId,
            recommendations,
            cached: false,
            generatedAt,
            latencyMs,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[live-recs] Failed to generate recommendations for ${sessionId}:`, errorMessage);

        return {
            ok: false,
            sessionId,
            recommendations: {
                call: { sessionId, lastEventAt: timestamp },
                recommendations: [],
                model: FAST_MODEL,
                version: '1.0',
            },
            cached: false,
            generatedAt: Date.now(),
            latencyMs: Date.now() - startTime,
            error: errorMessage,
        };
    }
}

/**
 * Generate live recommendations with debouncing
 */
export async function generateLiveRecommendations(
    request: LiveRecommendationRequest
): Promise<LiveRecommendationResponse> {
    const { sessionId, question } = request;
    const questionHash = hashQuestion(question);
    const pendingKey = `${sessionId}:${questionHash}`;

    // Check if there's already a pending request for this question
    const pending = pendingRequests.get(pendingKey);
    if (pending) {
        const age = Date.now() - pending.timestamp;
        if (age < DEBOUNCE_WINDOW_MS) {
            console.log(`[live-recs] Debouncing duplicate request for ${sessionId}`);
            return pending.promise;
        } else {
            // Old pending request, remove it
            pendingRequests.delete(pendingKey);
        }
    }

    // Create new pending request
    const promise = generateLiveRecommendationsInternal(request);
    pendingRequests.set(pendingKey, {
        promise,
        timestamp: Date.now(),
    });

    // Clean up after completion
    promise.finally(() => {
        const current = pendingRequests.get(pendingKey);
        if (current?.promise === promise) {
            pendingRequests.delete(pendingKey);
        }
    });

    return promise;
}

/**
 * Check if OpenAI is configured
 */
export function isLiveRecommendationsConfigured(): boolean {
    return Boolean(OPENAI_API_KEY);
}
