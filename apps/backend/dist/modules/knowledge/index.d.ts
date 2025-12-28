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
    embedding?: number[];
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
declare class KnowledgeServiceImpl implements KnowledgeService {
    private documents;
    ingestDocument(params: IngestDocumentParams): Promise<KnowledgeDocument>;
    getDocument(workspaceId: string, documentId: string): Promise<KnowledgeDocument | null>;
    listDocuments(workspaceId: string): Promise<KnowledgeDocument[]>;
    deleteDocument(workspaceId: string, documentId: string): Promise<void>;
    /**
     * Simple content chunking by paragraphs
     * Production version would use token-based chunking with overlap
     */
    private chunkContent;
    /**
     * Simple string hashing for content deduplication
     */
    private hashString;
}
export declare const knowledgeService: KnowledgeServiceImpl;
export {};
//# sourceMappingURL=index.d.ts.map