// Retrieval Module
// Handles knowledge retrieval for suggestions
// 
// IMPORTANT CONSTRAINT (from Spec.md Rule 6):
// Retrieval may ONLY read from knowledge read-models or embeddings,
// never mutate or enrich source documents.

export interface RetrievalResult {
    documentId: string;
    text: string;
    relevanceScore: number;
}

export interface RetrievalService {
    // Query ONLY from read-models/embeddings, NOT raw knowledge tables
    search(workspaceId: string, query: string, limit?: number): Promise<RetrievalResult[]>;
}
