// LLM Module
// Orchestrates LLM calls for suggestions and analysis

export interface SuggestionRequest {
    question: string;
    context: string[];
    workspaceId: string;
}

export interface Suggestion {
    text: string;
    confidence: number;
    sources: string[];
}

export interface LLMService {
    generateSuggestion(request: SuggestionRequest): Promise<Suggestion>;
    generateCallSummary(transcriptId: string): Promise<string>;
}
