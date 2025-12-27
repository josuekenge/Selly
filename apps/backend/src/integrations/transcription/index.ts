// Transcription Integration Adapter
// Wraps external transcription provider APIs
// This is an adapter layer - all transcription providers must implement this interface

export interface TranscriptionProvider {
    name: string;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    streamAudio(chunk: ArrayBuffer): Promise<void>;
    onTranscript(callback: (result: TranscriptionResult) => void): void;
}

export interface TranscriptionResult {
    text: string;
    isFinal: boolean;
    confidence: number;
    timestamp: number;
}

// Factory for creating transcription provider instances
export const createTranscriptionProvider = (providerName: string): TranscriptionProvider => {
    // TODO: Implement provider factory (Deepgram, AssemblyAI, etc.)
    throw new Error(`Provider ${providerName} not implemented`);
};
