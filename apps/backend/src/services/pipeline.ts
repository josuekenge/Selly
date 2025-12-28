// Pipeline Service
// Orchestrates call processing: transcription -> events -> state -> signals -> recommendations -> summary
// Uses existing domain code without modification
// NO secrets in logs

import type { DomainEvent, TranscriptFinalizedEvent, CallStartedEvent } from '@selly/contracts';
import { createInitialState, reduceConversationState } from '../domain/conversation/reducer.js';
import { serializeConversationStateForAI } from '../domain/conversation/serializer.js';
import { extractSignals } from '../signals/extractor.js';
import { classifyAISignals, type LlmJsonClient as ClassifierLlmClient } from '../ai/signals/classifier.js';
import { generateRecommendations, type LlmJsonClient as RecommenderLlmClient } from '../ai/recommendations/generator.js';
import type { SignalSet } from '../signals/types.js';
import type { AISignalSet } from '../ai/signals/types.js';
import type { RecommendationSet } from '../ai/recommendations/types.js';
import type { SerializedConversationContext } from '../domain/conversation/serializer.js';
import { transcribeAudio, type TranscriptSegment, isDeepgramConfigured } from './deepgram.js';
import {
    downloadAudio,
    isSupabaseConfigured,
    updateCallRecord,
    storeUtterances,
    storeSummary,
    storeSignals3A,
    storeSignals3B,
    storeRecommendations,
    storeEvents,
} from './supabase.js';
import { getCall, updateCall, type TranscriptRecord } from '../api/store.js';
import { withRetry } from '../utils/retry.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export interface ProcessingResult {
    ok: boolean;
    sessionId: string;
    transcript: TranscriptRecord[];
    context: SerializedConversationContext;
    signals3a: SignalSet;
    signals3b: AISignalSet;
    recommendations: RecommendationSet;
    summary: StructuredSummary;
    error?: string;
}

/**
 * Check if OpenAI is configured
 */
export function isOpenAIConfigured(): boolean {
    return Boolean(OPENAI_API_KEY);
}

/**
 * Create an LLM client for OpenAI with retry logic
 */
function createOpenAIClient(): ClassifierLlmClient & RecommenderLlmClient {
    return {
        async completeJson(args: {
            system: string;
            user: string;
            model?: string;
            maxOutputTokens?: number
        }): Promise<unknown> {
            if (!OPENAI_API_KEY) {
                throw new Error('OpenAI API key not configured');
            }

            const model = args.model ?? 'gpt-4o-mini';
            const maxTokens = args.maxOutputTokens ?? 2048;

            // Wrap OpenAI call with retry logic
            return withRetry(async () => {
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
                        max_tokens: maxTokens,
                    }),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('[openai] Request failed:', response.status, errorText.slice(0, 200));
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
            }, {
                maxAttempts: 3,
                initialDelayMs: 1000,
                maxDelayMs: 10000,
                onRetry: (error, attempt) => {
                    console.log(`[openai] Retry ${attempt} after error:`, error instanceof Error ? error.message : String(error));
                },
            });
        },
    };
}

/**
 * Structured summary format for frontend
 */
interface StructuredSummary {
    title: string;
    bullets: string[];
    fullText: string;
}

/**
 * Generate a call summary using OpenAI with retry logic
 * Returns a structured summary with title and bullet points
 */
async function generateSummary(
    transcript: TranscriptRecord[],
    signals3a: SignalSet,
    signals3b: AISignalSet,
    recommendations: RecommendationSet
): Promise<StructuredSummary> {
    const defaultSummary: StructuredSummary = {
        title: 'Call Summary',
        bullets: [],
        fullText: ''
    };

    if (!OPENAI_API_KEY) {
        return { ...defaultSummary, fullText: 'Summary unavailable - OpenAI not configured' };
    }

    try {
        const transcriptText = transcript
            .map(t => `[${t.speaker.toUpperCase()}]: ${t.text}`)
            .join('\n');

        const signalsSummary = [
            ...signals3a.signals.map(s => s.type),
            ...signals3b.signals.map(s => `${s.type}: ${s.label}`),
        ].join(', ');

        const prompt = `Analyze this sales call and provide a structured summary in JSON format.

TRANSCRIPT:
${transcriptText}

DETECTED SIGNALS: ${signalsSummary || 'None'}

TOP RECOMMENDATIONS: ${recommendations.recommendations.map(r => r.title).join(', ') || 'None'}

Respond with ONLY a JSON object in this exact format (no markdown, no extra text):
{
  "title": "A short, descriptive title for this call (max 8 words)",
  "bullets": ["Key point 1", "Key point 2", "Key point 3"],
  "fullText": "A 2-3 sentence summary of the call"
}`;

        return await withRetry(async () => {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'user', content: prompt },
                    ],
                    max_tokens: 300,
                    temperature: 0.5,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[openai] Summary generation failed:', response.status, errorText.slice(0, 200));
                throw new Error(`Summary generation failed: ${response.status}`);
            }

            const result = await response.json() as {
                choices: Array<{ message: { content: string } }>;
            };

            const content = result.choices[0]?.message?.content ?? '';

            // Parse JSON response
            try {
                const parsed = JSON.parse(content) as StructuredSummary;
                return {
                    title: parsed.title || 'Call Summary',
                    bullets: Array.isArray(parsed.bullets) ? parsed.bullets : [],
                    fullText: parsed.fullText || content
                };
            } catch {
                // Fallback if JSON parsing fails
                console.warn('[openai] Failed to parse structured summary, using raw text');
                return {
                    title: 'Call Summary',
                    bullets: [],
                    fullText: content
                };
            }
        }, {
            maxAttempts: 3,
            initialDelayMs: 1000,
            maxDelayMs: 10000,
            onRetry: (error, attempt) => {
                console.log(`[openai] Summary retry ${attempt}:`, error instanceof Error ? error.message : String(error));
            },
        });
    } catch (error) {
        console.error('[openai] Summary generation failed after retries:', error);
        return { ...defaultSummary, fullText: 'Summary generation failed' };
    }
}

