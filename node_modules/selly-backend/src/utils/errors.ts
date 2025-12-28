// Error Utilities
// Typed error classes and error handling helpers for the backend
// Provides consistent error responses across all API endpoints

/**
 * Base application error with typed error codes
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly isOperational: boolean;
    public readonly context?: Record<string, unknown>;

    constructor(
        message: string,
        statusCode: number = 500,
        code: string = 'INTERNAL_ERROR',
        isOperational: boolean = true,
        context?: Record<string, unknown>
    ) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = isOperational;
        this.context = context;
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

// ============================================
// SPECIFIC ERROR TYPES
// ============================================

export class ValidationError extends AppError {
    constructor(message: string, context?: Record<string, unknown>) {
        super(message, 400, 'VALIDATION_ERROR', true, context);
    }
}

export class NotFoundError extends AppError {
    constructor(resource: string, id?: string) {
        super(
            id ? `${resource} with id '${id}' not found` : `${resource} not found`,
            404,
            'NOT_FOUND',
            true,
            { resource, id }
        );
    }
}

export class UnauthorizedError extends AppError {
    constructor(message: string = 'Unauthorized') {
        super(message, 401, 'UNAUTHORIZED', true);
    }
}

export class ForbiddenError extends AppError {
    constructor(message: string = 'Forbidden') {
        super(message, 403, 'FORBIDDEN', true);
    }
}

export class ConflictError extends AppError {
    constructor(message: string, context?: Record<string, unknown>) {
        super(message, 409, 'CONFLICT', true, context);
    }
}

export class RateLimitError extends AppError {
    public readonly retryAfterMs: number;

    constructor(retryAfterMs: number = 60000) {
        super('Too many requests, please try again later', 429, 'RATE_LIMIT', true, { retryAfterMs });
        this.retryAfterMs = retryAfterMs;
    }
}

export class ServiceUnavailableError extends AppError {
    constructor(service: string, message?: string) {
        super(
            message || `${service} service is temporarily unavailable`,
            503,
            'SERVICE_UNAVAILABLE',
            true,
            { service }
        );
    }
}

export class ExternalServiceError extends AppError {
    public readonly service: string;
    public readonly originalError?: Error;

    constructor(service: string, message: string, originalError?: Error) {
        super(message, 502, 'EXTERNAL_SERVICE_ERROR', true, { service });
        this.service = service;
        this.originalError = originalError;
    }
}

// ============================================
// ERROR RESPONSE FORMATTING
// ============================================

export interface ErrorResponse {
    ok: false;
    error: string;
    code: string;
    statusCode: number;
    context?: Record<string, unknown>;
    timestamp: string;
    requestId?: string;
}

export function formatErrorResponse(
    error: AppError | Error,
    requestId?: string
): ErrorResponse {
    if (error instanceof AppError) {
        return {
            ok: false,
            error: error.message,
            code: error.code,
            statusCode: error.statusCode,
            context: error.isOperational ? error.context : undefined,
            timestamp: new Date().toISOString(),
            requestId,
        };
    }

    // Unknown error - don't expose details
    return {
        ok: false,
        error: 'An unexpected error occurred',
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        timestamp: new Date().toISOString(),
        requestId,
    };
}

// ============================================
// SAFE ASYNC WRAPPER
// ============================================

/**
 * Wraps an async function to catch errors and return a Result type
 */
export type Result<T> =
    | { ok: true; data: T }
    | { ok: false; error: AppError };

export async function safeAsync<T>(
    fn: () => Promise<T>,
    errorContext?: string
): Promise<Result<T>> {
    try {
        const data = await fn();
        return { ok: true, data };
    } catch (error) {
        if (error instanceof AppError) {
            return { ok: false, error };
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        const appError = new AppError(
            errorContext ? `${errorContext}: ${message}` : message,
            500,
            'INTERNAL_ERROR',
            false
        );
        return { ok: false, error: appError };
    }
}

// ============================================
// LOGGING HELPERS
// ============================================

export function logError(error: unknown, context: string): void {
    const timestamp = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    if (error instanceof AppError && error.isOperational) {
        // Operational errors are expected - log at warn level
        console.warn(`[${timestamp}] [${context}] ${error.code}: ${message}`);
    } else {
        // Programming errors - log full stack
        console.error(`[${timestamp}] [${context}] ERROR: ${message}`);
        if (stack) {
            console.error(stack);
        }
    }
}
