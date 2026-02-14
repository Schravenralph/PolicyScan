import { KnowledgeClusterNode, KnowledgeMetaGraph } from '../knowledge-graph/clustering/KnowledgeGraphClusteringService.js';
import { logger } from '../../utils/logger.js';

/**
 * Represents a hierarchical community structure
 */
export interface HierarchicalCommunity {
  id: string;
  label: string;
  level: number; // 1 = high-level theme, 2 = sub-theme, 3 = specific topic
  parentId?: string;
  children: string[];
  clusterIds: string[]; // IDs of clusters at this level
  entityCount: number;
}

/**
 * Hierarchical community structure
 */
export interface HierarchicalStructure {
  communities: { [id: string]: HierarchicalCommunity };
  rootCommunities: string[]; // Level 1 community IDs
  maxLevel: number;
}

/**
 * Service for detecting hierarchical community structures
 * Organizes communities into multi-level hierarchies (Level 1: themes, Level 2: sub-themes, Level 3: topics)
 */
export class HierarchicalCommunityDetector {
  constructor() {
  }

  /**
   * Detect hierarchical structure from meta-graph
   * Creates 3-level hierarchy: High-level themes -> Sub-themes -> Specific topics
   */
  async detectHierarchy(
    metaGraph: KnowledgeMetaGraph,
    options: {
      maxLevels?: number;
      minEntitiesPerLevel?: number;
    } = {}
  ): Promise<HierarchicalStructure> {
    const { maxLevels = 3, minEntitiesPerLevel = 5 } = options;

    logger.info(`[HierarchicalDetector] Detecting hierarchy from ${metaGraph.totalClusters} clusters`);

    const communities: { [id: string]: HierarchicalCommunity } = {};
    const rootCommunities: string[] = [];

    // Group clusters by domain/theme for Level 1
    const level1Groups = this.groupClustersByDomain(metaGraph.clusters);
    
    // Create Level 1 communities (high-level themes)
    let level1Index = 0;
    for (const [domain, clusterIds] of Object.entries(level1Groups)) {
      const totalEntities = clusterIds.reduce((sum, id) => {
        return sum + (metaGraph.clusters[id]?.nodeCount || 0);
      }, 0);

      if (totalEntities < minEntitiesPerLevel) {
        continue; // Skip small groups
      }

      const level1Id = `hier-1-${level1Index++}`;
      const level1Label = this.generateLevel1Label(domain, metaGraph.clusters, clusterIds);

      communities[level1Id] = {
        id: level1Id,
        label: level1Label,
        level: 1,
        children: [],
        clusterIds,
        entityCount: totalEntities,
      };

      rootCommunities.push(level1Id);

      // Create Level 2 communities (sub-themes) for each Level 1 community
      const level2Groups = this.groupClustersBySubTheme(clusterIds, metaGraph.clusters);
      let level2Index = 0;

      for (const [subTheme, level2ClusterIds] of Object.entries(level2Groups)) {
        const level2EntityCount = level2ClusterIds.reduce((sum, id) => {
          return sum + (metaGraph.clusters[id]?.nodeCount || 0);
        }, 0);

        if (level2EntityCount < minEntitiesPerLevel) {
          continue;
        }

        const level2Id = `hier-2-${level1Index - 1}-${level2Index++}`;
        const level2Label = this.generateLevel2Label(subTheme, metaGraph.clusters, level2ClusterIds);

        communities[level2Id] = {
          id: level2Id,
          label: level2Label,
          level: 2,
          parentId: level1Id,
          children: [],
          clusterIds: level2ClusterIds,
          entityCount: level2EntityCount,
        };

        communities[level1Id].children.push(level2Id);

        // Create Level 3 communities (specific topics) for each Level 2 community
        if (maxLevels >= 3) {
          for (const clusterId of level2ClusterIds) {
            const cluster = metaGraph.clusters[clusterId];
            if (!cluster || cluster.nodeCount < minEntitiesPerLevel) {
              continue;
            }

            const level3Id = `hier-3-${level1Index - 1}-${level2Index - 1}-${clusterId}`;
            const level3Label = cluster.label || `Topic: ${clusterId}`;

            communities[level3Id] = {
              id: level3Id,
              label: level3Label,
              level: 3,
              parentId: level2Id,
              children: [],
              clusterIds: [clusterId],
              entityCount: cluster.nodeCount,
            };

            communities[level2Id].children.push(level3Id);
          }
        }
      }
    }

    logger.info(`[HierarchicalDetector] Created ${rootCommunities.length} Level 1 communities, ${Object.keys(communities).length} total communities`);

    return {
      communities,
      rootCommunities,
      maxLevel: maxLevels,
    };
  }

