import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { isTest } from '../config/env.js';

/**
 * Extract IP address from request (similar to express-rate-limit's ipKeyGenerator)
 */
function getIpFromRequest(req: Request): string {
    return (
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        (req.headers['x-real-ip'] as string) ||
        req.socket.remoteAddress ||
        req.ip ||
        'unknown'
    );
}

/**
 * Check if user is a developer or admin (should skip rate limiting)
 */
function isDeveloperOrAdmin(req: Request): boolean {
    return req.user?.role === 'developer' || req.user?.role === 'admin';
}

/**
 * Check if this is a test user (should skip rate limiting)
 */
function isTestUser(req: Request): boolean {
    // Check if user email is the known test user
    if (req.user?.email === 'test@example.com') {
        return true;
    }
    // Also check request body for login attempts with test email
    if (req.body?.email === 'test@example.com') {
        return true;
    }
    return false;
}

/**
 * Check if user is an advisor (should have lenient rate limits)
 */
function isAdvisor(req: Request): boolean {
    return req.user?.role === 'advisor';
}

/**
 * Rate limit info added by express-rate-limit middleware
 */
interface RateLimitInfo {
    resetTime?: number;
}

interface RequestWithRateLimit extends Request {
    rateLimit?: RateLimitInfo;
}

/**
 * Add Retry-After header according to RFC 6585 when rate limited
 * RFC 6585 specifies Retry-After header for 429 Too Many Requests responses
 * The header value is the number of seconds until the rate limit resets
 */
function addRetryAfterHeader(req: Request, res: Response, windowMs: number): void {
    // Try to get reset time from rate limit info (express-rate-limit stores this on req)
    const rateLimitInfo = (req as RequestWithRateLimit).rateLimit;
    if (rateLimitInfo?.resetTime) {
        const resetTime = rateLimitInfo.resetTime;
        const now = Date.now();
        const retryAfterSeconds = Math.ceil((resetTime - now) / 1000);
        if (retryAfterSeconds > 0) {
            res.setHeader('Retry-After', retryAfterSeconds.toString());
            return;
        }
    }
    
    // Fallback: calculate based on window size
    // This is a conservative estimate - the actual reset might be sooner
    const retryAfterSeconds = Math.ceil(windowMs / 1000);
    res.setHeader('Retry-After', retryAfterSeconds.toString());
}

/**
 * General API rate limiter
 * - Developers/Admins: No rate limiting (skip)
 * - Advisors: 1000 requests per 15 minutes (lenient)
 * - Authenticated users: 500 requests per 15 minutes (reasonable for normal usage)
 * - Unauthenticated: 300 requests per 15 minutes (increased from 100 to allow normal browsing)
 * 
 * Uses user-based tracking for authenticated users (userId) and IP-based for unauthenticated.
 * This prevents shared IP issues (office networks, VPNs) from affecting individual users.
 * 
 * Note: /api/graph/stream is excluded - it's read-only polling and doesn't need rate limiting.
 * /api/tests endpoints are always exempt from rate limiting to allow unlimited testing dashboard
 * access for testers and administrators without requiring authentication.
 */
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    // Use user-based key for authenticated users, IP for unauthenticated
    keyGenerator: (req: Request) => {
        // For authenticated users, track by userId to avoid shared IP issues
        if (req.user?.userId) {
            return `user:${req.user.userId}`;
        }
        // For unauthenticated users, use IP with proper IPv6 handling
        return getIpFromRequest(req);
    },
    max: (req: Request) => {
        // Developers and admins: no limit (will be skipped)
        if (isDeveloperOrAdmin(req)) {
            return Number.MAX_SAFE_INTEGER;
        }
        // Advisors: lenient limit
        if (isAdvisor(req)) {
            return 1000; // 1000 requests per 15 minutes for advisors (~66/min)
        }
        // Authenticated users (non-admin, non-advisor): reasonable limit
        if (req.user?.userId) {
            return 500; // 500 requests per 15 minutes for authenticated users (~33/min)
        }
        // Unauthenticated users: increased limit for normal browsing
        return 300; // 300 requests per 15 minutes (~20/min, ~0.33/sec)
    },
    message: 'Too many requests, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers (RFC 6585 draft)
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req: Request, res: Response) => {
        // Add Retry-After header according to RFC 6585
        addRetryAfterHeader(req, res, 15 * 60 * 1000); // 15 minutes window
        res.status(429).json({
            error: 'Too many requests, please try again later.',
            message: 'Too many requests, please try again later.',
        });
    },
    skip: (req) => {
        // Skip rate limiting in test/CI environment
        if (isTest() || process.env.CI === 'true' || process.env.PLAYWRIGHT === 'true') {
            return true;
        }
        // Skip rate limiting for test user
        if (isTestUser(req)) {
            return true;
        }
        // Skip rate limiting for developers and admins
        if (isDeveloperOrAdmin(req)) {
            return true;
        }
        // Skip rate limiting for graph stream endpoint - it's read-only polling
        if (req.path.startsWith('/api/graph/stream')) {
            return true;
        }
        // Skip rate limiting for CSRF token endpoint - it's needed for every mutation request
        // and should be accessible without restrictions to allow proper CSRF protection
        if (req.path === '/api/csrf-token' || req.path === '/csrf-token') {
            return true;
        }
        // Skip rate limiting for testing dashboard endpoints - always exempt for testers/administrators
        // These endpoints are used for monitoring and testing, so they should not be rate limited
        if (req.path.startsWith('/api/tests')) {
            return true;
        }
        // Skip rate limiting for SSE endpoints - they're long-lived connections
        // EventSource connections stay open and may reconnect frequently
        // Rate limiting would break real-time log streaming
        if (req.path.endsWith('/events') || req.path.includes('/events?')) {
            return true;
        }
        // Also check Accept header for SSE (text/event-stream)
        const acceptHeader = req.headers.accept || '';
        if (acceptHeader.includes('text/event-stream')) {
            return true;
        }
        return false;
    }
});

