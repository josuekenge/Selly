// Intent Types
// Type definitions for intent detection module

export enum IntentCategory {
    PRICING = 'pricing',
    FEATURES = 'features',
    COMPARISON = 'comparison',
    OBJECTION = 'objection',
    TIMELINE = 'timeline',
    TECHNICAL = 'technical',
    GENERAL = 'general',
}

export interface Intent {
    category: IntentCategory;
    confidence: number;
    keywords: string[];
}
