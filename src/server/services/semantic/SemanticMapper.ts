import { GraphClusteringService } from '../graphs/navigation/GraphClusteringService.js';
import { MetaGraph } from '../graphs/navigation/GraphClusteringService.js';
import { logger } from '../../utils/logger.js';

export class SemanticMapper {
    constructor(private clusteringService: GraphClusteringService) { }

    /**
     * Map a natural language query to relevant graph clusters
     * Uses adaptive clustering - tries with lower minClusterSize if no clusters found initially
     */
    async mapQueryToClusters(query: string, metaGraph?: MetaGraph): Promise<string[]> {
        let graph = metaGraph;
        const normalizedQuery = query.toLowerCase();
        const keywords = normalizedQuery.split(/\s+/).filter(k => k.length > 3); // Filter short words

        // Try to get clusters with default settings first
        if (!graph) {
            graph = await this.clusteringService.createMetaGraph();
        }

        // Diagnostic: Check if graph has any clusters at all
        let totalClusters = Object.keys(graph.clusters).length;
        const totalNodes = graph.totalNodes;
        let nodesInClusters = graph.nodesInClusters;

        // If no clusters found and graph has nodes, try with lower minClusterSize
        if (totalClusters === 0 && totalNodes > 0 && !metaGraph) {
            logger.debug({ query, totalNodes, defaultMinSize: 10 }, 'No clusters with default minClusterSize, trying with lower threshold...');
            
            // Try progressively lower thresholds: 5, 3, 1
            for (const minSize of [5, 3, 1]) {
                graph = await this.clusteringService.createMetaGraph({ minClusterSize: minSize });
                totalClusters = Object.keys(graph.clusters).length;
                nodesInClusters = graph.nodesInClusters;
                
                if (totalClusters > 0) {
                    logger.info({ query, minClusterSize: minSize, clustersFound: totalClusters }, 'Found clusters with reduced minClusterSize');
                    break;
                }
            }
        }

        if (totalClusters === 0) {
            // Log diagnostic information about why no clusters were found
            if (totalNodes === 0) {
                logger.warn({ query }, 'No clusters found: Navigation graph is empty (0 nodes). Need to explore IPLO first to build graph.');
            } else if (nodesInClusters === 0) {
                logger.warn({ query, totalNodes }, 'No clusters found: Graph has nodes but no clusters meet minimum size threshold (even with minSize=1). Graph may need more exploration.');
            } else {
                logger.warn({ query, totalNodes, nodesInClusters, totalClusters }, 'No clusters found: Graph has nodes but clustering returned 0 clusters.');
            }
            return [];
        }

        const matchingClusterIds: Set<string> = new Set();

        for (const [clusterId, cluster] of Object.entries(graph.clusters)) {
            const label = cluster.label.toLowerCase();
            const urlPattern = cluster.urlPattern?.toLowerCase() || '';

            // 1. Direct label match (highest priority)
            if (label.includes(normalizedQuery)) {
                matchingClusterIds.add(clusterId);
                continue;
            }

            // 2. Query matches URL pattern (e.g., "bodem" matches "iplo.nl/thema/bodem")
            if (urlPattern.includes(normalizedQuery)) {
                matchingClusterIds.add(clusterId);
                continue;
            }

            // 3. Keyword match in label
            if (keywords.length > 0 && keywords.some(k => label.includes(k))) {
                matchingClusterIds.add(clusterId);
                continue;
            }

            // 4. Keyword match in URL pattern
            if (keywords.length > 0 && keywords.some(k => urlPattern.includes(k))) {
                matchingClusterIds.add(clusterId);
                continue;
            }

            // 5. Partial word match (e.g., "bodem" matches "bodemkwaliteit")
            const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 2);
            if (queryWords.some(qw => label.includes(qw) || urlPattern.includes(qw))) {
                matchingClusterIds.add(clusterId);
                continue;
            }
        }

        // Diagnostic: If no matches found but clusters exist, log why
        if (matchingClusterIds.size === 0 && totalClusters > 0) {
            const clusterLabels = Object.values(graph.clusters).map(c => c.label).slice(0, 10);
            logger.debug({ 
                query, 
                normalizedQuery, 
                keywords, 
                availableClusters: clusterLabels,
                totalClusters 
            }, 'No clusters matched query. Available cluster labels shown.');
        }

        return Array.from(matchingClusterIds);
    }
}
