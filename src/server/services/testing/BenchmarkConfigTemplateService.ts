/**
 * Benchmark Configuration Template Service
 * 
 * Service for managing benchmark configuration templates.
 * Provides CRUD operations and validation for benchmark configuration templates.
 */

import {
  BenchmarkConfigTemplate,
  type BenchmarkConfigTemplateDocument,
  type BenchmarkConfigTemplateCreateInput,
  type BenchmarkConfigTemplateUpdateInput,
} from '../../models/BenchmarkConfigTemplate.js';
import { BadRequestError } from '../../types/errors.js';
import { logger } from '../../utils/logger.js';

const VALID_BENCHMARK_TYPES = ['settings', 'relevance-scorer', 'reranker', 'hybrid-retrieval', 'workflow'];

/**
 * Service for managing benchmark configuration templates
 */
export class BenchmarkConfigTemplateService {
  /**
   * Validate benchmark types
   */
  private validateBenchmarkTypes(types: string[]): void {
    if (!Array.isArray(types) || types.length === 0) {
      throw new BadRequestError('At least one benchmark type is required');
    }

    const invalidTypes = types.filter(type => !VALID_BENCHMARK_TYPES.includes(type));
    if (invalidTypes.length > 0) {
      throw new BadRequestError(`Invalid benchmark types: ${invalidTypes.join(', ')}. Valid types: ${VALID_BENCHMARK_TYPES.join(', ')}`);
    }
  }

  /**
   * Create a new benchmark configuration template
   */
  async createTemplate(input: BenchmarkConfigTemplateCreateInput): Promise<BenchmarkConfigTemplateDocument> {
    // Validate input
    if (!input.name || !input.name.trim()) {
      throw new BadRequestError('Template name is required');
    }

    this.validateBenchmarkTypes(input.benchmarkTypes);

    try {
      return await BenchmarkConfigTemplate.create(input);
    } catch (error) {
      logger.error({ error, input }, 'Error creating benchmark config template');
      throw error;
    }
  }

  /**
   * List templates with optional filters
   */
  async listTemplates(filters: {
    name?: string;
    createdBy?: string;
    isPublic?: boolean;
    isDefault?: boolean;
    search?: string;
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
  }): Promise<{ entries: BenchmarkConfigTemplateDocument[]; total: number }> {
    try {
      return await BenchmarkConfigTemplate.find(filters);
    } catch (error) {
      logger.error({ error, filters }, 'Error listing benchmark config templates');
      throw error;
    }
  }

  /**
   * Get template by ID
   */
  async getTemplate(id: string): Promise<BenchmarkConfigTemplateDocument | null> {
    try {
      return await BenchmarkConfigTemplate.findById(id);
    } catch (error) {
      logger.error({ error, id }, 'Error getting benchmark config template');
      throw error;
    }
  }

  /**
   * Update a template
   */
  async updateTemplate(
    id: string,
    updates: BenchmarkConfigTemplateUpdateInput
  ): Promise<BenchmarkConfigTemplateDocument | null> {
    // Validate benchmark types if provided
    if (updates.benchmarkTypes) {
      this.validateBenchmarkTypes(updates.benchmarkTypes);
    }

    try {
      return await BenchmarkConfigTemplate.update(id, updates);
    } catch (error) {
      logger.error({ error, id, updates }, 'Error updating benchmark config template');
      throw error;
    }
  }

  /**
   * Delete a template
   */
  async deleteTemplate(id: string): Promise<boolean> {
    try {
      return await BenchmarkConfigTemplate.delete(id);
    } catch (error) {
      logger.error({ error, id }, 'Error deleting benchmark config template');
      throw error;
    }
  }

  /**
   * Increment usage count for a template
   */
  async incrementUsage(id: string): Promise<void> {
    try {
      await BenchmarkConfigTemplate.incrementUsage(id);
    } catch (error) {
      logger.error({ error, id }, 'Error incrementing template usage');
      // Don't throw - usage tracking is non-critical
    }
  }

  /**
   * Ensure database indexes exist
   */
  async ensureIndexes(): Promise<void> {
    try {
      await BenchmarkConfigTemplate.ensureIndexes();
    } catch (error) {
      logger.error({ error }, 'Error ensuring benchmark config template indexes');
      throw error;
    }
  }
}

