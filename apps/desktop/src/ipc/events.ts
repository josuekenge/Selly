// IPC Event Definitions
// Events for communication between Tauri shell and UI

export enum IPCEvents {
    // Audio events
    AUDIO_CAPTURE_START = 'audio:capture:start',
    AUDIO_CAPTURE_STOP = 'audio:capture:stop',

    // Transcription events
    TRANSCRIPT_PARTIAL = 'transcript:partial',
    TRANSCRIPT_FINAL = 'transcript:final',

    // Suggestion events
    SUGGESTION_RECEIVED = 'suggestion:received',

    // Session events
    SESSION_START = 'session:start',
    SESSION_END = 'session:end',
}
