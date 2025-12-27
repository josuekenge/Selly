// Question Detector
// Detects questions from transcript text

export interface DetectedQuestion {
    text: string;
    confidence: number;
    timestamp: number;
    category?: string;
}

export class QuestionDetector {
    detect(transcript: string): DetectedQuestion | null {
        // TODO: Implement question detection logic
        // Should detect questions within ~100ms
        return null;
    }
}
