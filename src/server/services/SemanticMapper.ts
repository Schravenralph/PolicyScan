import { GraphClusteringService } from './graphs/navigation/GraphClusteringService.js';
import { MetaGraph } from './graphs/navigation/GraphClusteringService.js';

export class SemanticMapper {
    constructor(private clusteringService: GraphClusteringService) { }

    /**
     * Map a natural language query to relevant graph clusters
     */
    async mapQueryToClusters(query: string, metaGraph?: MetaGraph): Promise<string[]> {
        const graph = metaGraph || await this.clusteringService.createMetaGraph();
        const normalizedQuery = query.toLowerCase();
        const keywords = normalizedQuery.split(/\s+/).filter(k => k.length > 3); // Filter short words

        const matchingClusterIds: Set<string> = new Set();

        for (const [clusterId, cluster] of Object.entries(graph.clusters)) {
            const label = cluster.label.toLowerCase();

            // 1. Direct label match
            if (label.includes(normalizedQuery)) {
                matchingClusterIds.add(clusterId);
                continue;
            }

            // 2. Keyword match in label
            if (keywords.some(k => label.includes(k))) {
                matchingClusterIds.add(clusterId);
                continue;
            }

            // 3. Match in top pages (if available)
            // Assuming cluster.nodes contains page titles or URLs
            // For now, we only have node count and label in the basic cluster interface
            // But we can check the nodes if we have access to them via the service

            // Simple heuristic for MVP: Label matching is primary
        }

        return Array.from(matchingClusterIds);
    }
}
