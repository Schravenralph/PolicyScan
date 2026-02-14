/**
 * Transformation Error Handler - Handles errors during data transformation
 *
 * Provides utilities for safely executing transformations with error handling,
 * fallback values, and recovery mechanisms.
 */
export interface TransformationResult<T> {
    success: boolean;
    data?: T;
    error?: Error;
    originalData?: unknown;
    fallbackUsed?: boolean;
}
/**
 * Execute transformation with error handling and validation
 */
export declare function safeTransform<TInput, TOutput>(input: TInput, transformFn: (input: TInput) => TOutput, options?: {
    validateInput?: (input: TInput) => {
        valid: boolean;
        errors: string[];
    };
    validateOutput?: (output: TOutput) => {
        valid: boolean;
        errors: string[];
    };
    fallback?: (input: TInput, error: Error) => TOutput | null;
    preserveOriginal?: boolean;
}): TransformationResult<TOutput>;
/**
 * Transform array with error handling (continues on individual failures)
 */
export declare function safeTransformArray<TInput, TOutput>(inputs: TInput[], transformFn: (input: TInput) => TOutput, options?: {
    validateInput?: (input: TInput) => {
        valid: boolean;
        errors: string[];
    };
    validateOutput?: (output: TOutput) => {
        valid: boolean;
        errors: string[];
    };
    fallback?: (input: TInput, error: Error) => TOutput | null;
    continueOnError?: boolean;
}): {
    results: TransformationResult<TOutput>[];
    succeeded: number;
    failed: number;
};
