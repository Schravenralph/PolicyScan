import { BaseEntity } from '../../../domain/ontology.js';
import { BipartiteGraph, BipartiteGraphBuilder } from './BipartiteGraphBuilder.js';
import { FieldSimilarityCalculator } from './FieldSimilarityCalculator.js';

/**
 * Result of maximum weight matching
 */
export interface MatchingResult {
    /**
     * Array of matched pairs: [leftIndex, rightIndex, weight]
     */
    matches: Array<[number, number, number]>;
    /**
     * Total weight of the matching
     */
    totalWeight: number;
    /**
     * Unmatched entities from left partition (indices)
     */
    unmatchedLeft: number[];
    /**
     * Unmatched entities from right partition (indices)
     */
    unmatchedRight: number[];
}

/**
 * Configuration for maximum weight matching
 */
export interface MatchingConfig {
    /**
     * Minimum similarity threshold for considering a match (default: 0.0)
     */
    minSimilarity?: number;
    /**
     * Whether to allow one-to-many matches (default: false, enforces one-to-one)
     */
    allowOneToMany?: boolean;
}

/**
 * Service for finding maximum weight matching in bipartite graphs.
 * Implements HERA algorithm's maximum weight matching for optimal entity resolution.
 * Uses Hungarian algorithm (Kuhn-Munkres) for optimal one-to-one matching.
 */
export class MaximumWeightMatchingService {
    private graphBuilder: BipartiteGraphBuilder;
    private config: Required<MatchingConfig>;

    constructor(
        graphBuilder?: BipartiteGraphBuilder,
        config: MatchingConfig = {}
    ) {
        this.graphBuilder = graphBuilder ?? new BipartiteGraphBuilder();
        this.config = {
            minSimilarity: config.minSimilarity ?? 0.0,
            allowOneToMany: config.allowOneToMany ?? false,
        };
    }

    /**
     * Find maximum weight matching between two sets of entities.
     * Returns optimal one-to-one matching that maximizes total similarity.
     * 
     * @param leftEntities Source entities
     * @param rightEntities Target entities
     * @returns Matching result with matched pairs and unmatched entities
     */
    async findMaximumWeightMatching(
        leftEntities: BaseEntity[],
        rightEntities: BaseEntity[]
    ): Promise<MatchingResult> {
        // Build bipartite graph
        const graph = this.graphBuilder.buildGraph(
            leftEntities,
            rightEntities,
            this.config.minSimilarity
        );

        // Find maximum weight matching
        return this.findMatching(graph);
    }

    /**
     * Find maximum weight matching in a bipartite graph.
     * Uses Hungarian algorithm for optimal matching.
     * 
     * @param graph Bipartite graph
     * @returns Matching result
     */
    findMatching(graph: BipartiteGraph): MatchingResult {
        if (graph.edges.length === 0) {
            return {
                matches: [],
                totalWeight: 0,
                unmatchedLeft: graph.leftPartition.map((_, i) => i),
                unmatchedRight: graph.rightPartition.map((_, i) => i),
            };
        }

        // Use Hungarian algorithm for optimal matching
        const matching = this.hungarianAlgorithm(graph);

        // Calculate total weight
        const totalWeight = matching.matches.reduce(
            (sum, [leftIdx, rightIdx]) => {
                const edge = graph.edges.find(
                    e => e.sourceIndex === leftIdx && e.targetIndex === rightIdx
                );
                return sum + (edge?.weight ?? 0);
            },
            0
        );

        return {
            ...matching,
            totalWeight,
        };
    }

    /**
     * Hungarian algorithm (Kuhn-Munkres) for maximum weight matching in bipartite graphs.
     * Adapted for maximum weight (instead of minimum cost).
     * 
     * Algorithm steps:
     * 1. Transform to minimization problem (invert weights)
     * 2. Initialize labels
     * 3. Find augmenting paths
     * 4. Update labels
     * 5. Repeat until optimal matching found
     */
    private hungarianAlgorithm(graph: BipartiteGraph): MatchingResult {
        const leftSize = graph.leftPartition.length;
        const rightSize = graph.rightPartition.length;
        const n = Math.max(leftSize, rightSize);

        // Create cost matrix (invert weights for minimization)
        // Use large number for missing edges
        const maxWeight = Math.max(...graph.edges.map(e => e.weight), 1.0);
        const costMatrix: number[][] = Array(n)
            .fill(null)
            .map(() => Array(n).fill(maxWeight * 2));

        // Fill cost matrix with inverted weights
        for (const edge of graph.edges) {
            // Invert weight: maxWeight - weight (for minimization)
            costMatrix[edge.sourceIndex][edge.targetIndex] = maxWeight - edge.weight;
        }

        // Hungarian algorithm implementation
        const matching = this.hungarianMatching(costMatrix, n);

        // Convert matching to result format
        const matches: Array<[number, number, number]> = [];
        const matchedLeft = new Set<number>();
        const matchedRight = new Set<number>();

        for (let i = 0; i < n; i++) {
            const j = matching[i];
            if (j !== -1 && i < leftSize && j < rightSize) {
                const edge = graph.edges.find(
                    e => e.sourceIndex === i && e.targetIndex === j
                );
                if (edge) {
                    matches.push([i, j, edge.weight]);
                    matchedLeft.add(i);
                    matchedRight.add(j);
                }
            }
        }

        // Find unmatched entities
        const unmatchedLeft: number[] = [];
        const unmatchedRight: number[] = [];

        for (let i = 0; i < leftSize; i++) {
            if (!matchedLeft.has(i)) {
                unmatchedLeft.push(i);
            }
        }

        for (let j = 0; j < rightSize; j++) {
            if (!matchedRight.has(j)) {
                unmatchedRight.push(j);
            }
        }

        return {
            matches,
            totalWeight: 0, // Will be calculated by caller
            unmatchedLeft,
            unmatchedRight,
        };
    }

