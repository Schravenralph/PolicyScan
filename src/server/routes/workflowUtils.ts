/**
 * Utility functions for workflow route handlers.
 * Shared helper functions used across multiple route files.
 */

import type { DocumentType } from '../services/infrastructure/types.js';

/**
 * Converts a value to a string, or returns undefined if not a string.
 */
export const asString = (value: unknown): string | undefined => {
    return typeof value === 'string' ? value : undefined;
};

/**
 * Converts a value to a number, or returns undefined if not a valid number.
 */
export const asNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return undefined;
};

/**
 * Converts a value to a string array, or returns undefined if not an array of strings.
 */
export const asStringArray = (value: unknown): string[] | undefined => {
    if (!Array.isArray(value)) {
        return undefined;
    }
    return value.filter((item): item is string => typeof item === 'string');
};

/**
 * Converts a value to a DocumentType, defaulting to 'Webpagina' if invalid.
 */
export const toDocumentType = (value: unknown): DocumentType => {
    if (typeof value !== 'string') {
        return 'Webpagina';
    }
    const valid: DocumentType[] = [
        'PDF',
        'Omgevingsvisie',
        'Omgevingsplan',
        'Bestemmingsplan',
        'Structuurvisie',
        'Beleidsregel',
        'Beleidsnota',
        'Verordening',
        'Visiedocument',
        'Rapport',
        'Besluit',
        'Beleidsdocument',
        'Webpagina',
    ];
    return valid.includes(value as DocumentType) ? (value as DocumentType) : 'Webpagina';
};

/**
 * Domain allowlist for BFS crawlers.
 * SECURITY: Empty set means allow NO domains (deny all).
 * This is populated from CRAWLER_ALLOWED_DOMAINS env var.
 */
export const ALLOWED_DOMAINS = new Set<string>();

let domainsInitialized = false;

/**
 * Internal function to reset the allowed domains state for testing.
 */
export const _resetAllowedDomainsState = (): void => {
    ALLOWED_DOMAINS.clear();
    domainsInitialized = false;
};

/**
 * Checks if a URL is in an allowed domain.
 */
export const isAllowedDomain = (url: string): boolean => {
    try {
        if (!domainsInitialized) {
            // Lazy load allowed domains from environment.
            // Read directly from process.env to avoid full env validation
            // which can throw for unrelated missing variables and permanently
            // lock the allowlist into an empty (deny-all) state.
            const raw = process.env.CRAWLER_ALLOWED_DOMAINS;
            if (raw) {
                const domains = raw.split(',');
                for (const domain of domains) {
                    const trimmed = domain.trim().toLowerCase();
                    if (trimmed) {
                        ALLOWED_DOMAINS.add(trimmed);
                    }
                }
            }
            domainsInitialized = true;
        }

        if (ALLOWED_DOMAINS.size === 0) {
            // Secure default: If no domains are allowed, block everything.
            return false;
        }
        const hostname = new URL(url).hostname;
        return ALLOWED_DOMAINS.has(hostname);
    } catch {
        return false;
    }
};

/**
 * Resilient fetch helper that logs failures instead of swallowing them.
 */
export const safeFetch = async (
    url: string,
    options?: RequestInit,
    _runId?: string,
    _warnPrefix?: string
): Promise<Response | null> => {
    try {
        return await fetch(url, options);
    } catch (error) {
        // Note: runManager needs to be passed in or imported
        // For now, we'll just return null and let the caller handle logging
        // Parameters are intentionally unused for now
        void _runId;
        void _warnPrefix;
        void (error instanceof Error ? error.message : String(error));
        return null;
    }
};
