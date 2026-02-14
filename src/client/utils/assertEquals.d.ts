export type AssertEqualsOptions = {
    message?: string;
    tolerance?: number;
    throwOnError?: boolean;
    context?: Record<string, unknown>;
};
export declare function assertEquals<T>(actual: T, expected: T, options?: AssertEqualsOptions): void;
