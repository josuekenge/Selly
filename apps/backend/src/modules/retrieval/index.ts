// Retrieval Module
// Handles knowledge retrieval for suggestions
//
// IMPORTANT CONSTRAINT (from Spec.md Rule 6):
// Retrieval may ONLY read from knowledge read-models or embeddings,
// never mutate or enrich source documents.
// In-memory implementation with simple keyword matching

import { knowledgeService, type KnowledgeChunk } from '../knowledge/index.js';

export interface RetrievalResult {
    chunkId: string;
    documentId: string;
    content: string;
    similarity: number; // 0-1 score
    metadata?: Record<string, any>;
}

export interface RetrievalOptions {
    limit?: number;
    minSimilarity?: number;
}

export interface RetrievalService {
    retrieveContext(
        workspaceId: string,
        query: string,
        options?: RetrievalOptions
    ): Promise<RetrievalResult[]>;
}

// ============================================
// IN-MEMORY IMPLEMENTATION
// ============================================

class RetrievalServiceImpl implements RetrievalService {
    /**
     * Retrieve relevant knowledge chunks for a query
     * Uses simple keyword matching - production would use vector similarity
     */
    async retrieveContext(
        workspaceId: string,
        query: string,
        options: RetrievalOptions = {}
    ): Promise<RetrievalResult[]> {
        const limit = options.limit ?? 5;
        const minSimilarity = options.minSimilarity ?? 0.1;

        // Get all documents for workspace
        const documents = await knowledgeService.listDocuments(workspaceId);

        // Collect all chunks
        const allChunks: Array<{ chunk: KnowledgeChunk; documentId: string }> = [];
        for (const doc of documents) {
            if (doc.chunks) {
                for (const chunk of doc.chunks) {
                    allChunks.push({ chunk, documentId: doc.id });
                }
            }
        }

        if (allChunks.length === 0) {
            console.log(`[retrieval] No knowledge chunks found for workspace ${workspaceId}`);
            return [];
        }

        // Score chunks by keyword similarity
        const scoredChunks = allChunks.map(({ chunk, documentId }) => {
            const similarity = this.calculateKeywordSimilarity(query, chunk.content);
            return {
                chunkId: chunk.id,
                documentId,
                content: chunk.content,
                similarity,
                metadata: chunk.metadata,
            };
        });

        // Filter and sort by similarity
        const results = scoredChunks
            .filter(r => r.similarity >= minSimilarity)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);

        console.log(`[retrieval] Found ${results.length} chunks for query "${query.substring(0, 50)}..."`);

        return results;
    }

    /**
     * Calculate keyword similarity between query and content
     * Production version would use vector embeddings and cosine similarity
     */
    private calculateKeywordSimilarity(query: string, content: string): number {
        const queryWords = this.tokenize(query.toLowerCase());
        const contentWords = this.tokenize(content.toLowerCase());

        if (queryWords.length === 0) return 0;

        // Count matching words
        let matchCount = 0;
        for (const word of queryWords) {
            if (contentWords.includes(word)) {
                matchCount++;
            }
        }

        // Simple ratio: matches / total query words
        const similarity = matchCount / queryWords.length;

        return similarity;
    }

    /**
     * Tokenize text into words
     */
    private tokenize(text: string): string[] {
        return text
            .split(/\W+/)
            .filter(word => word.length > 2) // Filter out short words
            .filter(word => !this.isStopWord(word));
    }

    /**
     * Check if word is a common stop word
     */
    private isStopWord(word: string): boolean {
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'is', 'are', 'was', 'were', 'been', 'be', 'have', 'has',
            'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may',
            'might', 'must', 'can', 'this', 'that', 'these', 'those', 'it', 'its'
        ]);
        return stopWords.has(word);
    }
}

// Singleton instance
export const retrievalService = new RetrievalServiceImpl();
