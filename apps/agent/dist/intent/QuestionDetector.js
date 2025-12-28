// Question Detector
// Pattern-based question detection from transcript text
// Provides question type classification and confidence scoring
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
export class QuestionDetector {
    static QUESTION_STARTERS = [
        'what', 'when', 'where', 'who', 'why', 'how',
        'can', 'could', 'would', 'should', 'is', 'are',
        'do', 'does', 'did', 'will', 'was', 'were'
    ];
    static TECHNICAL_KEYWORDS = [
        'api', 'integration', 'sdk', 'webhook', 'authentication',
        'oauth', 'ssl', 'encrypt', 'security', 'technical',
        'implementation', 'deploy', 'infrastructure', 'scalability',
        'performance', 'latency', 'uptime', 'database', 'backup'
    ];
    static PRICING_KEYWORDS = [
        'price', 'cost', 'pricing', 'expensive', 'cheap', 'afford',
        'budget', 'pay', 'payment', 'subscription', 'plan', 'tier',
        'free', 'trial', 'discount', 'refund', 'billing', 'invoice'
    ];
    static COMPETITOR_KEYWORDS = [
        'competitor', 'alternative', 'versus', 'vs', 'compare',
        'comparison', 'better', 'worse', 'different', 'similar',
        'salesforce', 'hubspot', 'gong', 'chorus'
    ];
    static INTEGRATION_KEYWORDS = [
        'integrate', 'integration', 'connect', 'sync', 'import',
        'export', 'api', 'zapier', 'webhook', 'plugin', 'addon',
        'crm', 'calendar', 'slack', 'teams', 'zoom'
    ];
    /**
     * Detect if text contains a question
     */
    static detect(text) {
        if (!text || text.trim().length === 0) {
            return {
                isQuestion: false,
                confidence: 0,
                text
            };
        }
        const normalizedText = text.toLowerCase().trim();
        let confidence = 0;
        // Signal 1: Question mark (0.5 confidence)
        if (normalizedText.includes('?')) {
            confidence += 0.5;
        }
        // Signal 2: Starts with question word (0.4 confidence)
        const firstWord = normalizedText.split(/\s+/)[0];
        if (this.QUESTION_STARTERS.includes(firstWord)) {
            confidence += 0.4;
        }
        // Signal 3: Intonation patterns (0.15 confidence)
        // Common patterns like "right?", "correct?", "isn't it?"
        if (/\b(right|correct|yes|no)\?$/i.test(normalizedText)) {
            confidence += 0.15;
        }
        const isQuestion = confidence >= 0.6;
        const questionType = isQuestion ? this.classifyQuestionType(normalizedText) : undefined;
        return {
            isQuestion,
            confidence,
            questionType,
            text
        };
    }
    /**
     * Classify question type based on keywords
     */
    static classifyQuestionType(text) {
        const scores = {
            technical: this.calculateScore(text, this.TECHNICAL_KEYWORDS),
            pricing: this.calculateScore(text, this.PRICING_KEYWORDS),
            competitor: this.calculateScore(text, this.COMPETITOR_KEYWORDS),
            integration: this.calculateScore(text, this.INTEGRATION_KEYWORDS),
            general: 0.1 // Default baseline
        };
        // Return type with highest score
        const entries = Object.entries(scores);
        entries.sort((a, b) => b[1] - a[1]);
        return entries[0][0];
    }
    /**
     * Calculate keyword match score
     */
    static calculateScore(text, keywords) {
        let score = 0;
        for (const keyword of keywords) {
            if (text.includes(keyword)) {
                score += 1;
            }
        }
        return score;
    }
    /**
     * Batch detect questions from multiple utterances
     */
    static detectBatch(texts) {
        return texts.map(text => this.detect(text));
    }
}
//# sourceMappingURL=QuestionDetector.js.map