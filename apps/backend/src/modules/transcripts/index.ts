// Transcripts Module
// Stores and manages call transcripts

export interface Transcript {
    id: string;
    callId: string;
    workspaceId: string;
    text: string;
    createdAt: Date;
}

export interface TranscriptService {
    saveTranscript(callId: string, workspaceId: string, text: string): Promise<Transcript>;
    getTranscript(transcriptId: string): Promise<Transcript | null>;
    getTranscriptsForCall(callId: string): Promise<Transcript[]>;
}
