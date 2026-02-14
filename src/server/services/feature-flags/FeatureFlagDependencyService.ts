/**
 * Feature Flag Dependency and Validation Service
 * 
 * Manages feature flag dependencies, conflicts, and validation to ensure
 * flag configurations are always valid.
 */

import { KGFeatureFlag } from '../../models/FeatureFlag.js';

export type DependencyType = 'parent-child' | 'requires' | 'conflicts' | 'mutually-exclusive';

export interface FlagDependency {
  type: DependencyType;
  flag: string;
  relatedFlag: string;
  cascadeDisable?: boolean; // If true, disabling parent disables child
  cascadeEnable?: boolean; // If true, enabling child enables parent
  description?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type: 'dependency' | 'conflict' | 'required' | 'mutually-exclusive';
  flag: string;
  message: string;
  relatedFlags?: string[];
}

export interface ValidationWarning {
  type: 'cascade' | 'recommendation';
  flag: string;
  message: string;
  relatedFlags?: string[];
}

export interface FlagDependencyGraph {
  flag: string;
  parents: string[];
  children: string[];
  requires: string[];
  requiredBy: string[];
  conflicts: string[];
  mutuallyExclusiveWith: string[];
}

/**
 * Feature Flag Dependency Service
 * 
 * Manages dependencies, conflicts, and validation for feature flags.
 */
export class FeatureFlagDependencyService {
  private dependencies: FlagDependency[] = [];
  private dependencyGraph: Map<string, FlagDependencyGraph> = new Map();

  constructor() {
    this.initializeDependencies();
    this.buildDependencyGraph();
  }

  /**
   * Initialize flag dependencies based on known relationships
   */
  private initializeDependencies(): void {
    // Parent-Child relationships
    // KG_ENABLED is parent of all KG_* flags
    const allKGFlags = Object.values(KGFeatureFlag).filter(
      flag => flag !== KGFeatureFlag.KG_ENABLED
    );
    for (const childFlag of allKGFlags) {
      this.dependencies.push({
        type: 'parent-child',
        flag: KGFeatureFlag.KG_ENABLED,
        relatedFlag: childFlag,
        cascadeDisable: true, // Disabling KG_ENABLED disables all children
        cascadeEnable: false, // Enabling a child doesn't enable KG_ENABLED
        description: `${childFlag} depends on ${KGFeatureFlag.KG_ENABLED}`,
      });
    }

    // KG_LEGAL_FEATURES_ENABLED is parent of legal-related flags
    const legalFlags = [
      KGFeatureFlag.KG_HIERARCHICAL_STRUCTURE_ENABLED,
      KGFeatureFlag.KG_DOCUMENT_DEPENDENCIES_ENABLED,
      KGFeatureFlag.KG_TEMPORAL_QUERIES_ENABLED,
      KGFeatureFlag.KG_ONTOLOGY_ALIGNMENT_ENABLED,
    ];
    for (const childFlag of legalFlags) {
      this.dependencies.push({
        type: 'parent-child',
        flag: KGFeatureFlag.KG_LEGAL_FEATURES_ENABLED,
        relatedFlag: childFlag,
        cascadeDisable: true,
        cascadeEnable: false,
        description: `${childFlag} depends on ${KGFeatureFlag.KG_LEGAL_FEATURES_ENABLED}`,
      });
    }

    // Requires relationships
    // KG_TRAVERSAL_ENABLED requires KG_REASONING_ENABLED
    this.dependencies.push({
      type: 'requires',
      flag: KGFeatureFlag.KG_TRAVERSAL_ENABLED,
      relatedFlag: KGFeatureFlag.KG_REASONING_ENABLED,
      description: `${KGFeatureFlag.KG_TRAVERSAL_ENABLED} requires ${KGFeatureFlag.KG_REASONING_ENABLED}`,
    });

    // KG_LEGAL_FEATURES_ENABLED requires KG_ENABLED
    this.dependencies.push({
      type: 'requires',
      flag: KGFeatureFlag.KG_LEGAL_FEATURES_ENABLED,
      relatedFlag: KGFeatureFlag.KG_ENABLED,
      description: `${KGFeatureFlag.KG_LEGAL_FEATURES_ENABLED} requires ${KGFeatureFlag.KG_ENABLED}`,
    });

    // Note: Conflicts and mutually-exclusive relationships can be added here
    // Example: Different retrieval strategies might conflict
  }

  /**
   * Build dependency graph for efficient lookups
   */
  private buildDependencyGraph(): void {
    this.dependencyGraph.clear();

    for (const dep of this.dependencies) {
      // Initialize graph entries if needed
      if (!this.dependencyGraph.has(dep.flag)) {
        this.dependencyGraph.set(dep.flag, {
          flag: dep.flag,
          parents: [],
          children: [],
          requires: [],
          requiredBy: [],
          conflicts: [],
          mutuallyExclusiveWith: [],
        });
      }
      if (!this.dependencyGraph.has(dep.relatedFlag)) {
        this.dependencyGraph.set(dep.relatedFlag, {
          flag: dep.relatedFlag,
          parents: [],
          children: [],
          requires: [],
          requiredBy: [],
          conflicts: [],
          mutuallyExclusiveWith: [],
        });
      }

      const flagGraph = this.dependencyGraph.get(dep.flag)!;
      const relatedGraph = this.dependencyGraph.get(dep.relatedFlag)!;

      switch (dep.type) {
        case 'parent-child':
          flagGraph.children.push(dep.relatedFlag);
          relatedGraph.parents.push(dep.flag);
          break;
        case 'requires':
          flagGraph.requires.push(dep.relatedFlag);
          relatedGraph.requiredBy.push(dep.flag);
          break;
        case 'conflicts':
          flagGraph.conflicts.push(dep.relatedFlag);
          relatedGraph.conflicts.push(dep.flag);
          break;
        case 'mutually-exclusive':
          flagGraph.mutuallyExclusiveWith.push(dep.relatedFlag);
          relatedGraph.mutuallyExclusiveWith.push(dep.flag);
          break;
      }
    }
  }

