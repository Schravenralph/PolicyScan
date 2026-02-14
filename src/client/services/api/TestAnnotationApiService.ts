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

export class TestAnnotationApiService extends BaseApiService {
  constructor(_baseUrl?: string) {
    super();
    // Note: BaseApiService doesn't accept baseUrl in constructor
    // If baseUrl customization is needed, it should be handled differently
  }

  /**
   * Get annotations for a test run
   */
  async getAnnotationsForRun(runId: string): Promise<{
    runId: string;
    annotations: TestResultAnnotation[];
    count: number;
  }> {
    return this.request(`/tests/annotations/run/${encodeURIComponent(runId)}`);
  }

  /**
   * Get annotations for a specific test
   */
  async getAnnotationsForTest(testId: string): Promise<{
    testId: string;
    annotations: TestResultAnnotation[];
    count: number;
  }> {
    return this.request(`/tests/annotations/test/${encodeURIComponent(testId)}`);
  }

  /**
   * Add a new annotation
   */
  async addAnnotation(annotation: {
    runId: string;
    testId?: string;
    annotationType: 'comment' | 'tag' | 'label' | 'note';
    content: string;
    author?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    annotation: TestResultAnnotation;
    message: string;
  }> {
    return this.request('/tests/annotations', {
      method: 'POST',
      body: JSON.stringify(annotation),
    });
  }

  /**
   * Update an annotation
   */
  async updateAnnotation(
    id: string,
    updates: {
      content?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<{
    annotation: TestResultAnnotation;
    message: string;
  }> {
    return this.request(`/tests/annotations/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  /**
   * Delete an annotation
   */
  async deleteAnnotation(id: string): Promise<{
    message: string;
    id: string;
  }> {
    return this.request(`/tests/annotations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  /**
   * Add tags to a test result
   */
  async addTags(runId: string, tags: string[]): Promise<{
    message: string;
    runId: string;
    tags: string[];
  }> {
    return this.request('/tests/annotations/tags', {
      method: 'POST',
      body: JSON.stringify({ runId, tags }),
    });
  }

  /**
   * Get tags for a test run
   */
  async getTagsForRun(runId: string): Promise<{
    runId: string;
    tags: string[];
    count: number;
  }> {
    return this.request(`/tests/annotations/tags/run/${encodeURIComponent(runId)}`);
  }

  /**
   * Get all unique tags
   */
  async getAllTags(): Promise<{
    tags: TestResultTag[];
    count: number;
  }> {
    return this.request('/tests/annotations/tags');
  }
}


