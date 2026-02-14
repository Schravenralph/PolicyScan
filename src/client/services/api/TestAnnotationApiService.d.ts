/**
 * Test Annotation API Service
 *
 * Client-side service for interacting with test annotation endpoints.
 */
import { BaseApiService } from './BaseApiService.js';
export interface TestResultAnnotation {
    _id?: string;
    runId: string;
    testId?: string;
    annotationType: 'comment' | 'tag' | 'label' | 'note';
    content: string;
    author?: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
}
export interface TestResultTag {
    name: string;
    color?: string;
    description?: string;
}
export declare class TestAnnotationApiService extends BaseApiService {
    constructor(_baseUrl?: string);
    /**
     * Get annotations for a test run
     */
    getAnnotationsForRun(runId: string): Promise<{
        runId: string;
        annotations: TestResultAnnotation[];
        count: number;
    }>;
    /**
     * Get annotations for a specific test
     */
    getAnnotationsForTest(testId: string): Promise<{
        testId: string;
        annotations: TestResultAnnotation[];
        count: number;
    }>;
    /**
     * Add a new annotation
     */
    addAnnotation(annotation: {
        runId: string;
        testId?: string;
        annotationType: 'comment' | 'tag' | 'label' | 'note';
        content: string;
        author?: string;
        metadata?: Record<string, unknown>;
    }): Promise<{
        annotation: TestResultAnnotation;
        message: string;
    }>;
    /**
     * Update an annotation
     */
    updateAnnotation(id: string, updates: {
        content?: string;
        metadata?: Record<string, unknown>;
    }): Promise<{
        annotation: TestResultAnnotation;
        message: string;
    }>;
    /**
     * Delete an annotation
     */
    deleteAnnotation(id: string): Promise<{
        message: string;
        id: string;
    }>;
    /**
     * Add tags to a test result
     */
    addTags(runId: string, tags: string[]): Promise<{
        message: string;
        runId: string;
        tags: string[];
    }>;
    /**
     * Get tags for a test run
     */
    getTagsForRun(runId: string): Promise<{
        runId: string;
        tags: string[];
        count: number;
    }>;
    /**
     * Get all unique tags
     */
    getAllTags(): Promise<{
        tags: TestResultTag[];
        count: number;
    }>;
}
