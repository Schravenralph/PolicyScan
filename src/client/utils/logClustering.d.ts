import { BaseLogEntry } from '../types/logTypes.js';
interface ClusterConfig {
    maxClusterSize?: number;
    minClusterSize?: number;
    dropInvalid?: boolean;
}
/**
 * Clusters logs semantically by grouping similar activities and operations.
 * Groups logs with similar message patterns, thought bubbles, or activity types
 * into a single entry with multiple thoughts.
 *
 * Uses semantic similarity instead of time-based windows to create
 * human-readable chunks that represent logical operations.
 */
export declare function clusterLogs(logs: BaseLogEntry[], config?: ClusterConfig): BaseLogEntry[];
export {};
