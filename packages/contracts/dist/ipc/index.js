// IPC Contracts
// Shared type definitions for IPC between Desktop shell and Local Agent
// 
// RULES (from SPEC.md):
// - No logic
// - No helpers
// - No data access
// - Only interfaces, types, and enums
// ============================================
// IPC CHANNEL NAMES
// ============================================
export var IPCChannel;
(function (IPCChannel) {
    // Session lifecycle
    IPCChannel["SESSION_START"] = "session:start";
    IPCChannel["SESSION_STOP"] = "session:stop";
    IPCChannel["SESSION_STATUS"] = "session:status";
    // Audio
    IPCChannel["AUDIO_DEVICE_LIST"] = "audio:device:list";
    IPCChannel["AUDIO_DEVICE_SELECT"] = "audio:device:select";
    // Transcription
    IPCChannel["TRANSCRIPT_PARTIAL"] = "transcript:partial";
    IPCChannel["TRANSCRIPT_FINAL"] = "transcript:final";
    // Suggestions
    IPCChannel["SUGGESTION_REQUEST"] = "suggestion:request";
    IPCChannel["SUGGESTION_RESPONSE"] = "suggestion:response";
})(IPCChannel || (IPCChannel = {}));
