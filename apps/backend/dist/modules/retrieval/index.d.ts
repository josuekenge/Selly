export interface RetrievalResult {
    chunkId: string;
    documentId: string;
    content: string;
    similarity: number;
    metadata?: Record<string, any>;
}
export interface RetrievalOptions {
    limit?: number;
    minSimilarity?: number;
}
export interface RetrievalService {
    retrieveContext(workspaceId: string, query: string, options?: RetrievalOptions): Promise<RetrievalResult[]>;
}
declare class RetrievalServiceImpl implements RetrievalService {
    /**
     * Retrieve relevant knowledge chunks for a query
     * Uses simple keyword matching - production would use vector similarity
     */
    retrieveContext(workspaceId: string, query: string, options?: RetrievalOptions): Promise<RetrievalResult[]>;
    /**
     * Calculate keyword similarity between query and content
     * Production version would use vector embeddings and cosine similarity
     */
    private calculateKeywordSimilarity;
    /**
     * Tokenize text into words
     */
    private tokenize;
    /**
     * Check if word is a common stop word
     */
    private isStopWord;
}
export declare const retrievalService: RetrievalServiceImpl;
export {};
//# sourceMappingURL=index.d.ts.map