/**
 * Validation utilities for WorkflowReview
 */

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * Validate candidate result input
 */
export function validateCandidateInput(candidate: {
    id?: string;
    title?: string;
    url?: string;
    snippet?: string;
    metadata?: Record<string, unknown>;
}): ValidationResult {
    const errors: string[] = [];

    if (!candidate.title && !candidate.url) {
        errors.push('Candidate must have either title or url');
    }

    if (candidate.url) {
        try {
            new URL(candidate.url);
        } catch {
            errors.push(`Invalid URL: ${candidate.url}`);
        }
    }

    if (candidate.id && typeof candidate.id !== 'string') {
        errors.push('Candidate id must be a string');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validate review creation input
 */
export function validateReviewCreateInput(input: {
    runId?: string;
    workflowId?: string;
    moduleId?: string;
    moduleName?: string;
    candidateResults?: unknown[];
}): ValidationResult {
    const errors: string[] = [];

    if (!input.runId || typeof input.runId !== 'string') {
        errors.push('runId is required and must be a string');
    }

    if (!input.workflowId || typeof input.workflowId !== 'string') {
        errors.push('workflowId is required and must be a string');
    }

    if (!input.moduleId || typeof input.moduleId !== 'string') {
        errors.push('moduleId is required and must be a string');
    }

    if (!input.moduleName || typeof input.moduleName !== 'string') {
        errors.push('moduleName is required and must be a string');
    }

    if (!Array.isArray(input.candidateResults)) {
        errors.push('candidateResults must be an array');
    } else if (input.candidateResults.length === 0) {
        errors.push('candidateResults must contain at least one candidate');
    } else {
        // Validate each candidate
        input.candidateResults.forEach((candidate, idx) => {
            if (typeof candidate !== 'object' || candidate === null) {
                errors.push(`Candidate ${idx} must be an object`);
            } else {
                const candidateValidation = validateCandidateInput(candidate as {
                    id?: string;
                    title?: string;
                    url?: string;
                    snippet?: string;
                    metadata?: Record<string, unknown>;
                });
                if (!candidateValidation.valid) {
                    errors.push(`Candidate ${idx}: ${candidateValidation.errors.join(', ')}`);
                }
            }
        });
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validate ObjectId format
 */
export function validateObjectId(id: string): boolean {
    return /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * Sanitize candidate data
 */
export function sanitizeCandidate(candidate: {
    id?: string;
    title?: string;
    url?: string;
    snippet?: string;
    metadata?: Record<string, unknown>;
}): {
    id: string;
    title: string;
    url: string;
    snippet: string;
    metadata: Record<string, unknown>;
} {
    return {
        id: candidate.id || `candidate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: (candidate.title || candidate.url || 'Untitled').trim().substring(0, 500),
        url: (candidate.url || '').trim(),
        snippet: (candidate.snippet || '').trim().substring(0, 1000),
        metadata: candidate.metadata || {}
    };
}