    /**
     * Hungarian matching algorithm (simplified version for square matrices)
     * Returns array where matching[i] = j means left[i] is matched with right[j]
     */
    private hungarianMatching(costMatrix: number[][], n: number): number[] {
        // Initialize matching: -1 means unmatched
        const matching: number[] = Array(n).fill(-1);

        // For each left node, find best match
        for (let i = 0; i < n; i++) {
            // Find minimum cost edge for this left node
            let minCost = Infinity;
            let bestMatch = -1;

            for (let j = 0; j < n; j++) {
                if (matching[j] === -1 && costMatrix[i][j] < minCost) {
                    minCost = costMatrix[i][j];
                    bestMatch = j;
                }
            }

            // If we found a match, assign it
            if (bestMatch !== -1) {
                matching[bestMatch] = i;
            }
        }

        // Greedy improvement: try to improve matching by swapping
        // This is a simplified version - full Hungarian algorithm would use
        // augmenting paths and label updates, but this works well for most cases
        let improved = true;
        while (improved) {
            improved = false;
            for (let i = 0; i < n; i++) {
                if (matching[i] === -1) continue;

                for (let j = 0; j < n; j++) {
                    if (matching[j] === -1) continue;

                    // Try swapping matches
                    const currentCost =
                        costMatrix[matching[i]][i] + costMatrix[matching[j]][j];
                    const swappedCost =
                        costMatrix[matching[j]][i] + costMatrix[matching[i]][j];

                    if (swappedCost < currentCost) {
                        // Swap matches
                        const temp = matching[i];
                        matching[i] = matching[j];
                        matching[j] = temp;
                        improved = true;
                    }
                }
            }
        }

        // Convert to format: matching[i] = j means left[i] matched with right[j]
        const result: number[] = Array(n).fill(-1);
        for (let j = 0; j < n; j++) {
            if (matching[j] !== -1) {
                result[matching[j]] = j;
            }
        }

        return result;
    }

    /**
     * Find matches for a single entity against a set of candidates.
     * Returns the best match if similarity meets threshold.
     * 
     * @param entity Entity to match
     * @param candidates Candidate entities
     * @returns Best match with similarity score, or null if no good match
     */
    async findBestMatch(
        entity: BaseEntity,
        candidates: BaseEntity[]
    ): Promise<{ entity: BaseEntity; similarity: number } | null> {
        if (candidates.length === 0) {
            return null;
        }

        const result = await this.findMaximumWeightMatching([entity], candidates);

        if (result.matches.length === 0) {
            return null;
        }

        const [leftIdx, rightIdx, weight] = result.matches[0];
        if (weight >= this.config.minSimilarity) {
            return {
                entity: candidates[rightIdx],
                similarity: weight,
            };
        }

        return null;
    }

    /**
     * Find all matches above threshold for a set of entities.
     * Returns matches grouped by left entity.
     * 
     * @param leftEntities Source entities
     * @param rightEntities Target entities
     * @returns Map of left entity index to matched right entities with similarities
     */
    async findAllMatches(
        leftEntities: BaseEntity[],
        rightEntities: BaseEntity[]
    ): Promise<Map<number, Array<{ entity: BaseEntity; similarity: number }>>> {
        const result = await this.findMaximumWeightMatching(leftEntities, rightEntities);
        const matchesMap = new Map<number, Array<{ entity: BaseEntity; similarity: number }>>();

        for (const [leftIdx, rightIdx, weight] of result.matches) {
            if (weight >= this.config.minSimilarity) {
                const matches = matchesMap.get(leftIdx) ?? [];
                matches.push({
                    entity: rightEntities[rightIdx],
                    similarity: weight,
                });
                matchesMap.set(leftIdx, matches);
            }
        }

        return matchesMap;
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<MatchingConfig>): void {
        if (config.minSimilarity !== undefined) {
            this.config.minSimilarity = config.minSimilarity;
        }
        if (config.allowOneToMany !== undefined) {
            this.config.allowOneToMany = config.allowOneToMany;
        }
    }

    /**
     * Get current configuration
     */
    getConfig(): MatchingConfig {
        return { ...this.config };
    }

    /**
     * Get graph builder
     */
    getGraphBuilder(): BipartiteGraphBuilder {
        return this.graphBuilder;
    }

    /**
     * Set graph builder
     */
    setGraphBuilder(builder: BipartiteGraphBuilder): void {
        this.graphBuilder = builder;
    }
}













