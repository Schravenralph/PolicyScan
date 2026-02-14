/**
 * Utility functions for Feature Flags
 *
 * Extracted from FeatureFlagsPage.tsx for better organization
 */
import type { FeatureFlag, FeatureFlagCategory, FlagDependencyGraph, CategoryStats } from '../types/featureFlags.js';
/**
 * Get all available feature flag categories
 */
export declare function getFeatureFlagCategories(): FeatureFlagCategory[];
/**
 * Separate flags by source (environment vs database)
 * Includes flags with source: 'default' as manageable flags since they're part of the enum
 */
export declare function separateFlagsBySource(flags: FeatureFlag[]): {
    environmentFlags: FeatureFlag[];
    databaseFlags: FeatureFlag[];
};
/**
 * Separate flags into independent and dependent based on dependency graphs
 */
export declare function separateFlagsByDependencies(databaseFlags: FeatureFlag[], dependencyGraphs: Map<string, FlagDependencyGraph>): {
    independentFlags: FeatureFlag[];
    dependentFlags: FeatureFlag[];
};
/**
 * Filter flags by category
 */
export declare function filterFlagsByCategory(flags: FeatureFlag[], category: FeatureFlagCategory | 'All'): FeatureFlag[];
/**
 * Group flags by category
 */
export declare function groupFlagsByCategory(flags: FeatureFlag[], categories: FeatureFlagCategory[]): Record<FeatureFlagCategory, FeatureFlag[]>;
/**
 * Calculate category statistics
 *
 * @param flagsByCategory Flags grouped by category
 * @param draftMode Whether draft mode is active
 * @param draftFlags Draft flag states (if in draft mode)
 * @returns Statistics for each category
 */
export declare function calculateCategoryStats(flagsByCategory: Record<FeatureFlagCategory, FeatureFlag[]>, draftMode: boolean, draftFlags: Record<string, boolean>): Record<FeatureFlagCategory, CategoryStats>;
/**
 * Get the effective flag state (considering draft mode)
 */
export declare function getEffectiveFlagState(flag: FeatureFlag, draftMode: boolean, draftFlags: Record<string, boolean>): boolean;
/**
 * Tree node structure for hierarchical flag display
 */
export interface FlagTreeNode {
    flag: FeatureFlag;
    depth: number;
    parent?: string;
    requiredBy?: string[];
    children: FlagTreeNode[];
}
/**
 * Build a hierarchical tree structure from flags and dependency graphs
 * Groups flags by their parent/required relationships with depth information for indentation
 *
 * @param flags Array of feature flags to organize
 * @param dependencyGraphs Map of flag names to their dependency graphs
 * @returns Array of root-level flag tree nodes (flags with no parents or requirements)
 */
export declare function buildFlagTree(flags: FeatureFlag[], dependencyGraphs: Map<string, FlagDependencyGraph>): FlagTreeNode[];
/**
 * Flatten a flag tree into a linear array with depth information
 * Useful for rendering flags in a flat list with indentation
 *
 * @param treeNodes Root nodes of the flag tree
 * @returns Flat array of flags with depth information
 */
export declare function flattenFlagTree(treeNodes: FlagTreeNode[]): FlagTreeNode[];
/**
 * Convert a feature flag name to a readable display name
 * Removes _ENABLED suffix and converts underscores to spaces with proper capitalization
 *
 * Examples:
 * - KG_ENABLED -> "Knowledge Graph"
 * - KG_RETRIEVAL_ENABLED -> "Knowledge Graph Retrieval"
 * - KG_WORKFLOW_INTEGRATION_ENABLED -> "Knowledge Graph Workflow Integration"
 */
export declare function getFeatureFlagDisplayName(flagName: string): string;
