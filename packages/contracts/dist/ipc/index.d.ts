export declare enum IPCChannel {
    SESSION_START = "session:start",
    SESSION_STOP = "session:stop",
    SESSION_STATUS = "session:status",
    AUDIO_DEVICE_LIST = "audio:device:list",
    AUDIO_DEVICE_SELECT = "audio:device:select",
    TRANSCRIPT_PARTIAL = "transcript:partial",
    TRANSCRIPT_FINAL = "transcript:final",
    SUGGESTION_REQUEST = "suggestion:request",
    SUGGESTION_RESPONSE = "suggestion:response"
}
export interface IPCMessage<T = unknown> {
    readonly channel: IPCChannel;
    readonly payload: T;
    readonly timestamp: number;
}
export interface SessionStartRequest {
    readonly workspaceId: string;
}
export interface SessionStartResponse {
    readonly sessionId: string;
    readonly success: boolean;
    readonly error?: string;
}
export interface SessionStatusResponse {
    readonly isActive: boolean;
    readonly sessionId?: string;
    readonly startedAt?: number;
}
export interface AudioDevice {
    readonly id: string;
    readonly name: string;
    readonly isDefault: boolean;
    readonly isInput: boolean;
}
export interface AudioDeviceListResponse {
    readonly devices: readonly AudioDevice[];
}
export interface AudioDeviceSelectRequest {
    readonly deviceId: string;
}
export interface SuggestionRequest {
    readonly question: string;
    readonly context?: string;
}
export interface SuggestionResponse {
    readonly suggestion: string;
    readonly confidence: number;
    readonly sources: readonly string[];
}
//# sourceMappingURL=index.d.ts.map