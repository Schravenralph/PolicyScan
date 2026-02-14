import { getDB } from '../config/database.js';
import { ObjectId, type Filter, type UpdateFilter } from 'mongodb';

const COLLECTION_NAME = 'community_reports';

export interface CommunityReportDocument {
  _id?: ObjectId;
  clusterId: string;
  label: string; // Semantic label from CommunityLabel
  summary: string; // Summary from CommunityLabel (2-3 sentences)
  keyEntities: Array<{
    id: string;
    type: string;
    name: string;
    description?: string;
    importanceScore?: number;
  }>; // Top 10 most important entities
  keyRelationships: Array<{
    sourceId: string;
    targetId: string;
    type: string;
    sourceName?: string;
    targetName?: string;
    importanceScore?: number;
  }>; // Top 10 most important relationships
  representativeExamples: Array<{
    type: 'entity' | 'relationship';
    entityId?: string;
    relationshipId?: string;
    description: string;
  }>; // 3-5 representative examples
  metadata?: {
    entityCount?: number;
    relationshipCount?: number;
    domain?: string;
    jurisdiction?: string;
    generationTimestamp?: Date;
  };
  cost?: {
    llmCalls?: number;
    tokensUsed?: number;
    estimatedCost?: number;
  };
  version?: number; // Report version for versioning
  createdAt: Date;
  updatedAt: Date;
}

export interface CommunityReportCreateInput {
  clusterId: string;
  label: string;
  summary: string;
  keyEntities: Array<{
    id: string;
    type: string;
    name: string;
    description?: string;
    importanceScore?: number;
  }>;
  keyRelationships: Array<{
    sourceId: string;
    targetId: string;
    type: string;
    sourceName?: string;
    targetName?: string;
    importanceScore?: number;
  }>;
  representativeExamples: Array<{
    type: 'entity' | 'relationship';
    entityId?: string;
    relationshipId?: string;
    description: string;
  }>;
  metadata?: {
    entityCount?: number;
    relationshipCount?: number;
    domain?: string;
    jurisdiction?: string;
    generationTimestamp?: Date;
  };
  cost?: {
    llmCalls?: number;
    tokensUsed?: number;
    estimatedCost?: number;
  };
  version?: number;
}

export interface CommunityReportUpdateInput {
  label?: string;
  summary?: string;
  keyEntities?: Array<{
    id: string;
    type: string;
    name: string;
    description?: string;
    importanceScore?: number;
  }>;
  keyRelationships?: Array<{
    sourceId: string;
    targetId: string;
    type: string;
    sourceName?: string;
    targetName?: string;
    importanceScore?: number;
  }>;
  representativeExamples?: Array<{
    type: 'entity' | 'relationship';
    entityId?: string;
    relationshipId?: string;
    description: string;
  }>;
  metadata?: Partial<CommunityReportDocument['metadata']>;
  cost?: Partial<CommunityReportDocument['cost']>;
  version?: number;
  updatedAt?: Date;
}

/**
 * MongoDB model for community reports
 */
