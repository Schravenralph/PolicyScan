import { getDB } from '../config/database.js';
import { ObjectId } from 'mongodb';

const COLLECTION_NAME = 'community_labels';

export interface CommunityLabelDocument {
  _id?: ObjectId;
  clusterId: string;
  label: string;
  summary?: string;
  communityHash?: string; // Hash of community content to detect changes
  // Hierarchical label support
  hierarchy?: {
    level: number; // 0 = root, 1+ = nested
    parentId?: string; // Cluster ID of parent label
    childrenIds?: string[]; // Cluster IDs of child labels
    path?: string[]; // Full path from root to this label (e.g., ["Milieu", "Bodemkwaliteit"])
  };
  metadata?: {
    entityCount?: number;
    entityTypes?: string[];
    domain?: string;
    jurisdiction?: string;
  };
  quality?: {
    score?: number;
    validated?: boolean;
    validatedBy?: string;
  };
  cost?: {
    llmCalls?: number;
    tokensUsed?: number;
    estimatedCost?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface CommunityLabelCreateInput {
  clusterId: string;
  label: string;
  summary?: string;
  communityHash?: string;
  hierarchy?: {
    level: number;
    parentId?: string;
    childrenIds?: string[];
    path?: string[];
  };
  metadata?: {
    entityCount?: number;
    entityTypes?: string[];
    domain?: string;
    jurisdiction?: string;
  };
  quality?: {
    score?: number;
    validated?: boolean;
    validatedBy?: string;
  };
  cost?: {
    llmCalls?: number;
    tokensUsed?: number;
    estimatedCost?: number;
  };
}

export interface CommunityLabelUpdateInput {
  label?: string;
  summary?: string;
  communityHash?: string;
  hierarchy?: Partial<CommunityLabelDocument['hierarchy']>;
  metadata?: Partial<CommunityLabelDocument['metadata']>;
  quality?: Partial<CommunityLabelDocument['quality']>;
  cost?: Partial<CommunityLabelDocument['cost']>;
  updatedAt?: Date;
}

/**
 * MongoDB model for community labels
 */
export class CommunityLabel {
  /**
   * Create or update a community label
   */
  static async upsert(
    clusterId: string,
    labelData: CommunityLabelCreateInput
  ): Promise<CommunityLabelDocument> {
    const db = getDB();
    const collection = db.collection<CommunityLabelDocument>(COLLECTION_NAME);

    const existing = await collection.findOne({ clusterId });

    if (existing) {
      // Update existing label
      const updateData: CommunityLabelUpdateInput = {
        label: labelData.label,
        summary: labelData.summary,
        communityHash: labelData.communityHash,
        hierarchy: labelData.hierarchy ? {
          level: labelData.hierarchy.level,
          parentId: labelData.hierarchy.parentId,
          childrenIds: labelData.hierarchy.childrenIds,
          path: labelData.hierarchy.path,
        } : undefined,
        metadata: labelData.metadata,
        quality: labelData.quality,
        cost: labelData.cost,
        updatedAt: new Date(),
      };

      // Filter out undefined values for MongoDB $set
      const updateFilter: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updateData)) {
        if (value !== undefined) {
          updateFilter[key] = value;
        }
      }

      const result = await collection.findOneAndUpdate(
        { clusterId },
        {
          $set: updateFilter,
        },
        { returnDocument: 'after', upsert: false }
      );

      if (!result) {
        throw new Error(`Failed to update community label: ${clusterId}`);
      }

      return result;
    } else {
      // Create new label
      const label: CommunityLabelDocument = {
        ...labelData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await collection.insertOne(label);
      return { ...label, _id: result.insertedId };
    }
  }

  /**
   * Find a label by cluster ID
   */
  static async findByClusterId(clusterId: string): Promise<CommunityLabelDocument | null> {
    const db = getDB();
    const collection = db.collection<CommunityLabelDocument>(COLLECTION_NAME);
    return await collection.findOne({ clusterId });
  }

  /**
   * Find labels by cluster IDs
   */
  static async findByClusterIds(clusterIds: string[]): Promise<CommunityLabelDocument[]> {
    const db = getDB();
    const collection = db.collection<CommunityLabelDocument>(COLLECTION_NAME);
    // Limit to prevent memory exhaustion with large cluster ID arrays
    const MAX_CLUSTER_IDS = parseInt(process.env.MAX_COMMUNITY_LABELS || '1000', 10);
    const limitedClusterIds = clusterIds.slice(0, MAX_CLUSTER_IDS);
    
    if (clusterIds.length > MAX_CLUSTER_IDS) {
      const { logger } = await import('../utils/logger.js');
      logger.warn(
        { total: clusterIds.length, limited: MAX_CLUSTER_IDS },
        '[CommunityLabel] Cluster IDs truncated to prevent memory exhaustion'
      );
    }
    
    return await collection
      .find({ clusterId: { $in: limitedClusterIds } })
      .limit(MAX_CLUSTER_IDS)
      .toArray();
  }

  /**
   * Find all labels
   */
  static async findAll(options: {
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
  } = {}): Promise<CommunityLabelDocument[]> {
    const db = getDB();
    const collection = db.collection<CommunityLabelDocument>(COLLECTION_NAME);
    const { limit = 100, skip = 0, sort = { createdAt: -1 } } = options;

    return await collection
      .find()
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  /**
   * Delete a label by cluster ID
   */
  static async deleteByClusterId(clusterId: string): Promise<boolean> {
    const db = getDB();
    const collection = db.collection<CommunityLabelDocument>(COLLECTION_NAME);
    const result = await collection.deleteOne({ clusterId });
    return result.deletedCount > 0;
  }

  /**
   * Delete labels by cluster IDs
   */
  static async deleteByClusterIds(clusterIds: string[]): Promise<number> {
    const db = getDB();
    const collection = db.collection<CommunityLabelDocument>(COLLECTION_NAME);
    const result = await collection.deleteMany({ clusterId: { $in: clusterIds } });
    return result.deletedCount;
  }

  /**
   * Check if a label exists for a cluster
   */
  static async exists(clusterId: string): Promise<boolean> {
    const db = getDB();
    const collection = db.collection<CommunityLabelDocument>(COLLECTION_NAME);
    const count = await collection.countDocuments({ clusterId });
    return count > 0;
  }

  /**
   * Get statistics about labels
   */
  static async getStatistics(): Promise<{
    totalLabels: number;
    validatedLabels: number;
    averageQualityScore?: number;
  }> {
    const db = getDB();
    const collection = db.collection<CommunityLabelDocument>(COLLECTION_NAME);

    const totalLabels = await collection.countDocuments();
    const validatedLabels = await collection.countDocuments({ 'quality.validated': true });

    // Calculate average quality score (limit to prevent memory exhaustion)
    const MAX_STATS_LABELS = parseInt(process.env.MAX_COMMUNITY_LABELS || '1000', 10);
    const labelsWithScores = await collection
      .find({ 'quality.score': { $exists: true } })
      .limit(MAX_STATS_LABELS)
      .toArray();

    const averageQualityScore =
      labelsWithScores.length > 0
        ? labelsWithScores.reduce((sum, label) => sum + (label.quality?.score || 0), 0) /
          labelsWithScores.length
        : undefined;

    return {
      totalLabels,
      validatedLabels,
      averageQualityScore,
    };
  }

  /**
   * Find labels by hierarchy level
   */
  static async findByHierarchyLevel(level: number): Promise<CommunityLabelDocument[]> {
    const db = getDB();
    const collection = db.collection<CommunityLabelDocument>(COLLECTION_NAME);
    // Limit to prevent memory exhaustion with large hierarchies
    const MAX_HIERARCHY_RESULTS = parseInt(process.env.MAX_COMMUNITY_LABELS || '1000', 10);
    return await collection
      .find({ 'hierarchy.level': level })
      .limit(MAX_HIERARCHY_RESULTS)
      .toArray();
  }

  /**
   * Find root labels (level 0 or no hierarchy)
   */
  static async findRootLabels(): Promise<CommunityLabelDocument[]> {
    const db = getDB();
    const collection = db.collection<CommunityLabelDocument>(COLLECTION_NAME);
    // Limit to prevent memory exhaustion
    const MAX_ROOT_LABELS = parseInt(process.env.MAX_COMMUNITY_LABELS || '1000', 10);
    return await collection
      .find({
        $or: [
          { 'hierarchy.level': 0 },
          { hierarchy: { $exists: false } },
          { 'hierarchy.level': { $exists: false } },
        ],
      })
      .limit(MAX_ROOT_LABELS)
      .toArray();
  }

  /**
   * Find child labels of a parent
   */
  static async findChildren(parentId: string): Promise<CommunityLabelDocument[]> {
    const db = getDB();
    const collection = db.collection<CommunityLabelDocument>(COLLECTION_NAME);
    // Limit to prevent memory exhaustion with large hierarchies
    const MAX_CHILDREN = parseInt(process.env.MAX_COMMUNITY_LABELS || '1000', 10);
    return await collection
      .find({ 'hierarchy.parentId': parentId })
      .limit(MAX_CHILDREN)
      .toArray();
  }

  /**
   * Find parent label of a child
   */
  static async findParent(childId: string): Promise<CommunityLabelDocument | null> {
    const db = getDB();
    const collection = db.collection<CommunityLabelDocument>(COLLECTION_NAME);
    const child = await collection.findOne({ clusterId: childId });
    if (!child || !child.hierarchy?.parentId) {
      return null;
    }
    return await collection.findOne({ clusterId: child.hierarchy.parentId });
  }

  /**
   * Get all ancestor labels (parents up to root)
   */
  static async getAncestors(clusterId: string): Promise<CommunityLabelDocument[]> {
    const ancestors: CommunityLabelDocument[] = [];
    let current = await this.findByClusterId(clusterId);
    
    while (current && current.hierarchy?.parentId) {
      const parent = await this.findByClusterId(current.hierarchy.parentId);
      if (parent) {
        ancestors.push(parent);
        current = parent;
      } else {
        break;
      }
    }
    
    // Return ancestors in order from root to immediate parent
    return ancestors.reverse();
  }

  /**
   * Get all descendant labels (children recursively)
   */
  static async getDescendants(clusterId: string): Promise<CommunityLabelDocument[]> {
    const db = getDB();
    const collection = db.collection<CommunityLabelDocument>(COLLECTION_NAME);
    
    // Optimized implementation using $graphLookup to avoid recursive queries
    // We start by finding immediate children to handle cases where the parent might not exist (orphaned trees)
    return await collection.aggregate<CommunityLabelDocument>([
      { $match: { 'hierarchy.parentId': clusterId } },
      {
        $graphLookup: {
          from: COLLECTION_NAME,
          startWith: '$clusterId',
          connectFromField: 'clusterId',
          connectToField: 'hierarchy.parentId',
          as: 'nestedDescendants'
        }
      },
      {
        $project: {
          allDescendants: {
            $concatArrays: [["$$ROOT"], "$nestedDescendants"]
          }
        }
      },
      { $unwind: "$allDescendants" },
      { $replaceRoot: { newRoot: "$allDescendants" } },
      // Clean up the temporary nestedDescendants field that might be present in the root documents
      { $project: { nestedDescendants: 0 } }
    ]).toArray();
  }
}