/**
 * Rate limiter for mutation endpoints
 * - Developers/Admins: No rate limiting (skip)
 * - Advisors: 500 requests per 15 minutes (lenient)
 * - Authenticated users: 200 requests per 15 minutes (reasonable for normal usage)
 * - Unauthenticated: 100 requests per 15 minutes (increased from 20 to allow normal usage)
 * 
 * Uses user-based tracking for authenticated users (userId) and IP-based for unauthenticated.
 */
export const mutationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    // Use user-based key for authenticated users, IP for unauthenticated
    keyGenerator: (req: Request) => {
        // For authenticated users, track by userId to avoid shared IP issues
        if (req.user?.userId) {
            return `user:${req.user.userId}`;
        }
        // For unauthenticated users, use IP with proper IPv6 handling
        return getIpFromRequest(req);
    },
    max: (req: Request) => {
        // Developers and admins: no limit (will be skipped)
        if (isDeveloperOrAdmin(req)) {
            return Number.MAX_SAFE_INTEGER;
        }
        // Advisors: lenient limit
        if (isAdvisor(req)) {
            return 500; // 500 mutation requests per 15 minutes for advisors (~33/min)
        }
        // Authenticated users (non-admin, non-advisor): reasonable limit
        if (req.user?.userId) {
            return 200; // 200 mutation requests per 15 minutes for authenticated users (~13/min)
        }
        // Unauthenticated users: increased limit for normal usage
        return 100; // 100 mutation requests per 15 minutes (~6.67/min)
    },
    message: 'Too many mutation requests, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers (RFC 6585 draft)
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
        // Add Retry-After header according to RFC 6585
        addRetryAfterHeader(req, res, 15 * 60 * 1000); // 15 minutes window
        res.status(429).json({
            error: 'Too many mutation requests, please try again later.',
            message: 'Too many mutation requests, please try again later.',
        });
    },
    skip: (req) => {
        // Skip rate limiting in test/CI environment
        if (isTest() || process.env.CI === 'true' || process.env.PLAYWRIGHT === 'true') {
            return true;
        }
        // Skip rate limiting for test user
        if (isTestUser(req)) {
            return true;
        }
        // Skip rate limiting for developers and admins
        if (isDeveloperOrAdmin(req)) {
            return true;
        }
        // Skip rate limiting for SSE endpoints - they're long-lived connections
        // EventSource connections stay open and may reconnect frequently
        // Rate limiting would break real-time log streaming
        if (req.path.endsWith('/events') || req.path.includes('/events?')) {
            return true;
        }
        // Also check Accept header for SSE (text/event-stream)
        const acceptHeader = req.headers.accept || '';
        if (acceptHeader.includes('text/event-stream')) {
            return true;
        }
        return false;
    }
});

