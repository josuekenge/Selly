// LLM Integration Adapter
// Wraps external LLM provider APIs
// This is an adapter layer - all LLM providers must implement this interface

export interface LLMProvider {
    name: string;
    complete(prompt: string, options?: LLMOptions): Promise<LLMResponse>;
    streamComplete(prompt: string, options?: LLMOptions): AsyncIterable<string>;
}

export interface LLMOptions {
    maxTokens?: number;
    temperature?: number;
    model?: string;
}

export interface LLMResponse {
    text: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
    };
}

// Factory for creating LLM provider instances
export const createLLMProvider = (providerName: string): LLMProvider => {
    // TODO: Implement provider factory (OpenAI, Anthropic, etc.)
    throw new Error(`Provider ${providerName} not implemented`);
};
