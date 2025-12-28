// Knowledge Module
// Handles knowledge ingestion and storage
// NOTE: This module OWNS knowledge data writes
// In-memory implementation - can be extended with database later

export interface KnowledgeDocument {
    id: string;
    workspaceId: string;
    title: string;
    description?: string;
    sourceType: 'manual' | 'upload' | 'api';
    status: 'pending' | 'processed' | 'error';
    content: string;
    chunks?: KnowledgeChunk[];
    metadata?: Record<string, any>;
    createdAt: number;
    updatedAt: number;
}

export interface KnowledgeChunk {
    id: string;
    documentId: string;
    workspaceId: string;
    chunkIndex: number;
    content: string;
    contentHash: string;
    embedding?: number[]; // Vector embedding (1536 dimensions for OpenAI)
    metadata?: Record<string, any>;
}

export interface IngestDocumentParams {
    workspaceId: string;
    title: string;
    content: string;
    description?: string;
    sourceType?: 'manual' | 'upload' | 'api';
    metadata?: Record<string, any>;
}

export interface KnowledgeService {
    ingestDocument(params: IngestDocumentParams): Promise<KnowledgeDocument>;
    getDocument(workspaceId: string, documentId: string): Promise<KnowledgeDocument | null>;
    listDocuments(workspaceId: string): Promise<KnowledgeDocument[]>;
    deleteDocument(workspaceId: string, documentId: string): Promise<void>;
}

// ============================================
// IN-MEMORY IMPLEMENTATION
// ============================================

class KnowledgeServiceImpl implements KnowledgeService {
    private documents: Map<string, KnowledgeDocument> = new Map();

    async ingestDocument(params: IngestDocumentParams): Promise<KnowledgeDocument> {
        const id = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = Date.now();

        // Simple chunking: split into paragraphs
        const chunks = this.chunkContent(params.content, id, params.workspaceId);

        const document: KnowledgeDocument = {
            id,
            workspaceId: params.workspaceId,
            title: params.title,
            description: params.description,
            sourceType: params.sourceType ?? 'manual',
            status: 'processed',
            content: params.content,
            chunks,
            metadata: params.metadata,
            createdAt: now,
            updatedAt: now,
        };

        this.documents.set(id, document);

        console.log(`[knowledge] Ingested document "${params.title}" with ${chunks.length} chunks`);

        return document;
    }

    async getDocument(workspaceId: string, documentId: string): Promise<KnowledgeDocument | null> {
        const doc = this.documents.get(documentId);
        if (!doc || doc.workspaceId !== workspaceId) {
            return null;
        }
        return doc;
    }

    async listDocuments(workspaceId: string): Promise<KnowledgeDocument[]> {
        const docs: KnowledgeDocument[] = [];
        for (const doc of this.documents.values()) {
            if (doc.workspaceId === workspaceId) {
                docs.push(doc);
            }
        }
        return docs.sort((a, b) => b.createdAt - a.createdAt);
    }

    async deleteDocument(workspaceId: string, documentId: string): Promise<void> {
        const doc = this.documents.get(documentId);
        if (doc && doc.workspaceId === workspaceId) {
            this.documents.delete(documentId);
            console.log(`[knowledge] Deleted document ${documentId}`);
        }
    }

    /**
     * Simple content chunking by paragraphs
     * Production version would use token-based chunking with overlap
     */
    private chunkContent(content: string, documentId: string, workspaceId: string): KnowledgeChunk[] {
        const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);
        const chunks: KnowledgeChunk[] = [];

        for (let i = 0; i < paragraphs.length; i++) {
            const chunkContent = paragraphs[i].trim();
            if (chunkContent.length < 10) continue; // Skip very short paragraphs

            const chunkId = `chunk_${documentId}_${i}`;
            const contentHash = this.hashString(chunkContent);

            chunks.push({
                id: chunkId,
                documentId,
                workspaceId,
                chunkIndex: i,
                content: chunkContent,
                contentHash,
                // Embedding would be generated here in production
                embedding: undefined,
                metadata: {
                    paragraphIndex: i,
                    length: chunkContent.length,
                },
            });
        }

        return chunks;
    }

    /**
     * Simple string hashing for content deduplication
     */
    private hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString(36);
    }
}

// Singleton instance
export const knowledgeService = new KnowledgeServiceImpl();