  /**
   * Group clusters by domain/theme for Level 1
   */
  private groupClustersByDomain(
    clusters: { [id: string]: KnowledgeClusterNode }
  ): { [domain: string]: string[] } {
    const groups: { [domain: string]: string[] } = {};

    for (const [id, cluster] of Object.entries(clusters)) {
      const domain = cluster.metadata.domain || 
                     cluster.metadata.category || 
                     this.extractDomainFromLabel(cluster.label) ||
                     'Other';

      if (!groups[domain]) {
        groups[domain] = [];
      }
      groups[domain].push(id);
    }

    return groups;
  }

  /**
   * Group clusters by sub-theme for Level 2
   */
  private groupClustersBySubTheme(
    clusterIds: string[],
    clusters: { [id: string]: KnowledgeClusterNode }
  ): { [subTheme: string]: string[] } {
    const groups: { [subTheme: string]: string[] } = {};

    for (const id of clusterIds) {
      const cluster = clusters[id];
      if (!cluster) continue;

      // Use entity type or category as sub-theme
      const subTheme = cluster.metadata.entityType ||
                       cluster.metadata.category ||
                       this.extractSubThemeFromLabel(cluster.label) ||
                       'General';

      if (!groups[subTheme]) {
        groups[subTheme] = [];
      }
      groups[subTheme].push(id);
    }

    return groups;
  }

  /**
   * Extract domain from label (e.g., "Milieu" from "Milieu > Bodemkwaliteit")
   */
  private extractDomainFromLabel(label: string): string | null {
    const parts = label.split('>').map(s => s.trim());
    if (parts.length > 0) {
      return parts[0];
    }
    return null;
  }

  /**
   * Extract sub-theme from label
   */
  private extractSubThemeFromLabel(label: string): string | null {
    const parts = label.split('>').map(s => s.trim());
    if (parts.length > 1) {
      return parts[1];
    }
    return null;
  }

  /**
   * Generate Level 1 label (high-level theme)
   */
  private generateLevel1Label(
    domain: string,
    clusters: { [id: string]: KnowledgeClusterNode },
    clusterIds: string[]
  ): string {
    // Use domain name, or generate from cluster labels
    if (domain !== 'Other') {
      return domain;
    }

    // Generate from most common words in cluster labels
    const labels = clusterIds.map(id => clusters[id]?.label || '').filter(Boolean);
    const words = labels.flatMap(l => l.split(/\s+/)).filter(w => w.length > 3);
    const wordCounts = new Map<string, number>();
    
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }

    const topWords = Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([word]) => word);

    return topWords.join(' ') || domain;
  }

  /**
   * Generate Level 2 label (sub-theme)
   */
  private generateLevel2Label(
    subTheme: string,
    clusters: { [id: string]: KnowledgeClusterNode },
    clusterIds: string[]
  ): string {
    if (subTheme !== 'General') {
      return subTheme;
    }

    // Generate from cluster labels
    const labels = clusterIds.map(id => clusters[id]?.label || '').filter(Boolean);
    if (labels.length > 0) {
      return labels[0]; // Use first label as sub-theme
    }

    return subTheme;
  }

  /**
   * Get hierarchical label path (e.g., "Milieu > Bodemkwaliteit > Verontreiniging")
   */
  getHierarchicalLabel(communityId: string, structure: HierarchicalStructure): string {
    const community = structure.communities[communityId];
    if (!community) {
      return '';
    }

    const path: string[] = [community.label];

    let current = community;
    while (current.parentId) {
      const parent = structure.communities[current.parentId];
      if (!parent) break;
      path.unshift(parent.label);
      current = parent;
    }

    return path.join(' > ');
  }

  /**
   * Get all communities at a specific level
   */
  getCommunitiesAtLevel(level: number, structure: HierarchicalStructure): HierarchicalCommunity[] {
    return Object.values(structure.communities).filter(c => c.level === level);
  }

  /**
   * Get child communities
   */
  getChildCommunities(communityId: string, structure: HierarchicalStructure): HierarchicalCommunity[] {
    const community = structure.communities[communityId];
    if (!community) {
      return [];
    }

    return community.children
      .map(id => structure.communities[id])
      .filter(Boolean);
  }
}

