import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { Request, Response, NextFunction } from 'express';

// Create a DOMPurify instance for Node.js
const window = new JSDOM('').window;
// DOMPurify needs a Window-like object, JSDOM's window works but needs proper typing
// JSDOM's window is compatible with DOMPurify but TypeScript doesn't recognize it
// Use type assertion - JSDOM window is compatible with DOMPurify's expected Window type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const purify = DOMPurify(window as any);

/**
 * Sanitize HTML strings in request body
 * Removes potentially dangerous HTML/JavaScript while preserving safe formatting
 */
type SanitizableValue = string | number | boolean | null | SanitizableValue[] | { [key: string]: SanitizableValue };

export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
    if (req.body && typeof req.body === 'object') {
        // Fields to exclude from sanitization
        const EXCLUDED_FIELDS: string[] = [];

        // Recursively sanitize string fields
        const sanitizeObject = (obj: unknown, key?: string): SanitizableValue => {
            // Skip sanitization for excluded fields
            if (key && EXCLUDED_FIELDS.includes(key)) {
                return obj as SanitizableValue;
            }

            if (typeof obj === 'string') {
                // Sanitize HTML but preserve basic formatting
                return purify.sanitize(obj, {
                    ALLOWED_TAGS: [], // Remove all HTML tags
                    ALLOWED_ATTR: [],
                });
            } else if (Array.isArray(obj)) {
                return obj.map(item => sanitizeObject(item));
            } else if (obj && typeof obj === 'object') {
                const sanitized: Record<string, SanitizableValue> = {};
                for (const [k, value] of Object.entries(obj)) {
                    sanitized[k] = sanitizeObject(value, k);
                }
                return sanitized;
            }
            return obj as SanitizableValue;
        };

        req.body = sanitizeObject(req.body);
    }
    next();
}

/**
 * Sanitize a single string value
 */
export function sanitizeString(input: string): string {
    return purify.sanitize(input, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
    });
}
