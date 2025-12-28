export type QuestionType = 'technical' | 'pricing' | 'competitor' | 'integration' | 'general';
export interface QuestionDetectionResult {
    isQuestion: boolean;
    confidence: number;
    questionType?: QuestionType;
    text: string;
}
/**
 * QuestionDetector - Fast pattern-based question detection
 *
 * Detection signals:
 * - Question mark presence (0.5 confidence)
 * - Question words at start (0.4 confidence)
 * - Intonation patterns (0.15 confidence)
 *
 * Total confidence threshold: 0.6+ = high confidence question
 */
export declare class QuestionDetector {
    private static readonly QUESTION_STARTERS;
    private static readonly TECHNICAL_KEYWORDS;
    private static readonly PRICING_KEYWORDS;
    private static readonly COMPETITOR_KEYWORDS;
    private static readonly INTEGRATION_KEYWORDS;
    /**
     * Detect if text contains a question
     */
    static detect(text: string): QuestionDetectionResult;
    /**
     * Classify question type based on keywords
     */
    private static classifyQuestionType;
    /**
     * Calculate keyword match score
     */
    private static calculateScore;
    /**
     * Batch detect questions from multiple utterances
     */
    static detectBatch(texts: string[]): QuestionDetectionResult[];
}
//# sourceMappingURL=QuestionDetector.d.ts.map