/**
 * Authentication rate limiter
 * - Developers/Admins: No rate limiting (skip)
 * - Advisors: 20 login attempts per 15 minutes (lenient)
 * - Unauthenticated: 5 login attempts per 15 minutes
 */
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: (req: Request) => {
        // Developers and admins: no limit (will be skipped)
        if (isDeveloperOrAdmin(req)) {
            return Number.MAX_SAFE_INTEGER;
        }
        // Advisors: lenient limit
        if (isAdvisor(req)) {
            return 20; // 20 login attempts per 15 minutes for advisors
        }
        // Unauthenticated users: standard limit
        return 5;
    },
    message: 'Too many authentication attempts from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers (RFC 6585 draft)
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful requests
    handler: (req: Request, res: Response) => {
        // Add Retry-After header according to RFC 6585
        addRetryAfterHeader(req, res, 15 * 60 * 1000); // 15 minutes window
        res.status(429).json({
            error: 'Too many authentication attempts from this IP, please try again later.',
            message: 'Too many authentication attempts from this IP, please try again later.',
        });
    },
    skip: (req) => {
        // Skip rate limiting in test/CI environment
        if (isTest() || process.env.CI === 'true' || process.env.PLAYWRIGHT === 'true') {
            return true;
        }
        // Skip rate limiting for test user
        if (isTestUser(req)) {
            return true;
        }
        // Skip rate limiting for developers and admins
        return isDeveloperOrAdmin(req);
    }
});

/**
 * Rate limiter for workflow execution endpoints
 * - Developers/Admins: No rate limiting (skip)
 * - Advisors: 20 workflow executions per 15 minutes (lenient)
 * - Authenticated users: 10 workflow executions per 15 minutes (reasonable for normal usage)
 * - Unauthenticated: 5 workflow executions per 15 minutes (restrictive to prevent abuse)
 * 
 * Workflow executions are resource-intensive and can trigger expensive external API calls,
 * so we need stricter limits than general mutation endpoints to prevent DoS attacks and cost issues.
 * 
 * Applies to:
 * - POST /api/workflows/:id/run
 * - POST /api/queries/:id/scan
 */
export const workflowExecutionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    // Use user-based key for authenticated users, IP for unauthenticated
    keyGenerator: (req: Request) => {
        // For authenticated users, track by userId to avoid shared IP issues
        if (req.user?.userId) {
            return `workflow:user:${req.user.userId}`;
        }
        // For unauthenticated users, use IP with proper IPv6 handling
        return `workflow:ip:${getIpFromRequest(req)}`;
    },
    max: (req: Request) => {
        // Developers and admins: no limit (will be skipped)
        if (isDeveloperOrAdmin(req)) {
            return Number.MAX_SAFE_INTEGER;
        }
        // Advisors: lenient limit
        if (isAdvisor(req)) {
            return 20; // 20 workflow executions per 15 minutes for advisors (~1.33/min)
        }
        // Authenticated users (non-admin, non-advisor): reasonable limit
        if (req.user?.userId) {
            return 10; // 10 workflow executions per 15 minutes for authenticated users (~0.67/min)
        }
        // Unauthenticated users: restrictive limit to prevent abuse
        return 5; // 5 workflow executions per 15 minutes (~0.33/min)
    },
    message: 'Too many workflow executions, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers (RFC 6585 draft)
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
        // Add Retry-After header according to RFC 6585
        addRetryAfterHeader(req, res, 15 * 60 * 1000); // 15 minutes window
        res.status(429).json({
            error: 'Too many workflow executions, please try again later.',
            message: 'Too many workflow executions, please try again later.',
            retryAfter: 900, // 15 minutes in seconds
        });
    },
    skip: (req) => {
        // Skip rate limiting in test/CI environment
        if (isTest() || process.env.CI === 'true' || process.env.PLAYWRIGHT === 'true') {
            return true;
        }
        // Skip rate limiting for test user
        if (isTestUser(req)) {
            return true;
        }
        // Skip rate limiting for developers and admins
        return isDeveloperOrAdmin(req);
    }
});
