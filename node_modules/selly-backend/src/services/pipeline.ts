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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export interface ProcessingResult {
    ok: boolean;
    sessionId: string;
    transcript: TranscriptRecord[];
    context: SerializedConversationContext;
    signals3a: SignalSet;
    signals3b: AISignalSet;
    recommendations: RecommendationSet;
    summary: string;
    error?: string;
}

/**
 * Check if OpenAI is configured
 */
export function isOpenAIConfigured(): boolean {
    return Boolean(OPENAI_API_KEY);
}

/**
 * Create an LLM client for OpenAI
 */
function createOpenAIClient(): ClassifierLlmClient & RecommenderLlmClient {
    return {
        async completeJson(args: { system: string; user: string; model?: string }): Promise<unknown> {
            if (!OPENAI_API_KEY) {
                throw new Error('OpenAI API key not configured');
            }

            const model = args.model ?? 'gpt-4o-mini';

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
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[openai] Request failed:', response.status);
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
        },
    };
}

/**
 * Generate a call summary using OpenAI
 */
async function generateSummary(
    transcript: TranscriptRecord[],
    signals3a: SignalSet,
    signals3b: AISignalSet,
    recommendations: RecommendationSet
): Promise<string> {
    if (!OPENAI_API_KEY) {
        return 'Summary unavailable - OpenAI not configured';
    }

    const transcriptText = transcript
        .map(t => `[${t.speaker.toUpperCase()}]: ${t.text}`)
        .join('\n');

    const signalsSummary = [
        ...signals3a.signals.map(s => s.type),
        ...signals3b.signals.map(s => `${s.type}: ${s.label}`),
    ].join(', ');

    const prompt = `Summarize this sales call in 2-3 sentences. Focus on key topics discussed, any objections raised, and next steps if mentioned.

TRANSCRIPT:
${transcriptText}

DETECTED SIGNALS: ${signalsSummary || 'None'}

TOP RECOMMENDATIONS: ${recommendations.recommendations.map(r => r.title).join(', ') || 'None'}

Provide a concise, actionable summary.`;

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
            max_tokens: 200,
            temperature: 0.5,
        }),
    });

    if (!response.ok) {
        console.error('[openai] Summary generation failed:', response.status);
        return 'Summary generation failed';
    }

    const result = await response.json() as {
        choices: Array<{ message: { content: string } }>;
    };

    return result.choices[0]?.message?.content ?? 'No summary generated';
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
        // Step 1: Download audio from Supabase
        console.log('[pipeline] Step 1: Downloading audio...');
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured - cannot download audio');
        }
        const { data: audioData } = await downloadAudio(audioObjectPath);
        console.log(`[pipeline] Downloaded ${audioData.byteLength} bytes`);

        // Step 2: Transcribe with Deepgram
        console.log('[pipeline] Step 2: Transcribing...');
        if (!isDeepgramConfigured()) {
            throw new Error('Deepgram not configured - cannot transcribe');
        }
        const segments = await transcribeAudio(audioData);
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
        const signals3a = extractSignals(context);
        console.log(`[pipeline] Extracted ${signals3a.signals.length} deterministic signals`);

        // Step 7: Classify AI signals (Step 3B)
        console.log('[pipeline] Step 7: Classifying AI signals (Step 3B)...');
        const llmClient = createOpenAIClient();
        const signals3b = await classifyAISignals(llmClient, context);
        console.log(`[pipeline] Classified ${signals3b.signals.length} AI signals`);

        // Step 8: Generate recommendations (Step 4)
        console.log('[pipeline] Step 8: Generating recommendations (Step 4)...');
        const recommendations = await generateRecommendations(llmClient, {
            ctx: context,
            signals3a,
            signals3b,
        });
        console.log(`[pipeline] Generated ${recommendations.recommendations.length} recommendations`);

        // Step 9: Generate summary
        console.log('[pipeline] Step 9: Generating summary...');
        const summary = await generateSummary(transcript, signals3a, signals3b, recommendations);
        console.log('[pipeline] Summary generated');

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

        // Store in Supabase if configured
        if (isSupabaseConfigured()) {
            try {
                // Update call record
                await updateCallRecord(sessionId, {
                    status: 'ended',
                    ended_at: new Date().toISOString(),
                    duration_ms: Date.now() - callStartTime,
                });

                // Store utterances
                const utteranceRows = transcript.map((t, i) => ({
                    seq: i,
                    speaker: t.speaker as 'rep' | 'prospect' | 'unknown',
                    text: t.text,
                    confidence: t.confidence,
                    startedAtMs: t.startedAt - callStartTime,
                    endedAtMs: t.endedAt - callStartTime,
                }));
                await storeUtterances(sessionId, workspaceId, utteranceRows);

                // Store summary
                await storeSummary(sessionId, workspaceId, { text: summary }, '1.0', 'gpt-4o-mini');

                // Store signals and recommendations
                await storeSignals3A(sessionId, workspaceId, signals3a, '1.0');
                await storeSignals3B(sessionId, workspaceId, signals3b, '1.0', 'gpt-4o-mini');
                await storeRecommendations(sessionId, workspaceId, recommendations, '1.0', 'gpt-4o-mini');

                // Store events for replay
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

                console.log('[pipeline] Stored all results in Supabase');
            } catch (err) {
                console.error('[pipeline] Failed to store in Supabase:', err);
                // Continue anyway, we have in-memory storage
            }
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
            summary: '',
            error: errorMessage,
        };
    }
}
