/**
 * Feature Flag System Validation Utility
 * 
 * Simple validation functions to verify the flag system works correctly.
 * These are lightweight checks that don't require database setup.
 */

import { FeatureFlag, KGFeatureFlag } from '../models/FeatureFlag.js';
import { getFeatureFlagDependencyService } from '../services/feature-flags/FeatureFlagDependencyService.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate that all enum flags are defined and can be checked
 */
export function validateAllFlagsDefined(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const enumFlags = Object.values(KGFeatureFlag);
  const totalFlags = enumFlags.length;
  
  // Check that we can call isEnabled on all flags
  for (const flagName of enumFlags) {
    try {
      const enabled = FeatureFlag.isEnabled(flagName, true);
      if (typeof enabled !== 'boolean') {
        errors.push(`Flag ${flagName} returned non-boolean value: ${typeof enabled}`);
      }
    } catch (error) {
      errors.push(`Failed to check flag ${flagName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  if (totalFlags < 30) {
    warnings.push(`Only ${totalFlags} flags found in enum, expected at least 30`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate flag resolution priority (Environment > Database > Default)
 */
export function validateFlagResolutionPriority(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Test that environment variables take precedence
  const testFlag = KGFeatureFlag.KG_ENABLED;
  const originalEnv = process.env[testFlag];
  
  try {
    // Set environment variable
    process.env[testFlag] = 'false';
    const envResult = FeatureFlag.isEnabled(testFlag, true);
    if (envResult !== false) {
      errors.push(`Environment variable should take precedence, but got ${envResult}`);
    }
    
    // Remove environment variable (should fall back to default)
    delete process.env[testFlag];
    const defaultResult = FeatureFlag.isEnabled(testFlag, true);
    if (typeof defaultResult !== 'boolean') {
      errors.push(`Default value should be boolean, but got ${typeof defaultResult}`);
    }
  } catch (error) {
    errors.push(`Failed to test flag resolution priority: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    // Restore original environment variable
    if (originalEnv !== undefined) {
      process.env[testFlag] = originalEnv;
    } else {
      delete process.env[testFlag];
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate dependency service works correctly
 */
export function validateDependencyService(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    const dependencyService = getFeatureFlagDependencyService();
    
    // Test that we can get dependency graphs
    const allGraphs = dependencyService.getAllDependencyGraphs();
    if (allGraphs.size === 0) {
      warnings.push('No dependency graphs found - dependencies may not be initialized');
    }
    
    // Test that KG_ENABLED has children (it should be parent of all other flags)
    const kgEnabledGraph = dependencyService.getDependencyGraph(KGFeatureFlag.KG_ENABLED);
    if (kgEnabledGraph) {
      if (kgEnabledGraph.children.length === 0) {
        warnings.push('KG_ENABLED has no children - expected it to be parent of other flags');
      }
    } else {
      warnings.push('KG_ENABLED dependency graph not found');
    }
    
    // Test validation function
    const testConfig = {
      [KGFeatureFlag.KG_ENABLED]: true,
      [KGFeatureFlag.KG_RETRIEVAL_ENABLED]: true,
    };
    
    // This should be async, but we'll test the interface
    const validationPromise = dependencyService.validateConfiguration(testConfig);
    if (!(validationPromise instanceof Promise)) {
      errors.push('validateConfiguration should return a Promise');
    }
  } catch (error) {
    errors.push(`Failed to validate dependency service: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate cascade operations
 */
export function validateCascadeOperations(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    const dependencyService = getFeatureFlagDependencyService();
    
    // Test that disabling KG_ENABLED would cascade to children
    const cascadeFlags = dependencyService.getCascadeDisableFlags(KGFeatureFlag.KG_ENABLED);
    if (cascadeFlags.length === 0) {
      warnings.push('KG_ENABLED has no cascade disable flags - expected it to cascade to children');
    } else if (cascadeFlags.length < 10) {
      warnings.push(`Only ${cascadeFlags.length} cascade flags found for KG_ENABLED, expected more`);
    }
    
    // Test that we can get cascade enable flags
    const traversalCascade = dependencyService.getCascadeEnableFlags(KGFeatureFlag.KG_TRAVERSAL_ENABLED);
    // This might be empty if cascade enable is disabled, which is fine
    if (traversalCascade.length > 0) {
      // Verify it includes required flags
      const hasReasoning = traversalCascade.includes(KGFeatureFlag.KG_REASONING_ENABLED);
      if (!hasReasoning && traversalCascade.length > 0) {
        warnings.push('KG_TRAVERSAL_ENABLED cascade enable should include KG_REASONING_ENABLED');
      }
    }
  } catch (error) {
    errors.push(`Failed to validate cascade operations: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Run all validations and return combined results
 */
export function validateFeatureFlagSystem(): ValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];
  
  const validations = [
    { name: 'All Flags Defined', result: validateAllFlagsDefined() },
    { name: 'Flag Resolution Priority', result: validateFlagResolutionPriority() },
    { name: 'Dependency Service', result: validateDependencyService() },
    { name: 'Cascade Operations', result: validateCascadeOperations() },
  ];
  
  for (const { name, result } of validations) {
    if (!result.valid) {
      allErrors.push(`[${name}] ${result.errors.join('; ')}`);
    }
    if (result.warnings.length > 0) {
      allWarnings.push(`[${name}] ${result.warnings.join('; ')}`);
    }
  }
  
  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}
