/**
 * WorkflowConfigurationService
 * 
 * Service for applying workflow configuration settings (feature flags) during workflow execution.
 * This service ensures that user-selected configuration feature flags are applied before
 * workflow execution and restored afterward to prevent affecting other users' workflows.
 */

import { logger } from '../../utils/logger.js';
import { WorkflowConfiguration } from '../../models/WorkflowConfiguration.js';
import { FeatureFlag, KGFeatureFlag } from '../../models/FeatureFlag.js';

/**
 * Restore function type - call this to restore original feature flag values
 */
export type RestoreFeatureFlags = () => Promise<void>;

/**
 * Service for managing workflow configuration application
 */
export class WorkflowConfigurationService {
  /**
   * Apply feature flags from user's active workflow configuration
   * 
   * This method:
   * 1. Gets the user's active configuration
   * 2. Stores original feature flag values
   * 3. Applies configuration feature flags
   * 4. Returns a restore function to revert changes
   * 
   * @param userId - User ID to get active configuration for
   * @returns Promise resolving to restore function, or no-op function if no configuration/flags
   */
  static async applyConfigurationFlags(
    userId: string
  ): Promise<RestoreFeatureFlags> {
    try {
      // Get user's active configuration
      const config = await WorkflowConfiguration.findActiveByUser(userId);
      
      if (!config || !config.featureFlags || Object.keys(config.featureFlags).length === 0) {
        // No configuration or no flags to apply
        logger.debug(
          { userId, hasConfig: !!config, hasFlags: config?.featureFlags ? Object.keys(config.featureFlags).length : 0 },
          'No feature flags to apply from configuration'
        );
        return async () => {}; // No-op restore function
      }

      // Ensure FeatureFlag service is initialized
      await FeatureFlag.initializeService();

      // Store original values for restoration
      const originalFlags: Record<string, boolean | null> = {};
      const flagsToApply: Record<string, boolean> = {};

      // Process each flag in configuration
      for (const [flagName, enabled] of Object.entries(config.featureFlags)) {
        // Check if flag exists (either as KG flag or regular flag)
        const currentFlag = await FeatureFlag.findByName(flagName);
        const originalValue = currentFlag?.enabled ?? null;
        originalFlags[flagName] = originalValue;
        flagsToApply[flagName] = enabled;

        logger.debug(
          { userId, flagName, enabled, originalValue, configName: config.name },
          'Preparing to apply configuration feature flag'
        );
      }

      // Apply all flags at once using bulk operation
      if (Object.keys(flagsToApply).length > 0) {
        // Check which flags are KG flags
        const kgFlagValues = Object.values(KGFeatureFlag) as string[];
        
        // Apply flags
        for (const [flagName, enabled] of Object.entries(flagsToApply)) {
          if (kgFlagValues.includes(flagName)) {
            // Use KG flag method for KG flags
            await FeatureFlag.setKGFlag(
              flagName as typeof KGFeatureFlag[keyof typeof KGFeatureFlag],
              enabled,
              `workflow-config-${config._id?.toString() || 'unknown'}`
            );
          } else {
            // Use regular upsert for other flags
            await FeatureFlag.upsert({
              name: flagName,
              enabled,
              updatedBy: `workflow-config-${config._id?.toString() || 'unknown'}`,
            });
          }
        }

        // Refresh cache to ensure changes are immediately available
        await FeatureFlag.refreshCache();

        logger.info(
          {
            userId,
            configName: config.name,
            configId: config._id?.toString(),
            flagsApplied: Object.keys(flagsToApply),
            flagCount: Object.keys(flagsToApply).length,
          },
          'Applied feature flags from workflow configuration'
        );
      }

      // Return restore function
      return async () => {
        try {
          logger.debug(
            { userId, configName: config.name, flagsToRestore: Object.keys(originalFlags) },
            'Restoring original feature flag values'
          );

          const kgFlagValues = Object.values(KGFeatureFlag) as string[];

          for (const [flagName, originalValue] of Object.entries(originalFlags)) {
            if (originalValue === null) {
              // Flag didn't exist before, delete it
              await FeatureFlag.deleteByName(flagName);
            } else {
              // Restore original value
              if (kgFlagValues.includes(flagName)) {
                await FeatureFlag.setKGFlag(
                  flagName as typeof KGFeatureFlag[keyof typeof KGFeatureFlag],
                  originalValue,
                  'workflow-config-restore'
                );
              } else {
                await FeatureFlag.upsert({
                  name: flagName,
                  enabled: originalValue,
                  updatedBy: 'workflow-config-restore',
                });
              }
            }
          }

          // Refresh cache after restoration
          await FeatureFlag.refreshCache();

          logger.info(
            {
              userId,
              configName: config.name,
              flagsRestored: Object.keys(originalFlags),
            },
            'Restored original feature flag values'
          );
        } catch (error) {
          logger.error(
            { error, userId, configName: config.name },
            'Failed to restore feature flags - this may affect other workflows'
          );
          // Don't throw - restoration failure shouldn't break workflow execution
        }
      };
    } catch (error) {
      logger.error(
        { error, userId },
        'Failed to apply configuration feature flags - continuing with default flags'
      );
      // Return no-op function on error - don't break workflow execution
      return async () => {};
    }
  }

  /**
   * Get active configuration for a user (helper method)
   * 
   * @param userId - User ID
   * @returns Active configuration or null
   */
  static async getActiveConfiguration(userId: string) {
    return await WorkflowConfiguration.findActiveByUser(userId);
  }

  /**
   * Validate that a workflow ID exists and is available
   * 
   * @param workflowId - Workflow ID to validate
   * @returns true if workflow exists, false otherwise
   */
  static async validateWorkflowId(workflowId: string): Promise<boolean> {
    try {
      const { getWorkflowById } = await import('../../utils/workflowLookup.js');
      const workflow = await getWorkflowById(workflowId);
      return workflow !== null;
    } catch (error) {
      logger.error({ error, workflowId }, 'Failed to validate workflow ID');
      return false;
    }
  }
}


