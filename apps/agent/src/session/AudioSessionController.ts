// Audio Session Controller
// Manages the lifecycle of audio capture and transcription sessions

import { AudioCapture } from '../audio/AudioCapture';
import { CloudTranscriber } from '../transcription/CloudTranscriber';
import { QuestionDetector } from '../intent/QuestionDetector';

export interface SessionState {
    isActive: boolean;
    startedAt?: Date;
    questionCount: number;
}

export class AudioSessionController {
    private audioCapture: AudioCapture;
    private transcriber: CloudTranscriber;
    private questionDetector: QuestionDetector;
    private state: SessionState = { isActive: false, questionCount: 0 };

    constructor() {
        this.audioCapture = new AudioCapture();
        this.transcriber = new CloudTranscriber();
        this.questionDetector = new QuestionDetector();
    }

    async startSession(): Promise<void> {
        // TODO: Implement session start
        this.state = { isActive: true, startedAt: new Date(), questionCount: 0 };
    }

    async endSession(): Promise<void> {
        // TODO: Implement session end
        this.state.isActive = false;
    }

    getState(): SessionState {
        return this.state;
    }
}