export class CommunityReport {
  /**
   * Create or update a community report
   */
  static async upsert(
    clusterId: string,
    reportData: CommunityReportCreateInput
  ): Promise<CommunityReportDocument> {
    const db = getDB();
    const collection = db.collection<CommunityReportDocument>(COLLECTION_NAME);

    const existing = await collection.findOne({ clusterId });

    if (existing) {
      // Update existing report
      const updateData: CommunityReportUpdateInput = {
        ...reportData,
        updatedAt: new Date(),
      };

      // Increment version if provided, otherwise keep existing version
      if (reportData.version !== undefined) {
        updateData.version = reportData.version;
      } else if (existing.version !== undefined) {
        updateData.version = existing.version + 1;
      } else {
        updateData.version = 1;
      }

      const filter: Filter<CommunityReportDocument> = { clusterId };
      const updateFilter: UpdateFilter<CommunityReportDocument> = {
        $set: updateData,
      };
      const result = await collection.findOneAndUpdate(
        filter,
        updateFilter,
        { returnDocument: 'after', upsert: false }
      );

      if (!result) {
        throw new Error(`Failed to update community report: ${clusterId}`);
      }

      return result;
    } else {
      // Create new report
      const report: CommunityReportDocument = {
        ...reportData,
        version: reportData.version || 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await collection.insertOne(report);
      return { ...report, _id: result.insertedId };
    }
  }

  /**
   * Find a report by cluster ID
   */
  static async findByClusterId(clusterId: string): Promise<CommunityReportDocument | null> {
    const db = getDB();
    const collection = db.collection<CommunityReportDocument>(COLLECTION_NAME);
    return await collection.findOne({ clusterId });
  }

  /**
   * Find reports by cluster IDs
   */
  static async findByClusterIds(clusterIds: string[]): Promise<CommunityReportDocument[]> {
    const db = getDB();
    const collection = db.collection<CommunityReportDocument>(COLLECTION_NAME);
    
    // Limit cluster IDs to prevent loading too many reports into memory
    // Default limit: 1000 reports, configurable via env
    const maxReports = parseInt(process.env.MAX_COMMUNITY_REPORTS || '1000', 10);
    const limitedClusterIds = clusterIds.slice(0, maxReports);
    
    if (clusterIds.length > maxReports) {
      console.warn(
        `[CommunityReport] Cluster IDs list truncated from ${clusterIds.length} to ${maxReports} to prevent memory exhaustion`
      );
    }
    
    return await collection
      .find({ clusterId: { $in: limitedClusterIds } })
      .limit(maxReports)
      .toArray();
  }

  /**
   * Find all reports
   */
  static async findAll(options: {
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
  } = {}): Promise<CommunityReportDocument[]> {
    const db = getDB();
    const collection = db.collection<CommunityReportDocument>(COLLECTION_NAME);
    const { limit = 100, skip = 0, sort = { createdAt: -1 } } = options;

    return await collection
      .find()
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  /**
   * Delete a report by cluster ID
   */
  static async deleteByClusterId(clusterId: string): Promise<boolean> {
    const db = getDB();
    const collection = db.collection<CommunityReportDocument>(COLLECTION_NAME);
    const result = await collection.deleteOne({ clusterId });
    return result.deletedCount > 0;
  }

  /**
   * Delete reports by cluster IDs
   */
  static async deleteByClusterIds(clusterIds: string[]): Promise<number> {
    const db = getDB();
    const collection = db.collection<CommunityReportDocument>(COLLECTION_NAME);
    const result = await collection.deleteMany({ clusterId: { $in: clusterIds } });
    return result.deletedCount;
  }

  /**
   * Check if a report exists for a cluster
   */
  static async exists(clusterId: string): Promise<boolean> {
    const db = getDB();
    const collection = db.collection<CommunityReportDocument>(COLLECTION_NAME);
    const count = await collection.countDocuments({ clusterId });
    return count > 0;
  }

  /**
   * Get statistics about reports
   */
  static async getStatistics(): Promise<{
    totalReports: number;
    averageEntitiesPerReport?: number;
    averageRelationshipsPerReport?: number;
  }> {
    const db = getDB();
    const collection = db.collection<CommunityReportDocument>(COLLECTION_NAME);

    const totalReports = await collection.countDocuments({});

    // Use aggregation pipeline to calculate averages on database side
    // Limit to prevent memory exhaustion when calculating statistics
    // Default limit: 10000 reports for stats calculation, configurable via environment variable
    const MAX_COMMUNITY_REPORT_STATS = parseInt(process.env.MAX_COMMUNITY_REPORT_STATS || '10000', 10);
    
    const statsResult = await collection
      .aggregate([
        {
          $limit: MAX_COMMUNITY_REPORT_STATS
        },
        {
          $project: {
            entityCount: { $size: { $ifNull: ['$keyEntities', []] } },
            relationshipCount: { $size: { $ifNull: ['$keyRelationships', []] } },
          },
        },
        {
          $group: {
            _id: null,
            totalEntities: { $sum: '$entityCount' },
            totalRelationships: { $sum: '$relationshipCount' },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();
    
    // Log warning if aggregation might have been truncated
    if (totalReports > MAX_COMMUNITY_REPORT_STATS) {
      console.warn(
        `[CommunityReport] getStatistics() aggregation may have been truncated at ${MAX_COMMUNITY_REPORT_STATS} entries. ` +
        `Statistics may be incomplete. Consider increasing MAX_COMMUNITY_REPORT_STATS.`
      );
    }

    const stats = statsResult[0];
    const averageEntitiesPerReport =
      stats && stats.count > 0 ? stats.totalEntities / stats.count : undefined;
    const averageRelationshipsPerReport =
      stats && stats.count > 0 ? stats.totalRelationships / stats.count : undefined;

    return {
      totalReports,
      averageEntitiesPerReport,
      averageRelationshipsPerReport,
    };
  }

  /**
   * Get report in markdown format for human readability
   */
  static toMarkdown(report: CommunityReportDocument): string {
    const lines: string[] = [];

    lines.push(`# Community Report: ${report.label}`);
    lines.push('');
    lines.push(`**Cluster ID:** ${report.clusterId}`);
    if (report.version) {
      lines.push(`**Version:** ${report.version}`);
    }
    lines.push('');

    lines.push('## Summary');
    lines.push(report.summary);
    lines.push('');

    if (report.metadata) {
      lines.push('## Metadata');
      if (report.metadata.entityCount) {
        lines.push(`- Entity Count: ${report.metadata.entityCount}`);
      }
      if (report.metadata.relationshipCount) {
        lines.push(`- Relationship Count: ${report.metadata.relationshipCount}`);
      }
      if (report.metadata.domain) {
        lines.push(`- Domain: ${report.metadata.domain}`);
      }
      if (report.metadata.jurisdiction) {
        lines.push(`- Jurisdiction: ${report.metadata.jurisdiction}`);
      }
      lines.push('');
    }

    if (report.keyEntities && report.keyEntities.length > 0) {
      lines.push('## Key Entities');
      report.keyEntities.forEach((entity, index) => {
        lines.push(`${index + 1}. **${entity.name}** (${entity.type})`);
        if (entity.description) {
          lines.push(`   - ${entity.description}`);
        }
        if (entity.importanceScore !== undefined) {
          lines.push(`   - Importance Score: ${entity.importanceScore.toFixed(2)}`);
        }
      });
      lines.push('');
    }

    if (report.keyRelationships && report.keyRelationships.length > 0) {
      lines.push('## Key Relationships');
      report.keyRelationships.forEach((rel, index) => {
        const sourceName = rel.sourceName || rel.sourceId;
        const targetName = rel.targetName || rel.targetId;
        lines.push(`${index + 1}. **${sourceName}** --[${rel.type}]--> **${targetName}**`);
        if (rel.importanceScore !== undefined) {
          lines.push(`   - Importance Score: ${rel.importanceScore.toFixed(2)}`);
        }
      });
      lines.push('');
    }

    if (report.representativeExamples && report.representativeExamples.length > 0) {
      lines.push('## Representative Examples');
      report.representativeExamples.forEach((example, index) => {
        lines.push(`${index + 1}. ${example.description}`);
      });
      lines.push('');
    }

    if (report.cost) {
      lines.push('## Cost Information');
      if (report.cost.llmCalls) {
        lines.push(`- LLM Calls: ${report.cost.llmCalls}`);
      }
      if (report.cost.tokensUsed) {
        lines.push(`- Tokens Used: ${report.cost.tokensUsed}`);
      }
      if (report.cost.estimatedCost) {
        lines.push(`- Estimated Cost: $${report.cost.estimatedCost.toFixed(4)}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
