  /**
   * Validate flag configuration
   */
  async validateConfiguration(
    flags: Record<string, boolean>
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check each enabled flag
    for (const [flagName, enabled] of Object.entries(flags)) {
      if (!enabled) continue;

      const graph = this.dependencyGraph.get(flagName);
      if (!graph) continue;

      // Check required flags
      for (const requiredFlag of graph.requires) {
        if (!flags[requiredFlag]) {
          errors.push({
            type: 'required',
            flag: flagName,
            message: `${flagName} requires ${requiredFlag} to be enabled`,
            relatedFlags: [requiredFlag],
          });
        }
      }

      // Check parent flags
      for (const parentFlag of graph.parents) {
        if (!flags[parentFlag]) {
          errors.push({
            type: 'dependency',
            flag: flagName,
            message: `${flagName} requires parent flag ${parentFlag} to be enabled`,
            relatedFlags: [parentFlag],
          });
        }
      }

      // Check conflicts
      for (const conflictingFlag of graph.conflicts) {
        if (flags[conflictingFlag]) {
          errors.push({
            type: 'conflict',
            flag: flagName,
            message: `${flagName} conflicts with ${conflictingFlag}`,
            relatedFlags: [conflictingFlag],
          });
        }
      }

      // Check mutually exclusive
      for (const exclusiveFlag of graph.mutuallyExclusiveWith) {
        if (flags[exclusiveFlag]) {
          errors.push({
            type: 'mutually-exclusive',
            flag: flagName,
            message: `${flagName} and ${exclusiveFlag} are mutually exclusive`,
            relatedFlags: [exclusiveFlag],
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate a single flag change
   */
  async validateFlagChange(
    flagName: string,
    newValue: boolean,
    currentFlags: Record<string, boolean>
  ): Promise<ValidationResult> {
    const updatedFlags = { ...currentFlags, [flagName]: newValue };
    return this.validateConfiguration(updatedFlags);
  }

  /**
   * Get flags that would be affected by cascade disable
   */
  getCascadeDisableFlags(flagName: string): string[] {
    const affected: string[] = [];
    const graph = this.dependencyGraph.get(flagName);
    if (!graph) return affected;

    // Get all children recursively
    const visited = new Set<string>();
    const queue = [...graph.children];

    while (queue.length > 0) {
      const child = queue.shift()!;
      if (visited.has(child)) continue;
      visited.add(child);
      affected.push(child);

      const childGraph = this.dependencyGraph.get(child);
      if (childGraph) {
        queue.push(...childGraph.children);
      }
    }

    return affected;
  }

  /**
   * Get flags that would be affected by cascade enable
   */
  getCascadeEnableFlags(flagName: string): string[] {
    const affected: string[] = [];
    const graph = this.dependencyGraph.get(flagName);
    if (!graph) return affected;

    // Get all parents recursively
    const visited = new Set<string>();
    const queue = [...graph.parents, ...graph.requires];

    while (queue.length > 0) {
      const parent = queue.shift()!;
      if (visited.has(parent)) continue;
      visited.add(parent);
      affected.push(parent);

      const parentGraph = this.dependencyGraph.get(parent);
      if (parentGraph) {
        queue.push(...parentGraph.parents, ...parentGraph.requires);
      }
    }

    return affected;
  }

  /**
   * Get dependency graph for a flag
   */
  getDependencyGraph(flagName: string): FlagDependencyGraph | null {
    return this.dependencyGraph.get(flagName) || null;
  }

  /**
   * Get all dependency graphs
   */
  getAllDependencyGraphs(): Map<string, FlagDependencyGraph> {
    return new Map(this.dependencyGraph);
  }

  /**
   * Get all dependencies
   */
  getAllDependencies(): FlagDependency[] {
    return [...this.dependencies];
  }

  /**
   * Add a custom dependency (for runtime configuration)
   */
  addDependency(dependency: FlagDependency): void {
    this.dependencies.push(dependency);
    this.buildDependencyGraph();
  }

  /**
   * Remove a dependency
   */
  removeDependency(flag: string, relatedFlag: string, type: DependencyType): void {
    this.dependencies = this.dependencies.filter(
      dep => !(dep.flag === flag && dep.relatedFlag === relatedFlag && dep.type === type)
    );
    this.buildDependencyGraph();
  }
}

// Singleton instance
let dependencyServiceInstance: FeatureFlagDependencyService | null = null;

/**
 * Get the singleton instance of FeatureFlagDependencyService
 */
export function getFeatureFlagDependencyService(): FeatureFlagDependencyService {
  if (!dependencyServiceInstance) {
    dependencyServiceInstance = new FeatureFlagDependencyService();
  }
  return dependencyServiceInstance;
}


