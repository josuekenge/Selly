// Error Middleware
// Global error handling middleware for Express
// Catches all errors and returns consistent JSON responses

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError, formatErrorResponse, logError } from '../utils/errors.js';

/**
 * Async handler wrapper - catches errors from async route handlers
 * Use this to wrap all async route handlers to avoid try/catch boilerplate
 * 
 * Example:
 *   router.get('/resource', asyncHandler(async (req, res) => {
 *       const data = await fetchData();
 *       res.json(data);
 *   }));
 */
export function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * 404 Not Found handler - catches unmatched routes
 */
export function notFoundHandler(req: Request, res: Response): void {
    res.status(404).json({
        ok: false,
        error: `Route not found: ${req.method} ${req.path}`,
        code: 'NOT_FOUND',
        statusCode: 404,
        timestamp: new Date().toISOString(),
    });
}

/**
 * Global error handler - catches all errors passed to next()
 * Must be registered LAST in the middleware chain
 */
export function globalErrorHandler(
    error: Error,
    req: Request,
    res: Response,
    _next: NextFunction
): void {
    // Generate request ID for tracking
    const requestId = req.headers['x-request-id'] as string ||
        `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Log the error
    logError(error, `${req.method} ${req.path}`);

    // Format response
    const response = formatErrorResponse(error, requestId);

    // Send response
    res.status(response.statusCode).json(response);
}

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
        const message = `${req.method} ${req.path} ${res.statusCode} ${duration}ms`;

        if (logLevel === 'warn') {
            console.warn(`[api] ${message}`);
        } else {
            console.log(`[api] ${message}`);
        }
    });

    next();
}

/**
 * Health check that includes service status
 */
export interface ServiceHealth {
    name: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    latencyMs?: number;
    error?: string;
}

export async function checkServiceHealth(
    name: string,
    checkFn: () => Promise<boolean>
): Promise<ServiceHealth> {
    const start = Date.now();
    try {
        const isHealthy = await checkFn();
        return {
            name,
            status: isHealthy ? 'healthy' : 'degraded',
            latencyMs: Date.now() - start,
        };
    } catch (error) {
        return {
            name,
            status: 'unhealthy',
            latencyMs: Date.now() - start,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
