// Agent Error Utilities
// Provides retry logic and error handling helpers

/**
 * Retry options for async operations
 */
export interface RetryOptions {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    onRetry?: (error: unknown, attempt: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> = {
    maxAttempts: 3,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
};

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
    let lastError: unknown;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt >= opts.maxAttempts) {
                break;
            }

            // Calculate delay with exponential backoff
            const delay = Math.min(
                opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
                opts.maxDelayMs
            );

            if (options.onRetry) {
                options.onRetry(error, attempt);
            }

            await sleep(delay);
        }
    }

    throw lastError;
}

/**
 * Execute with timeout - returns undefined if timeout is exceeded
 */
export async function withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
): Promise<T | undefined> {
    return Promise.race([
        fn(),
        new Promise<undefined>((resolve) =>
            setTimeout(() => resolve(undefined), timeoutMs)
        ),
    ]);
}

/**
 * Safe wrapper that catches errors and returns undefined instead of throwing
 */
export async function safeAsync<T>(
    fn: () => Promise<T>,
    context?: string
): Promise<T | undefined> {
    try {
        return await fn();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[safeAsync${context ? `: ${context}` : ''}] ${message}`);
        return undefined;
    }
}

/**
 * Log error with context prefix
 */
export function logError(error: unknown, context: string): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${context}] Error: ${message}`);
}
