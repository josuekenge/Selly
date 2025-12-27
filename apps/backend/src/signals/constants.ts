// Signal Constants
// Step 3A: Deterministic signal extraction thresholds

// Rep is speaking less than 30% of the time
export const TALK_RATIO_REP_LOW = 0.3;

// Rep is speaking more than 70% of the time
export const TALK_RATIO_REP_HIGH = 0.7;

// A single silence gap exceeding 5 seconds
export const LONG_SILENCE_MS = 5000;

// Average transcription confidence below this indicates poor audio
export const LOW_AVG_CONFIDENCE = 0.7;

// Maximum number of signals to include in a SignalSet
export const MAX_SIGNALS = 10;

// Number of recent utterances to scan for keyword signals
export const KEYWORD_WINDOW_UTTERANCES = 10;

// Silences per minute threshold for frequent_silence signal
export const FREQUENT_SILENCE_PER_MINUTE = 5;
