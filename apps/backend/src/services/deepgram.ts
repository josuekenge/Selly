// Deepgram Service
// Wrapper for Deepgram transcription API
// Multichannel support for MIC (left/rep) + LOOPBACK (right/prospect)
// NO secrets in logs

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const DEEPGRAM_API_URL = 'https://api.deepgram.com/v1/listen';

export interface DeepgramWord {
    word: string;
    start: number;
    end: number;
    confidence: number;
    speaker?: number;
    channel?: number;
}

export interface DeepgramUtterance {
    start: number;
    end: number;
    confidence: number;
    channel: number;
    transcript: string;
    words: DeepgramWord[];
    id: string;
}

export interface DeepgramChannel {
    alternatives: Array<{
        transcript: string;
        confidence: number;
        words: DeepgramWord[];
    }>;
}

export interface DeepgramResult {
    results: {
        channels: DeepgramChannel[];
        utterances?: DeepgramUtterance[];
    };
    metadata: {
        request_id: string;
        duration: number;
        channels: number;
    };
}

export interface TranscriptSegment {
    speaker: 'rep' | 'prospect';
    text: string;
    startedAt: number;
    endedAt: number;
    confidence: number;
    channel: number;
}

/**
 * Check if Deepgram is configured
 */
export function isDeepgramConfigured(): boolean {
    return Boolean(DEEPGRAM_API_KEY);
}

/**
 * Transcribe audio using Deepgram prerecorded API
 * Expects stereo audio: left channel = MIC (rep), right channel = LOOPBACK (prospect)
 */
export async function transcribeAudio(audioData: ArrayBuffer): Promise<TranscriptSegment[]> {
    if (!DEEPGRAM_API_KEY) {
        throw new Error('Deepgram API key not configured');
    }

    console.log('[deepgram] Starting transcription...');
    console.log(`[deepgram] Audio size: ${audioData.byteLength} bytes`);

    const response = await fetch(DEEPGRAM_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Token ${DEEPGRAM_API_KEY}`,
            'Content-Type': 'audio/wav',
        },
        body: audioData,
        // Query params for multichannel and utterances
        // @ts-expect-error - fetch with query params
        url: `${DEEPGRAM_API_URL}?model=nova-2&multichannel=true&utterances=true&punctuate=true&diarize=false`,
    });

    // Build URL with query params
    const url = new URL(DEEPGRAM_API_URL);
    url.searchParams.set('model', 'nova-2');
    url.searchParams.set('multichannel', 'true');
    url.searchParams.set('utterances', 'true');
    url.searchParams.set('punctuate', 'true');
    url.searchParams.set('smart_format', 'true');

    const actualResponse = await fetch(url.toString(), {
        method: 'POST',
        headers: {
            'Authorization': `Token ${DEEPGRAM_API_KEY}`,
            'Content-Type': 'audio/wav',
        },
        body: audioData,
    });

    if (!actualResponse.ok) {
        const errorText = await actualResponse.text();
        console.error('[deepgram] Transcription failed:', actualResponse.status);
        throw new Error(`Deepgram transcription failed: ${actualResponse.status}`);
    }

    const result = (await actualResponse.json()) as DeepgramResult;

    console.log(`[deepgram] Transcription complete. Channels: ${result.metadata.channels}, Duration: ${result.metadata.duration}s`);

    // Convert Deepgram result to our transcript format
    return convertDeepgramResult(result);
}

/**
 * Convert Deepgram result to transcript segments
 * Channel 0 (left) = rep (MIC), Channel 1 (right) = prospect (LOOPBACK)
 */
function convertDeepgramResult(result: DeepgramResult): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];

    // If utterances are available, use them (more accurate timing)
    if (result.results.utterances && result.results.utterances.length > 0) {
        for (const utterance of result.results.utterances) {
            if (!utterance.transcript.trim()) continue;

            segments.push({
                speaker: utterance.channel === 0 ? 'rep' : 'prospect',
                text: utterance.transcript,
                startedAt: Math.floor(utterance.start * 1000),
                endedAt: Math.floor(utterance.end * 1000),
                confidence: utterance.confidence,
                channel: utterance.channel,
            });
        }

        // Sort by start time
        segments.sort((a, b) => a.startedAt - b.startedAt);
        return segments;
    }

    // Fallback: extract from channels directly
    const channels = result.results.channels;

    for (let channelIndex = 0; channelIndex < channels.length; channelIndex++) {
        const channel = channels[channelIndex];
        if (!channel.alternatives.length) continue;

        const alternative = channel.alternatives[0];
        if (!alternative.words.length) continue;

        // Group words into utterances based on gaps
        let currentUtterance: DeepgramWord[] = [];
        const GAP_THRESHOLD = 1.0; // 1 second gap = new utterance

        for (const word of alternative.words) {
            if (currentUtterance.length === 0) {
                currentUtterance.push(word);
            } else {
                const lastWord = currentUtterance[currentUtterance.length - 1];
                if (word.start - lastWord.end > GAP_THRESHOLD) {
                    // Flush current utterance
                    if (currentUtterance.length > 0) {
                        segments.push(wordsToSegment(currentUtterance, channelIndex));
                    }
                    currentUtterance = [word];
                } else {
                    currentUtterance.push(word);
                }
            }
        }

        // Flush remaining
        if (currentUtterance.length > 0) {
            segments.push(wordsToSegment(currentUtterance, channelIndex));
        }
    }

    // Sort by start time
    segments.sort((a, b) => a.startedAt - b.startedAt);
    return segments;
}

/**
 * Convert a group of words to a transcript segment
 */
function wordsToSegment(words: DeepgramWord[], channel: number): TranscriptSegment {
    const text = words.map(w => w.word).join(' ');
    const avgConfidence = words.reduce((sum, w) => sum + w.confidence, 0) / words.length;

    return {
        speaker: channel === 0 ? 'rep' : 'prospect',
        text,
        startedAt: Math.floor(words[0].start * 1000),
        endedAt: Math.floor(words[words.length - 1].end * 1000),
        confidence: avgConfidence,
        channel,
    };
}