/**
 * Convert transcript segments to domain events
 */
function transcriptToEvents(
    sessionId: string,
    workspaceId: string,
    segments: TranscriptSegment[],
    callStartTime: number
): DomainEvent[] {
    const events: DomainEvent[] = [];

    // Add call started event
    const callStarted: CallStartedEvent = {
        type: 'call.started',
        payload: {
            callId: sessionId,
            workspaceId,
            userId: 'pipeline',
            timestamp: callStartTime,
        },
    };
    events.push(callStarted);

    // Convert each segment to a transcript.finalized event
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];

        const transcriptEvent: TranscriptFinalizedEvent = {
            type: 'transcript.finalized',
            payload: {
                callId: sessionId,
                utteranceId: `utt-${sessionId}-${i}`,
                speaker: segment.speaker,
                text: segment.text,
                startedAt: callStartTime + segment.startedAt,
                endedAt: callStartTime + segment.endedAt,
                confidence: segment.confidence,
            },
        };
        events.push(transcriptEvent);
    }

    return events;
}

/**
 * Process a completed call
 * Downloads audio -> transcribes -> runs full pipeline -> stores results
 */
export async function processCall(
    sessionId: string,
    audioObjectPath: string
): Promise<ProcessingResult> {
    console.log(`[pipeline] Processing call ${sessionId}`);
    console.log(`[pipeline] Audio path: ${audioObjectPath}`);

    const callRecord = getCall(sessionId);
    const workspaceId = callRecord?.workspaceId ?? 'default';
    const callStartTime = callRecord?.createdAt ?? Date.now();

    // Update status
    updateCall(sessionId, { status: 'processing' });

    try {
        // Step 1: Download audio from Supabase with retry
        console.log('[pipeline] Step 1: Downloading audio...');
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured - cannot download audio');
        }

        const { data: audioData } = await withRetry(
            () => downloadAudio(audioObjectPath),
            {
                maxAttempts: 3,
                initialDelayMs: 2000,
                maxDelayMs: 10000,
                onRetry: (error, attempt) => {
                    console.log(`[pipeline] Audio download retry ${attempt}:`, error instanceof Error ? error.message : String(error));
                },
            }
        );
        console.log(`[pipeline] Downloaded ${audioData.byteLength} bytes`);

        // Validate audio data
        if (!audioData || audioData.byteLength === 0) {
            throw new Error('Downloaded audio is empty');
        }

        // Step 2: Transcribe with Deepgram with retry
        console.log('[pipeline] Step 2: Transcribing...');
        if (!isDeepgramConfigured()) {
            throw new Error('Deepgram not configured - cannot transcribe');
        }

        const segments = await withRetry(
            () => transcribeAudio(audioData),
            {
                maxAttempts: 3,
                initialDelayMs: 2000,
                maxDelayMs: 15000,
                onRetry: (error, attempt) => {
                    console.log(`[pipeline] Transcription retry ${attempt}:`, error instanceof Error ? error.message : String(error));
                },
            }
        );
        console.log(`[pipeline] Got ${segments.length} transcript segments`);

        // Convert to TranscriptRecord format for storage
        const transcript: TranscriptRecord[] = segments.map(s => ({
            speaker: s.speaker,
            text: s.text,
            startedAt: callStartTime + s.startedAt,
            endedAt: callStartTime + s.endedAt,
            confidence: s.confidence,
        }));

        // Step 3: Convert to domain events
        console.log('[pipeline] Step 3: Converting to events...');
        const events = transcriptToEvents(sessionId, workspaceId, segments, callStartTime);
        console.log(`[pipeline] Generated ${events.length} events`);

        // Step 4: Run reducer to build state (Step 2)
        console.log('[pipeline] Step 4: Building conversation state (Step 2)...');
        let state = createInitialState(sessionId, workspaceId, callStartTime);
        for (const event of events) {
            state = reduceConversationState(state, event);
        }
        console.log(`[pipeline] State built: ${state.eventCount} events, ${state.transcriptWindow.totalUtteranceCount} utterances`);

        // Step 5: Serialize for AI (Step 2.5)
        console.log('[pipeline] Step 5: Serializing context (Step 2.5)...');
        const context = serializeConversationStateForAI(state);

        // Step 6: Extract deterministic signals (Step 3A)
        console.log('[pipeline] Step 6: Extracting signals (Step 3A)...');
        let signals3a: SignalSet;
        try {
            signals3a = extractSignals(context);
            console.log(`[pipeline] Extracted ${signals3a.signals.length} deterministic signals`);
        } catch (error) {
            console.error('[pipeline] Failed to extract deterministic signals:', error);
            // Create empty signal set as fallback
            signals3a = {
                call: { sessionId, lastEventAt: Date.now() },
                signals: [],
                version: '3A.0',
            };
        }

        // Step 7: Classify AI signals (Step 3B) - gracefully degrade if unavailable
        console.log('[pipeline] Step 7: Classifying AI signals (Step 3B)...');
        let signals3b: AISignalSet;
        if (!isOpenAIConfigured()) {
            console.log('[pipeline] OpenAI not configured, skipping AI signal classification');
            signals3b = {
                call: { sessionId, lastEventAt: Date.now() },
                signals: [],
                model: 'none',
                version: '3B.0',
            };
        } else {
            try {
                const llmClient = createOpenAIClient();
                signals3b = await withRetry(
                    () => classifyAISignals(llmClient, context),
                    {
                        maxAttempts: 2,
                        initialDelayMs: 2000,
                        maxDelayMs: 10000,
                        onRetry: (error, attempt) => {
                            console.log(`[pipeline] AI signals retry ${attempt}:`, error instanceof Error ? error.message : String(error));
                        },
                    }
                );
                console.log(`[pipeline] Classified ${signals3b.signals.length} AI signals`);
            } catch (error) {
                console.error('[pipeline] Failed to classify AI signals, continuing with empty set:', error);
                signals3b = {
                    call: { sessionId, lastEventAt: Date.now() },
                    signals: [],
                    model: 'error',
                    version: '3B.0',
                };
            }
        }

        // Step 8: Generate recommendations (Step 4) - gracefully degrade if unavailable
        console.log('[pipeline] Step 8: Generating recommendations (Step 4)...');
        let recommendations: RecommendationSet;
        if (!isOpenAIConfigured()) {
            console.log('[pipeline] OpenAI not configured, skipping recommendations');
            recommendations = {
                call: { sessionId, lastEventAt: Date.now() },
                recommendations: [],
                model: 'none',
                version: '4.0',
            };
        } else {
            try {
                const llmClient = createOpenAIClient();
                recommendations = await withRetry(
                    () => generateRecommendations(llmClient, {
                        ctx: context,
                        signals3a,
                        signals3b,
                    }),
                    {
                        maxAttempts: 2,
                        initialDelayMs: 2000,
                        maxDelayMs: 10000,
                        onRetry: (error, attempt) => {
                            console.log(`[pipeline] Recommendations retry ${attempt}:`, error instanceof Error ? error.message : String(error));
                        },
                    }
                );
                console.log(`[pipeline] Generated ${recommendations.recommendations.length} recommendations`);
            } catch (error) {
                console.error('[pipeline] Failed to generate recommendations, continuing with empty set:', error);
                recommendations = {
                    call: { sessionId, lastEventAt: Date.now() },
                    recommendations: [],
                    model: 'error',
                    version: '4.0',
                };
            }
        }

        // Step 9: Generate summary - gracefully degrade if unavailable
        console.log('[pipeline] Step 9: Generating summary...');
        let summary: StructuredSummary;
        if (!isOpenAIConfigured()) {
            summary = { title: 'Call Summary', bullets: [], fullText: 'Summary unavailable - OpenAI not configured' };
            console.log('[pipeline] OpenAI not configured, skipping summary');
        } else {
            summary = await generateSummary(transcript, signals3a, signals3b, recommendations);
            console.log('[pipeline] Summary generated');
        }

        // Step 10: Store results
        console.log('[pipeline] Step 10: Storing results...');

        // Update in-memory store
        updateCall(sessionId, {
            status: 'completed',
            endedAt: Date.now(),
            transcript,
            summary,
            signals3a,
            signals3b,
            recommendations,
        });

        // Store in Supabase if configured - with retry and graceful degradation
        if (isSupabaseConfigured()) {
            console.log('[pipeline] Storing results in Supabase...');

            // Update call record - critical, retry
            try {
                await withRetry(
                    () => updateCallRecord(sessionId, {
                        status: 'ended',
                        ended_at: new Date().toISOString(),
                        duration_ms: Date.now() - callStartTime,
                    }),
                    {
                        maxAttempts: 3,
                        initialDelayMs: 1000,
                        onRetry: (error, attempt) => {
                            console.log(`[pipeline] Call record update retry ${attempt}:`, error instanceof Error ? error.message : String(error));
                        },
                    }
                );
                console.log('[pipeline] Updated call record');
            } catch (err) {
                console.error('[pipeline] Failed to update call record:', err);
                // Critical but continue with other storage
            }

            // Store utterances - critical, retry
            try {
                const utteranceRows = transcript.map((t, i) => ({
                    seq: i,
                    speaker: t.speaker as 'rep' | 'prospect' | 'unknown',
                    text: t.text,
                    confidence: t.confidence,
                    startedAtMs: t.startedAt - callStartTime,
                    endedAtMs: t.endedAt - callStartTime,
                }));

                await withRetry(
                    () => storeUtterances(sessionId, workspaceId, utteranceRows),
                    {
                        maxAttempts: 3,
                        initialDelayMs: 1000,
                        onRetry: (error, attempt) => {
                            console.log(`[pipeline] Utterances storage retry ${attempt}:`, error instanceof Error ? error.message : String(error));
                        },
                    }
                );
                console.log('[pipeline] Stored utterances');
            } catch (err) {
                console.error('[pipeline] Failed to store utterances:', err);
            }

            // Store summary - non-critical
            try {
                await storeSummary(sessionId, workspaceId, { text: summary.fullText }, '1.0', 'gpt-4o-mini');
                console.log('[pipeline] Stored summary');
            } catch (err) {
                console.error('[pipeline] Failed to store summary:', err);
            }

            // Store signals 3A - non-critical
            try {
                await storeSignals3A(sessionId, workspaceId, signals3a, '1.0');
                console.log('[pipeline] Stored 3A signals');
            } catch (err) {
                console.error('[pipeline] Failed to store 3A signals:', err);
            }

            // Store signals 3B - non-critical
            try {
                await storeSignals3B(sessionId, workspaceId, signals3b, '1.0', signals3b.model);
                console.log('[pipeline] Stored 3B signals');
            } catch (err) {
                console.error('[pipeline] Failed to store 3B signals:', err);
            }

            // Store recommendations - non-critical
            try {
                await storeRecommendations(sessionId, workspaceId, recommendations, '1.0', recommendations.model);
                console.log('[pipeline] Stored recommendations');
            } catch (err) {
                console.error('[pipeline] Failed to store recommendations:', err);
            }

            // Store events for replay - non-critical
            try {
                const eventRows = events.map((e, i) => ({
                    seq: i,
                    type: e.type,
                    occurredAt: new Date(
                        'timestamp' in e.payload ? e.payload.timestamp :
                            'startedAt' in e.payload ? e.payload.startedAt :
                                callStartTime
                    ).toISOString(),
                    payload: e.payload,
                }));

                await storeEvents(sessionId, workspaceId, eventRows);
                console.log('[pipeline] Stored events');
            } catch (err) {
                console.error('[pipeline] Failed to store events:', err);
            }

            console.log('[pipeline] Supabase storage complete');
        } else {
            console.log('[pipeline] Supabase not configured, skipping cloud storage');
        }

        console.log(`[pipeline] Processing complete for ${sessionId}`);

        return {
            ok: true,
            sessionId,
            transcript,
            context,
            signals3a,
            signals3b,
            recommendations,
            summary,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[pipeline] Processing failed for ${sessionId}:`, errorMessage);

        updateCall(sessionId, {
            status: 'error',
            error: errorMessage,
        });

        return {
            ok: false,
            sessionId,
            transcript: [],
            context: {} as SerializedConversationContext,
            signals3a: { call: { sessionId, lastEventAt: 0 }, signals: [], version: '' },
            signals3b: { call: { sessionId, lastEventAt: 0 }, signals: [], model: '', version: '' },
            recommendations: { call: { sessionId, lastEventAt: 0 }, recommendations: [], model: '', version: '' },
            summary: { title: 'Error', bullets: [], fullText: '' },
            error: errorMessage,
        };
    }
}
