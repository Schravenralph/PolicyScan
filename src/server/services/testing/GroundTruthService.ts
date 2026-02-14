/**
 * Ground Truth Service
 * 
 * Service for managing ground truth datasets used in workflow evaluation.
 * Provides CRUD operations and validation for ground truth datasets.
 * 
 * This is a wrapper around the static GroundTruthService methods to provide
 * instance-based API for consistency with other services.
 */

import { GroundTruthDataset, type GroundTruthDatasetDocument, type GroundTruthDatasetCreateInput } from '../../models/GroundTruthDataset.js';
import { logger } from '../../utils/logger.js';

export interface GroundTruthDatasetResponse {
  _id: string;
  name: string;
  description?: string;
  queryCount: number;
  created_at: Date;
  created_by?: string;
  updated_at?: Date;
}

export interface GroundTruthDatasetDetailResponse extends GroundTruthDatasetResponse {
  queries: Array<{
    query: string;
    relevant_documents: Array<{
      url: string;
      relevance: number;
    }>;
  }>;
}

/**
 * Service for managing ground truth datasets
 */
export class GroundTruthService {
  /**
   * Create a new ground truth dataset
   */
  async createDataset(input: GroundTruthDatasetCreateInput): Promise<GroundTruthDatasetDocument> {
    return await GroundTruthDataset.create(input);
  }

  /**
   * List ground truth datasets
   */
  async listDatasets(filters: {
    name?: string;
    created_by?: string;
    search?: string;
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
  }): Promise<{ entries: GroundTruthDatasetDocument[]; total: number }> {
    return await GroundTruthDataset.find(filters);
  }

  /**
   * Get dataset by ID
   */
  async getDataset(id: string): Promise<GroundTruthDatasetDetailResponse | null> {
    const dataset = await GroundTruthDataset.findById(id);
    if (!dataset) {
      return null;
    }

    return {
      _id: dataset._id!.toString(),
      name: dataset.name,
      description: dataset.description,
      queryCount: dataset.queries.length,
      queries: dataset.queries,
      created_at: dataset.created_at,
      created_by: dataset.created_by,
      updated_at: dataset.updated_at,
    };
  }

  /**
   * Check if a dataset exists
   */
  async checkDatasetExists(id: string): Promise<boolean> {
    return await GroundTruthDataset.exists(id);
  }

  /**
   * Update a dataset
   */
  async updateDataset(
    id: string,
    updates: Partial<Pick<GroundTruthDatasetDocument, 'name' | 'description' | 'queries'>>
  ): Promise<GroundTruthDatasetDocument | null> {
    return await GroundTruthDataset.update(id, updates);
  }

  /**
   * Delete a dataset
   */
  async deleteDataset(id: string): Promise<boolean> {
    return await GroundTruthDataset.delete(id);
  }

  /**
   * Get dataset statistics
   */
  async getDatasetStatistics(id: string): Promise<{
    queryCount: number;
    totalDocuments: number;
    averageRelevance: number;
    relevanceDistribution: Record<number, number>;
  } | null> {
    const dataset = await GroundTruthDataset.findById(id);
    if (!dataset) {
      return null;
    }

    let totalDocuments = 0;
    let totalRelevance = 0;
    const relevanceDistribution: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };

    for (const query of dataset.queries) {
      totalDocuments += query.relevant_documents.length;
      for (const doc of query.relevant_documents) {
        totalRelevance += doc.relevance;
        relevanceDistribution[doc.relevance] = (relevanceDistribution[doc.relevance] || 0) + 1;
      }
    }

    return {
      queryCount: dataset.queries.length,
      totalDocuments,
      averageRelevance: totalDocuments > 0 ? totalRelevance / totalDocuments : 0,
      relevanceDistribution,
    };
  }
}
