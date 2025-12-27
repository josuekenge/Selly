// Local Agent Entry Point
// System companion for audio capture and transcription

export { AudioDeviceManager } from './audio/AudioDeviceManager';
export { AudioCapture } from './audio/AudioCapture';
export { CloudTranscriber } from './transcription/CloudTranscriber';
export { QuestionDetector } from './intent/QuestionDetector';
export { AudioSessionController } from './session/AudioSessionController';

// Re-export types
export * from './transcription/TranscriptionTypes';
export * from './intent/IntentTypes';
