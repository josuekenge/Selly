// Cloud Transcriber
// Streams audio to cloud transcription provider

export interface TranscriptionResult {
    text: string;
    isFinal: boolean;
    confidence: number;
    timestamp: number;
}

export class CloudTranscriber {
    async connect(): Promise<void> {
        // TODO: Connect to transcription provider
    }

    async disconnect(): Promise<void> {
        // TODO: Disconnect from transcription provider
    }

    async streamAudio(audioChunk: ArrayBuffer): Promise<void> {
        // TODO: Stream audio chunk
    }

    onTranscript(callback: (result: TranscriptionResult) => void): void {
        // TODO: Register transcript callback
    }
}
