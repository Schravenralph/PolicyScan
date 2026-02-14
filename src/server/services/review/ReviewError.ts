/**
 * Custom error types for Review Service
 */

export class ReviewError extends Error {
    constructor(
        message: string,
        public code: string,
        public statusCode: number = 500
    ) {
        super(message);
        this.name = 'ReviewError';
        Object.setPrototypeOf(this, ReviewError.prototype);
    }
}

export class ReviewNotFoundError extends ReviewError {
    constructor(reviewId: string) {
        super(`Review not found: ${reviewId}`, 'REVIEW_NOT_FOUND', 404);
        this.name = 'ReviewNotFoundError';
    }
}

export class ReviewAlreadyCompletedError extends ReviewError {
    constructor(reviewId: string) {
        super(`Review ${reviewId} is already completed`, 'REVIEW_ALREADY_COMPLETED', 400);
        this.name = 'ReviewAlreadyCompletedError';
    }
}

export class InvalidReviewInputError extends ReviewError {
    constructor(message: string) {
        super(`Invalid review input: ${message}`, 'INVALID_REVIEW_INPUT', 400);
        this.name = 'InvalidReviewInputError';
    }
}

export class RunNotPausedError extends ReviewError {
    constructor(runId: string, status: string, message?: string) {
        super(message || `Run ${runId} is not paused: ${status}`, 'RUN_NOT_PAUSED', 400);
        this.name = 'RunNotPausedError';
    }
}

export class CandidateNotFoundError extends ReviewError {
    constructor(candidateId: string) {
        super(`Candidate not found: ${candidateId}`, 'CANDIDATE_NOT_FOUND', 404);
        this.name = 'CandidateNotFoundError';
    }
}

