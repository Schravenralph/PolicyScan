import { BaseEntity } from '../../../domain/ontology.js';
import { FieldSimilarityCalculator } from './FieldSimilarityCalculator.js';

/**
 * Edge in the bipartite graph representing a potential match between entities
 */
export interface BipartiteEdge {
    sourceIndex: number; // Index in left partition
    targetIndex: number; // Index in right partition
    weight: number; // Field similarity score (0-1)
}

/**
 * Bipartite graph representation for entity matching
 */
export interface BipartiteGraph {
    leftPartition: BaseEntity[]; // Source entities
    rightPartition: BaseEntity[]; // Target entities
    edges: BipartiteEdge[]; // Weighted edges between partitions
}

/**
 * Service for building bipartite graphs from entity sets for maximum weight matching.
 * Implements HERA algorithm's bipartite graph construction where:
 * - Left partition: source entities
 * - Right partition: target entities
 * - Edge weights: field similarity (sim_f) calculated using FieldSimilarityCalculator
 */
export class BipartiteGraphBuilder {
    private similarityCalculator: FieldSimilarityCalculator;

    constructor(similarityCalculator?: FieldSimilarityCalculator) {
        this.similarityCalculator = similarityCalculator ?? new FieldSimilarityCalculator();
    }

    /**
     * Build a bipartite graph from two sets of entities.
     * Creates edges between all entity pairs with weights based on field similarity.
     * 
     * @param leftEntities Source entities (left partition)
     * @param rightEntities Target entities (right partition)
     * @param minSimilarity Minimum similarity threshold for creating an edge (default: 0.0)
     * @returns Bipartite graph with weighted edges
     */
    buildGraph(
        leftEntities: BaseEntity[],
        rightEntities: BaseEntity[],
        minSimilarity: number = 0.0
    ): BipartiteGraph {
        const edges: BipartiteEdge[] = [];

        // Create edges between all entity pairs
        for (let i = 0; i < leftEntities.length; i++) {
            for (let j = 0; j < rightEntities.length; j++) {
                const leftEntity = leftEntities[i];
                const rightEntity = rightEntities[j];

                // Calculate field similarity (sim_f)
                const similarity = this.similarityCalculator.calculateEntitySimilarity(
                    leftEntity,
                    rightEntity
                );

                // Only create edge if similarity meets threshold
                if (similarity >= minSimilarity) {
                    edges.push({
                        sourceIndex: i,
                        targetIndex: j,
                        weight: similarity,
                    });
                }
            }
        }

        return {
            leftPartition: leftEntities,
            rightPartition: rightEntities,
            edges,
        };
    }

    /**
     * Build a bipartite graph from a single set of entities (self-matching).
     * Useful for finding duplicates within a single set.
     * Excludes self-matches (entity matched with itself).
     * 
     * @param entities Entities to match against themselves
     * @param minSimilarity Minimum similarity threshold for creating an edge (default: 0.0)
     * @returns Bipartite graph with weighted edges
     */
    buildSelfMatchingGraph(
        entities: BaseEntity[],
        minSimilarity: number = 0.0
    ): BipartiteGraph {
        const edges: BipartiteEdge[] = [];

        // Create edges between all entity pairs (excluding self-matches)
        for (let i = 0; i < entities.length; i++) {
            for (let j = i + 1; j < entities.length; j++) {
                const entity1 = entities[i];
                const entity2 = entities[j];

                // Calculate field similarity
                const similarity = this.similarityCalculator.calculateEntitySimilarity(
                    entity1,
                    entity2
                );

                // Only create edge if similarity meets threshold
                if (similarity >= minSimilarity) {
                    // Add edge in both directions for bipartite matching
                    edges.push({
                        sourceIndex: i,
                        targetIndex: j,
                        weight: similarity,
                    });
                }
            }
        }

        return {
            leftPartition: entities,
            rightPartition: entities,
            edges,
        };
    }

    /**
     * Build a bipartite graph from entity pairs with pre-calculated similarities.
     * Useful when similarities are calculated externally.
     * 
     * @param leftEntities Source entities (left partition)
     * @param rightEntities Target entities (right partition)
     * @param similarities Matrix of similarities [leftIndex][rightIndex] = similarity
     * @param minSimilarity Minimum similarity threshold for creating an edge (default: 0.0)
     * @returns Bipartite graph with weighted edges
     */
    buildGraphFromSimilarities(
        leftEntities: BaseEntity[],
        rightEntities: BaseEntity[],
        similarities: number[][],
        minSimilarity: number = 0.0
    ): BipartiteGraph {
        const edges: BipartiteEdge[] = [];

        for (let i = 0; i < leftEntities.length; i++) {
            for (let j = 0; j < rightEntities.length; j++) {
                const similarity = similarities[i]?.[j] ?? 0.0;

                if (similarity >= minSimilarity) {
                    edges.push({
                        sourceIndex: i,
                        targetIndex: j,
                        weight: similarity,
                    });
                }
            }
        }

        return {
            leftPartition: leftEntities,
            rightPartition: rightEntities,
            edges,
        };
    }

    /**
     * Get adjacency list representation of the graph (for efficient traversal)
     */
    getAdjacencyList(graph: BipartiteGraph): Map<number, Array<{ target: number; weight: number }>> {
        const adjacencyList = new Map<number, Array<{ target: number; weight: number }>>();

        // Initialize all nodes
        for (let i = 0; i < graph.leftPartition.length; i++) {
            adjacencyList.set(i, []);
        }

        // Add edges
        for (const edge of graph.edges) {
            const neighbors = adjacencyList.get(edge.sourceIndex) ?? [];
            neighbors.push({
                target: edge.targetIndex,
                weight: edge.weight,
            });
            adjacencyList.set(edge.sourceIndex, neighbors);
        }

        return adjacencyList;
    }

    /**
     * Get statistics about the graph
     */
    getGraphStats(graph: BipartiteGraph): {
        leftPartitionSize: number;
        rightPartitionSize: number;
        edgeCount: number;
        averageWeight: number;
        maxWeight: number;
        minWeight: number;
    } {
        if (graph.edges.length === 0) {
            return {
                leftPartitionSize: graph.leftPartition.length,
                rightPartitionSize: graph.rightPartition.length,
                edgeCount: 0,
                averageWeight: 0,
                maxWeight: 0,
                minWeight: 0,
            };
        }

        const weights = graph.edges.map(e => e.weight);
        const sum = weights.reduce((a, b) => a + b, 0);

        return {
            leftPartitionSize: graph.leftPartition.length,
            rightPartitionSize: graph.rightPartition.length,
            edgeCount: graph.edges.length,
            averageWeight: sum / weights.length,
            maxWeight: Math.max(...weights),
            minWeight: Math.min(...weights),
        };
    }

    /**
     * Update similarity calculator
     */
    setSimilarityCalculator(calculator: FieldSimilarityCalculator): void {
        this.similarityCalculator = calculator;
    }

    /**
     * Get similarity calculator
     */
    getSimilarityCalculator(): FieldSimilarityCalculator {
        return this.similarityCalculator;
    }
}













