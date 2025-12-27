// Retry Utility
// Wraps async functions with exponential backoff retry logic

export interface RetryOptions {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
    onRetry?: (error: unknown, attempt: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'shouldRetry'>> = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
};

/**
 * Default retry condition: retry on network/timeout/5xx errors
 */
function defaultShouldRetry(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();

    // Retry on rate limits
    if (lower.includes('429') || lower.includes('rate limit')) return true;

    // Retry on timeouts
    if (lower.includes('timeout') || lower.includes('timed out')) return true;

    // Retry on network errors
    if (lower.includes('network') || lower.includes('econnrefused') || lower.includes('econnreset')) return true;

    // Retry on server errors
    if (lower.includes('500') || lower.includes('502') || lower.includes('503') || lower.includes('504')) return true;

    // Don't retry on client errors
    if (lower.includes('400') || lower.includes('401') || lower.includes('403') || lower.includes('404')) return false;

    // Don't retry on validation errors
    if (lower.includes('invalid') || lower.includes('validation')) return false;

    // Default: retry on unknown errors
    return true;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wrap an async function with retry logic
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const shouldRetry = options.shouldRetry ?? defaultShouldRetry;

    let lastError: unknown;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt >= opts.maxAttempts) {
                // Max attempts reached
                break;
            }

            if (!shouldRetry(error, attempt)) {
                // Error is not retryable
                break;
            }

            // Calculate delay with exponential backoff
            const delay = Math.min(
                opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
                opts.maxDelayMs
            );

            // Optional callback
            if (options.onRetry) {
                options.onRetry(error, attempt);
            }

            console.log(`[retry] Attempt ${attempt} failed, retrying in ${delay}ms...`);
            await sleep(delay);
        }
    }

    throw lastError;
}

/**
 * Create a retry wrapper for a specific function
 */
export function createRetryWrapper<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    options: RetryOptions = {}
): (...args: TArgs) => Promise<TResult> {
    return (...args: TArgs) => withRetry(() => fn(...args), options);
}
