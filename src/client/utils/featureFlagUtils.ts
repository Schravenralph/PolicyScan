/**
 * Utility functions for Feature Flags
 * 
 * Extracted from FeatureFlagsPage.tsx for better organization
 */

import type { FeatureFlag, FeatureFlagCategory, FlagDependencyGraph, CategoryStats } from '../types/featureFlags.js';

/**
 * Get all available feature flag categories
 */
export function getFeatureFlagCategories(): FeatureFlagCategory[] {
  return [
    'Knowledge Graph Core',
    'Knowledge Graph Advanced',
    'Legal Features',
    'Retrieval',
    'Extraction',
    'Other',
  ];
}

/**
 * Separate flags by source (environment vs database)
 * Includes flags with source: 'default' as manageable flags since they're part of the enum
 */
export function separateFlagsBySource(flags: FeatureFlag[]) {
  const environmentFlags = flags.filter(f => f.source === 'environment');
  // Include both 'database' and 'default' sources as manageable flags
  // 'default' flags are from the enum but not yet initialized in the database
  const databaseFlags = flags.filter(f => f.source === 'database' || f.source === 'default');
  return { environmentFlags, databaseFlags };
}

/**
 * Separate flags into independent and dependent based on dependency graphs
 */
export function separateFlagsByDependencies(
  databaseFlags: FeatureFlag[],
  dependencyGraphs: Map<string, FlagDependencyGraph>
) {
  const independentFlags = databaseFlags.filter(flag => {
    const graph = dependencyGraphs.get(flag.name);
    if (!graph) return true; // No dependency info means independent
    return graph.parents.length === 0 && 
           graph.requires.length === 0 && 
           graph.conflicts.length === 0 && 
           graph.mutuallyExclusiveWith.length === 0;
  });
  
  const dependentFlags = databaseFlags.filter(flag => {
    const graph = dependencyGraphs.get(flag.name);
    if (!graph) return false;
    return graph.parents.length > 0 || 
           graph.requires.length > 0 || 
           graph.conflicts.length > 0 || 
           graph.mutuallyExclusiveWith.length > 0;
  });
  
  return { independentFlags, dependentFlags };
}

/**
 * Filter flags by category
 */
export function filterFlagsByCategory(
  flags: FeatureFlag[],
  category: FeatureFlagCategory | 'All'
): FeatureFlag[] {
  return category === 'All' 
    ? flags 
    : flags.filter(f => f.category === category);
}

/**
 * Group flags by category
 */
export function groupFlagsByCategory(
  flags: FeatureFlag[],
  categories: FeatureFlagCategory[]
): Record<FeatureFlagCategory, FeatureFlag[]> {
  return categories.reduce((acc, category) => {
    acc[category] = flags.filter(f => f.category === category);
    return acc;
  }, {} as Record<FeatureFlagCategory, FeatureFlag[]>);
}

/**
 * Calculate category statistics
 * 
 * @param flagsByCategory Flags grouped by category
 * @param draftMode Whether draft mode is active
 * @param draftFlags Draft flag states (if in draft mode)
 * @returns Statistics for each category
 */
export function calculateCategoryStats(
  flagsByCategory: Record<FeatureFlagCategory, FeatureFlag[]>,
  draftMode: boolean,
  draftFlags: Record<string, boolean>
): Record<FeatureFlagCategory, CategoryStats> {
  const categories = Object.keys(flagsByCategory) as FeatureFlagCategory[];
  
  return categories.reduce((acc, category) => {
    const categoryFlags = flagsByCategory[category];
    const enabledCount = categoryFlags.filter(f => {
      if (draftMode && f.source === 'database' && f.name in draftFlags) {
        return draftFlags[f.name];
      }
      return f.enabled;
    }).length;
    
    acc[category] = {
      total: categoryFlags.length,
      enabled: enabledCount,
      disabled: categoryFlags.length - enabledCount,
    };
    return acc;
  }, {} as Record<FeatureFlagCategory, CategoryStats>);
}

/**
 * Get the effective flag state (considering draft mode)
 */
export function getEffectiveFlagState(
  flag: FeatureFlag,
  draftMode: boolean,
  draftFlags: Record<string, boolean>
): boolean {
  if (draftMode && flag.source === 'database' && flag.name in draftFlags) {
    return draftFlags[flag.name];
  }
  return flag.enabled;
}

/**
 * Tree node structure for hierarchical flag display
 */
