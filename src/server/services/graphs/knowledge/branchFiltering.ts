/**
 * Branch Filtering Utilities for GraphDB Knowledge Graph Queries
 * 
 * Provides clean, reusable functions for generating SPARQL branch filters.
 * Branch filtering is based on metadata: entities with branch metadata belong to that branch,
 * entities without branch metadata belong to 'main'.
 */

/**
 * Generate SPARQL filter clause for entity branch filtering
 * 
 * @param branch - Branch name ('main' or other branch name)
 * @param metadataVar - SPARQL variable name for metadata (default: '?metadata')
 * @returns SPARQL FILTER clause string, or empty string if branch is null/undefined
 */
export function buildEntityBranchFilter(branch: string | null | undefined, metadataVar: string = '?metadata'): string {
  if (!branch) {
    return ''; // No filter - query all entities
  }

  if (branch === 'main') {
    // Main branch: entities without branch metadata
    return `FILTER(!BOUND(${metadataVar}) || !CONTAINS(STR(${metadataVar}), "branch"))`;
  }

  // Other branches: entities with branch metadata matching the branch name
  return `FILTER(CONTAINS(STR(${metadataVar}), "${branch}"))`;
}

/**
 * Generate SPARQL filter clause for relationship branch filtering
 * 
 * @param branch - Branch name ('main' or other branch name)
 * @param metadataVar - SPARQL variable name for metadata (default: '?relMetadata')
 * @returns SPARQL FILTER clause string, or empty string if branch is null/undefined
 */
export function buildRelationshipBranchFilter(branch: string | null | undefined, metadataVar: string = '?relMetadata'): string {
  if (!branch) {
    return ''; // No filter - query all relationships
  }

  if (branch === 'main') {
    // Main branch: relationships without branch metadata
    return `FILTER(!BOUND(${metadataVar}) || !CONTAINS(STR(${metadataVar}), "branch"))`;
  }

  // Other branches: relationships with branch metadata matching the branch name
  return `FILTER(CONTAINS(STR(${metadataVar}), "${branch}"))`;
}
