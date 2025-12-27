export declare enum IntentCategory {
    PRICING = "pricing",
    FEATURES = "features",
    COMPARISON = "comparison",
    OBJECTION = "objection",
    TIMELINE = "timeline",
    TECHNICAL = "technical",
    GENERAL = "general"
}
export interface DetectedQuestion {
    text: string;
    confidence: number;
    timestamp: number;
    category?: IntentCategory;
}
//# sourceMappingURL=IntentTypes.d.ts.map