export interface FlagTreeNode {
  flag: FeatureFlag;
  depth: number;
  parent?: string; // Parent flag name
  requiredBy?: string[]; // Flags that require this flag
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
export function buildFlagTree(
  flags: FeatureFlag[],
  dependencyGraphs: Map<string, FlagDependencyGraph>
): FlagTreeNode[] {
  // Create a map of flags by name for quick lookup
  const flagsMap = new Map(flags.map(f => [f.name, f]));
  
  // Track which flags have been processed
  const processed = new Set<string>();
  
  // Map to store tree nodes by flag name
  const nodesMap = new Map<string, FlagTreeNode>();
  
  /**
   * Get or create a tree node for a flag, calculating its depth
   */
  function getOrCreateNode(flagName: string, visited: Set<string> = new Set()): FlagTreeNode | null {
    // Return existing node if already created
    if (nodesMap.has(flagName)) {
      return nodesMap.get(flagName)!;
    }

    // Prevent infinite loops in circular dependencies
    if (visited.has(flagName)) {
      return null;
    }
    visited.add(flagName);
    
    const flag = flagsMap.get(flagName);
    if (!flag) {
      return null;
    }
    
    const graph = dependencyGraphs.get(flagName);
    
    // Calculate depth based on parents and required flags
    let maxDepth = 0;
    let parentFlag: string | undefined;
    
    if (graph) {
      // Check parent flags (parent-child relationships)
      for (const parent of graph.parents) {
        const parentNode = getOrCreateNode(parent, new Set(visited));
        if (parentNode && parentNode.depth >= maxDepth) {
          maxDepth = parentNode.depth + 1;
          parentFlag = parent;
        }
      }
      
      // Check required flags (requires relationships)
      for (const required of graph.requires) {
        const requiredNode = getOrCreateNode(required, new Set(visited));
        if (requiredNode && requiredNode.depth >= maxDepth) {
          maxDepth = requiredNode.depth + 1;
          parentFlag = required;
        }
      }
    }
    
    // Create the node
    const node: FlagTreeNode = {
      flag,
      depth: maxDepth,
      parent: parentFlag,
      requiredBy: graph?.requiredBy || [],
      children: [],
    };
    
    nodesMap.set(flagName, node);
    processed.add(flagName);
    
    // Build children (flags that have this flag as parent or required)
    if (graph) {
      // Flags that have this as a parent
      for (const childName of graph.children) {
        const childNode = getOrCreateNode(childName, new Set(visited));
        if (childNode && childNode.parent === flagName) {
          node.children.push(childNode);
        }
      }
      
      // Flags that require this flag
      for (const requiredByFlag of graph.requiredBy || []) {
        const requiredByNode = getOrCreateNode(requiredByFlag, new Set(visited));
        if (requiredByNode && requiredByNode.parent === flagName) {
          node.children.push(requiredByNode);
        }
      }
    }
    
    return node;
  }
  
  // Build tree for all flags
  for (const flag of flags) {
    if (!processed.has(flag.name)) {
      getOrCreateNode(flag.name);
    }
  }
  
  // Return root nodes (flags with depth 0 or no parent)
  const rootNodes: FlagTreeNode[] = [];
  for (const node of nodesMap.values()) {
    if (node.depth === 0 || !node.parent) {
      rootNodes.push(node);
    }
  }
  
  // Sort root nodes by name for consistent display
  rootNodes.sort((a, b) => a.flag.name.localeCompare(b.flag.name));
  
  // Sort children recursively
  function sortChildren(node: FlagTreeNode) {
    node.children.sort((a, b) => a.flag.name.localeCompare(b.flag.name));
    for (const child of node.children) {
      sortChildren(child);
    }
  }
  
  for (const root of rootNodes) {
    sortChildren(root);
  }
  
  return rootNodes;
}

/**
 * Flatten a flag tree into a linear array with depth information
 * Useful for rendering flags in a flat list with indentation
 * 
 * @param treeNodes Root nodes of the flag tree
 * @returns Flat array of flags with depth information
 */
export function flattenFlagTree(treeNodes: FlagTreeNode[]): FlagTreeNode[] {
  const result: FlagTreeNode[] = [];
  
  function traverse(node: FlagTreeNode) {
    result.push(node);
    for (const child of node.children) {
      traverse(child);
    }
  }
  
  for (const root of treeNodes) {
    traverse(root);
  }
  
  return result;
}

/**
 * Convert a feature flag name to a readable display name
 * Removes _ENABLED suffix and converts underscores to spaces with proper capitalization
 * 
 * Examples:
 * - KG_ENABLED -> "Knowledge Graph"
 * - KG_RETRIEVAL_ENABLED -> "Knowledge Graph Retrieval"
 * - KG_WORKFLOW_INTEGRATION_ENABLED -> "Knowledge Graph Workflow Integration"
 */
export function getFeatureFlagDisplayName(flagName: string): string {
  if (!flagName) return flagName;
  
  // Remove _ENABLED suffix if present
  let displayName = flagName.replace(/_ENABLED$/, '');
  
  // Remove KG_ prefix if present (we'll add "Knowledge Graph" at the start)
  const hasKG = displayName.startsWith('KG_') || displayName === 'KG';
  if (hasKG) {
    displayName = displayName.replace(/^KG_?/, '');
  }
  
  // If empty after removing prefix, return "Knowledge Graph"
  if (!displayName) {
    return 'Knowledge Graph';
  }
  
  // Convert underscores to spaces and split into words
  const words = displayName.split('_').map(word => {
    // Capitalize first letter, lowercase the rest
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
  
  // Join words with spaces
  let result = words.join(' ');
  
  // Add "Knowledge Graph" prefix if it was a KG flag
  if (hasKG) {
    result = 'Knowledge Graph ' + result;
  }
  
  // Special cases for better readability (acronyms, proper nouns, etc.)
  const specialCases: Record<string, string> = {
    'Knowledge Graph ': 'Knowledge Graph',
    'Knowledge Graph Graphrag Retrieval': 'Knowledge Graph GraphRAG Retrieval',
    'Knowledge Graph Llm Answer Generation': 'Knowledge Graph LLM Answer Generation',
    'Knowledge Graph Truthfulrag': 'Knowledge Graph TruthfulRAG',
    'Knowledge Graph Heterognn Scoring': 'Knowledge Graph Heterogeneous GNN Scoring',
  };
  
  // Apply special cases if they exist, otherwise return the formatted result
  return specialCases[result] || result;
}

