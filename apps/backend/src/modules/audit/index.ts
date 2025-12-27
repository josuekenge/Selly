// Audit Module
// Logs all AI outputs and system events

export interface AuditEntry {
    id: string;
    workspaceId: string;
    userId: string;
    action: string;
    details: Record<string, unknown>;
    timestamp: Date;
}

export interface AuditService {
    log(workspaceId: string, userId: string, action: string, details: Record<string, unknown>): Promise<AuditEntry>;
    getAuditLog(workspaceId: string, options?: { limit?: number; offset?: number }): Promise<AuditEntry[]>;
}
