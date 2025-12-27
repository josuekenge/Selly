// Knowledge Module
// Handles knowledge ingestion and storage
// NOTE: This module OWNS knowledge data writes

export interface KnowledgeDocument {
    id: string;
    workspaceId: string;
    title: string;
    content: string;
    embedding?: number[];
    createdAt: Date;
    updatedAt: Date;
}

export interface KnowledgeService {
    ingestDocument(workspaceId: string, title: string, content: string): Promise<KnowledgeDocument>;
    updateDocument(documentId: string, content: string): Promise<KnowledgeDocument>;
    deleteDocument(documentId: string): Promise<void>;
}
