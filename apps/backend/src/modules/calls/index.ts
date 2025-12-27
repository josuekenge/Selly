// Calls Module
// Manages call sessions and metadata

export interface Call {
    id: string;
    workspaceId: string;
    userId: string;
    startedAt: Date;
    endedAt?: Date;
    status: 'active' | 'completed' | 'failed';
}

export interface CallService {
    startCall(workspaceId: string, userId: string): Promise<Call>;
    endCall(callId: string): Promise<Call>;
    getCall(callId: string): Promise<Call | null>;
}
